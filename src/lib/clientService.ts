import { db } from '@/integrations/local/client';
import { Client, ClientStats, Meeting, SalesStage, Sentiment } from '@/types/meeting';
import { apiClient } from '@/lib/apiClient';

const DEFAULT_CLIENT_ID = 'client_default';

function nowIso() {
  return new Date().toISOString();
}

function ensureSyncMeta(client: Client, syncState: 'synced' | 'local-only' | 'pending' | 'conflicted' = 'synced'): Client {
  return {
    ...client,
    syncMeta: {
      version: client.syncMeta?.version || 1,
      lastSyncedAt: syncState === 'synced' ? (client.syncMeta?.lastSyncedAt || nowIso()) : (client.syncMeta?.lastSyncedAt || null),
      dirty: syncState !== 'synced',
      syncState,
      deletedAt: client.deletedAt || client.syncMeta?.deletedAt || null,
      conflictFields: client.syncMeta?.conflictFields || [],
    },
  };
}

function mapRemoteClient(raw: any): Client {
  return ensureSyncMeta({
    id: raw.id,
    name: raw.name,
    industry: raw.industry || undefined,
    size: raw.size || undefined,
    contactPerson: raw.contactPerson || undefined,
    email: raw.email || undefined,
    phone: raw.phone || undefined,
    address: raw.address || undefined,
    website: raw.website || undefined,
    logo: raw.logo || undefined,
    notes: raw.notes || undefined,
    status: raw.status || 'prospect',
    tags: Array.isArray(raw.tags) ? raw.tags : [],
    createdAt: raw.createdAt || raw.created_at || nowIso(),
    lastContactDate: raw.lastContactDate || undefined,
    totalMeetings: Number(raw.totalMeetings || 0),
    totalRevenue: Number(raw.totalRevenue || 0),
    assignedCommercialId: raw.assignedCommercialId || undefined,
    deletedAt: raw.deleted_at || raw.deletedAt || null,
    syncMeta: raw.syncMeta,
  } as Client, 'synced');
}

async function logLocalAuditEvent(params: {
  entityType: 'meeting' | 'analysis' | 'client';
  entityId: string;
  eventType: string;
  before?: any;
  after?: any;
  metadata?: any;
}) {
  await db.auditEvents.add({
    id: crypto.randomUUID(),
    entityType: params.entityType,
    entityId: params.entityId,
    eventType: params.eventType,
    before: params.before ?? null,
    after: params.after ?? null,
    metadata: params.metadata ?? {},
    createdAt: nowIso(),
  } as any);
}

function ensureId(id?: string) {
  return id || crypto.randomUUID();
}

function daysBetween(a: string | Date, b: string | Date) {
  const d1 = typeof a === 'string' ? new Date(a) : a;
  const d2 = typeof b === 'string' ? new Date(b) : b;
  return Math.round((d2.getTime() - d1.getTime()) / 86_400_000);
}

function calculateRelationshipHealth(stats: ClientStats): ClientStats['relationshipHealth'] {
  const daysSinceLast = daysBetween(stats.lastMeetingDate, new Date());
  const winRate = stats.winRate;

  if (winRate > 70 && daysSinceLast <= 14) return 'excellent';
  if (winRate > 50 && daysSinceLast <= 30) return 'good';
  if (winRate > 30 || daysSinceLast <= 60) return 'fair';
  return 'poor';
}

export async function getAllClients(options?: { includeDeleted?: boolean }): Promise<Client[]> {
  const includeDeleted = !!options?.includeDeleted;
  try {
    const remote = await apiClient.getClients({ includeDeleted, limit: 500 });
    const mapped = (remote.items || []).map(mapRemoteClient);
    if (mapped.length > 0) {
      await db.clients.bulkPut(mapped as any);
    }
    return mapped;
  } catch {
    const all = await db.clients.toArray();
    if (includeDeleted) return all;
    return all.filter((c) => !c.deletedAt);
  }
}

export async function getActiveClients(): Promise<Client[]> {
  const all = await getAllClients();
  return all.filter((c) => c.status !== 'churned');
}

export async function getClientById(id: string): Promise<Client | undefined> {
  try {
    const remote = await apiClient.getClient(id);
    const mapped = mapRemoteClient(remote);
    await db.clients.put(mapped as any);
    if (mapped.deletedAt) return undefined;
    return mapped;
  } catch {
    const client = await db.clients.get(id);
    if (client?.deletedAt) return undefined;
    return client;
  }
}

export async function searchClients(query: string): Promise<Client[]> {
  const q = query.trim();
  if (!q) return getAllClients();
  try {
    const remote = await apiClient.getClients({ search: q, limit: 200 });
    const mapped = (remote.items || []).map(mapRemoteClient);
    if (mapped.length > 0) {
      await db.clients.bulkPut(mapped as any);
    }
    return mapped.filter((c) => !c.deletedAt);
  } catch {
    const lower = q.toLowerCase();
    const clients = await getAllClients();
    return clients.filter((c) =>
      (c.name || '').toLowerCase().includes(lower)
      || (c.email || '').toLowerCase().includes(lower)
      || (c.contactPerson || '').toLowerCase().includes(lower)
    );
  }
}

export async function createClient(data: Omit<Client, 'id' | 'createdAt'> & { id?: string }): Promise<Client> {
  const record: Client = ensureSyncMeta({
    id: ensureId(data.id),
    createdAt: nowIso(),
    status: data.status || 'prospect',
    deletedAt: null,
    ...data,
  }, 'pending');

  try {
    const remote = await apiClient.createClient(record);
    const mapped = mapRemoteClient(remote);
    await db.clients.put(mapped as any);
    await logLocalAuditEvent({
      entityType: 'client',
      entityId: mapped.id,
      eventType: 'client_created',
      after: { name: mapped.name, status: mapped.status },
    });
    return mapped;
  } catch {
    const offline = ensureSyncMeta(record, 'local-only');
    await db.clients.put(offline as any);
    await logLocalAuditEvent({
      entityType: 'client',
      entityId: offline.id,
      eventType: 'client_created_offline',
      after: { name: offline.name, status: offline.status },
    });
    return offline;
  }

}

export async function updateClient(id: string, data: Partial<Client>): Promise<void> {
  const before = await db.clients.get(id);
  try {
    const remote = await apiClient.updateClient(id, data);
    const mapped = mapRemoteClient(remote);
    await db.clients.put(mapped as any);
  } catch {
    const changedFields = Object.keys(data || {});
    await db.clients.update(id, {
      ...data,
      syncMeta: {
        version: before?.syncMeta?.version || 1,
        lastSyncedAt: before?.syncMeta?.lastSyncedAt || null,
        dirty: true,
        syncState: 'pending',
        deletedAt: before?.deletedAt || null,
        conflictFields: changedFields,
      },
    } as any);
  }
  const after = await db.clients.get(id);
  await logLocalAuditEvent({
    entityType: 'client',
    entityId: id,
    eventType: 'client_updated',
    before,
    after,
  });
}

export async function markClientConflictResolvedKeepLocal(id: string): Promise<void> {
  const client = await db.clients.get(id);
  if (!client) return;
  await db.clients.update(id, {
    syncMeta: {
      ...(client.syncMeta || { version: 1 }),
      dirty: true,
      syncState: 'pending',
      conflictFields: [],
    },
  } as any);
}

export async function overwriteClientWithServer(id: string): Promise<Client | undefined> {
  const remote = await apiClient.getClient(id, { includeDeleted: true });
  const mapped = mapRemoteClient(remote);
  await db.clients.put(mapped as any);
  return mapped;
}

export async function deleteClient(id: string): Promise<void> {
  const client = await db.clients.get(id);
  if (!client) return;

  if (client.deletedAt) return;

  try {
    await apiClient.deleteClient(id);
    await db.clients.update(id, {
      deletedAt: nowIso(),
      status: client.status === 'churned' ? 'churned' : 'inactive',
      syncMeta: {
        version: (client.syncMeta?.version || 1) + 1,
        lastSyncedAt: nowIso(),
        dirty: false,
        syncState: 'synced',
        deletedAt: nowIso(),
      },
    } as any);
  } catch {
    await db.clients.update(id, {
      deletedAt: nowIso(),
      status: client.status === 'churned' ? 'churned' : 'inactive',
      syncMeta: {
        version: client.syncMeta?.version || 1,
        lastSyncedAt: client.syncMeta?.lastSyncedAt || null,
        dirty: true,
        syncState: 'pending',
        deletedAt: nowIso(),
      },
    } as any);
  }
  await logLocalAuditEvent({
    entityType: 'client',
    entityId: id,
    eventType: 'client_soft_deleted',
    before: { deletedAt: client.deletedAt || null, status: client.status },
    after: { deletedAt: nowIso(), status: client.status === 'churned' ? 'churned' : 'inactive' },
  });
}

export async function restoreClient(id: string): Promise<void> {
  const client = await db.clients.get(id);
  if (!client || !client.deletedAt) return;

  try {
    await apiClient.restoreClient(id);
    await db.clients.update(id, {
      deletedAt: null,
      status: client.status === 'inactive' ? 'active' : client.status,
      syncMeta: {
        version: (client.syncMeta?.version || 1) + 1,
        lastSyncedAt: nowIso(),
        dirty: false,
        syncState: 'synced',
        deletedAt: null,
      },
    } as any);
  } catch {
    await db.clients.update(id, {
      deletedAt: null,
      status: client.status === 'inactive' ? 'active' : client.status,
      syncMeta: {
        version: client.syncMeta?.version || 1,
        lastSyncedAt: client.syncMeta?.lastSyncedAt || null,
        dirty: true,
        syncState: 'pending',
        deletedAt: null,
      },
    } as any);
  }
  await logLocalAuditEvent({
    entityType: 'client',
    entityId: id,
    eventType: 'client_restored',
    before: { deletedAt: client.deletedAt, status: client.status },
    after: { deletedAt: null, status: client.status === 'inactive' ? 'active' : client.status },
  });
}

export async function getClientsByCommercial(commercialId: string): Promise<Client[]> {
  const clients = await db.clients.where('assignedCommercialId').equals(commercialId).toArray();
  return clients.filter((c) => !c.deletedAt);
}

export async function updateClientStatus(id: string, status: Client['status']): Promise<void> {
  await updateClient(id, { status });
}

export async function getClientMeetings(clientId: string): Promise<Meeting[]> {
  const rows = await db.meetings.where('clientId').equals(clientId).toArray();
  return rows.map((r) => ({ ...r } as Meeting)).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

export async function getClientMeetingsByDateRange(clientId: string, start: Date, end: Date): Promise<Meeting[]> {
  const rows = await db.meetings.where('clientId').equals(clientId).toArray();
  return rows.filter((r) => {
    const dt = new Date(r.created_at);
    return dt >= start && dt <= end;
  }).map((r) => ({ ...r } as Meeting));
}

export async function getRecentMeetings(clientId: string, limit = 5): Promise<Meeting[]> {
  const meetings = await getClientMeetings(clientId);
  return meetings.slice(0, limit);
}

export async function linkMeetingToClient(meetingId: string, clientId: string, clientName?: string): Promise<void> {
  await db.meetings.update(meetingId, { clientId, clientName });
  await updateClientLastContact(clientId);
}

export async function updateClientLastContact(clientId: string): Promise<void> {
  const meetings = await getClientMeetings(clientId);
  if (meetings.length === 0) return;
  const last = meetings[0];
  await updateClient(clientId, {
    lastContactDate: last.created_at,
    totalMeetings: meetings.length,
  });
}

export async function getClientStats(clientId: string): Promise<ClientStats | null> {
  const meetings = await getClientMeetings(clientId);
  if (meetings.length === 0) return null;

  const analyses = await db.meeting_analyses.where('meeting_id').anyOf(meetings.map((m) => m.id)).toArray();
  const byId = new Map<string, any>();
  analyses.forEach((a) => byId.set(a.meeting_id, a));

  const won = meetings.filter((m) => m.dealStatus === 'won' && m.dealValue);
  const pending = meetings.filter((m) => m.dealStatus === 'pending' && m.dealValue);
  const totalRevenue = won.reduce((sum, m) => sum + (m.dealValue || 0), 0);
  const pendingRevenue = pending.reduce((sum, m) => sum + (m.dealValue || 0), 0);
  const firstMeetingDate = meetings[meetings.length - 1].created_at;
  const lastMeetingDate = meetings[0].created_at;

  const meetingsByStage: Record<SalesStage, number> = {
    contact_visits: 0,
    value_proposition: 0,
    offer_negotiation: 0,
    closing: 0,
    closed_lost: 0,
  };

  meetings.forEach((m) => {
    const a = byId.get(m.id);
    const stage = (a?.sales_stage || m.analysis?.sales_stage) as SalesStage | undefined;
    if (stage && meetingsByStage[stage] !== undefined) {
      meetingsByStage[stage] += 1;
    }
  });

  const wonCount = won.length;
  const totalWithValue = meetings.filter((m) => m.dealValue).length;
  const winRate = totalWithValue > 0 ? Math.round((wonCount / totalWithValue) * 100) : 0;
  const averageDealValue = wonCount > 0 ? Math.round(totalRevenue / wonCount) : 0;

  const latestAnalysis = analyses.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
  const currentStage = latestAnalysis?.sales_stage || 'contact_visits';
  const currentSentiment = (latestAnalysis?.sentiment as Sentiment) || 'neutral';

  const stats: ClientStats = {
    clientId,
    totalMeetings: meetings.length,
    firstMeetingDate,
    lastMeetingDate,
    totalRevenue,
    pendingRevenue,
    averageDealValue,
    winRate,
    currentStage,
    currentSentiment,
    meetingsByStage,
    relationshipHealth: 'fair',
  };

  stats.relationshipHealth = calculateRelationshipHealth(stats);
  return stats;
}

export async function getMeetingCount(clientId: string): Promise<number> {
  return db.meetings.where('clientId').equals(clientId).count();
}

export async function getClientsNeedingFollowUp(days = 30): Promise<Client[]> {
  const clients = await getAllClients();
  const threshold = new Date();
  threshold.setDate(threshold.getDate() - days);
  return clients.filter((c) => c.lastContactDate && new Date(c.lastContactDate) < threshold);
}

export async function getTopClientsByRevenue(limit = 5): Promise<Client[]> {
  const clients = await getAllClients();
  return clients
    .filter((c) => (c.totalRevenue || 0) > 0)
    .sort((a, b) => (b.totalRevenue || 0) - (a.totalRevenue || 0))
    .slice(0, limit);
}

export async function syncClientsFromMeetings(meetings: Meeting[]): Promise<void> {
  try {
    await apiClient.syncClientsFromMeetings(meetings.map((m) => ({
      clientId: m.clientId,
      clientName: m.clientName,
      created_at: m.created_at,
    })));
    await getAllClients({ includeDeleted: true });
    return;
  } catch {
    const existing = await getAllClients({ includeDeleted: true });
    const byId = new Map(existing.map((c) => [c.id, c]));
    for (const m of meetings) {
      if (!m.clientId) continue;
      if (!byId.has(m.clientId)) {
        const record = ensureSyncMeta({
          id: m.clientId,
          name: m.clientName || 'Client',
          status: 'active',
          createdAt: m.created_at || nowIso(),
          lastContactDate: m.created_at,
          totalMeetings: 1,
          totalRevenue: m.dealStatus === 'won' ? m.dealValue || 0 : 0,
          deletedAt: null,
        } as Client, 'local-only');
        await db.clients.put(record as any);
        byId.set(m.clientId, record);
      }
    }
  }
}

export { DEFAULT_CLIENT_ID };
