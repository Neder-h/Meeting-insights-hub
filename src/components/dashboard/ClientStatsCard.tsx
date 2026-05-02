import { useEffect, useMemo, useState } from 'react';
import { Users, Activity, AlertTriangle, Crown } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { getAllClients } from '@/lib/clientService';
import { Client } from '@/types/meeting';

const THIRTY_DAYS = 1000 * 60 * 60 * 24 * 30;

export function ClientStatsCard() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const list = await getAllClients();
      setClients(list);
      setLoading(false);
    };
    load();
  }, []);

  const stats = useMemo(() => {
    const now = Date.now();
    const total = clients.length;
    const active = clients.filter((c) => c.status === 'active' || c.status === 'prospect').length;
    const newThisMonth = clients.filter((c) => {
      const d = new Date(c.createdAt);
      const today = new Date();
      return d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth();
    }).length;
    const atRisk = clients.filter((c) => {
      if (c.status === 'churned') return true;
      if (!c.lastContactDate) return false;
      return now - new Date(c.lastContactDate).getTime() > THIRTY_DAYS;
    }).length;
    const topClient = clients.reduce((best, c) => {
      const rev = c.totalRevenue || 0;
      if (!best || rev > (best.totalRevenue || 0)) return c;
      return best;
    }, null as Client | null);

    return { total, active, newThisMonth, atRisk, topClient };
  }, [clients]);

  if (loading) {
    return (
      <Card className="glass-card">
        <CardHeader>
          <CardTitle>Clients</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </CardContent>
      </Card>
    );
  }

  const items = [
    { label: 'Total clients', value: stats.total, icon: Users },
    { label: 'Actifs / prospects', value: stats.active, icon: Activity },
    { label: 'Nouveaux ce mois', value: stats.newThisMonth, icon: Crown },
    { label: 'À risque', value: stats.atRisk, icon: AlertTriangle },
  ];

  return (
    <Card className="glass-card">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Clients</CardTitle>
        {stats.topClient && (
          <span className="text-xs text-muted-foreground">Top: {stats.topClient.name}</span>
        )}
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {items.map((item) => (
          <div key={item.label} className="rounded-lg border border-border p-3 flex items-center gap-3">
            <div className="rounded-md bg-primary/10 p-2 text-primary">
              <item.icon className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{item.label}</p>
              <p className="text-lg font-semibold">{item.value}</p>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
