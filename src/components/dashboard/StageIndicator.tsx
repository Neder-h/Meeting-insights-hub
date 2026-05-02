import { SalesStage } from '@/types/meeting';
import { cn } from '@/lib/utils';

interface StageIndicatorProps {
  stage: SalesStage;
  className?: string;
}

const stages: { key: SalesStage; label: string; color: string }[] = [
  { key: 'contact_visits', label: 'Contact-lettre-visites', color: 'yellow' },
  { key: 'value_proposition', label: 'Proposition de valeur-présentation', color: 'green' },
  { key: 'offer_negotiation', label: 'Proposition offre-objection-négociation', color: 'blue' },
  { key: 'closing', label: 'Closing-BC', color: 'red' },
];

export function StageIndicator({ stage, className }: StageIndicatorProps) {
  const currentIndex = stages.findIndex((s) => s.key === stage);

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex items-center justify-between">
        {stages.map((s, index) => {
          const isActive = index <= currentIndex;
          const isCurrent = s.key === stage;

          const getStageColor = (color: string) => {
            switch (color) {
              case 'yellow': return 'bg-yellow-500 text-yellow-50 ring-yellow-300';
              case 'green': return 'bg-green-500 text-green-50 ring-green-300';
              case 'blue': return 'bg-blue-500 text-blue-50 ring-blue-300';
              case 'red': return 'bg-red-500 text-red-50 ring-red-300';
              default: return 'bg-primary text-primary-foreground ring-primary/30';
            }
          };

          const getStageBgColor = (color: string) => {
            switch (color) {
              case 'yellow': return 'bg-yellow-100 text-yellow-800';
              case 'green': return 'bg-green-100 text-green-800';
              case 'blue': return 'bg-blue-100 text-blue-800';
              case 'red': return 'bg-red-100 text-red-800';
              default: return 'bg-primary/20 text-primary';
            }
          };

          return (
            <div key={s.key} className="flex flex-col items-center gap-2">
              <div
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-all",
                  isCurrent
                    ? `${getStageColor(s.color)} ring-2 ring-offset-2 ring-offset-background`
                    : isActive
                    ? getStageBgColor(s.color)
                    : "bg-muted text-muted-foreground"
                )}
              >
                {index + 1}
              </div>
              <span
                className={cn(
                  "text-xs transition-colors",
                  isCurrent
                    ? "font-medium text-foreground"
                    : isActive
                    ? "text-muted-foreground"
                    : "text-muted-foreground/50"
                )}
              >
                {s.label}
              </span>
            </div>
          );
        })}
      </div>

      <div className="relative h-1.5 rounded-full bg-muted overflow-hidden">
        <div className="absolute inset-0 flex">
          {stages.map((s, index) => {
            const isActive = index <= currentIndex;
            const segmentWidth = `${100 / stages.length}%`;

            const getProgressColor = (color: string) => {
              switch (color) {
                case 'yellow': return 'bg-yellow-500';
                case 'green': return 'bg-green-500';
                case 'blue': return 'bg-blue-500';
                case 'red': return 'bg-red-500';
                default: return 'bg-primary';
              }
            };

            return (
              <div
                key={s.key}
                className={`h-full transition-all duration-500 ${
                  isActive ? getProgressColor(s.color) : 'bg-muted'
                }`}
                style={{ width: segmentWidth }}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
