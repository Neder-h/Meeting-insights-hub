import { ReactNode } from 'react';
import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface InsightCardProps {
  title: string;
  icon: LucideIcon;
  iconColor?: string;
  items: string[];
  className?: string;
  emptyMessage?: string;
}

export function InsightCard({
  title,
  icon: Icon,
  iconColor = "text-primary",
  items,
  className,
  emptyMessage = "Aucun élément détecté",
}: InsightCardProps) {
  return (
    <div className={cn("glass-card rounded-xl p-6", className)}>
      <div className="mb-4 flex items-center gap-3">
        <div className={cn("rounded-lg bg-muted p-2", iconColor)}>
          <Icon className="h-5 w-5" />
        </div>
        <h3 className="font-semibold">{title}</h3>
      </div>

      {items.length > 0 ? (
        <ul className="space-y-3">
          {items.map((item, index) => (
            <li
              key={index}
              className="flex items-start gap-3 text-sm text-muted-foreground animate-fade-in"
              style={{ animationDelay: `${index * 100}ms` }}
            >
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
              {item}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">{emptyMessage}</p>
      )}
    </div>
  );
}
