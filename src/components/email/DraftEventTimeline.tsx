import React from 'react';
import {
  Mail,
  Pencil,
  RefreshCw,
  ShieldCheck,
  Send,
  Trash2,
  CheckCircle2,
  Clock,
  GitBranch,
} from 'lucide-react';
import type { EmailDraftEvent } from '@/types/meeting';

const ACTION_CONFIG: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  generated: { icon: Mail, color: 'text-blue-500', label: 'Generated' },
  regenerated: { icon: RefreshCw, color: 'text-violet-500', label: 'Regenerated' },
  edited: { icon: Pencil, color: 'text-orange-500', label: 'Edited' },
  accepted: { icon: CheckCircle2, color: 'text-emerald-500', label: 'Accepted' },
  approved: { icon: ShieldCheck, color: 'text-emerald-600', label: 'Approved' },
  sent: { icon: Send, color: 'text-sky-500', label: 'Sent' },
  deleted: { icon: Trash2, color: 'text-red-500', label: 'Deleted' },
};

function relativeTime(dateStr: string) {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

interface DraftEventTimelineProps {
  events: EmailDraftEvent[];
  maxItems?: number;
}

export function DraftEventTimeline({ events, maxItems = 30 }: DraftEventTimelineProps) {
  if (!events.length) return null;

  const items = events.slice(0, maxItems);

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium flex items-center gap-2">
        <Clock className="h-4 w-4 text-muted-foreground" />
        Draft activity
      </p>
      <div className="relative pl-5 space-y-0">
        {/* vertical line */}
        <div className="absolute left-[9px] top-2 bottom-2 w-px bg-border" />

        {items.map((evt, i) => {
          const cfg = ACTION_CONFIG[evt.action] || ACTION_CONFIG.edited;
          const Icon = cfg.icon;
          return (
            <div key={evt.id || i} className="relative flex items-start gap-3 py-1.5">
              <div className={`relative z-10 flex h-[18px] w-[18px] items-center justify-center rounded-full bg-background border border-border ${cfg.color}`}>
                <Icon className="h-3 w-3" />
              </div>
              <div className="flex-1 flex items-center justify-between min-w-0 text-xs">
                <span className="font-medium">
                  {cfg.label}
                  {evt.hadEdits && <span className="text-muted-foreground ml-1">(with edits)</span>}
                  {evt.status && (
                    <span className="ml-1.5 text-muted-foreground">· {evt.status}</span>
                  )}
                </span>
                <span className="text-muted-foreground shrink-0 ml-2 tabular-nums">
                  {relativeTime(evt.createdAt)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
