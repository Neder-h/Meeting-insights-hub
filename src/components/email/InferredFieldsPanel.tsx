import React from 'react';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle } from 'lucide-react';
import type { EmailDraftInferredField } from '@/types/meeting';

function confidenceColor(c: number) {
  if (c >= 70) return { bar: 'bg-emerald-500', text: 'text-emerald-700 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-950/30' };
  if (c >= 40) return { bar: 'bg-amber-500', text: 'text-amber-700 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-950/30' };
  return { bar: 'bg-red-500', text: 'text-red-700 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-950/30' };
}

function sourceBadgeVariant(source: string): 'default' | 'secondary' | 'outline' | 'destructive' {
  if (source === 'analysis') return 'default';
  if (source === 'transcript') return 'secondary';
  if (source === 'manual') return 'outline';
  return 'destructive';
}

interface InferredFieldsProps {
  inferredFields: EmailDraftInferredField[];
  fieldsToVerify: string[];
}

export function InferredFieldsPanel({ inferredFields, fieldsToVerify }: InferredFieldsProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="space-y-2">
        <p className="text-sm font-medium">Inferred fields</p>
        {inferredFields.length === 0 ? (
          <p className="text-xs text-muted-foreground">No inferred fields available.</p>
        ) : (
          <div className="space-y-2">
            {inferredFields.map((field, i) => {
              const colors = confidenceColor(field.confidence);
              return (
                <div key={`${field.field}-${i}`} className={`rounded-lg border border-border/60 p-3 text-xs ${colors.bg}`}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-semibold capitalize">{field.field.replace(/([A-Z])/g, ' $1').trim()}</span>
                    <Badge variant={sourceBadgeVariant(field.source)} className="text-[10px] h-5 px-1.5">
                      {field.source}
                    </Badge>
                  </div>
                  <p className="text-muted-foreground mb-2 leading-relaxed">{field.value}</p>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${colors.bar}`}
                        style={{ width: `${Math.max(3, field.confidence)}%` }}
                      />
                    </div>
                    <span className={`text-[10px] font-medium tabular-nums ${colors.text}`}>
                      {field.confidence}%
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="space-y-2">
        <p className="flex items-center gap-1 text-sm font-medium text-amber-700 dark:text-amber-400">
          <AlertTriangle className="h-4 w-4" />
          Needs verification
        </p>
        {fieldsToVerify.length === 0 ? (
          <p className="text-xs text-muted-foreground">All fields verified.</p>
        ) : (
          <div className="space-y-1.5">
            {fieldsToVerify.map((field, i) => (
              <div
                key={i}
                className="flex items-start gap-2 rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 p-2.5 text-xs"
              >
                <AlertTriangle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                <span className="text-amber-800 dark:text-amber-300">{field}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
