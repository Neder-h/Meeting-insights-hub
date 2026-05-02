import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Check, ShieldCheck, Send } from 'lucide-react';

interface ApprovalPipelineProps {
  status: 'draft' | 'approved' | 'sent';
  approvedAt?: string | null;
  sentAt?: string | null;
}

const STEPS = [
  { key: 'draft', label: 'Draft', icon: Check },
  { key: 'approved', label: 'Approved', icon: ShieldCheck },
  { key: 'sent', label: 'Sent', icon: Send },
] as const;

function stepState(stepKey: string, currentStatus: string): 'done' | 'current' | 'upcoming' {
  const order = ['draft', 'approved', 'sent'];
  const currentIdx = order.indexOf(currentStatus);
  const stepIdx = order.indexOf(stepKey);
  if (stepIdx < currentIdx) return 'done';
  if (stepIdx === currentIdx) return 'current';
  return 'upcoming';
}

export function ApprovalPipeline({ status, approvedAt, sentAt }: ApprovalPipelineProps) {
  return (
    <div className="flex items-center gap-1">
      {STEPS.map((step, i) => {
        const state = stepState(step.key, status);
        const Icon = step.icon;

        const circleClass =
          state === 'done'
            ? 'bg-emerald-500 text-white border-emerald-500'
            : state === 'current'
              ? 'bg-primary text-primary-foreground border-primary'
              : 'bg-muted text-muted-foreground border-border';

        const lineClass =
          state === 'done' || (state === 'current' && i > 0)
            ? 'bg-emerald-500'
            : 'bg-border';

        const timestamp =
          step.key === 'approved' && approvedAt
            ? new Date(approvedAt).toLocaleDateString()
            : step.key === 'sent' && sentAt
              ? new Date(sentAt).toLocaleDateString()
              : null;

        return (
          <React.Fragment key={step.key}>
            {i > 0 && (
              <div className={`h-0.5 w-6 rounded-full ${lineClass} transition-colors`} />
            )}
            <div className="flex flex-col items-center gap-0.5">
              <div className={`flex h-6 w-6 items-center justify-center rounded-full border-2 transition-colors ${circleClass}`}>
                <Icon className="h-3 w-3" />
              </div>
              <span className="text-[10px] font-medium leading-none">{step.label}</span>
              {timestamp && (
                <span className="text-[9px] text-muted-foreground tabular-nums">{timestamp}</span>
              )}
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}
