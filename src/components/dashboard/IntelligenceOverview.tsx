import { useMemo } from 'react';
import { Brain, TrendingUp, TrendingDown, Target, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts';
import type { Meeting } from '@/types/meeting';

type HealthPoint = { date: string; label: string; score: number };

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function stageLabel(stage?: string) {
  switch (stage) {
    case 'contact_visits': return 'Contact';
    case 'value_proposition': return 'Proposition';
    case 'offer_negotiation': return 'Négociation';
    case 'closing': return 'Closing';
    case 'closed_lost': return 'Perdu';
    default: return 'Inconnu';
  }
}

function avg(nums: number[]) {
  if (!nums.length) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function formatCurrency(value: number, currency = 'TND') {
  try {
    return new Intl.NumberFormat('fr-TN', {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `${Math.round(value).toLocaleString('fr-FR')} ${currency}`;
  }
}

function computeHealthScore(meetings: Meeting[]) {
  if (!meetings.length) return 0;
  const win = avg(meetings.map((m) => m.analysis?.win_probability || 0));
  const sentiment = avg(meetings.map((m) => {
    const s = m.analysis?.sentiment;
    if (s === 'positive') return 100;
    if (s === 'neutral') return 60;
    if (s === 'negative') return 30;
    return 55;
  }));
  const cadence = clamp(meetings.length * 18, 0, 100);
  const friction = avg(meetings.map((m) => (m.analysis?.objections?.length || 0) + (m.analysis?.risks?.length || 0)));

  return Math.round(clamp(
    (win * 0.45) + (sentiment * 0.25) + (cadence * 0.2) - (friction * 3.5) + 8,
    0,
    100
  ));
}

interface IntelligenceOverviewProps {
  meetings: Meeting[];
}

const chartConfig = {
  score: {
    label: 'Health score',
    color: 'hsl(var(--primary))',
  },
} satisfies ChartConfig;

export function IntelligenceOverview({ meetings }: IntelligenceOverviewProps) {
  const now = useMemo(() => new Date(), []);

  const { healthTrend, coaching, forecast } = useMemo(() => {
    const ninetyDaysAgo = new Date(now);
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const recent = (meetings || []).filter((m) => new Date(m.created_at) >= ninetyDaysAgo);

    const byClient = new Map<string, Meeting[]>();
    for (const m of recent) {
      const key = m.clientId || 'client_default';
      if (!byClient.has(key)) byClient.set(key, []);
      byClient.get(key)!.push(m);
    }

    const points: HealthPoint[] = [];
    for (let offset = 84; offset >= 0; offset -= 7) {
      const end = new Date(now);
      end.setDate(end.getDate() - offset);
      const start = new Date(end);
      start.setDate(start.getDate() - 30);

      const clientScores = [...byClient.values()].map((clientMeetings) => {
        const slice = clientMeetings.filter((m) => {
          const dt = new Date(m.created_at);
          return dt >= start && dt <= end;
        });
        return computeHealthScore(slice);
      }).filter((v) => v > 0);

      points.push({
        date: end.toISOString(),
        label: end.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }),
        score: Math.round(avg(clientScores)),
      });
    }

    const weakMeetings = recent.filter((m) => (m.analysis?.win_probability || 0) < 45);
    const strongMeetings = recent.filter((m) => (m.analysis?.win_probability || 0) >= 65);

    const weakObjections = new Map<string, number>();
    weakMeetings.forEach((m) => (m.analysis?.objections || []).forEach((o) => {
      const k = o.trim();
      if (!k) return;
      weakObjections.set(k, (weakObjections.get(k) || 0) + 1);
    }));

    const strongObjections = new Set<string>();
    strongMeetings.forEach((m) => (m.analysis?.objections || []).forEach((o) => strongObjections.add(o.trim())));

    const objectionGaps = [...weakObjections.entries()]
      .filter(([k]) => !strongObjections.has(k))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([objection, count]) => ({
        objection,
        count,
        suggestion: `Préparer un talk-track: reconnaissance du point (« ${objection} »), preuve client, et mini-plan de mitigation en 2 étapes.`,
      }));

    const winPatternMap = new Map<string, number>();
    strongMeetings.forEach((m) => (m.analysis?.key_topics || []).forEach((topic) => {
      const k = topic.trim();
      if (!k) return;
      winPatternMap.set(k, (winPatternMap.get(k) || 0) + 1);
    }));
    const winPatterns = [...winPatternMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([topic, count]) => ({ topic, count }));

    const pending = recent
      .filter((m) => m.dealStatus !== 'won' && m.dealStatus !== 'lost' && (m.analysis?.sales_stage || ''))
      .map((m) => {
        const createdAt = new Date(m.created_at);
        const ageDays = Math.max(0, Math.round((now.getTime() - createdAt.getTime()) / 86_400_000));
        const stage = m.analysis?.sales_stage || 'contact_visits';
        const threshold = stage === 'contact_visits'
          ? 21
          : stage === 'value_proposition'
            ? 21
            : stage === 'offer_negotiation'
              ? 30
              : 20;
        const value = m.dealValue || 0;
        const probability = clamp(m.analysis?.win_probability || 0, 0, 100);
        const weighted = (value * probability) / 100;
        return {
          id: m.id,
          title: m.title,
          clientName: m.clientName || 'Client',
          stage,
          ageDays,
          isAging: ageDays > threshold,
          value,
          weighted,
          probability,
          currency: m.dealCurrency || 'TND',
        };
      })
      .sort((a, b) => b.weighted - a.weighted);

    const totalPipeline = pending.reduce((s, d) => s + d.value, 0);
    const weightedForecast = pending.reduce((s, d) => s + d.weighted, 0);
    const agingCount = pending.filter((d) => d.isAging).length;

    return {
      healthTrend: points,
      coaching: {
        objectionGaps,
        winPatterns,
      },
      forecast: {
        deals: pending.slice(0, 6),
        totalPipeline,
        weightedForecast,
        agingCount,
      },
    };
  }, [meetings, now]);

  const trendDelta = (healthTrend[healthTrend.length - 1]?.score || 0) - (healthTrend[0]?.score || 0);

  return (
    <div className="grid gap-6 xl:grid-cols-3">
      <Card className="glass-card xl:col-span-1">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingUp className="h-4 w-4 text-primary" />
            Santé client (90j)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Tendance globale</span>
            <Badge variant={trendDelta >= 0 ? 'default' : 'destructive'} className="gap-1">
              {trendDelta >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
              {trendDelta >= 0 ? '+' : ''}{trendDelta}
            </Badge>
          </div>
          <ChartContainer config={chartConfig} className="h-[210px] w-full">
            <LineChart data={healthTrend} margin={{ left: 8, right: 8, top: 8, bottom: 0 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={18} />
              <YAxis tickLine={false} axisLine={false} domain={[0, 100]} width={28} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Line type="monotone" dataKey="score" stroke="var(--color-score)" strokeWidth={2.4} dot={false} />
            </LineChart>
          </ChartContainer>
        </CardContent>
      </Card>

      <Card className="glass-card xl:col-span-1">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Brain className="h-4 w-4 text-primary" />
            Coaching commercial
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">Objection-handling gaps</p>
            <div className="space-y-2">
              {coaching.objectionGaps.length > 0 ? coaching.objectionGaps.map((g) => (
                <div key={g.objection} className="rounded-md border border-border p-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium line-clamp-1">{g.objection}</p>
                    <Badge variant="secondary">{g.count}x</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{g.suggestion}</p>
                </div>
              )) : <p className="text-xs text-muted-foreground">Pas assez de données pour détecter des gaps.</p>}
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">Win-patterns</p>
            <div className="flex flex-wrap gap-2">
              {coaching.winPatterns.length > 0 ? coaching.winPatterns.map((p) => (
                <Badge key={p.topic} variant="outline">{p.topic} ({p.count})</Badge>
              )) : <p className="text-xs text-muted-foreground">Pas encore de patterns de gain exploitables.</p>}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="glass-card xl:col-span-1">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Target className="h-4 w-4 text-primary" />
            Forecast pipeline
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-md border border-border p-2">
              <p className="text-[11px] text-muted-foreground">Pipeline brut</p>
              <p className="text-sm font-semibold">{formatCurrency(forecast.totalPipeline)}</p>
            </div>
            <div className="rounded-md border border-border p-2">
              <p className="text-[11px] text-muted-foreground">Forecast pondéré</p>
              <p className="text-sm font-semibold">{formatCurrency(forecast.weightedForecast)}</p>
            </div>
            <div className="rounded-md border border-border p-2">
              <p className="text-[11px] text-muted-foreground">Aging élevé</p>
              <p className="text-sm font-semibold inline-flex items-center gap-1">
                <AlertTriangle className="h-3 w-3 text-warning" />
                {forecast.agingCount}
              </p>
            </div>
          </div>

          <div className="space-y-2">
            {forecast.deals.length > 0 ? forecast.deals.map((d) => (
              <div key={d.id} className="rounded-md border border-border p-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium line-clamp-1">{d.clientName}</p>
                  <Badge variant={d.isAging ? 'destructive' : 'secondary'}>
                    {d.ageDays}j
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground line-clamp-1">{d.title} · {stageLabel(d.stage)}</p>
                <p className="mt-1 text-xs">
                  {d.probability}% × {formatCurrency(d.value, d.currency)} = <span className="font-medium">{formatCurrency(d.weighted, d.currency)}</span>
                </p>
              </div>
            )) : <p className="text-xs text-muted-foreground">Aucun deal en cours pour le forecast.</p>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
