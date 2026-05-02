import { cn } from '@/lib/utils';

interface WinProbabilityGaugeProps {
  probability: number;
  confidence: number;
  className?: string;
}

export function WinProbabilityGauge({
  probability,
  confidence,
  className,
}: WinProbabilityGaugeProps) {
  const circumference = 2 * Math.PI * 45;
  const strokeDashoffset = circumference - (probability / 100) * circumference;

  const getColor = (prob: number) => {
    if (prob >= 70) return 'text-success';
    if (prob >= 40) return 'text-warning';
    return 'text-destructive';
  };

  return (
    <div className={cn("flex flex-col items-center", className)}>
      <div className="relative">
        <svg className="h-40 w-40 -rotate-90 transform">
          {/* Background circle */}
          <circle
            cx="80"
            cy="80"
            r="45"
            stroke="currentColor"
            strokeWidth="10"
            fill="none"
            className="text-muted"
          />
          {/* Progress circle */}
          <circle
            cx="80"
            cy="80"
            r="45"
            stroke="url(#gradient)"
            strokeWidth="10"
            fill="none"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            className="transition-all duration-1000"
          />
          <defs>
            <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="hsl(217 91% 60%)" />
              <stop offset="100%" stopColor="hsl(187 94% 43%)" />
            </linearGradient>
          </defs>
        </svg>

        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={cn("text-4xl font-bold", getColor(probability))}>
            {probability}%
          </span>
          <span className="text-sm text-muted-foreground">Win Rate</span>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Confiance:</span>
        <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all duration-500"
            style={{ width: `${confidence}%` }}
          />
        </div>
        <span className="text-xs font-medium">{confidence}%</span>
      </div>
    </div>
  );
}
