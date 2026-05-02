import Dexie, { Table } from 'dexie';
import { Meeting, MeetingAnalysis, RevenueData, MonthlyRevenue, Commercial, CommercialTarget, CommercialRevenue, Client, EmailDraft } from '@/types/meeting';

export interface MeetingRow {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  status: 'recording' | 'uploading' | 'queued' | 'transcribing' | 'translating' | 'analyzing' | 'completed' | 'error';
  audio_url: string | null;
  transcript: string | null;
  raw_transcript: string | null;  // Original mixed-language transcript from Whisper
  error_message: string | null;
  duration_seconds: number | null;
  transcript_engine: 'whisper' | null;
  transcript_language: 'fr-FR' | 'ar-TN' | null;
  dealValue?: number | null;
  dealCurrency?: string | null;
  dealStatus?: 'pending' | 'won' | 'lost' | null;
  closedDate?: string | null;
  commercialId?: string | null;
  clientId: string;
  clientName?: string | null;
  deletedAt?: string | null;
  deletedBy?: string | null;
  syncMeta?: {
    version: number;
    lastSyncedAt?: string | null;
    dirty?: boolean;
    syncState?: 'local-only' | 'synced' | 'pending' | 'conflicted';
    deletedAt?: string | null;
    conflictFields?: string[];
    remoteId?: string | null;
    entityType?: 'meeting';
    lastError?: string | null;
  };
}

export interface MeetingAnalysisRow {
  id: string;
  meeting_id: string;
  summary: string | null;
  sales_stage: 'contact_visits' | 'value_proposition' | 'offer_negotiation' | 'closing' | 'closed_lost' | null;
  objections: string[] | null;
  risks: string[] | null;
  next_actions: string[] | null;
  key_topics: string[] | null;
  sentiment: 'positive' | 'neutral' | 'negative' | null;
  win_probability: number | null;
  confidence: number | null;
  duration_minutes: number | null;
  created_at: string;
}

export interface RevenueRow extends RevenueData {}

export interface MonthlyRevenueRow extends MonthlyRevenue {
  id: string; // `${year}-${month}`
}

export interface CommercialRow extends Commercial {}

export interface CommercialTargetRow extends CommercialTarget {}

export interface CommercialRevenueRow extends CommercialRevenue {}

export interface ClientRow extends Client {
  deletedAt?: string | null;
}

export interface AuditEventRow {
  id: string;
  entityType: 'meeting' | 'analysis' | 'client';
  entityId: string;
  eventType: string;
  before?: any;
  after?: any;
  metadata?: any;
  actorId?: string | null;
  createdAt: string;
}

export class LocalDatabase extends Dexie {
  meetings!: Table<MeetingRow>;
  meeting_analyses!: Table<MeetingAnalysisRow>;
  revenue!: Table<RevenueRow>;
  monthly_revenue!: Table<MonthlyRevenueRow>;
  commercials!: Table<CommercialRow>;
  commercial_targets!: Table<CommercialTargetRow>;
  commercial_revenue!: Table<CommercialRevenueRow>;
  clients!: Table<ClientRow>;
  emailDrafts!: Table<EmailDraft, string>;
  auditEvents!: Table<AuditEventRow, string>;

  constructor() {
    super('MeetingInsightsDB');
    this.version(1).stores({
      meetings: 'id, title, created_at, updated_at, status',
      meeting_analyses: 'id, meeting_id, sales_stage, sentiment, created_at'
    });
    this.version(2).stores({
      meetings: 'id, title, created_at, updated_at, status',
      meeting_analyses: 'id, meeting_id, sales_stage, sentiment, created_at'
    }).upgrade(tx => {
      // Handle any data migration if needed
      console.log('Upgrading database to version 2');
    });
    this.version(3).stores({
      meetings: 'id, title, created_at, updated_at, status',
      meeting_analyses: 'id, meeting_id, sales_stage, sentiment, created_at'
    }).upgrade(tx => {
      // Handle any data migration if needed
      console.log('Upgrading database to version 3');
    });
    this.version(4).stores({
      meetings: 'id, title, created_at, updated_at, status',
      meeting_analyses: 'id, meeting_id, sales_stage, sentiment, created_at'
    }).upgrade(tx => {
      // Add raw_transcript field and translating status support
      console.log('Upgrading database to version 4 - adding raw_transcript support');
    });
    this.version(5).stores({
      meetings: 'id, title, created_at, updated_at, status',
      meeting_analyses: 'id, meeting_id, sales_stage, sentiment, created_at',
      revenue: 'year',
      monthly_revenue: 'id, year, month, [year+month]'
    }).upgrade(tx => {
      console.log('Upgrading database to version 5 - adding revenue tracking tables');
    });
    this.version(6).stores({
      meetings: 'id, title, created_at, updated_at, status, commercialId, [commercialId+created_at]',
      meeting_analyses: 'id, meeting_id, sales_stage, sentiment, created_at',
      revenue: 'year',
      monthly_revenue: 'id, year, month, [year+month]',
      commercials: 'id, name, email, active',
      commercial_targets: 'id, commercialId, year, [commercialId+year]',
      commercial_revenue: 'id, commercialId, year, month, [commercialId+year], [commercialId+year+month]'
    }).upgrade(() => {
      console.log('Upgrading database to version 6 - adding commercial performance tracking tables');
    });

    this.version(7).stores({
      meetings: 'id, title, created_at, updated_at, status, commercialId, clientId, [commercialId+created_at], [clientId+created_at]',
      meeting_analyses: 'id, meeting_id, sales_stage, sentiment, created_at',
      revenue: 'year',
      monthly_revenue: 'id, year, month, [year+month]',
      commercials: 'id, name, email, active',
      commercial_targets: 'id, commercialId, year, [commercialId+year]',
      commercial_revenue: 'id, commercialId, year, month, [commercialId+year], [commercialId+year+month]',
      clients: 'id, name, status, assignedCommercialId, createdAt, lastContactDate'
    }).upgrade(async (tx) => {
      console.log('Upgrading database to version 7 - adding clients and linking meetings');
      const defaultClientId = 'client_default';
      const defaultClient: ClientRow = {
        id: defaultClientId,
        name: 'Unassigned Client',
        status: 'inactive',
        notes: 'Auto-created during migration. Reassignez ces réunions.',
        createdAt: new Date().toISOString(),
        tags: [],
      } as ClientRow;

      const existing = await tx.table('clients').get(defaultClientId).catch(() => null);
      if (!existing) {
        await tx.table('clients').add(defaultClient).catch(() => {});
      }

      const meetingsTable = tx.table('meetings');
      await meetingsTable.toCollection().modify((m: any) => {
        if (!m.clientId) {
          m.clientId = defaultClientId;
          m.clientName = defaultClient.name;
        }
      });
    });

    this.version(8).stores({
      meetings: 'id, title, created_at, updated_at, status, commercialId, clientId, [commercialId+created_at], [clientId+created_at]',
      meeting_analyses: 'id, meeting_id, sales_stage, sentiment, created_at',
      revenue: 'year',
      monthly_revenue: 'id, year, month, [year+month]',
      commercials: 'id, name, email, active',
      commercial_targets: 'id, commercialId, year, [commercialId+year]',
      commercial_revenue: 'id, commercialId, year, month, [commercialId+year], [commercialId+year+month]',
      clients: 'id, name, status, assignedCommercialId, createdAt, lastContactDate',
      emailDrafts: '++id, meetingId, clientId, commercialId, status, createdAt'
    }).upgrade(() => {
      console.log('Upgrading database to version 8 - adding email drafts table');
    });

    this.version(9).stores({
      meetings: 'id, title, created_at, updated_at, status, deletedAt, commercialId, clientId, [commercialId+created_at], [clientId+created_at], [clientId+deletedAt]',
      meeting_analyses: 'id, meeting_id, sales_stage, sentiment, created_at',
      revenue: 'year',
      monthly_revenue: 'id, year, month, [year+month]',
      commercials: 'id, name, email, active',
      commercial_targets: 'id, commercialId, year, [commercialId+year]',
      commercial_revenue: 'id, commercialId, year, month, [commercialId+year], [commercialId+year+month]',
      clients: 'id, name, status, deletedAt, assignedCommercialId, createdAt, lastContactDate',
      emailDrafts: '++id, meetingId, clientId, commercialId, status, createdAt',
      auditEvents: 'id, entityType, entityId, eventType, createdAt, [entityType+createdAt], [entityId+createdAt]'
    }).upgrade(async (tx) => {
      console.log('Upgrading database to version 9 - soft delete fields and local audit events');
      await tx.table('meetings').toCollection().modify((m: any) => {
        if (m.deletedAt === undefined) m.deletedAt = null;
      });
      await tx.table('clients').toCollection().modify((c: any) => {
        if (c.deletedAt === undefined) c.deletedAt = null;
      });
    });

    this.version(10).stores({
      meetings: 'id, title, created_at, updated_at, status, deletedAt, commercialId, clientId, [commercialId+created_at], [clientId+created_at], [clientId+deletedAt]',
      meeting_analyses: 'id, meeting_id, sales_stage, sentiment, created_at',
      revenue: 'year',
      monthly_revenue: 'id, year, month, [year+month]',
      commercials: 'id, name, email, active',
      commercial_targets: 'id, commercialId, year, [commercialId+year]',
      commercial_revenue: 'id, commercialId, year, month, [commercialId+year], [commercialId+year+month]',
      clients: 'id, name, status, deletedAt, assignedCommercialId, createdAt, lastContactDate',
      emailDrafts: 'id, meetingId, clientId, commercialId, status, createdAt, updatedAt',
      auditEvents: 'id, entityType, entityId, eventType, createdAt, [entityType+createdAt], [entityId+createdAt]'
    }).upgrade(async (tx) => {
      console.log('Upgrading database to version 10 - stable string IDs + sync metadata');
      await tx.table('emailDrafts').toCollection().modify((d: any) => {
        if (!d.id) d.id = crypto.randomUUID();
        if (!d.syncMeta) {
          d.syncMeta = {
            version: 1,
            lastSyncedAt: null,
            dirty: false,
            syncState: 'synced',
            deletedAt: null,
          };
        }
      });
      await tx.table('clients').toCollection().modify((c: any) => {
        if (!c.syncMeta) {
          c.syncMeta = {
            version: 1,
            lastSyncedAt: null,
            dirty: false,
            syncState: 'synced',
            deletedAt: c.deletedAt || null,
          };
        }
      });
    });

    this.version(11).stores({
      meetings: 'id, title, created_at, updated_at, status, deletedAt, commercialId, clientId, [commercialId+created_at], [clientId+created_at], [clientId+deletedAt]',
      meeting_analyses: 'id, meeting_id, sales_stage, sentiment, created_at',
      revenue: 'year',
      monthly_revenue: 'id, year, month, [year+month]',
      commercials: 'id, name, email, active',
      commercial_targets: 'id, commercialId, year, [commercialId+year]',
      commercial_revenue: 'id, commercialId, year, month, [commercialId+year], [commercialId+year+month]',
      clients: 'id, name, status, deletedAt, assignedCommercialId, createdAt, lastContactDate',
      emailDrafts: 'id, meetingId, clientId, commercialId, status, createdAt, updatedAt',
      auditEvents: 'id, entityType, entityId, eventType, createdAt, [entityType+createdAt], [entityId+createdAt]'
    }).upgrade(async (tx) => {
      console.log('Upgrading database to version 11 - meeting sync metadata');
      await tx.table('meetings').toCollection().modify((m: any) => {
        if (!m.syncMeta) {
          m.syncMeta = {
            version: 1,
            lastSyncedAt: null,
            dirty: false,
            syncState: 'synced',
            deletedAt: m.deletedAt || null,
            conflictFields: [],
            remoteId: null,
            entityType: 'meeting',
            lastError: null,
          };
        }
      });
    });
  }
}

export const db = new LocalDatabase();

