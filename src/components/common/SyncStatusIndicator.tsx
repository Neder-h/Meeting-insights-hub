import { AlertTriangle, RefreshCw, Wifi, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useSyncStatus } from '@/hooks/useSyncStatus';

export function SyncStatusIndicator() {
  const {
    online,
    syncing,
    pendingTotal,
    conflictTotal,
    snapshot,
    triggerSync,
    lastSyncedAt,
  } = useSyncStatus();

  return (
    <div className="flex items-center gap-2 rounded-xl border border-border/70 bg-background/70 px-3 py-1.5 text-xs">
      <span className="inline-flex items-center gap-1 text-muted-foreground">
        {online ? <Wifi className="h-3.5 w-3.5 text-emerald-500" /> : <WifiOff className="h-3.5 w-3.5 text-amber-500" />}
        {online ? 'Online' : 'Offline'}
      </span>

      {pendingTotal > 0 ? (
        <Badge variant="secondary">{pendingTotal} pending</Badge>
      ) : (
        <Badge variant="outline">Synced</Badge>
      )}

      {conflictTotal > 0 ? (
        <Badge variant="destructive" className="gap-1">
          <AlertTriangle className="h-3 w-3" />
          {conflictTotal} conflict{conflictTotal > 1 ? 's' : ''}
        </Badge>
      ) : null}

      {snapshot.revenueLocalOnlyRecords > 0 ? (
        <Badge variant="outline">Revenue local-only</Badge>
      ) : null}

      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="h-7 px-2"
        onClick={() => triggerSync()}
        disabled={!online || syncing}
      >
        <RefreshCw className={`mr-1 h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} />
        Sync
      </Button>

      {lastSyncedAt ? (
        <span className="hidden text-muted-foreground md:inline">
          {new Date(lastSyncedAt).toLocaleTimeString('fr-FR')}
        </span>
      ) : null}
    </div>
  );
}
