import { useEffect, useState } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { CommercialPerformanceOverview } from '@/components/dashboard/CommercialPerformanceOverview';
import { CommercialCard } from '@/components/dashboard/CommercialCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getActiveCommercials, getAllPerformances, syncCommercialsFromUsers } from '@/lib/commercialService';
import { Commercial, CommercialPerformance } from '@/types/meeting';
import { AddRevenueForm } from '@/components/forms/AddRevenueForm';
import { SetTargetForm } from '@/components/forms/SetTargetForm';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { getAnalyticsTrends, getCoachingInsights, AnalyticsTrendResponse, CoachingInsightsResponse } from '@/lib/api';
import { Badge } from '@/components/ui/badge';

export default function PerformancePage() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [commercials, setCommercials] = useState<Commercial[]>([]);
  const [performances, setPerformances] = useState<CommercialPerformance[]>([]);
  const [loading, setLoading] = useState(true);
  const [trendAnalytics, setTrendAnalytics] = useState<AnalyticsTrendResponse | null>(null);
  const [coachingAnalytics, setCoachingAnalytics] = useState<CoachingInsightsResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      await syncCommercialsFromUsers();
      const [comms, perfs, trends, coaching] = await Promise.all([
        getActiveCommercials(),
        getAllPerformances(year),
        getAnalyticsTrends({ windowDays: 120, bucket: 'month' }).catch(() => null),
        getCoachingInsights({ windowDays: 120 }).catch(() => null),
      ]);
      if (!cancelled) {
        setCommercials(comms);
        setPerformances(perfs);
        setTrendAnalytics(trends);
        setCoachingAnalytics(coaching);
        setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [year]);

  return (
    <MainLayout>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Performance commerciale</h1>
          <p className="text-muted-foreground">Suivi des objectifs et revenus par commercial</p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger className="w-[120px]"><SelectValue placeholder="Année" /></SelectTrigger>
            <SelectContent>
              {[year - 1, year, year + 1].map((y) => (
                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <CommercialPerformanceOverview year={year} />

          <Card className="glass-card">
            <CardHeader>
              <CardTitle>Recurring objections & trend analytics</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {!trendAnalytics ? (
                <p className="text-sm text-muted-foreground">Aucune donnée de tendance disponible.</p>
              ) : (
                <>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded border border-border p-3">
                      <p className="text-xs text-muted-foreground">Meetings analyzed</p>
                      <p className="text-lg font-semibold">{trendAnalytics.totals.meetingsAnalyzed}</p>
                    </div>
                    <div className="rounded border border-border p-3">
                      <p className="text-xs text-muted-foreground">Unique objections</p>
                      <p className="text-lg font-semibold">{trendAnalytics.totals.uniqueObjections}</p>
                    </div>
                    <div className="rounded border border-border p-3">
                      <p className="text-xs text-muted-foreground">Top recurring</p>
                      <p className="text-lg font-semibold">{trendAnalytics.recurringObjections.slice(0, 5).reduce((s, x) => s + x.count, 0)}</p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    {trendAnalytics.recurringObjections.slice(0, 8).map((o) => (
                      <div key={o.normalized} className="flex items-center justify-between rounded border border-border p-2 text-sm">
                        <span className="line-clamp-1">{o.objection}</span>
                        <Badge variant="secondary">{o.count}x</Badge>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card className="glass-card">
            <CardHeader>
              <CardTitle>Coaching insights by commercial</CardTitle>
            </CardHeader>
            <CardContent>
              {!coachingAnalytics || coachingAnalytics.coaching.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucune donnée coaching disponible.</p>
              ) : (
                <div className="space-y-3">
                  {coachingAnalytics.coaching.map((item) => (
                    <div key={item.commercialId} className="rounded border border-border p-3">
                      <div className="flex items-center justify-between">
                        <p className="font-medium">{item.commercialName}</p>
                        <Badge variant={item.winRateTrend.delta >= 0 ? 'default' : 'destructive'}>
                          Win trend {item.winRateTrend.delta >= 0 ? '+' : ''}{item.winRateTrend.delta}
                        </Badge>
                      </div>
                      <div className="mt-2 grid gap-2 text-xs text-muted-foreground sm:grid-cols-4">
                        <span>Meetings: {item.totals.totalMeetings}</span>
                        <span>Avg win: {item.totals.avgWinProbability}%</span>
                        <span>Conversion: {item.stageConversion.conversionRate}%</span>
                        <span>Follow-up quality: {item.followUpQuality.score}%</span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {item.commonObjections.slice(0, 4).map((o) => (
                          <Badge key={`${item.commercialId}-${o.objection}`} variant="outline">
                            {o.objection} ({o.count})
                          </Badge>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {loading ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Skeleton className="h-48" />
              <Skeleton className="h-48" />
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {performances.map((perf) => (
                <CommercialCard key={perf.commercial.id} performance={perf} />
              ))}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <Tabs defaultValue="revenue">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="revenue">Ajouter revenu</TabsTrigger>
              <TabsTrigger value="target">Objectifs</TabsTrigger>
            </TabsList>
            <TabsContent value="revenue">
              <Card className="glass-card">
                <CardHeader>
                  <CardTitle>Ajouter un revenu</CardTitle>
                </CardHeader>
                <CardContent>
                  <AddRevenueForm commercials={commercials} onSaved={() => getAllPerformances(year).then(setPerformances)} />
                </CardContent>
              </Card>
            </TabsContent>
            <TabsContent value="target">
              <Card className="glass-card">
                <CardHeader>
                  <CardTitle>Définir un objectif</CardTitle>
                </CardHeader>
                <CardContent>
                  {commercials.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Aucun commercial actif.</p>
                  ) : (
                    <SetTargetForm
                      commercials={commercials}
                      onSaved={() => getAllPerformances(year).then(setPerformances)}
                    />
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </MainLayout>
  );
}
