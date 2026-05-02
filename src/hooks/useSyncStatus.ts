import { useCallback, useEffect, useMemo, useState } from 'react';
import { db } from '@/integrations/local/client';
import { runBackgroundSync, SyncResult } from '@/services/syncService';

export interface SyncStatusSnapshot {
  pendingMeetings: number;
  pendingClients: number;
  pendingDrafts: number;
  conflictedMeetings: number;
  conflictedClients: number;
  conflictedDrafts: number;
  revenueLocalOnlyRecords: number;
}

function isPendingState(syncState?: string) {
  return syncState === 'pending' || syncState === 'local-only';
}

async function collectSnapshot(): Promise<SyncStatusSnapshot> {
  const [meetings, clients, drafts, monthlyRevenue, commercialRevenue, commercialTargets, annualRevenue] = await Promise.all([
    db.meetings.toArray(),
    db.clients.toArray(),
    db.emailDrafts.toArray(),
    db.monthly_revenue.toArray(),
    db.commercial_revenue.toArray(),
    db.commercial_targets.toArray(),
    db.revenue.toArray(),
  ]);

  const pendingMeetings = meetings.filter((m: any) => isPendingState(m?.syncMeta?.syncState) || m?.syncMeta?.dirty).length;
  const pendingClients = clients.filter((c: any) => isPendingState(c?.syncMeta?.syncState) || c?.syncMeta?.dirty).length;
  const pendingDrafts = drafts.filter((d: any) => isPendingState(d?.syncMeta?.syncState) || d?.syncMeta?.dirty).length;

  const conflictedMeetings = meetings.filter((m: any) => m?.syncMeta?.syncState === 'conflicted').length;
  const conflictedClients = clients.filter((c: any) => c?.syncMeta?.syncState === 'conflicted').length;
  const conflictedDrafts = drafts.filter((d: any) => d?.syncMeta?.syncState === 'conflicted').length;

  return {
    pendingMeetings,
    pendingClients,
    pendingDrafts,
    conflictedMeetings,
    conflictedClients,
    conflictedDrafts,
    revenueLocalOnlyRecords: monthlyRevenue.length + commercialRevenue.length + commercialTargets.length + annualRevenue.length,
  };
}

export function useSyncStatus() {
  const [snapshot, setSnapshot] = useState<SyncStatusSnapshot>({
    pendingMeetings: 0,
    pendingClients: 0,
    pendingDrafts: 0,
    conflictedMeetings: 0,
    conflictedClients: 0,
    conflictedDrafts: 0,
    revenueLocalOnlyRecords: 0,
  });
  const [syncing, setSyncing] = useState(false);
  const [lastResult, setLastResult] = useState<SyncResult | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [online, setOnline] = useState<boolean>(typeof navigator !== 'undefined' ? navigator.onLine : true);

  const refreshSnapshot = useCallback(async () => {
    const value = await collectSnapshot();
    setSnapshot(value);
  }, []);

  const triggerSync = useCallback(async () => {
    if (!online) return null;
    setSyncing(true);
    try {
      const result = await runBackgroundSync();
      setLastResult(result);
      setLastSyncedAt(new Date().toISOString());
      await refreshSnapshot();
      return result;
    } finally {
      setSyncing(false);
    }
  }, [online, refreshSnapshot]);

  useEffect(() => {
    refreshSnapshot().catch(() => {});

    const interval = setInterval(() => {
      refreshSnapshot().catch(() => {});
    }, 5000);

    const onOnline = () => {
      setOnline(true);
      triggerSync().catch(() => {});
    };
    const onOffline = () => setOnline(false);

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);

    return () => {
      clearInterval(interval);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [refreshSnapshot, triggerSync]);

  const pendingTotal = useMemo(
    () => snapshot.pendingMeetings + snapshot.pendingClients + snapshot.pendingDrafts,
    [snapshot.pendingMeetings, snapshot.pendingClients, snapshot.pendingDrafts],
  );

  const conflictTotal = useMemo(
    () => snapshot.conflictedMeetings + snapshot.conflictedClients + snapshot.conflictedDrafts,
    [snapshot.conflictedMeetings, snapshot.conflictedClients, snapshot.conflictedDrafts],
  );

  return {
    online,
    syncing,
    pendingTotal,
    conflictTotal,
    snapshot,
    lastResult,
    lastSyncedAt,
    refreshSnapshot,
    triggerSync,
  };
}
