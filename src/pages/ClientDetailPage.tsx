import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Building2, Calendar, Clock, Info, Loader2, Mail, Phone, Globe, User, Pencil } from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useMeetings } from '@/hooks/useMeetings';
import { Client, ClientStatus, Meeting } from '@/types/meeting';
import { getClientById, syncClientsFromMeetings } from '@/lib/clientService';
import { getClient360, Client360Response } from '@/lib/api';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ClientForm } from '@/components/clients/ClientForm';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

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

export default function ClientDetailPage() {
  const { clientId } = useParams();
  const navigate = useNavigate();
  const { data: meetings = [], isLoading: loadingMeetings } = useMeetings();
  const [client, setClient] = useState<Client | null>(null);
  const [loadingClient, setLoadingClient] = useState(true);
  const [stats, setStats] = useState<any>(null);
  const [showEdit, setShowEdit] = useState(false);
  const [client360, setClient360] = useState<Client360Response | null>(null);

  useEffect(() => {
    const run = async () => {
      await syncClientsFromMeetings(meetings as Meeting[]);
      if (clientId) {
        const [c, c360] = await Promise.all([
          getClientById(clientId),
          getClient360(clientId).catch(() => null),
        ]);
        setClient(c || null);
        setClient360(c360);
        setStats(null);
      }
      setLoadingClient(false);
    };
    run();
  }, [clientId, meetings]);

  const clientMeetings = useMemo(() => (meetings as Meeting[]).filter((m) => m.clientId === clientId), [meetings, clientId]);

  const derivedStats = useMemo(() => {
    const totalMeetings = clientMeetings.length;
    const revenue = clientMeetings
      .filter((m) => m.dealStatus === 'won' && m.dealValue)
      .reduce((sum, m) => sum + (m.dealValue || 0), 0);
    const lastMeeting = clientMeetings.length > 0
      ? clientMeetings.reduce((latest, m) => (new Date(m.created_at) > new Date(latest.created_at) ? m : latest), clientMeetings[0])
      : null;
    return {
      totalMeetings,
      totalRevenue: revenue,
      lastMeetingDate: lastMeeting?.created_at,
    };
  }, [clientMeetings]);

  const isLoading = loadingClient || loadingMeetings;

  if (isLoading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
        </div>
      </MainLayout>
    );
  }

  if (!client) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center min-h-[60vh] flex-col gap-3">
          <p className="text-muted-foreground">Client introuvable</p>
          <Button variant="outline" onClick={() => navigate('/clients')}>Retour</Button>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="animate-fade-in space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate('/clients')} className="text-muted-foreground">
              <ArrowLeft className="h-4 w-4 mr-1" /> Clients
            </Button>
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                <Building2 className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-2xl font-bold">{client.name}</h1>
                <div className="flex gap-2 items-center text-sm text-muted-foreground">
                  {client.industry && <Badge variant="secondary">{client.industry}</Badge>}
                  {client.contactPerson && (
                    <span className="flex items-center gap-1"><User className="h-4 w-4" /> {client.contactPerson}</span>
                  )}
                </div>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge className={statusColor[client.status]}>{statusLabels[client.status]}</Badge>
            <Badge variant={client.syncMeta?.syncState === 'conflicted' ? 'destructive' : 'outline'}>
              {client.syncMeta?.syncState === 'local-only' && 'Local-only'}
              {client.syncMeta?.syncState === 'pending' && 'Pending sync'}
              {client.syncMeta?.syncState === 'conflicted' && 'Sync conflict'}
              {(!client.syncMeta?.syncState || client.syncMeta?.syncState === 'synced') && 'Synced'}
            </Badge>
            <Dialog open={showEdit} onOpenChange={setShowEdit}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline">
                  <Pencil className="h-4 w-4 mr-1" /> Éditer
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Modifier le client</DialogTitle>
                </DialogHeader>
                <ClientForm
                  client={client}
                  onSaved={(updated) => {
                    setClient(updated);
                    setShowEdit(false);
                  }}
                />
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="glass-card p-4 rounded-xl">
            <p className="text-sm text-muted-foreground">Réunions</p>
            <p className="text-2xl font-bold">{derivedStats.totalMeetings}</p>
          </div>
          <div className="glass-card p-4 rounded-xl">
            <p className="text-sm text-muted-foreground">Revenu gagné</p>
            <p className="text-2xl font-bold">{derivedStats.totalRevenue.toLocaleString('fr-FR')} TND</p>
          </div>
          <div className="glass-card p-4 rounded-xl">
            <p className="text-sm text-muted-foreground">Dernier contact</p>
            <p className="text-2xl font-bold">{derivedStats.lastMeetingDate ? format(new Date(derivedStats.lastMeetingDate), 'PPP', { locale: fr }) : 'N/A'}</p>
          </div>
        </div>

        {client360 && (
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="glass-card p-4 rounded-xl">
              <p className="text-sm text-muted-foreground">Client 360 · Win probability moyen</p>
              <p className="text-2xl font-bold">{client360.summary.avgWinProbability}%</p>
            </div>
            <div className="glass-card p-4 rounded-xl">
              <p className="text-sm text-muted-foreground">Days since last contact</p>
              <p className="text-2xl font-bold">{client360.summary.daysSinceLastContact ?? '—'}j</p>
            </div>
            <div className="glass-card p-4 rounded-xl">
              <p className="text-sm text-muted-foreground">Open actions</p>
              <p className="text-2xl font-bold">{client360.openActions.length}</p>
            </div>
          </div>
        )}

        <div className="glass-card p-6 rounded-2xl">
          {client.syncMeta?.syncState && client.syncMeta.syncState !== 'synced' && (
            <div className="mb-4 rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
              {client.syncMeta.syncState === 'local-only' && 'Ce client n\'est présent qu\'en local pour le moment.'}
              {client.syncMeta.syncState === 'pending' && 'Certaines modifications locales ne sont pas encore synchronisées.'}
              {client.syncMeta.syncState === 'conflicted' && 'Conflit détecté: ouvrez “Éditer” pour résoudre (garder local ou reprendre serveur).'}
            </div>
          )}
          <h2 className="font-semibold mb-4">Coordonnées</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Mail className="h-4 w-4" /> {client.email || 'Non renseigné'}
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Phone className="h-4 w-4" /> {client.phone || 'Non renseigné'}
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Globe className="h-4 w-4" /> {client.website || 'Non renseigné'}
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Info className="h-4 w-4" /> {client.notes || 'Aucune note'}
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Timeline des réunions</h2>
          <div className="space-y-3">
            {clientMeetings.length === 0 && (
              <div className="glass-card p-6 rounded-xl text-muted-foreground">Aucune réunion liée.</div>
            )}
            {clientMeetings.map((meeting) => (
              <div key={meeting.id} className="glass-card p-4 rounded-xl cursor-pointer hover:border-primary/50" onClick={() => navigate(`/meeting/${meeting.id}`)}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Calendar className="h-4 w-4" />
                    {format(new Date(meeting.created_at), 'PPP p', { locale: fr })}
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Clock className="h-4 w-4" />
                    {meeting.analysis?.duration_minutes || 0} min
                  </div>
                </div>
                <p className="mt-2 font-semibold">{meeting.title}</p>
                {meeting.dealValue && (
                  <p className="text-sm text-muted-foreground">Deal: {meeting.dealValue.toLocaleString('fr-FR')} {meeting.dealCurrency || 'TND'} ({meeting.dealStatus || 'pending'})</p>
                )}
              </div>
            ))}
          </div>
        </div>

        {client360 && (
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="glass-card p-6 rounded-2xl">
              <h2 className="font-semibold mb-3">Sentiment trend</h2>
              <div className="space-y-2 text-sm">
                {client360.sentimentTrend.length === 0 ? (
                  <p className="text-muted-foreground">Aucune tendance disponible.</p>
                ) : client360.sentimentTrend.map((row) => (
                  <div key={row.bucket} className="flex items-center justify-between border-b border-border/50 pb-1">
                    <span>{row.bucket}</span>
                    <span className="text-muted-foreground">
                      +{row.positive} / ={row.neutral} / -{row.negative}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="glass-card p-6 rounded-2xl">
              <h2 className="font-semibold mb-3">Open next actions</h2>
              <div className="space-y-2 text-sm">
                {client360.openActions.length === 0 ? (
                  <p className="text-muted-foreground">Aucune action ouverte détectée.</p>
                ) : client360.openActions.slice(0, 10).map((a, idx) => (
                  <div key={`${a.meetingId}-${idx}`} className="rounded border border-border p-2">
                    <p>{a.action}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {format(new Date(a.createdAt), 'PPP p', { locale: fr })}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </MainLayout>
  );
}
