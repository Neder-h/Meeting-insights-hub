import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, Plus, Search, Filter, Loader2, ArrowRight } from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ClientStatus } from '@/types/meeting';
import { formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';
import { useClientSummary } from '@/hooks/useClientSummary';
import { VirtualizedList } from '@/components/common/VirtualizedList';
import { db } from '@/integrations/local/client';

const statusLabels: Record<ClientStatus, string> = {
  prospect: 'Prospect',
  active: 'Actif',
  inactive: 'Inactif',
  churned: 'Perdu',
};

const statusColor: Record<ClientStatus, string> = {
  prospect: 'bg-blue-500/10 text-blue-600',
  active: 'bg-green-500/10 text-green-600',
  inactive: 'bg-muted text-muted-foreground',
  churned: 'bg-red-500/10 text-red-600',
};

export default function ClientsPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<ClientStatus | 'all'>('all');
  const [page, setPage] = useState(1);
  const [syncStateByClientId, setSyncStateByClientId] = useState<Record<string, string>>({});

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 250);
    return () => clearTimeout(t);
  }, [search]);

  const { data, isLoading, isFetching } = useClientSummary({
    page,
    limit: 18,
    search: debouncedSearch || undefined,
    status: statusFilter,
  });

  const clients = data?.items || [];
  const total = data?.pagination.total || 0;
  const totalPages = data?.pagination.totalPages || 1;

  useEffect(() => {
    if (!clients.length) return;
    clients.forEach((c) => {
      db.clients.put({
        id: c.clientId,
        name: c.clientName,
        status: c.status,
        createdAt: c.lastContact || new Date().toISOString(),
        lastContactDate: c.lastContact || undefined,
        totalMeetings: c.meetingsCount,
        totalRevenue: c.revenue,
      } as any).catch(() => {});
    });
  }, [clients]);

  useEffect(() => {
    let mounted = true;
    const loadSyncStates = async () => {
      const rows = await db.clients.toArray();
      if (!mounted) return;
      const map: Record<string, string> = {};
      rows.forEach((r: any) => {
        map[r.id] = r?.syncMeta?.syncState || 'synced';
      });
      setSyncStateByClientId(map);
    };
    loadSyncStates().catch(() => {});
    return () => { mounted = false; };
  }, [clients]);

  return (
    <MainLayout>
      <div className="animate-fade-in">
        <div className="mb-8 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl font-bold">Clients</h1>
            <p className="text-muted-foreground">Vue client-centrée de vos réunions</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setStatusFilter('all')} className={statusFilter === 'all' ? 'border-primary text-primary' : ''}>
              <Filter className="h-4 w-4 mr-2" />
              {statusFilter === 'all' ? 'Tous' : statusLabels[statusFilter as ClientStatus]}
            </Button>
            <Button variant="gradient" onClick={() => navigate('/')}>
              <Plus className="h-4 w-4 mr-2" />
              Nouveau client via réunion
            </Button>
          </div>
        </div>

        <div className="mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher par nom ou contact..."
              className="pl-10 bg-muted/50"
            />
          </div>
        </div>

        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        )}

        {!isLoading && total === 0 && (
          <div className="text-center glass-card p-8 rounded-2xl">
            <p className="text-muted-foreground">Aucun client pour l'instant.</p>
            <Button className="mt-4" onClick={() => navigate('/')}>Ajouter votre premier client</Button>
          </div>
        )}

        {!isLoading && clients.length > 0 && (
          <>
            {clients.length > 10 ? (
              <VirtualizedList
                items={clients}
                itemHeight={220}
                height={880}
                className="rounded-xl"
                renderItem={(client) => {
                  const lastContact = client.lastContact
                    ? formatDistanceToNow(new Date(client.lastContact), { addSuffix: true, locale: fr })
                    : 'Jamais';
                  return (
                    <div className="pb-4">
                      <div
                        className="glass-card rounded-xl p-5 hover:-translate-y-1 transition-transform cursor-pointer"
                        onClick={() => navigate(`/clients/${client.clientId}`)}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                              <Building2 className="h-5 w-5" />
                            </div>
                            <div>
                              <p className="font-semibold leading-tight">{client.clientName}</p>
                              <p className="text-xs text-muted-foreground">Industrie inconnue</p>
                            </div>
                          </div>
                            <div className="flex items-center gap-2">
                              <Badge className={statusColor[client.status]}>{statusLabels[client.status]}</Badge>
                              {syncStateByClientId[client.clientId] && syncStateByClientId[client.clientId] !== 'synced' ? (
                                <Badge variant={syncStateByClientId[client.clientId] === 'conflicted' ? 'destructive' : 'outline'}>
                                  {syncStateByClientId[client.clientId] === 'local-only' && 'Local-only'}
                                  {syncStateByClientId[client.clientId] === 'pending' && 'Pending'}
                                  {syncStateByClientId[client.clientId] === 'conflicted' && 'Conflict'}
                                </Badge>
                              ) : null}
                            </div>
                        </div>

                        <div className="mt-4 space-y-2 text-sm text-muted-foreground">
                          <div className="flex justify-between">
                            <span>Réunions</span>
                            <span className="font-medium text-foreground">{client.meetingsCount}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Dernier contact</span>
                            <span className="font-medium text-foreground">{lastContact}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Revenu gagné</span>
                            <span className="font-medium text-foreground">{client.revenue.toLocaleString('fr-FR')} TND</span>
                          </div>
                        </div>

                        <div className="mt-4 flex items-center gap-2 text-primary text-sm">
                          Voir le profil
                          <ArrowRight className="h-4 w-4" />
                        </div>
                      </div>
                    </div>
                  );
                }}
              />
            ) : (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {clients.map((client) => {
                  const lastContact = client.lastContact
                    ? formatDistanceToNow(new Date(client.lastContact), { addSuffix: true, locale: fr })
                    : 'Jamais';
                  return (
                    <div
                      key={client.clientId}
                      className="glass-card rounded-xl p-5 hover:-translate-y-1 transition-transform cursor-pointer"
                      onClick={() => navigate(`/clients/${client.clientId}`)}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                            <Building2 className="h-5 w-5" />
                          </div>
                          <div>
                            <p className="font-semibold leading-tight">{client.clientName}</p>
                            <p className="text-xs text-muted-foreground">Industrie inconnue</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge className={statusColor[client.status]}>{statusLabels[client.status]}</Badge>
                          {syncStateByClientId[client.clientId] && syncStateByClientId[client.clientId] !== 'synced' ? (
                            <Badge variant={syncStateByClientId[client.clientId] === 'conflicted' ? 'destructive' : 'outline'}>
                              {syncStateByClientId[client.clientId] === 'local-only' && 'Local-only'}
                              {syncStateByClientId[client.clientId] === 'pending' && 'Pending'}
                              {syncStateByClientId[client.clientId] === 'conflicted' && 'Conflict'}
                            </Badge>
                          ) : null}
                        </div>
                      </div>

                      <div className="mt-4 space-y-2 text-sm text-muted-foreground">
                        <div className="flex justify-between">
                          <span>Réunions</span>
                          <span className="font-medium text-foreground">{client.meetingsCount}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Dernier contact</span>
                          <span className="font-medium text-foreground">{lastContact}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Revenu gagné</span>
                          <span className="font-medium text-foreground">{client.revenue.toLocaleString('fr-FR')} TND</span>
                        </div>
                      </div>

                      <div className="mt-4 flex items-center gap-2 text-primary text-sm">
                        Voir le profil
                        <ArrowRight className="h-4 w-4" />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="mt-6 flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Page {page} / {totalPages} · {total} total
                {isFetching ? ' · mise à jour…' : ''}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1 || isFetching}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Précédent
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages || isFetching}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  Suivant
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </MainLayout>
  );
}
