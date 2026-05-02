import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { CommercialPerformance } from '@/types/meeting';
import { TrendingUp, TrendingDown } from 'lucide-react';

const statusColor: Record<CommercialPerformance['status'], string> = {
  'on-track': 'bg-green-500/15 text-green-700',
  'at-risk': 'bg-yellow-500/15 text-yellow-700',
  'behind': 'bg-red-500/15 text-red-700',
};

function progressColor(pct: number) {
  if (pct >= 100) return 'bg-green-500/40';
  if (pct >= 90) return 'bg-green-500/25';
  if (pct >= 70) return 'bg-yellow-500/25';
  return 'bg-red-500/25';
}

interface CommercialCardProps {
  performance: CommercialPerformance;
}

export function CommercialCard({ performance }: CommercialCardProps) {
  const { commercial, target, revenue, progress, status, projectedAnnual } = performance;
  const currency = target?.currency || 'TND';
  const quarters = [
    { label: 'Q1', target: target?.q1Target ?? 0, actual: revenue.q1, pct: progress.q1Progress },
    { label: 'Q2', target: target?.q2Target ?? 0, actual: revenue.q2, pct: progress.q2Progress },
    { label: 'Q3', target: target?.q3Target ?? 0, actual: revenue.q3, pct: progress.q3Progress },
    { label: 'Q4', target: target?.q4Target ?? 0, actual: revenue.q4, pct: progress.q4Progress },
  ];

  return (
    <Card className="glass-card">
      <CardHeader className="flex flex-row items-start justify-between gap-4 pb-4">
        <div>
          <CardTitle className="text-lg">{commercial.name}</CardTitle>
          <p className="text-sm text-muted-foreground">{commercial.email}</p>
        </div>
        <Badge className={statusColor[status]}>{status.replace('-', ' ')}</Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">Annuel</span>
            <span className="text-muted-foreground">{progress.annualProgress}%</span>
          </div>
          <Progress value={progress.annualProgress} className={progressColor(progress.annualProgress)} />
          <p className="mt-1 text-sm text-muted-foreground">
            {revenue.ytd.toLocaleString('fr-FR')} / {(target?.annualTarget ?? 0).toLocaleString('fr-FR')} {currency}
          </p>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          {quarters.map((q, idx) => (
            <div key={q.label} className="rounded-lg border border-border p-3">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">{q.label}</span>
                <span className="text-muted-foreground">{q.pct}%</span>
              </div>
              <Progress value={q.pct} className={progressColor(q.pct)} />
              <p className="mt-1 text-xs text-muted-foreground">
                {q.actual.toLocaleString('fr-FR')} / {q.target.toLocaleString('fr-FR')} {currency}
              </p>
              {idx === 2 && (
                <Badge variant="secondary" className="mt-2">Trimestre en cours</Badge>
              )}
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between text-sm">
          <div className="inline-flex items-center gap-2 text-muted-foreground">
            {projectedAnnual >= (target?.annualTarget ?? 0) ? (
              <TrendingUp className="h-4 w-4 text-green-600" />
            ) : (
              <TrendingDown className="h-4 w-4 text-yellow-600" />
            )}
            Projection: {projectedAnnual.toLocaleString('fr-FR')} {currency}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
