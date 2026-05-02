import { useEffect, useMemo, useState } from 'react';
import { DollarSign, TrendingUp, TrendingDown, Target } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { RevenueData } from '@/types/meeting';
import { calculateGrowth, getAnnualRevenue, recalculateTotals, getPreviousYearRevenue } from '@/lib/revenueService';

function formatCurrency(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat('fr-TN', {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${amount.toLocaleString('fr-FR')} ${currency}`;
  }
}

interface RevenueCardProps {
  year?: number;
}

export function RevenueCard({ year: inputYear }: RevenueCardProps) {
  const [year, setYear] = useState<number>(inputYear || new Date().getFullYear());
  const [data, setData] = useState<RevenueData | null>(null);
  const [prev, setPrev] = useState<RevenueData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const current = await getAnnualRevenue(year) || await recalculateTotals(year);
        const previous = await getPreviousYearRevenue(year);
        if (cancelled) return;
        setData(current);
        setPrev(previous);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Erreur de chargement');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [year]);

  const growth = useMemo(() => calculateGrowth(data, prev), [data, prev]);
  const progress = useMemo(() => {
    if (!data?.target || data.target === 0) return null;
    return Math.min(100, Math.round((data.total / data.target) * 100));
  }, [data]);

  if (loading) {
    return (
      <Card className="glass-card rounded-xl p-0">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-lg">
            <DollarSign className="h-5 w-5 text-primary" />
            Chiffre d'affaires {year}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-3 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card className="glass-card rounded-xl p-0">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <DollarSign className="h-5 w-5 text-destructive" />
            Chiffre d'affaires {year}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{error || 'Aucune donnée'}</p>
        </CardContent>
      </Card>
    );
  }

  const currency = data.currency || 'TND';
  const growthPositive = growth !== null && growth >= 0;

  return (
    <Card className="glass-card rounded-xl p-0 bg-gradient-to-br from-primary/10 via-background to-background">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-lg">
          <DollarSign className="h-5 w-5 text-primary" />
          Chiffre d'affaires {year}
          <Badge variant="outline" className="ml-2">Local cache</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-3xl font-bold leading-tight">{formatCurrency(data.total, currency)}</p>
            <p className="text-sm text-muted-foreground">Total annuel</p>
          </div>
          {growth !== null && (
            <Badge variant={growthPositive ? 'default' : 'destructive'} className="gap-1">
              {growthPositive ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
              {growthPositive ? '+' : ''}{growth.toFixed(1)}% vs {year - 1}
            </Badge>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
          <span>YTD: {formatCurrency(data.ytd, currency)}</span>
          {data.previousYear !== undefined && (
            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1 text-xs">
              <TrendingUp className="h-4 w-4" /> {formatCurrency(data.previousYear, currency)} l'an dernier
            </span>
          )}
        </div>

        {data.target ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <div className="inline-flex items-center gap-1 text-muted-foreground">
                <Target className="h-4 w-4" />
                Objectif {formatCurrency(data.target, currency)}
              </div>
              <span className="text-xs text-muted-foreground">{progress}%</span>
            </div>
            <Progress value={progress || 0} className={progress !== null && progress >= 90 ? 'bg-green-500/20' : progress !== null && progress >= 70 ? 'bg-yellow-500/20' : 'bg-red-500/20'} />
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
