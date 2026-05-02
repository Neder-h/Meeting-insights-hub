import config from '../config.js';
import Meeting from '../models/Meeting.js';
import MeetingAnalysis from '../models/MeetingAnalysis.js';
import { logSystemMeetingEvent } from './auditLogService.js';

function nowIso() {
  return new Date().toISOString();
}

function setStageMeta(processingMeta = {}, stage, patch) {
  const stages = processingMeta.stages || {};
  const current = stages[stage] || {};
  stages[stage] = { ...current, ...patch };
  return { ...processingMeta, stages };
}

async function updateStageStart(meeting, stage, attempt = 0) {
  meeting.status = stage;
  meeting.processing_meta = setStageMeta(meeting.processing_meta, stage, {
    startedAt: nowIso(),
    retries: attempt,
    error: null,
  });
  await meeting.save();
}

async function updateStageDone(meeting, stage, startedAtMs) {
  meeting.processing_meta = setStageMeta(meeting.processing_meta, stage, {
    completedAt: nowIso(),
    durationMs: Date.now() - startedAtMs,
  });
  await meeting.save();
}

async function updateStageError(meeting, stage, error, startedAtMs = null) {
  const patch = {
    failedAt: nowIso(),
    error: error instanceof Error ? error.message : String(error),
  };

  if (typeof startedAtMs === 'number') {
    patch.durationMs = Date.now() - startedAtMs;
  }

  meeting.processing_meta = setStageMeta(meeting.processing_meta, stage, patch);
  await meeting.save();
}

function parseAnalysisJson(text) {
  const clean = (text || '').trim();
  if (!clean) return null;
  try {
    return JSON.parse(clean);
  } catch {
    const start = clean.indexOf('{');
    const end = clean.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) return null;
    try {
      return JSON.parse(clean.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}

export async function processMeetingPipeline(meetingId, opts = {}) {
  const attempt = opts.attempt || 0;
  const meeting = await Meeting.findById(meetingId);
  if (!meeting) throw new Error('Meeting not found');

  meeting.processing_meta = {
    ...(meeting.processing_meta || {}),
    queue: {
      ...(meeting.processing_meta?.queue || {}),
      startedAt: nowIso(),
      attempts: attempt,
      jobId: opts.jobId || meeting.processing_meta?.queue?.jobId,
    },
  };
  await meeting.save();

  await logSystemMeetingEvent({
    meetingId,
    userId: meeting.user_id,
    eventType: 'processing_pipeline_started',
    metadata: {
      attempt,
      jobId: opts.jobId || null,
    },
  });

  try {
    let rawTranscript = (meeting.raw_transcript || '').trim();
    let transcript = (meeting.transcript || '').trim();

    if (!rawTranscript && !transcript) {
      const tStart = Date.now();
      await updateStageStart(meeting, 'transcribing', attempt);

      if (!meeting.audio_url) throw new Error('No audio url found for meeting');
      const audioResp = await fetch(meeting.audio_url);
      if (!audioResp.ok) throw new Error(`Audio download failed: HTTP ${audioResp.status}`);

      const audioBlob = await audioResp.blob();
      const formData = new FormData();
      formData.append('file', audioBlob, 'meeting.webm');

      const transcribeResp = await fetch(`${config.whisperUrl}/transcribe?mode=bilingual`, {
        method: 'POST',
        body: formData,
      });

      if (!transcribeResp.ok) {
        const err = await transcribeResp.text().catch(() => '');
        const transcribeError = new Error(`Transcription failed: HTTP ${transcribeResp.status} ${err.slice(0, 160)}`);
        await updateStageError(meeting, 'transcribing', transcribeError, tStart);
        await logSystemMeetingEvent({
          meetingId,
          userId: meeting.user_id,
          eventType: 'processing_transcription_failed',
          metadata: {
            attempt,
            statusCode: transcribeResp.status,
            details: err.slice(0, 500),
          },
        });
        throw transcribeError;
      }

      const transcribeData = await transcribeResp.json();
      rawTranscript = (transcribeData?.text || '').trim();
      transcript = rawTranscript;
      meeting.raw_transcript = rawTranscript;
      meeting.transcript = transcript;
      meeting.transcript_engine = 'whisper';
      meeting.transcript_language = transcribeData?.detected_language === 'ar' ? 'ar-TN' : 'fr-FR';
      await meeting.save();

      await updateStageDone(meeting, 'transcribing', tStart);
      await logSystemMeetingEvent({
        meetingId,
        userId: meeting.user_id,
        eventType: 'processing_transcription_completed',
        metadata: {
          attempt,
          detectedLanguage: transcribeData?.detected_language || null,
          transcriptLength: transcript.length,
          rawTranscriptLength: rawTranscript.length,
        },
      });
    }

    const hResp = await fetch(`${config.whisperUrl}/analyze/health`).catch(() => null);
    const geminiConfigured = hResp?.ok ? !!(await hResp.json()).configured : false;

    if (!geminiConfigured) {
      const trStart = Date.now();
      await updateStageStart(meeting, 'translating', attempt);

      const translateResp = await fetch(`${config.translateUrl}/translate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: rawTranscript || transcript, target_lang: 'fra_Latn', mode: 'segment' }),
      });

      if (translateResp.ok) {
        const translated = await translateResp.json();
        transcript = (translated?.text || transcript || rawTranscript || '').trim();
        meeting.transcript = transcript;
        await meeting.save();
      } else {
        const errText = await translateResp.text().catch(() => '');
        const fallbackReason = `Translation fallback to raw transcript: HTTP ${translateResp.status}`;
        meeting.processing_meta = setStageMeta(meeting.processing_meta, 'translating', {
          fallback: true,
          fallbackReason,
          error: errText.slice(0, 300) || fallbackReason,
        });
        await meeting.save();

        await logSystemMeetingEvent({
          meetingId,
          userId: meeting.user_id,
          eventType: 'processing_translation_fallback',
          metadata: {
            attempt,
            statusCode: translateResp.status,
            reason: fallbackReason,
            details: errText.slice(0, 500),
          },
        });
      }

      await updateStageDone(meeting, 'translating', trStart);
    }

    const aStart = Date.now();
    await updateStageStart(meeting, 'analyzing', attempt);

    const analyzeResp = await fetch(`${config.whisperUrl}/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        transcript: geminiConfigured ? (rawTranscript || transcript) : transcript,
        duration_minutes: Math.round((meeting.duration_seconds || 0) / 60),
      }),
    });

    if (!analyzeResp.ok) {
      const err = await analyzeResp.text().catch(() => '');
      const analysisError = new Error(`Analysis failed: HTTP ${analyzeResp.status} ${err.slice(0, 160)}`);
      await updateStageError(meeting, 'analyzing', analysisError, aStart);
      await logSystemMeetingEvent({
        meetingId,
        userId: meeting.user_id,
        eventType: 'processing_analysis_failed',
        metadata: {
          attempt,
          statusCode: analyzeResp.status,
          details: err.slice(0, 500),
        },
      });
      throw analysisError;
    }

    const maybeJson = await analyzeResp.text();
    const analysisData = parseAnalysisJson(maybeJson);
    if (!analysisData) {
      const parseError = new Error('Analysis payload parse failed');
      await updateStageError(meeting, 'analyzing', parseError, aStart);
      await logSystemMeetingEvent({
        meetingId,
        userId: meeting.user_id,
        eventType: 'processing_analysis_parse_failed',
        metadata: {
          attempt,
          payloadPreview: (maybeJson || '').slice(0, 600),
        },
      });
      throw parseError;
    }

    await MeetingAnalysis.deleteOne({ meeting_id: meeting._id });
    await MeetingAnalysis.create({
      meeting_id: meeting._id,
      summary: analysisData.summary || '',
      sales_stage: analysisData.sales_stage || 'value_proposition',
      objections: Array.isArray(analysisData.objections) ? analysisData.objections : [],
      risks: Array.isArray(analysisData.risks) ? analysisData.risks : [],
      next_actions: Array.isArray(analysisData.next_actions) ? analysisData.next_actions : [],
      key_topics: Array.isArray(analysisData.key_topics) ? analysisData.key_topics : [],
      sentiment: analysisData.sentiment || 'neutral',
      win_probability: Number(analysisData.win_probability || 0),
      confidence: Number(analysisData.confidence || 0),
      duration_minutes: Math.round((meeting.duration_seconds || 0) / 60),
    });

    await updateStageDone(meeting, 'analyzing', aStart);
    await logSystemMeetingEvent({
      meetingId,
      userId: meeting.user_id,
      eventType: 'processing_analysis_completed',
      metadata: {
        attempt,
        salesStage: analysisData.sales_stage || 'value_proposition',
        sentiment: analysisData.sentiment || 'neutral',
      },
    });

    meeting.status = 'completed';
    meeting.error_message = null;
    meeting.processing_meta = {
      ...(meeting.processing_meta || {}),
      queue: {
        ...(meeting.processing_meta?.queue || {}),
        completedAt: nowIso(),
      },
    };
    await meeting.save();

    await logSystemMeetingEvent({
      meetingId,
      userId: meeting.user_id,
      eventType: 'processing_pipeline_completed',
      metadata: {
        attempt,
        jobId: opts.jobId || null,
      },
    });
  } catch (error) {
    const activeStage = meeting.status;
    if (['transcribing', 'translating', 'analyzing'].includes(activeStage)) {
      await updateStageError(meeting, activeStage, error);
    }

    meeting.status = 'error';
    meeting.error_message = error instanceof Error ? error.message : 'Unknown processing error';
    meeting.processing_meta = {
      ...(meeting.processing_meta || {}),
      queue: {
        ...(meeting.processing_meta?.queue || {}),
        failedAt: nowIso(),
        attempts: attempt,
      },
    };
    await meeting.save();

    await logSystemMeetingEvent({
      meetingId,
      userId: meeting.user_id,
      eventType: 'processing_pipeline_failed',
      metadata: {
        attempt,
        jobId: opts.jobId || null,
        stage: ['transcribing', 'translating', 'analyzing'].includes(activeStage) ? activeStage : null,
        error: error instanceof Error ? error.message : String(error),
      },
    });

    throw error;
  }
}
