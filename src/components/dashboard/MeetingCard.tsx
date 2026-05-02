import { Link } from 'react-router-dom';
import { Calendar, Clock, ArrowRight, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Meeting } from '@/types/meeting';
import { SentimentBadge } from './SentimentBadge';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';
import { deleteMeeting } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface MeetingCardProps {
  meeting: Meeting;
  onDelete?: () => void;
}

export function MeetingCard({ meeting, onDelete }: MeetingCardProps) {
  const { analysis } = meeting;
  const { toast } = useToast();
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    try {
      setIsDeleting(true);
      await deleteMeeting(meeting.id);
      toast({
        title: "Réunion supprimée",
        description: "La réunion a été supprimée avec succès.",
      });
      onDelete?.();
    } catch (error) {
      console.error('Delete error:', error);
      toast({
        title: "Erreur",
        description: "Impossible de supprimer la réunion.",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="group relative">
      <Link
        to={`/meeting/${meeting.id}`}
        className="block"
      >
        <div className="glass-card liquid-interactive rounded-xl p-6 transition-all duration-300 hover:border-primary/50 hover:shadow-lg hover:shadow-primary/10">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors truncate">
                {meeting.title}
              </h3>

              {meeting.syncMeta?.syncState && meeting.syncMeta.syncState !== 'synced' && (
                <div className="mt-2 flex items-center gap-2">
                  <Badge variant={meeting.syncMeta.syncState === 'conflicted' ? 'destructive' : 'outline'}>
                    {meeting.syncMeta.syncState === 'local-only' && 'Local-only (not synced)'}
                    {meeting.syncMeta.syncState === 'pending' && 'Pending sync'}
                    {meeting.syncMeta.syncState === 'conflicted' && 'Sync conflict'}
                  </Badge>
                  {meeting.syncMeta.lastError ? (
                    <span className="text-xs text-muted-foreground line-clamp-1">{meeting.syncMeta.lastError}</span>
                  ) : null}
                </div>
              )}

              <div className="mt-2 flex items-center gap-4 text-sm text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Calendar className="h-4 w-4" />
                  {formatDistanceToNow(new Date(meeting.created_at), {
                    addSuffix: true,
                    locale: fr,
                  })}
                </span>
                {analysis && (
                  <span className="flex items-center gap-1">
                    <Clock className="h-4 w-4" />
                    {analysis.duration_minutes} min
                  </span>
                )}
              </div>
            </div>

            {analysis && (
              <SentimentBadge sentiment={analysis.sentiment} size="sm" />
            )}
          </div>

          {analysis && (
            <>
              <p className="mt-4 text-sm text-muted-foreground line-clamp-2">
                {analysis.summary}
              </p>

              <div className="mt-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="text-center">
                    <span className={cn(
                      "text-2xl font-bold",
                      analysis.win_probability >= 70 ? "text-success" :
                      analysis.win_probability >= 40 ? "text-warning" : "text-destructive"
                    )}>
                      {analysis.win_probability}%
                    </span>
                    <p className="text-xs text-muted-foreground">Win Rate</p>
                  </div>

                  <div className="h-8 w-px bg-border" />

                  <div className="flex flex-wrap gap-2">
                    {analysis.key_topics.slice(0, 3).map((topic) => (
                      <span
                        key={topic}
                        className="rounded-full border border-border/70 bg-secondary/50 px-2.5 py-1 text-xs text-muted-foreground"
                      >
                        {topic}
                      </span>
                    ))}
                  </div>
                </div>

                <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" />
              </div>
            </>
          )}

          {meeting.status !== 'completed' && (
            <div className="mt-4 flex items-center gap-2">
              <div className="h-2 w-2 animate-pulse rounded-full bg-primary" />
              <span className="text-sm text-muted-foreground capitalize">
                {meeting.status === 'recording' && 'Enregistrement...'}
                {meeting.status === 'uploading' && 'Upload...'}
                {meeting.status === 'transcribing' && 'Transcription...'}
                {meeting.status === 'analyzing' && 'Analyse IA...'}
                {meeting.status === 'error' && 'Erreur'}
              </span>
            </div>
          )}
        </div>
      </Link>

      {/* Delete Button */}
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-destructive/10 hover:bg-destructive/20 text-destructive hover:text-destructive"
            disabled={isDeleting}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer la réunion</AlertDialogTitle>
            <AlertDialogDescription>
              Êtes-vous sûr de vouloir supprimer cette réunion ? Cette action est irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={isDeleting}
            >
              {isDeleting ? 'Suppression...' : 'Supprimer'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
