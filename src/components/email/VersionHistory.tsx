import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ChevronDown, ChevronUp, RotateCcw } from 'lucide-react';
import type { EmailDraftVersion } from '@/types/meeting';

const EVENT_COLORS: Record<string, string> = {
  generated: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  regenerated: 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300',
  edited: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300',
  status_changed: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
  accepted: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
  approved: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
  sent: 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300',
  deleted: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
};

interface VersionHistoryProps {
  history: EmailDraftVersion[];
  onRestore: (version: EmailDraftVersion) => void;
  onCompare: (version: EmailDraftVersion) => void;
  isRestoring?: boolean;
}

export function VersionHistory({ history, onRestore, onCompare, isRestoring }: VersionHistoryProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (!history.length) return null;

  return (
    <div className="rounded-lg border border-border/60 p-3 space-y-2">
      <p className="text-sm font-medium">Version history ({history.length})</p>
      <div className="space-y-1.5 max-h-80 overflow-auto pr-1">
        {history.map((h) => {
          const isExpanded = expandedId === h.id;
          const colorClass = EVENT_COLORS[h.eventType] || EVENT_COLORS.edited;

          return (
            <div key={h.id} className="rounded-lg border border-border/50 overflow-hidden">
              <button
                onClick={() => setExpandedId(isExpanded ? null : h.id)}
                className="w-full flex items-center justify-between px-3 py-2 text-xs hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className={`text-[10px] h-5 px-1.5 ${colorClass}`}>
                    v{h.version}
                  </Badge>
                  <span className="font-medium">{h.eventType.replace(/_/g, ' ')}</span>
                  <span className="text-muted-foreground">· {h.status}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground tabular-nums">
                    {new Date(h.createdAt).toLocaleString()}
                  </span>
                  {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                </div>
              </button>

              {isExpanded && (
                <div className="border-t border-border/50 px-3 py-2.5 space-y-2 bg-muted/20">
                  <div className="text-xs">
                    <p className="font-medium text-muted-foreground mb-1">Subject</p>
                    <p>{h.subject || '(empty)'}</p>
                  </div>
                  <div className="text-xs">
                    <p className="font-medium text-muted-foreground mb-1">Body</p>
                    <pre className="whitespace-pre-wrap font-sans text-xs leading-relaxed max-h-40 overflow-auto bg-background/60 rounded p-2 border border-border/40">
                      {h.bodyText || '(empty)'}
                    </pre>
                  </div>
                  <div className="flex gap-2 pt-1">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      onClick={(e) => { e.stopPropagation(); onRestore(h); }}
                      disabled={isRestoring}
                    >
                      <RotateCcw className="mr-1 h-3 w-3" />
                      Restore
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs"
                      onClick={(e) => { e.stopPropagation(); onCompare(h); }}
                    >
                      Compare
                    </Button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
