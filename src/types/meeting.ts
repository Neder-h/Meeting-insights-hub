export type SalesStage =
  | 'contact_visits'
  | 'value_proposition'
  | 'offer_negotiation'
  | 'closing'
  | 'closed_lost';

export type Sentiment = 'positive' | 'neutral' | 'negative';

export type ClientStatus = 'prospect' | 'active' | 'inactive' | 'churned';
export type ClientSize = 'startup' | 'small' | 'medium' | 'large' | 'enterprise';

export type SyncState = 'local-only' | 'synced' | 'pending' | 'conflicted';

export interface SyncMetadata {
  version: number;
  lastSyncedAt?: string | null;
  dirty?: boolean;
  syncState?: SyncState;
  deletedAt?: string | null;
  conflictFields?: string[];
}

export interface Client {
  id: string;
  name: string;
  industry?: string;
  size?: ClientSize;
  contactPerson?: string;
  email?: string;
  phone?: string;
  address?: string;
  website?: string;
  logo?: string;
  notes?: string;
  status: ClientStatus;
  tags?: string[];
  createdAt: string;
  lastContactDate?: string;
  totalMeetings?: number;
  totalRevenue?: number;
  assignedCommercialId?: string;
  deletedAt?: string | null;
  syncMeta?: SyncMetadata;
}

export interface ClientStats {
  clientId: string;
  totalMeetings: number;
  firstMeetingDate: string;
  lastMeetingDate: string;
  totalRevenue: number;
  pendingRevenue: number;
  averageDealValue: number;
  winRate: number;
  currentStage: string;
  currentSentiment: string;
  meetingsByStage: {
    contact_visits: number;
    value_proposition: number;
    offer_negotiation: number;
    closing: number;
    closed_lost: number;
  };
  relationshipHealth: 'excellent' | 'good' | 'fair' | 'poor';
}

export interface MeetingAnalysis {
  id: string;
  summary: string;
  sales_stage: SalesStage;
  objections: string[];
  risks: string[];
  next_actions: string[];
  sentiment: Sentiment;
  win_probability: number;
  confidence: number;
  key_topics: string[];
  duration_minutes: number;
}

export interface RevenueData {
  year: number;
  total: number;
  currency: string; // e.g., "TND" or "EUR"
  target?: number;
  ytd: number;
  previousYear?: number;
  lastUpdated: string; // ISO date string
}

export interface MonthlyRevenue {
  id?: string; // `${year}-${month}` for deterministic keys
  year: number;
  month: number; // 1-12
  amount: number;
  currency: string;
}

export interface Commercial {
  id: string;
  name: string;
  email: string;
  phone?: string;
  active: boolean;
  startDate: string;
  avatar?: string;
  createdAt: string;
}

export interface CommercialTarget {
  id: string;
  commercialId: string;
  year: number;
  annualTarget: number;
  q1Target: number;
  q2Target: number;
  q3Target: number;
  q4Target: number;
  currency: string;
  createdBy?: string;
  lastUpdated: string;
}

export interface CommercialRevenue {
  id: string;
  commercialId: string;
  year: number;
  month: number; // 1-12
  amount: number;
  currency: string;
  source?: 'manual' | 'meeting' | 'import';
  recordedAt: string;
  meetingId?: string;
}

export interface CommercialPerformance {
  commercial: Commercial;
  target: CommercialTarget | null;
  revenue: {
    ytd: number;
    q1: number;
    q2: number;
    q3: number;
    q4: number;
    currentQuarter: number;
  };
  progress: {
    annualProgress: number;
    q1Progress: number;
    q2Progress: number;
    q3Progress: number;
    q4Progress: number;
    currentQuarterProgress: number;
  };
  status: 'on-track' | 'at-risk' | 'behind';
  projectedAnnual: number;
}

export interface Meeting {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  status: 'recording' | 'uploading' | 'queued' | 'transcribing' | 'translating' | 'analyzing' | 'completed' | 'error';
  audio_url?: string;
  transcript?: string;
  raw_transcript?: string; // Original mixed-language transcript from Whisper
  analysis?: MeetingAnalysis;
  error_message?: string;
  transcript_engine?: 'whisper';
  transcript_language?: 'fr-FR' | 'ar-TN';
  user_id?: string;
  clientId: string;
  clientName?: string;
  dealValue?: number;
  dealCurrency?: string;
  dealStatus?: 'pending' | 'won' | 'lost';
  closedDate?: string;
  commercialId?: string;
  processingMeta?: {
    queue?: {
      mode?: 'bullmq' | 'inline';
      jobId?: string | null;
      enqueuedAt?: string;
      startedAt?: string;
      completedAt?: string;
      failedAt?: string;
      attempts?: number;
    };
    stages?: Record<string, {
      startedAt?: string;
      completedAt?: string;
      failedAt?: string;
      durationMs?: number;
      retries?: number;
      error?: string | null;
      fallback?: boolean;
      fallbackReason?: string;
    }>;
  };
  syncMeta?: SyncMetadata & {
    remoteId?: string | null;
    entityType?: 'meeting';
    lastError?: string | null;
  };
  deletedAt?: string | null;
  deletedBy?: string | null;
}

export interface AuditEvent {
  id: string;
  user_id: string | null;
  meeting_id: string | null;
  entity_type: 'meeting' | 'analysis' | 'client';
  entity_id: string;
  event_type: string;
  before?: Record<string, any> | null;
  after?: Record<string, any> | null;
  metadata?: Record<string, any>;
  created_at: string;
}

export interface RecordingState {
  isRecording: boolean;
  isPaused: boolean;
  duration: number;
  audioBlob?: Blob;
}

export interface OfferRecommendation {
  summary: string;
  proposedSolution: string;
  businessNeed: string;
  clientPainPoints: string[];
  objectionHandling: string[];
  nextStepOffer: string;
  pricingMentioned: string | null;
  confidence: number;
}

export interface EmailDraftInferredField {
  field: string;
  value: string;
  source: 'analysis' | 'transcript' | 'fallback' | 'manual';
  confidence: number;
}

export interface EmailDraftVersion {
  id: string;
  meetingId: string;
  draftId: string;
  rootDraftId: string;
  version: number;
  eventType: 'generated' | 'regenerated' | 'edited' | 'accepted' | 'approved' | 'sent' | 'deleted' | 'status_changed';
  status: 'draft' | 'approved' | 'sent';
  subject: string;
  bodyText: string;
  bodyHtml: string;
  assumptions: string[];
  fieldsToVerify: string[];
  inferredFields: EmailDraftInferredField[];
  metadata?: Record<string, any>;
  createdAt: string;
  updatedAt?: string;
}

export interface EmailDraftEvent {
  id: string;
  meetingId: string;
  draftId: string | null;
  variant: 'A' | 'B';
  action: 'generated' | 'regenerated' | 'accepted' | 'approved' | 'edited' | 'sent' | 'deleted';
  hadEdits: boolean;
  status?: 'draft' | 'approved' | 'sent' | null;
  createdAt: string;
  updatedAt?: string;
}

export interface EmailDraft {
  id?: string;
  rootDraftId?: string;
  parentDraftId?: string | null;
  variantLabel?: string;
  meetingId: string;
  clientId: string;
  clientName: string;
  commercialId?: string;
  commercialName?: string;
  subject: string;
  bodyText: string;
  bodyHtml: string;
  language: string;
  tone: 'professional' | 'friendly' | 'executive';
  type: 'follow_up_offer';
  offerSummary: string;
  cta: string;
  assumptions: string[];
  fieldsToVerify: string[];
  inferredFields?: EmailDraftInferredField[];
  offerRecommendation?: OfferRecommendation;
  status: 'draft' | 'approved' | 'sent';
  approvedAt?: string | null;
  sentAt?: string | null;
  createdAt: string;
  updatedAt: string;
  syncMeta?: SyncMetadata;
}
