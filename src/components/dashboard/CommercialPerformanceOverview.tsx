import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { CommercialPerformance } from '@/types/meeting';
import { getAllPerformances } from '@/lib/commercialService';

const statusVariant: Record<CommercialPerformance['status'], 'default' | 'secondary' | 'destructive'> = {
  'on-track': 'default',
  'at-risk': 'secondary',
  'behind': 'destructive',
};

interface CommercialPerformanceOverviewProps {
  year?: number;
  onSelect?: (perf: CommercialPerformance) => void;
}

export function CommercialPerformanceOverview({ year: inputYear, onSelect }: CommercialPerformanceOverviewProps) {
  const [year] = useState<number>(inputYear || new Date().getFullYear());
  const [data, setData] = useState<CommercialPerformance[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      const res = await getAllPerformances(year);
      if (!cancelled) {
        setData(res);
        setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [year]);

  if (loading) {
    return (
      <Card className="glass-card">
        <CardHeader>
          <CardTitle>Performance commerciale</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Card className="glass-card">
        <CardHeader>
          <CardTitle>Performance commerciale</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Aucune donnée disponible.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="glass-card">
      <CardHeader>
        <CardTitle>Performance commerciale ({year})</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-muted-foreground">
            <tr>
              <th className="py-2 text-left">Commercial</th>
              <th className="py-2 text-left">Objectif annuel</th>
              <th className="py-2 text-left">YTD</th>
              <th className="py-2 text-left">Progression</th>
              <th className="py-2 text-left">Statut</th>
            </tr>
          </thead>
          <tbody>
            {data.map((perf) => {
              const target = perf.target?.annualTarget ?? 0;
              const progress = perf.progress.annualProgress;
              return (
                <tr
                  key={perf.commercial.id}
                  className="hover:bg-muted/40 cursor-pointer"
                  onClick={() => onSelect?.(perf)}
                >
                  <td className="py-2 font-medium">{perf.commercial.name}</td>
                  <td className="py-2">{target.toLocaleString('fr-FR')} {perf.target?.currency || 'TND'}</td>
                  <td className="py-2">{perf.revenue.ytd.toLocaleString('fr-FR')} {perf.target?.currency || 'TND'}</td>
                  <td className="py-2">{progress}%</td>
                  <td className="py-2">
                    <Badge variant={statusVariant[perf.status]} className="capitalize">
                      {perf.status.replace('-', ' ')}
                    </Badge>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
