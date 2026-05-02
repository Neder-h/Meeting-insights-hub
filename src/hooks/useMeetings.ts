import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getMeetings, getMeetingsPaginated, getMeeting, createMeeting, uploadAudioFile, processMeeting, MeetingsListParams } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';

export function useMeetings() {
  return useQuery({
    queryKey: ['meetings'],
    queryFn: getMeetings,
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    refetchInterval: (query) => {
      const data = query.state.data;
      // Only poll if there are meetings in processing state
      const hasProcessingMeetings = data?.some(
        (meeting: any) => meeting.status !== 'completed' && meeting.status !== 'error'
      );
      return hasProcessingMeetings ? 3000 : false; // Poll every 3 seconds only when needed
    },
  });
}

export function useMeetingsPaginated(params: MeetingsListParams) {
  return useQuery({
    queryKey: ['meetings', 'paginated', params],
    queryFn: () => getMeetingsPaginated(params),
    staleTime: 30_000,
    gcTime: 10 * 60_000,
    placeholderData: (previousData) => previousData,
  });
}

export function useMeeting(id: string) {
  return useQuery({
    queryKey: ['meeting', id],
    queryFn: () => getMeeting(id),
    enabled: !!id,
    staleTime: 20_000,
    gcTime: 5 * 60_000,
    refetchInterval: (query) => {
      const data = query.state.data;
      // Stop polling if meeting is completed or has error
      if (data?.status === 'completed' || data?.status === 'error') {
        return false;
      }
      return 3000; // Poll every 3 seconds while processing
    },
  });
}

export function useCreateMeeting() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({
      title,
      audioBlob,
      durationSeconds,
      transcript,
      rawTranscript,
      transcriptEngine,
      transcriptLanguage,
      clientId,
      clientName,
    }: {
      title: string;
      audioBlob: Blob;
      durationSeconds: number;
      transcript?: string;
      rawTranscript?: string;
      transcriptEngine?: 'whisper';
      transcriptLanguage?: 'fr-FR' | 'ar-TN';
      clientId: string;
      clientName?: string;
    }) => {
      // Generate unique filename
      const fileName = `${Date.now()}-${crypto.randomUUID()}.webm`;

      // Upload audio file
      toast({
        title: "Upload en cours",
        description: "Transfert du fichier audio...",
      });

      const audioUrl = await uploadAudioFile(audioBlob, fileName);

      // Create meeting record
      const meetingId = await createMeeting(title, audioUrl, durationSeconds, transcript, rawTranscript, transcriptEngine, transcriptLanguage, clientId, clientName);

      // Start processing (transcription + analysis)
      const isLocalOnly = meetingId.startsWith('local_');
      toast({
        title: isLocalOnly ? "Sauvegardé hors-ligne" : "Traitement en cours",
        description: isLocalOnly ? "La réunion sera synchronisée dès le retour de connexion." : "Analyse IA en cours...",
      });

      await processMeeting(meetingId, transcript);

      return {
        meetingId,
        syncState: isLocalOnly ? 'local-only' : 'synced',
      } as const;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['meetings'] });
      if (result?.syncState === 'local-only') {
        toast({
          title: "Réunion en attente de sync",
          description: "Visible localement. La synchronisation reprendra automatiquement en ligne.",
        });
      } else {
        toast({
          title: "Analyse terminée",
          description: "Votre réunion a été analysée avec succès.",
        });
      }
    },
    onError: (error) => {
      console.error('Create meeting error:', error);
      toast({
        variant: "destructive",
        title: "Erreur",
        description: error instanceof Error ? error.message : "Une erreur est survenue",
      });
    },
  });
}
