import { db } from '@/integrations/local/client';
import { apiClient } from '@/lib/apiClient';
import { mapClientForSync } from './syncUtils';
import { emailDraftService } from '@/services/emailDraftService';
import { dataUrlToBlob } from '@/lib/api';

export interface SyncResult {
  meetingsSynced: number;
  clientsSynced: number;
  draftsSynced: number;
  conflicts: number;
}

async function syncPendingMeetings(): Promise<{ synced: number; conflicts: number }> {
  const rows = await db.meetings.toArray();
  const pending = rows.filter((m: any) => m?.syncMeta?.dirty || m?.syncMeta?.syncState === 'pending' || m?.syncMeta?.syncState === 'local-only' || m?.syncMeta?.syncState === 'conflicted');

  let synced = 0;
  let conflicts = 0;

  for (const meeting of pending) {
    try {
      if (meeting.deletedAt) {
        if (!meeting.id.startsWith('local_')) {
          await apiClient.del(`/meetings/${meeting.id}`);
        }
        await db.meetings.update(meeting.id, {
          syncMeta: {
            ...(meeting.syncMeta || { version: 1 }),
            dirty: false,
            syncState: 'synced',
            deletedAt: meeting.deletedAt,
            lastSyncedAt: new Date().toISOString(),
            conflictFields: [],
            lastError: null,
          },
        } as any);
        synced += 1;
        continue;
      }

      if (meeting.id.startsWith('local_') || meeting.syncMeta?.syncState === 'local-only') {
        const audioBlob = meeting.audio_url?.startsWith('data:') ? await dataUrlToBlob(meeting.audio_url) : null;
        const uploadedAudioUrl = audioBlob
          ? await apiClient.upload(audioBlob, `${Date.now()}-${crypto.randomUUID()}.webm`)
          : meeting.audio_url;

        const created = await apiClient.post<{ id: string }>('/meetings', {
          title: meeting.title,
          status: 'uploading',
          audio_url: uploadedAudioUrl,
          transcript: meeting.transcript || null,
          raw_transcript: meeting.raw_transcript || null,
          duration_seconds: meeting.duration_seconds || 0,
          transcript_engine: meeting.transcript_engine || null,
          transcript_language: meeting.transcript_language || null,
          client_id: meeting.clientId,
          client_name: meeting.clientName || null,
          commercial_id: meeting.commercialId || null,
        });

        await apiClient.post(`/meetings/${created.id}/process`, {
          hasClientTranscript: !!meeting.transcript,
        });

        const drafts = await db.emailDrafts.where('meetingId').equals(meeting.id).toArray();
        for (const d of drafts) {
          await db.emailDrafts.update(d.id!, { meetingId: created.id } as any);
        }

        await db.meetings.delete(meeting.id);
        synced += 1;
        continue;
      }

      await apiClient.patch(`/meetings/${meeting.id}`, {
        title: meeting.title,
        client_id: meeting.clientId,
        client_name: meeting.clientName || null,
        commercial_id: meeting.commercialId || null,
        deal_value: meeting.dealValue || null,
        deal_currency: meeting.dealCurrency || null,
        deal_status: meeting.dealStatus || null,
      });

      await db.meetings.update(meeting.id, {
        syncMeta: {
          ...(meeting.syncMeta || { version: 1 }),
          version: (meeting.syncMeta?.version || 1) + 1,
          dirty: false,
          syncState: 'synced',
          deletedAt: meeting.deletedAt || null,
          lastSyncedAt: new Date().toISOString(),
          conflictFields: [],
          lastError: null,
        },
      } as any);

      synced += 1;
    } catch (error) {
      conflicts += 1;
      await db.meetings.update(meeting.id, {
        syncMeta: {
          ...(meeting.syncMeta || { version: 1 }),
          dirty: true,
          syncState: 'conflicted',
          conflictFields: ['title', 'clientId', 'transcript'],
          lastError: error instanceof Error ? error.message : 'meeting_sync_failed',
        },
      } as any);
    }
  }

  return { synced, conflicts };
}

async function syncPendingClients(): Promise<{ synced: number; conflicts: number }> {
  const clients = await db.clients.toArray();
  const pending = clients.filter((c: any) => c?.syncMeta?.dirty || c?.syncMeta?.syncState === 'pending' || c?.syncMeta?.syncState === 'local-only');

  let synced = 0;
  let conflicts = 0;

  for (const client of pending) {
    try {
      if (client.deletedAt) {
        await apiClient.deleteClient(client.id);
      } else if (client.syncMeta?.syncState === 'local-only') {
        await apiClient.createClient(mapClientForSync(client));
      } else {
        await apiClient.updateClient(client.id, mapClientForSync(client));
      }

      await db.clients.update(client.id, {
        syncMeta: {
          version: (client.syncMeta?.version || 1) + 1,
          lastSyncedAt: new Date().toISOString(),
          dirty: false,
          syncState: 'synced',
          deletedAt: client.deletedAt || null,
          conflictFields: [],
        },
      } as any);
      synced += 1;
    } catch {
      conflicts += 1;
      await db.clients.update(client.id, {
        syncMeta: {
          ...(client.syncMeta || { version: 1 }),
          dirty: true,
          syncState: 'conflicted',
          conflictFields: ['notes'],
        },
      } as any);
    }
  }

  return { synced, conflicts };
}

export async function runBackgroundSync(): Promise<SyncResult> {
  const [
    { synced: meetingsSynced, conflicts: meetingConflicts },
    { synced: clientsSynced, conflicts: clientConflicts },
    { synced: draftsSynced, conflicted: draftConflicts },
  ] = await Promise.all([
    syncPendingMeetings(),
    syncPendingClients(),
    emailDraftService.syncPendingDrafts(),
  ]);

  // refresh cache from backend after sync
  try {
    const remote = await apiClient.getClients({ includeDeleted: true, limit: 500 });
    const remoteItems = remote.items || [];
    for (const raw of remoteItems) {
      const existing = await db.clients.get(raw.id);
      const localState = existing?.syncMeta?.syncState;
      if (localState === 'local-only' || localState === 'pending' || localState === 'conflicted') {
        continue;
      }

      await db.clients.put({
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
        createdAt: raw.createdAt || new Date().toISOString(),
        lastContactDate: raw.lastContactDate || undefined,
        totalMeetings: Number(raw.totalMeetings || 0),
        totalRevenue: Number(raw.totalRevenue || 0),
        assignedCommercialId: raw.assignedCommercialId || undefined,
        deletedAt: raw.deleted_at || raw.deletedAt || null,
        syncMeta: {
          version: raw.syncMeta?.version || 1,
          lastSyncedAt: raw.syncMeta?.lastSyncedAt || new Date().toISOString(),
          dirty: false,
          syncState: 'synced',
          deletedAt: raw.deleted_at || raw.deletedAt || null,
        },
      } as any);
    }
  } catch {
    // ignore refresh failures
  }

  return {
    meetingsSynced,
    clientsSynced,
    draftsSynced,
    conflicts: meetingConflicts + clientConflicts + draftConflicts,
  };
}
