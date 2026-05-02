import { Smile, Meh, Frown } from 'lucide-react';
import { Sentiment } from '@/types/meeting';
import { cn } from '@/lib/utils';

interface SentimentBadgeProps {
  sentiment: Sentiment;
  size?: 'sm' | 'md' | 'lg';
}

const sentimentConfig = {
  positive: {
    icon: Smile,
    label: 'Positif',
    color: 'bg-success/10 text-success border-success/20',
  },
  neutral: {
    icon: Meh,
    label: 'Neutre',
    color: 'bg-warning/10 text-warning border-warning/20',
  },
  negative: {
    icon: Frown,
    label: 'Négatif',
    color: 'bg-destructive/10 text-destructive border-destructive/20',
  },
};

const sizeConfig = {
  sm: 'h-6 px-2 text-xs gap-1',
  md: 'h-8 px-3 text-sm gap-2',
  lg: 'h-10 px-4 text-base gap-2',
};

export function SentimentBadge({ sentiment, size = 'md' }: SentimentBadgeProps) {
  const config = sentimentConfig[sentiment];
  const Icon = config.icon;

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border font-medium",
        config.color,
        sizeConfig[size]
      )}
    >
      <Icon className={cn(size === 'sm' ? 'h-3 w-3' : 'h-4 w-4')} />
      {config.label}
    </span>
  );
}
