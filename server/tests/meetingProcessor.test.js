import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../models/Meeting.js', () => ({
  default: {
    findById: vi.fn(),
  },
}));

vi.mock('../models/MeetingAnalysis.js', () => ({
  default: {
    deleteOne: vi.fn(),
    create: vi.fn(),
  },
}));

import Meeting from '../models/Meeting.js';
import MeetingAnalysis from '../models/MeetingAnalysis.js';
import { processMeetingPipeline } from '../services/meetingProcessor.js';

describe('processMeetingPipeline critical flow', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('handles transcription handoff, translation fallback, analysis parsing and status transitions', async () => {
    const statusHistory = [];
    const meeting = {
      _id: 'm1',
      audio_url: 'http://audio.test/file.webm',
      raw_transcript: '',
      transcript: '',
      duration_seconds: 600,
      processing_meta: {},
      status: 'queued',
      error_message: null,
      save: vi.fn(async function save() {
        statusHistory.push(this.status);
      }),
    };

    Meeting.findById.mockResolvedValue(meeting);

    global.fetch = vi
      .fn()
      // download audio
      .mockResolvedValueOnce({ ok: true, blob: async () => new Blob(['audio']) })
      // whisper transcription
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ text: 'مرحبا budget', detected_language: 'ar' }),
      })
      // analyze health => gemini not configured => translation required
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ configured: false }),
      })
      // translation service response
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ text: 'bonjour budget' }),
      })
      // analysis response (lenient parsing path)
      .mockResolvedValueOnce({
        ok: true,
        text: async () => '```json {"summary":"ok","sales_stage":"closing","objections":[],"risks":[],"next_actions":[],"key_topics":["budget"],"sentiment":"positive","win_probability":80,"confidence":70} ```',
      });

    await processMeetingPipeline('m1', { attempt: 1, jobId: 'j1' });

    expect(MeetingAnalysis.deleteOne).toHaveBeenCalledWith({ meeting_id: 'm1' });
    expect(MeetingAnalysis.create).toHaveBeenCalled();
    expect(meeting.raw_transcript).toBe('مرحبا budget');
    expect(meeting.transcript).toBe('bonjour budget');
    expect(meeting.status).toBe('completed');
    expect(meeting.error_message).toBeNull();
    expect(statusHistory).toContain('transcribing');
    expect(statusHistory).toContain('translating');
    expect(statusHistory).toContain('analyzing');
    expect(meeting.processing_meta?.queue?.attempts).toBe(1);
    expect(meeting.processing_meta?.queue?.jobId).toBe('j1');
    expect(meeting.processing_meta?.stages?.analyzing?.retries).toBe(1);
  });

  it('marks meeting as error on upstream failure and stores message', async () => {
    const meeting = {
      _id: 'm2',
      audio_url: 'http://audio.test/file.webm',
      raw_transcript: '',
      transcript: '',
      duration_seconds: 100,
      processing_meta: {},
      status: 'queued',
      error_message: null,
      save: vi.fn(async () => {}),
    };

    Meeting.findById.mockResolvedValue(meeting);

    global.fetch = vi.fn().mockResolvedValueOnce({ ok: false, status: 500 });

    await expect(processMeetingPipeline('m2', { attempt: 0 })).rejects.toThrow(/Audio download failed/);
    expect(meeting.status).toBe('error');
    expect(meeting.error_message).toMatch(/Audio download failed/);
    expect(meeting.processing_meta?.queue?.attempts).toBe(0);
    expect(meeting.processing_meta?.queue?.failedAt).toBeTruthy();
  });
});
