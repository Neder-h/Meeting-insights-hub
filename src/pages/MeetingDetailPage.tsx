import { useParams, Link } from 'react-router-dom';
import { useEffect, useState, useRef } from 'react';
import {
  ArrowLeft,
  Download,
  AlertTriangle,
  Target,
  MessageSquare,
  Zap,
  Calendar,
  Clock,
  FileText,
  Loader2,
  Play,
  Pause
} from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { StageIndicator } from '@/components/dashboard/StageIndicator';
import { WinProbabilityGauge } from '@/components/dashboard/WinProbabilityGauge';
import { InsightCard } from '@/components/dashboard/InsightCard';
import { SentimentBadge } from '@/components/dashboard/SentimentBadge';
import { useMeeting } from '@/hooks/useMeetings';
import { getClientById } from '@/lib/clientService';
import { getCommercialById } from '@/lib/commercialService';
import { getMeetingAuditEvents } from '@/lib/api';
import { runBackgroundSync } from '@/services/syncService';
import { EmailDraftPanel } from '@/components/EmailDraftPanel';
import { DraftEventTimeline } from '@/components/email/DraftEventTimeline';
import { useEmailDraftEvents } from '@/hooks/useEmailDraft';
import { Client, Commercial, AuditEvent } from '@/types/meeting';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

function MeetingDraftActivity({ meetingId }: { meetingId: string }) {
  const { data: draftEvents = [] } = useEmailDraftEvents(meetingId);
  if (!draftEvents.length) return null;

  return (
    <div className="glass-card rounded-xl p-6">
      <DraftEventTimeline events={draftEvents} maxItems={20} />
    </div>
  );
}

export default function MeetingDetailPage() {
  const { id } = useParams();
  const { data: meeting, isLoading, error } = useMeeting(id || '');
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [client, setClient] = useState<Client | null>(null);
  const [commercial, setCommercial] = useState<Commercial | undefined>();
  const [loadingRelations, setLoadingRelations] = useState(false);
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [syncingMeeting, setSyncingMeeting] = useState(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!meeting) return;
      setLoadingRelations(true);
      try {
        const [clientData, commercialData] = await Promise.all([
          meeting.clientId ? getClientById(meeting.clientId) : Promise.resolve(undefined),
          meeting.commercialId ? getCommercialById(meeting.commercialId) : Promise.resolve(undefined),
        ]);
        if (!active) return;
        setClient(clientData || null);
        setCommercial(commercialData || undefined);
      } finally {
        if (active) {
          setLoadingRelations(false);
        }
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [meeting]);

  useEffect(() => {
    let active = true;
    const loadEvents = async () => {
      if (!id) return;
      setLoadingEvents(true);
      try {
        const data = await getMeetingAuditEvents(id);
        if (!active) return;
        setEvents(data || []);
      } catch {
        if (active) setEvents([]);
      } finally {
        if (active) setLoadingEvents(false);
      }
    };

    loadEvents();
    return () => {
      active = false;
    };
  }, [id, meeting?.status]);

  const formatDuration = (durationMs?: number) => {
    if (!durationMs || durationMs <= 0) return '—';
    if (durationMs < 1000) return `${durationMs}ms`;
    return `${Math.round(durationMs / 100) / 10}s`;
  };

  const formatStageLabel = (stage: string) => {
    const labels: Record<string, string> = {
      transcribing: 'Transcription',
      translating: 'Traduction',
      analyzing: 'Analyse',
    };
    return labels[stage] || stage;
  };

  const diagnosticsEvents = events.filter((e) =>
    e.event_type.includes('processing_') || e.event_type.includes('queue_')
  );

  const renderProcessingDiagnostics = () => (
    <div className="mt-8 grid gap-6 lg:grid-cols-2">
      <div className="glass-card rounded-xl p-6 space-y-4">
        <h2 className="font-semibold">Chronologie de traitement</h2>

        <div className="rounded-lg border border-border/60 p-3 text-sm space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Mode queue</span>
            <span className="font-medium">{meeting.processingMeta?.queue?.mode || '—'}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Job ID</span>
            <span className="font-mono text-xs">{meeting.processingMeta?.queue?.jobId || 'inline'}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Tentatives queue</span>
            <span className="font-medium">{meeting.processingMeta?.queue?.attempts ?? 0}</span>
          </div>
        </div>

        {meeting.processingMeta?.stages && Object.keys(meeting.processingMeta.stages).length > 0 ? (
          <div className="space-y-3">
            {Object.entries(meeting.processingMeta.stages).map(([stage, meta]) => (
              <div key={stage} className="rounded-lg border border-border/60 p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{formatStageLabel(stage)}</span>
                  <span className="text-muted-foreground">{formatDuration(meta?.durationMs)}</span>
                </div>
                <div className="mt-1 text-muted-foreground text-xs space-y-1">
                  <div>Retries: {meta?.retries ?? 0}</div>
                  {meta?.startedAt ? <div>Début: {format(new Date(meta.startedAt), 'PPpp', { locale: fr })}</div> : null}
                  {meta?.completedAt ? <div>Fin: {format(new Date(meta.completedAt), 'PPpp', { locale: fr })}</div> : null}
                  {meta?.failedAt ? <div>Échec: {format(new Date(meta.failedAt), 'PPpp', { locale: fr })}</div> : null}
                  {meta?.fallback ? <div className="text-amber-600">Fallback: {meta?.fallbackReason || 'Oui'}</div> : null}
                  {meta?.error ? <div className="text-destructive">Erreur: {meta.error}</div> : null}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Aucune étape détaillée disponible.</p>
        )}
      </div>

      <div className="glass-card rounded-xl p-6 space-y-4">
        <h2 className="font-semibold">Événements de diagnostic</h2>
        {loadingEvents ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Chargement des événements…
          </div>
        ) : diagnosticsEvents.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucun événement de queue/processing.</p>
        ) : (
          <div className="space-y-2 max-h-[360px] overflow-auto pr-2">
            {diagnosticsEvents.slice(0, 40).map((evt) => (
              <div key={evt.id} className="rounded-lg border border-border/60 p-3 text-xs">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium">{evt.event_type}</span>
                  <span className="text-muted-foreground">{format(new Date(evt.created_at), 'PPpp', { locale: fr })}</span>
                </div>
                {evt.metadata?.error ? (
                  <div className="mt-1 text-destructive">{String(evt.metadata.error)}</div>
                ) : null}
                {evt.metadata?.reason ? (
                  <div className="mt-1 text-amber-600">{String(evt.metadata.reason)}</div>
                ) : null}
                {evt.metadata?.statusCode ? (
                  <div className="mt-1 text-muted-foreground">HTTP: {String(evt.metadata.statusCode)}</div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  const retrySync = async () => {
    setSyncingMeeting(true);
    try {
      await runBackgroundSync();
    } finally {
      setSyncingMeeting(false);
    }
  };

  const handleDownloadTranscript = () => {
    if (!meeting?.transcript) return;

    const blob = new Blob([meeting.transcript], {
      type: 'text/plain',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    // Use meeting title in filename, sanitize it for filesystem
    const sanitizedTitle = meeting.title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const timestamp = format(new Date(meeting.created_at), 'yyyy-MM-dd');
    a.download = `transcription_${sanitizedTitle}_${timestamp}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handlePlayAudio = async () => {
    if (!meeting?.audio_url) return;

    try {
      if (!audioUrl) {
        // Audio is already stored as data URL in local database
        setAudioUrl(meeting.audio_url);

        if (audioRef.current) {
          audioRef.current.src = meeting.audio_url;
        }
      }

      if (audioRef.current) {
        if (isPlaying) {
          audioRef.current.pause();
          setIsPlaying(false);
        } else {
          await audioRef.current.play();
          setIsPlaying(true);
        }
      }
    } catch (error) {
      console.error('Error playing audio:', error);
    }
  };

  const handleAudioEnded = () => {
    setIsPlaying(false);
  };

  if (isLoading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center">
            <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto" />
            <p className="mt-4 text-muted-foreground">Chargement...</p>
          </div>
        </div>
      </MainLayout>
    );
  }

  if (error || !meeting) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center">
            <p className="text-destructive">Réunion non trouvée</p>
            <Button asChild variant="outline" className="mt-4">
              <Link to="/meetings">Retour aux réunions</Link>
            </Button>
          </div>
        </div>
      </MainLayout>
    );
  }

  // Show processing state
  if (meeting.status !== 'completed' && meeting.status !== 'error') {
    return (
      <MainLayout>
        <div className="animate-fade-in">
          <div className="flex items-center justify-center min-h-[40vh]">
            <div className="text-center glass-card rounded-2xl p-12 max-w-md">
              <Loader2 className="h-16 w-16 animate-spin text-primary mx-auto" />
              <h2 className="mt-6 text-2xl font-bold">Analyse en cours</h2>
              <p className="mt-2 text-muted-foreground">
                {meeting.status === 'uploading' && "Upload du fichier audio..."}
                {meeting.status === 'queued' && "Réunion en file d'attente..."}
                {meeting.status === 'transcribing' && "Transcription en cours..."}
                {meeting.status === 'translating' && "Traduction en cours..."}
                {meeting.status === 'analyzing' && "Analyse IA en cours..."}
              </p>
              <div className="mt-6 flex items-center justify-center gap-2">
                <div className="h-2 w-2 animate-pulse rounded-full bg-primary" />
                <span className="text-sm text-muted-foreground">
                  Cela peut prendre quelques instants
                </span>
              </div>
            </div>
          </div>

          {renderProcessingDiagnostics()}
        </div>
      </MainLayout>
    );
  }

  // Show error state
  if (meeting.status === 'error') {
    return (
      <MainLayout>
        <div className="animate-fade-in">
          <div className="flex items-center justify-center min-h-[40vh]">
            <div className="text-center glass-card rounded-2xl p-12 max-w-md">
              <AlertTriangle className="h-16 w-16 text-destructive mx-auto" />
              <h2 className="mt-6 text-2xl font-bold">Erreur de traitement</h2>
              <p className="mt-2 text-muted-foreground">
                {meeting.error_message || "Une erreur est survenue lors du traitement"}
              </p>
              <Button asChild variant="outline" className="mt-6">
                <Link to="/">Nouvelle réunion</Link>
              </Button>
            </div>
          </div>

          {renderProcessingDiagnostics()}
        </div>
      </MainLayout>
    );
  }

  const analysis = meeting.analysis;

  if (!analysis) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center">
            <p className="text-muted-foreground">Aucune analyse disponible</p>
            <Button asChild variant="outline" className="mt-4">
              <Link to="/meetings">Retour aux réunions</Link>
            </Button>
          </div>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="animate-fade-in">
        {/* Header */}
        <div className="mb-8 flex items-start justify-between">
          <div>
            <Link
              to="/meetings"
              className="mb-4 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              Retour aux réunions
            </Link>
            <h1 className="text-3xl font-bold">{meeting.title}</h1>
            <div className="mt-2 flex items-center gap-4 text-muted-foreground">
              <span className="flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                {format(new Date(meeting.created_at), 'PPP', { locale: fr })}
              </span>
              <span className="flex items-center gap-2">
                <Clock className="h-4 w-4" />
                {analysis.duration_minutes} minutes
              </span>
              <SentimentBadge sentiment={analysis.sentiment} />
              {meeting.syncMeta?.syncState && meeting.syncMeta.syncState !== 'synced' && (
                <span className="rounded-full border border-border px-2 py-0.5 text-xs">
                  {meeting.syncMeta.syncState === 'local-only' && 'Local-only (not synced)'}
                  {meeting.syncMeta.syncState === 'pending' && 'Pending sync'}
                  {meeting.syncMeta.syncState === 'conflicted' && 'Sync conflict'}
                </span>
              )}
            </div>
          </div>

          <div className="flex gap-2">
            <Button onClick={handlePlayAudio} variant="outline" disabled={!meeting.audio_url}>
              {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              {isPlaying ? 'Pause audio' : 'Écouter audio'}
            </Button>
            <Button onClick={handleDownloadTranscript} variant="outline" disabled={!meeting.transcript}>
              <Download className="h-4 w-4" />
              Télécharger transcription
            </Button>
          </div>
        </div>

        {/* Sales Stage */}
        {meeting.syncMeta?.syncState === 'local-only' && (
          <div className="mb-6 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-300">
            Cette réunion a été créée hors-ligne. Elle sera envoyée au backend dès que la synchronisation réussit.
            <div className="mt-3">
              <Button size="sm" variant="outline" onClick={retrySync} disabled={syncingMeeting}>
                {syncingMeeting ? 'Sync…' : 'Synchroniser maintenant'}
              </Button>
            </div>
          </div>
        )}

        {meeting.syncMeta?.syncState === 'conflicted' && (
          <div className="mb-6 rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm">
            <p className="font-medium text-destructive">Conflit de synchronisation</p>
            <p className="mt-1 text-muted-foreground">
              {meeting.syncMeta?.lastError || 'Le backend a rejeté une modification locale.'}
            </p>
            <div className="mt-3">
              <Button size="sm" variant="outline" onClick={retrySync} disabled={syncingMeeting}>
                {syncingMeeting ? 'Sync…' : 'Réessayer la synchronisation'}
              </Button>
            </div>
          </div>
        )}

        <div className="glass-card rounded-xl p-6 mb-8">
          <h2 className="mb-4 font-semibold">Stade du Deal</h2>
          <StageIndicator stage={analysis.sales_stage} />
        </div>

        {/* Main Grid */}
        <div className="grid gap-8 lg:grid-cols-3">
          {/* Left Column - Summary & Win Probability */}
          <div className="space-y-8 lg:col-span-2">
            {/* Summary */}
            <div className="glass-card rounded-xl p-6">
              <div className="mb-4 flex items-center gap-3">
                <div className="rounded-lg bg-primary/10 p-2 text-primary">
                  <FileText className="h-5 w-5" />
                </div>
                <h2 className="font-semibold">Résumé de la réunion</h2>
              </div>
              <p className="text-muted-foreground leading-relaxed">
                {analysis.summary}
              </p>

              {/* Key Topics */}
              {analysis.key_topics.length > 0 && (
                <div className="mt-6">
                  <h3 className="mb-3 text-sm font-medium text-muted-foreground">
                    Sujets clés abordés
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {analysis.key_topics.map((topic) => (
                      <span
                        key={topic}
                        className="rounded-full bg-primary/10 px-3 py-1 text-sm text-primary"
                      >
                        {topic}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Insights Grid */}
            <div className="grid gap-6 sm:grid-cols-2">
              <InsightCard
                title="Objections détectées"
                icon={MessageSquare}
                iconColor="text-warning"
                items={analysis.objections}
              />
              <InsightCard
                title="Risques identifiés"
                icon={AlertTriangle}
                iconColor="text-destructive"
                items={analysis.risks}
              />
            </div>

            {/* Next Actions */}
            <InsightCard
              title="Prochaines actions recommandées"
              icon={Zap}
              iconColor="text-accent"
              items={analysis.next_actions}
            />
          </div>

          {/* Right Column - Win Probability */}
          <div className="space-y-8">
            <div className="glass-card rounded-xl p-6">
              <h2 className="mb-6 font-semibold text-center">Probabilité de Win</h2>
              <WinProbabilityGauge
                probability={analysis.win_probability}
                confidence={analysis.confidence}
              />
            </div>

            {/* Quick Stats */}
            <div className="glass-card rounded-xl p-6 space-y-4">
              <h2 className="font-semibold">Statistiques</h2>
              
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Objections</span>
                  <span className="font-semibold">{analysis.objections.length}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Risques</span>
                  <span className="font-semibold">{analysis.risks.length}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Actions</span>
                  <span className="font-semibold">{analysis.next_actions.length}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Sujets</span>
                  <span className="font-semibold">{analysis.key_topics.length}</span>
                </div>
              </div>
            </div>

            {meeting.processingMeta?.stages && (
              <div className="glass-card rounded-xl p-6 space-y-4">
                <h2 className="font-semibold">Pipeline timings</h2>
                {Object.entries(meeting.processingMeta.stages).map(([stage, meta]) => (
                  <div key={stage} className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground capitalize">{stage}</span>
                    <span className="font-semibold">
                      {meta?.durationMs ? `${Math.round(meta.durationMs / 1000)}s` : '—'}
                      {typeof meta?.retries === 'number' && meta.retries > 0 ? ` · retry ${meta.retries}` : ''}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {renderProcessingDiagnostics()}
      </div>

      {analysis && (
        <div className="mt-10 space-y-6">
          {loadingRelations && !client ? (
            <div className="glass-card rounded-xl p-6 flex items-center gap-3 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>Loading client data…</span>
            </div>
          ) : client ? (
            <EmailDraftPanel
              meeting={meeting}
              analysis={analysis}
              client={client}
              commercial={commercial}
            />
          ) : null}

          <MeetingDraftActivity meetingId={meeting.id!} />
        </div>
      )}

      {/* Hidden audio element */}
      <audio
        ref={audioRef}
        onEnded={handleAudioEnded}
        style={{ display: 'none' }}
      />
    </MainLayout>
  );
}
