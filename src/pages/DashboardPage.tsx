import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  TrendingUp,
  Target,
  AlertTriangle,
  CheckCircle,
  ArrowUpRight,
  Calendar,
  Mic,
  Loader2
} from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { MeetingCard } from '@/components/dashboard/MeetingCard';
import { RevenueCard } from '@/components/dashboard/RevenueCard';
import { ClientStatsCard } from '@/components/dashboard/ClientStatsCard';
import { IntelligenceOverview } from '@/components/dashboard/IntelligenceOverview';
import { useMeetings } from '@/hooks/useMeetings';
import { deleteMeeting } from '@/lib/api';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';

export default function DashboardPage() {
  const { data: meetings, isLoading } = useMeetings();
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  const handleDeleteMeeting = async (id: string) => {
    if (!id) {
      toast.error("Impossible de supprimer : ID manquant");
      return;
    }

    try {
      // 1. Mise à jour optimiste de l'interface
      queryClient.setQueriesData({ queryKey: ['meetings'] }, (old: any) => {
        if (!Array.isArray(old)) return old;
        return old.filter((m: any) => m.id !== id);
      });

      // 2. Suppression réelle côté serveur (API)
      await deleteMeeting(id);
      toast.success('Réunion supprimée');
    } catch (error) {
      console.error("Détail de l'erreur 500 :", error);
      toast.error('Erreur lors de la suppression');
      // En cas d'erreur, on recharge les données pour remettre la réunion
      await queryClient.invalidateQueries({ queryKey: ['meetings'] });
    }
  };

  // Calculate stats from real data
  const completedMeetings = meetings?.filter(m => m.status === 'completed') || [];
  const avgWinRate = completedMeetings.length > 0
    ? Math.round(completedMeetings.reduce((acc, m) => acc + (m.analysis?.win_probability || 0), 0) / completedMeetings.length)
    : 0;
  const atRiskDeals = completedMeetings.filter(m => (m.analysis?.win_probability || 0) < 50).length;
  const wonDeals = completedMeetings.filter(m => m.analysis?.sales_stage === 'closed_won').length;

  const stats = [
    {
      label: 'Réunions ce mois',
      value: String(meetings?.length || 0),
      change: '+0',
      trend: 'up' as const,
      icon: Calendar,
    },
    {
      label: 'Win Rate moyen',
      value: `${avgWinRate}%`,
      change: '+0%',
      trend: 'up' as const,
      icon: Target,
    },
    {
      label: 'Deals à risque',
      value: String(atRiskDeals),
      change: '0',
      trend: 'down' as const,
      icon: AlertTriangle,
    },
    {
      label: 'Deals gagnés',
      value: String(wonDeals),
      change: '+0',
      trend: 'up' as const,
      icon: CheckCircle,
    },
  ];

  return (
    <MainLayout>
      <div className="animate-fade-in">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">
              Bonjour, <span className="gradient-text">{profile?.full_name || 'Commercial'}</span>
            </h1>
            <p className="mt-1 text-muted-foreground">
              Voici un aperçu de votre activité commerciale
            </p>
          </div>
          <Button asChild variant="gradient">
            <Link to="/">
              <Mic className="h-5 w-5" />
              Nouvelle réunion
            </Link>
          </Button>
        </div>

        {/* Revenue + Stats */}
        <div className="mb-8 grid gap-6 lg:grid-cols-4">
          <div className="lg:col-span-2 xl:col-span-2">
            <RevenueCard />
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-2 lg:col-span-2">
            {stats.map((stat, index) => (
              <div
                key={stat.label}
                className="glass-card liquid-interactive rounded-xl p-6 animate-slide-up"
                style={{ animationDelay: `${index * 100}ms` }}
              >
                <div className="flex items-start justify-between">
                  <div className="rounded-lg bg-primary/10 p-2 text-primary">
                    <stat.icon className="h-5 w-5" />
                  </div>
                  <span
                    className={`flex items-center text-sm font-medium ${
                      stat.trend === 'up' ? 'text-success' : 'text-destructive'
                    }`}
                  >
                    {stat.change}
                    <ArrowUpRight
                      className={`h-4 w-4 ${
                        stat.trend === 'down' ? 'rotate-180' : ''
                      }`}
                    />
                  </span>
                </div>
                <div className="mt-4">
                  <span className="text-3xl font-bold">{stat.value}</span>
                  <p className="mt-1 text-sm text-muted-foreground">{stat.label}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Clients overview */}
        <div className="mb-8">
          <ClientStatsCard />
        </div>

        {/* Client & Commercial Intelligence */}
        <div className="mb-8">
          <div className="mb-4">
            <h2 className="text-xl font-semibold">Client/commercial intelligence</h2>
            <p className="text-sm text-muted-foreground">Health trendline, coaching insights et forecast pondéré</p>
          </div>
          <IntelligenceOverview meetings={meetings || []} />
        </div>

        {/* Recent Meetings */}
        <div className="mb-8">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-semibold">Réunions récentes</h2>
            <Button asChild variant="ghost" size="sm">
              <Link to="/meetings">
                Voir tout
                <ArrowUpRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : meetings && meetings.length > 0 ? (
            <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
              {meetings.slice(0, 3).map((meeting, index) => (
                <div
                  key={meeting.id}
                  className="animate-slide-up"
                  style={{ animationDelay: `${(index + 4) * 100}ms` }}
                >
                  <MeetingCard meeting={meeting} onDelete={() => handleDeleteMeeting(meeting.id)} />
                </div>
              ))}
            </div>
          ) : (
            <div className="glass-card rounded-xl p-8 text-center">
              <p className="text-muted-foreground">
                Aucune réunion enregistrée. Commencez par en créer une !
              </p>
              <Button asChild variant="gradient" className="mt-4">
                <Link to="/">
                  <Mic className="h-5 w-5" />
                  Nouvelle réunion
                </Link>
              </Button>
            </div>
          )}
        </div>

        {/* Quick Actions */}
        <div className="grid gap-6 sm:grid-cols-3">
          {[
            {
              title: 'Enregistrer',
              description: 'Nouvelle réunion',
              icon: Mic,
              href: '/',
              gradient: 'from-primary to-accent',
            },
            {
              title: 'Analyser',
              description: 'Historique complet',
              icon: TrendingUp,
              href: '/meetings',
              gradient: 'from-accent to-success',
            },
            {
              title: 'Optimiser',
              description: 'Recommandations IA',
              icon: Target,
              href: '/meetings',
              gradient: 'from-success to-warning',
            },
          ].map((action, index) => (
            <Link
              key={action.title}
              to={action.href}
              className="group glass-card liquid-interactive rounded-xl p-6 transition-all hover:border-primary/50 animate-slide-up"
              style={{ animationDelay: `${(index + 7) * 100}ms` }}
            >
              <div
                className={`mb-4 inline-flex rounded-xl bg-gradient-to-br p-3 ${action.gradient}`}
              >
                <action.icon className="h-6 w-6 text-primary-foreground" />
              </div>
              <h3 className="font-semibold group-hover:text-primary transition-colors">
                {action.title}
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {action.description}
              </p>
            </Link>
          ))}
        </div>
      </div>
    </MainLayout>
  );
}
