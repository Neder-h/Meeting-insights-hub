import { apiClient } from '@/lib/apiClient';
import { Meeting, MeetingAnalysis, SalesStage, Sentiment, AuditEvent, EmailDraftEvent, EmailDraftVersion } from '@/types/meeting';
import { db } from '@/integrations/local/client';

// Mode options for Whisper transcription
// - bilingual: Best for French + Derja code-switching (keeps French Latin, Derja Arabic)
// - auto: Auto-detect, retry with Arabic if romanization detected
// - force_ar: Force Arabic script (all text in Arabic)
// - force_fr: Force French/Latin (Derja gets romanized - avoid)
export type WhisperMode = 'bilingual' | 'auto' | 'force_ar' | 'force_fr';

export interface MeetingsListParams {
  page?: number;
  limit?: number;
  search?: string;
  stage?: SalesStage;
  sentiment?: Sentiment;
  status?: Meeting['status'];
  includeDeleted?: boolean;
  sortBy?: 'createdAt' | 'updatedAt' | 'title' | 'status';
  sortOrder?: 'asc' | 'desc';
}

export interface MeetingsListResponse {
  items: Meeting[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface ClientSummaryItem {
  clientId: string;
  clientName: string;
  meetingsCount: number;
  lastContact: string;
  revenue: number;
  status: 'prospect' | 'active' | 'inactive' | 'churned';
}

export interface ClientSummaryResponse {
  items: ClientSummaryItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface ProcessingDiagnosticsResponse {
  queue: {
    enabled: boolean;
    connected: boolean;
    mode: 'bullmq' | 'inline';
    redisUrl?: string;
    counts: {
      waiting: number;
      active: number;
      completed: number;
      failed: number;
      delayed: number;
      paused: number;
    };
    error?: string;
  };
  summary: {
    recentFailureCount: number;
    recentEventCount: number;
  };
  failures: Array<{
    id: string;
    title: string;
    status: string;
    error_message: string | null;
    processing_meta: Record<string, any>;
    updated_at: string | null;
    created_at: string | null;
    user_id: string | null;
  }>;
  events: AuditEvent[];
}

export interface AnalyticsTrendResponse {
  windowDays: number;
  bucket: 'week' | 'month';
  recurringObjections: Array<{
    objection: string;
    normalized: string;
    count: number;
    lastSeen: string;
    buckets: Record<string, number>;
  }>;
  trendBuckets: Array<{
    bucket: string;
    totalMeetings: number;
    positive: number;
    neutral: number;
    negative: number;
    avgWinProbability: number;
    recurringObjectionsCount: number;
  }>;
  totals: {
    meetingsAnalyzed: number;
    uniqueObjections: number;
  };
}

export interface CoachingCommercialInsight {
  commercialId: string;
  commercialName: string;
  totals: {
    totalMeetings: number;
    wins: number;
    losses: number;
    openDeals: number;
    avgWinProbability: number;
  };
  winRateTrend: {
    earlyAvg: number;
    lateAvg: number;
    delta: number;
    points: Array<{ date: string; win_probability: number }>;
  };
  commonObjections: Array<{ objection: string; count: number }>;
  stageConversion: {
    stageCounts: Record<string, number>;
    earlyStage: number;
    lateStage: number;
    conversionRate: number;
  };
  followUpQuality: {
    score: number;
    generated: number;
    accepted: number;
    edited: number;
    feedbackMeetings: number;
  };
}

export interface CoachingInsightsResponse {
  windowDays: number;
  coaching: CoachingCommercialInsight[];
}

export interface Client360Response {
  clientId: string;
  clientName: string;
  summary: {
    totalMeetings: number;
    wonRevenue: number;
    pendingRevenue: number;
    lastContactAt: string | null;
    daysSinceLastContact: number | null;
    avgWinProbability: number;
  };
  sentimentTrend: Array<{
    bucket: string;
    positive: number;
    neutral: number;
    negative: number;
    avgSentimentScore: number;
  }>;
  openActions: Array<{
    action: string;
    meetingId: string;
    createdAt: string;
  }>;
  meetingHistory: Array<{
    id: string;
    title: string;
    createdAt: string;
    status: string;
    dealStatus: string;
    dealValue: number;
    dealCurrency: string;
    sentiment: string;
    salesStage: string;
    winProbability: number;
    objections: string[];
    nextActions: string[];
  }>;
}

export interface MeetingSearchResponse {
  items: Array<Meeting & { searchMatches?: string[] }>;
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  query: string;
}

export async function transcribeAudioWithWhisper(
  audioBlob: Blob, 
  mode: WhisperMode = 'bilingual'
): Promise<{
  text: string;
  rawText?: string;
  cleanedText?: string;
  cleaningProfile?: string;
  cleaningDiff?: Array<{ before: string; after: string; count: number }>;
  lowConfidenceCount?: number;
  segments?: Array<{ start: number; end: number; text: string; confidence?: number; low_confidence?: boolean }>;
  detectedLanguage: string;
  settings: any;
}> {
  const file = new File([audioBlob], "meeting.webm", { type: audioBlob.type || "audio/webm" });

  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(`http://127.0.0.1:9000/transcribe?mode=${mode}`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(errorData.detail || `HTTP ${response.status}`);
  }

  const result = await response.json();
  return {
    text: result.text || '',
    rawText: result.raw_text || '',
    cleanedText: result.cleaned_text || result.text || '',
    cleaningProfile: result.cleaning_profile,
    cleaningDiff: result.cleaning_diff || [],
    lowConfidenceCount: result.low_confidence_count || 0,
    segments: result.segments || [],
    detectedLanguage: result.detected_language || 'unknown',
    settings: result.settings || {}
  };
}

/**
 * Translate text using local NLLB-200 service
 * Translates Arabic to French while preserving existing French text
 */
export async function translateText(
  text: string,
  targetLang: 'fra_Latn' | 'eng_Latn' = 'fra_Latn',
  mode: 'segment' | 'full' = 'segment'
): Promise<{
  text: string;
  stats: { translated: number; passthrough: number };
  timing: { ms_total: number };
}> {
  const response = await fetch('http://127.0.0.1:9100/translate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, target_lang: targetLang, mode }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(errorData.detail || `Translation failed: HTTP ${response.status}`);
  }

  const result = await response.json();
  return {
    text: result.text || text,
    stats: result.stats || { translated: 0, passthrough: 0 },
    timing: result.timing || { ms_total: 0 }
  };
}

export async function uploadAudioFile(blob: Blob, fileName: string): Promise<string> {
  try {
    return await apiClient.upload(blob, fileName);
  } catch {
    return blobToDataUrl(blob);
  }
}

function nowIso() {
  return new Date().toISOString();
}

function makeMeetingSyncMeta(state: 'synced' | 'local-only' | 'pending' | 'conflicted', patch: Record<string, any> = {}) {
  return {
    version: 1,
    lastSyncedAt: state === 'synced' ? nowIso() : null,
    dirty: state !== 'synced',
    syncState: state,
    deletedAt: null,
    conflictFields: [],
    remoteId: null,
    entityType: 'meeting',
    lastError: null,
    ...patch,
  };
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Unable to read audio blob for offline storage'));
    reader.readAsDataURL(blob);
  });
}

export async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const response = await fetch(dataUrl);
  return response.blob();
}

async function cacheMeeting(meeting: Meeting) {
  await db.meetings.put({
    id: meeting.id,
    title: meeting.title,
    created_at: meeting.created_at,
    updated_at: meeting.updated_at,
    status: meeting.status,
    audio_url: meeting.audio_url || null,
    transcript: meeting.transcript || null,
    raw_transcript: meeting.raw_transcript || null,
    error_message: meeting.error_message || null,
    duration_seconds: typeof meeting.analysis?.duration_minutes === 'number' ? Math.round(meeting.analysis.duration_minutes * 60) : null,
    transcript_engine: meeting.transcript_engine || null,
    transcript_language: meeting.transcript_language || null,
    clientId: meeting.clientId,
    clientName: meeting.clientName || null,
    commercialId: meeting.commercialId || null,
    dealValue: meeting.dealValue || null,
    dealCurrency: meeting.dealCurrency || null,
    dealStatus: meeting.dealStatus || null,
    closedDate: meeting.closedDate || null,
    deletedAt: meeting.deletedAt || null,
    deletedBy: meeting.deletedBy || null,
    syncMeta: meeting.syncMeta || makeMeetingSyncMeta('synced', { remoteId: meeting.id }),
  } as any);

  if (meeting.analysis) {
    await db.meeting_analyses.put({
      id: meeting.analysis.id,
      meeting_id: meeting.id,
      summary: meeting.analysis.summary || null,
      sales_stage: meeting.analysis.sales_stage || null,
      objections: meeting.analysis.objections || [],
      risks: meeting.analysis.risks || [],
      next_actions: meeting.analysis.next_actions || [],
      key_topics: meeting.analysis.key_topics || [],
      sentiment: meeting.analysis.sentiment || null,
      win_probability: meeting.analysis.win_probability || 0,
      confidence: meeting.analysis.confidence || 0,
      duration_minutes: meeting.analysis.duration_minutes || 0,
      created_at: nowIso(),
    } as any);
  }
}

function mapLocalMeeting(row: any, analysisRow?: any): Meeting {
  return {
    id: row.id,
    title: row.title,
    created_at: row.created_at,
    updated_at: row.updated_at,
    status: row.status,
    audio_url: row.audio_url || undefined,
    transcript: row.transcript || undefined,
    raw_transcript: row.raw_transcript || undefined,
    error_message: row.error_message || undefined,
    transcript_engine: row.transcript_engine || undefined,
    transcript_language: row.transcript_language || undefined,
    clientId: row.clientId || 'client_default',
    clientName: row.clientName || undefined,
    commercialId: row.commercialId || undefined,
    dealValue: row.dealValue || undefined,
    dealCurrency: row.dealCurrency || undefined,
    dealStatus: row.dealStatus || undefined,
    closedDate: row.closedDate || undefined,
    deletedAt: row.deletedAt || null,
    deletedBy: row.deletedBy || null,
    syncMeta: row.syncMeta || makeMeetingSyncMeta('local-only'),
    analysis: analysisRow ? {
      id: analysisRow.id,
      summary: analysisRow.summary || '',
      sales_stage: analysisRow.sales_stage as SalesStage,
      objections: analysisRow.objections || [],
      risks: analysisRow.risks || [],
      next_actions: analysisRow.next_actions || [],
      key_topics: analysisRow.key_topics || [],
      sentiment: analysisRow.sentiment as Sentiment,
      win_probability: Number(analysisRow.win_probability || 0),
      confidence: Number(analysisRow.confidence || 0),
      duration_minutes: Number(analysisRow.duration_minutes || 0),
    } : undefined,
  };
}

export async function createMeeting(
  title: string,
  audioUrl: string,
  durationSeconds: number,
  transcript?: string,
  rawTranscript?: string,
  transcriptEngine?: 'whisper',
  transcriptLanguage?: 'fr-FR' | 'ar-TN',
  clientId?: string,
  clientName?: string
): Promise<string> {
  try {
    const result = await apiClient.post<{ id: string }>('/meetings', {
      title,
      status: 'uploading',
      audio_url: audioUrl,
      transcript: transcript || null,
      raw_transcript: rawTranscript || null,
      duration_seconds: durationSeconds,
      transcript_engine: transcriptEngine || null,
      transcript_language: transcriptLanguage || null,
      client_id: clientId,
      client_name: clientName,
    });
    return result.id;
  } catch (error) {
    const id = `local_${crypto.randomUUID()}`;
    const createdAt = nowIso();

    await db.meetings.put({
      id,
      title,
      created_at: createdAt,
      updated_at: createdAt,
      status: 'queued',
      audio_url: audioUrl,
      transcript: transcript || null,
      raw_transcript: rawTranscript || null,
      error_message: null,
      duration_seconds: durationSeconds,
      transcript_engine: transcriptEngine || null,
      transcript_language: transcriptLanguage || null,
      clientId: clientId || 'client_default',
      clientName: clientName || null,
      commercialId: null,
      dealValue: null,
      dealCurrency: null,
      dealStatus: null,
      closedDate: null,
      deletedAt: null,
      deletedBy: null,
      syncMeta: makeMeetingSyncMeta('local-only', {
        remoteId: null,
        lastError: error instanceof Error ? error.message : 'offline_create',
      }),
    } as any);

    return id;
  }
}

export async function processMeeting(meetingId: string, existingTranscript?: string): Promise<void> {
  if (meetingId.startsWith('local_')) {
    await db.meetings.update(meetingId, {
      status: 'queued',
      updated_at: nowIso(),
      syncMeta: {
        ...(await db.meetings.get(meetingId))?.syncMeta,
        dirty: true,
        syncState: 'local-only',
      },
    } as any);
    return;
  }

  try {
    await apiClient.post(`/meetings/${meetingId}/process`, {
      hasClientTranscript: !!existingTranscript,
    });
  } catch (error) {
    await db.meetings.update(meetingId, {
      updated_at: nowIso(),
      syncMeta: {
        ...(await db.meetings.get(meetingId))?.syncMeta,
        dirty: true,
        syncState: 'pending',
        lastError: error instanceof Error ? error.message : 'offline_process',
      },
    } as any);
  }
}

function toQuery(params: MeetingsListParams = {}) {
  const q = new URLSearchParams();
  if (params.page) q.set('page', String(params.page));
  if (params.limit) q.set('limit', String(params.limit));
  if (params.search) q.set('search', params.search);
  if (params.stage) q.set('stage', params.stage);
  if (params.sentiment) q.set('sentiment', params.sentiment);
  if (params.status) q.set('status', params.status);
  if (params.includeDeleted) q.set('includeDeleted', '1');
  if (params.sortBy) q.set('sortBy', params.sortBy);
  if (params.sortOrder) q.set('sortOrder', params.sortOrder);
  const s = q.toString();
  return s ? `?${s}` : '';
}

export async function getMeetings(params?: MeetingsListParams): Promise<Meeting[]> {
  const effectiveParams = params || { page: 1, limit: 1000 };
  const query = toQuery(effectiveParams);
  try {
    const data = await apiClient.get<any>(`/meetings${query}`);
    const remoteItems = (Array.isArray(data) ? data : (data?.items || [])).map(transformMeeting);

    await Promise.all(remoteItems.map((m) => cacheMeeting(m)));

    const localPendingRows = await db.meetings.toArray();
    const localPending = localPendingRows
      .filter((m: any) => m?.syncMeta?.syncState === 'local-only' || m?.syncMeta?.syncState === 'pending' || m?.syncMeta?.syncState === 'conflicted')
      .map((m: any) => mapLocalMeeting(m));

    const merged = [...remoteItems];
    const ids = new Set(remoteItems.map((m) => m.id));
    for (const local of localPending) {
      if (!ids.has(local.id)) merged.push(local);
    }

    return merged.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  } catch {
    const rows = await db.meetings.toArray();
    const analyses = await db.meeting_analyses.toArray();
    const byMeetingId = new Map(analyses.map((a: any) => [a.meeting_id, a]));
    return rows
      .map((row: any) => mapLocalMeeting(row, byMeetingId.get(row.id)))
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }
}

export async function getMeetingsPaginated(params: MeetingsListParams = {}): Promise<MeetingsListResponse> {
  const query = toQuery(params);
  try {
    const data = await apiClient.get<any>(`/meetings${query}`);

    const remoteItems = (Array.isArray(data) ? data : (data?.items || [])).map(transformMeeting);
    await Promise.all(remoteItems.map((m) => cacheMeeting(m)));

    const localPendingRows = await db.meetings.toArray();
    const localPending = localPendingRows
      .filter((m: any) => m?.syncMeta?.syncState === 'local-only' || m?.syncMeta?.syncState === 'pending' || m?.syncMeta?.syncState === 'conflicted')
      .map((m: any) => mapLocalMeeting(m));

    const merged = [...remoteItems];
    const ids = new Set(remoteItems.map((m) => m.id));
    for (const local of localPending) {
      if (!ids.has(local.id)) merged.push(local);
    }

    if (Array.isArray(data)) {
      return {
        items: merged,
        pagination: {
          page: params.page || 1,
          limit: params.limit || merged.length || 20,
          total: merged.length,
          totalPages: 1,
        },
      };
    }

    return {
      items: merged,
      pagination: {
        page: data?.pagination?.page || params.page || 1,
        limit: data?.pagination?.limit || params.limit || 20,
        total: (data?.pagination?.total || remoteItems.length) + localPending.filter((m) => !ids.has(m.id)).length,
        totalPages: data?.pagination?.totalPages || 1,
      },
    };
  } catch {
    const all = await getMeetings();
    const page = params.page || 1;
    const limit = params.limit || 20;
    const start = (page - 1) * limit;
    const items = all.slice(start, start + limit);
    return {
      items,
      pagination: {
        page,
        limit,
        total: all.length,
        totalPages: Math.max(1, Math.ceil(all.length / limit)),
      },
    };
  }
}

export async function getClientSummary(params: {
  page?: number;
  limit?: number;
  search?: string;
  status?: 'all' | 'prospect' | 'active' | 'inactive' | 'churned';
} = {}): Promise<ClientSummaryResponse> {
  const query = new URLSearchParams();
  if (params.page) query.set('page', String(params.page));
  if (params.limit) query.set('limit', String(params.limit));
  if (params.search) query.set('search', params.search);
  if (params.status && params.status !== 'all') query.set('status', params.status);

  const raw = await apiClient.get<any>(`/meetings/clients/summary${query.toString() ? `?${query.toString()}` : ''}`);

  return {
    items: raw?.items || [],
    pagination: {
      page: raw?.pagination?.page || params.page || 1,
      limit: raw?.pagination?.limit || params.limit || 20,
      total: raw?.pagination?.total || 0,
      totalPages: raw?.pagination?.totalPages || 1,
    },
  };
}

export async function getMeeting(id: string): Promise<Meeting | null> {
  try {
    const data = await apiClient.get<any>(`/meetings/${id}`);
    const meeting = transformMeeting(data);
    await cacheMeeting(meeting);
    return meeting;
  } catch {
    const row = await db.meetings.get(id);
    if (!row) return null;
    const analysis = await db.meeting_analyses.where('meeting_id').equals(id).first();
    return mapLocalMeeting(row, analysis);
  }
}

export async function deleteMeeting(id: string): Promise<void> {
  try {
    await apiClient.del(`/meetings/${id}`);
  } catch {
    await db.meetings.update(id, {
      deletedAt: nowIso(),
      updated_at: nowIso(),
      syncMeta: {
        ...(await db.meetings.get(id))?.syncMeta,
        dirty: true,
        syncState: 'pending',
        deletedAt: nowIso(),
      },
    } as any);
  }
}

export async function restoreMeeting(id: string): Promise<void> {
  try {
    await apiClient.post(`/meetings/${id}/restore`);
  } catch {
    await db.meetings.update(id, {
      deletedAt: null,
      updated_at: nowIso(),
      syncMeta: {
        ...(await db.meetings.get(id))?.syncMeta,
        dirty: true,
        syncState: 'pending',
        deletedAt: null,
      },
    } as any);
  }
}

export async function getMeetingAuditEvents(id: string): Promise<AuditEvent[]> {
  const data = await apiClient.get<any[]>(`/meetings/${id}/events`);
  return (data || []).map((e) => ({
    id: e.id,
    user_id: e.user_id || null,
    meeting_id: e.meeting_id || null,
    entity_type: e.entity_type,
    entity_id: e.entity_id,
    event_type: e.event_type,
    before: e.before || null,
    after: e.after || null,
    metadata: e.metadata || {},
    created_at: e.created_at || new Date().toISOString(),
  }));
}

export async function getMeetingEmailDraftEvents(id: string): Promise<EmailDraftEvent[]> {
  const data = await apiClient.get<any[]>(`/meetings/${id}/email-drafts/events`);
  return (data || []).map((row) => ({
    id: row.id,
    meetingId: row.meetingId || id,
    draftId: row.draftId || null,
    variant: row.variant === 'B' ? 'B' : 'A',
    action: row.action,
    hadEdits: !!row.hadEdits,
    status: row.status || null,
    createdAt: row.createdAt || new Date().toISOString(),
    updatedAt: row.updatedAt || undefined,
  }));
}

export async function getMeetingEmailDraftHistory(meetingId: string, draftId: string): Promise<EmailDraftVersion[]> {
  const rows = await apiClient.get<any[]>(`/meetings/${meetingId}/email-drafts/${draftId}/history`);
  return (rows || []).map((row) => ({
    id: row.id,
    meetingId: row.meetingId || meetingId,
    draftId: row.draftId || draftId,
    rootDraftId: row.rootDraftId || row.draftId || draftId,
    version: Number(row.version || 1),
    eventType: row.eventType,
    status: row.status,
    subject: row.subject || '',
    bodyText: row.bodyText || '',
    bodyHtml: row.bodyHtml || '',
    assumptions: Array.isArray(row.assumptions) ? row.assumptions : [],
    fieldsToVerify: Array.isArray(row.fieldsToVerify) ? row.fieldsToVerify : [],
    inferredFields: Array.isArray(row.inferredFields) ? row.inferredFields : [],
    metadata: row.metadata || {},
    createdAt: row.createdAt || new Date().toISOString(),
    updatedAt: row.updatedAt || undefined,
  }));
}

export async function getProcessingDiagnostics(): Promise<ProcessingDiagnosticsResponse> {
  return apiClient.get<ProcessingDiagnosticsResponse>('/meetings/diagnostics/processing');
}

export async function getAnalyticsTrends(params: { windowDays?: number; bucket?: 'week' | 'month' } = {}): Promise<AnalyticsTrendResponse> {
  const q = new URLSearchParams();
  if (params.windowDays) q.set('windowDays', String(params.windowDays));
  if (params.bucket) q.set('bucket', params.bucket);
  const suffix = q.toString() ? `?${q.toString()}` : '';
  return apiClient.get<AnalyticsTrendResponse>(`/meetings/analytics/trends${suffix}`);
}

export async function getCoachingInsights(params: { windowDays?: number } = {}): Promise<CoachingInsightsResponse> {
  const q = new URLSearchParams();
  if (params.windowDays) q.set('windowDays', String(params.windowDays));
  const suffix = q.toString() ? `?${q.toString()}` : '';
  return apiClient.get<CoachingInsightsResponse>(`/meetings/analytics/coaching${suffix}`);
}

export async function getClient360(clientId: string): Promise<Client360Response> {
  return apiClient.get<Client360Response>(`/meetings/clients/${clientId}/360`);
}

export async function searchMeetingsKeyword(params: { q: string; page?: number; limit?: number }): Promise<MeetingSearchResponse> {
  const q = new URLSearchParams();
  q.set('q', params.q);
  if (params.page) q.set('page', String(params.page));
  if (params.limit) q.set('limit', String(params.limit));
  return apiClient.get<MeetingSearchResponse>(`/meetings/search?${q.toString()}`);
}

function transformMeeting(data: any): Meeting {
  const analysis = data.meeting_analyses?.[0];

  return {
    id: data.id,
    title: data.title,
    created_at: data.created_at,
    updated_at: data.updated_at,
    status: data.status as Meeting['status'],
    audio_url: data.audio_url,
    transcript: data.transcript,
    raw_transcript: data.raw_transcript,
    error_message: data.error_message,
    user_id: data.user_id,
    clientId: data.client_id || 'client_default',
    clientName: data.client_name,
    commercialId: data.commercial_id,
    dealValue: data.deal_value,
    dealCurrency: data.deal_currency,
    dealStatus: data.deal_status,
    closedDate: data.closed_date,
    processingMeta: data.processing_meta,
    syncMeta: {
      version: data?.syncMeta?.version || 1,
      lastSyncedAt: data?.syncMeta?.lastSyncedAt || nowIso(),
      dirty: false,
      syncState: 'synced',
      deletedAt: data.deleted_at || null,
      conflictFields: [],
      remoteId: data.id,
      entityType: 'meeting',
      lastError: null,
    },
    deletedAt: data.deleted_at || null,
    deletedBy: data.deleted_by || null,
    analysis: analysis ? {
      id: analysis.id,
      summary: analysis.summary || '',
      sales_stage: analysis.sales_stage as SalesStage,
      objections: analysis.objections || [],
      risks: analysis.risks || [],
      next_actions: analysis.next_actions || [],
      key_topics: analysis.key_topics || [],
      sentiment: analysis.sentiment as Sentiment,
      win_probability: analysis.win_probability || 0,
      confidence: analysis.confidence || 0,
      duration_minutes: analysis.duration_minutes || 0,
    } : undefined,
  };
}
