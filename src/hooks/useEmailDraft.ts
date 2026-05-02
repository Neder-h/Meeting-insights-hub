import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { emailDraftService } from '@/services/emailDraftService';
import { apiClient } from '@/lib/apiClient';
import { EmailDraft, EmailDraftVersion, Meeting, MeetingAnalysis, Client, Commercial } from '@/types/meeting';

export function useEmailDrafts(meetingId: string) {
  return useQuery({
    queryKey: ['emailDrafts', meetingId],
    queryFn: () => emailDraftService.getDraftsByMeetingId(meetingId),
    enabled: !!meetingId,
  });
}

export function useLatestEmailDraft(meetingId: string) {
  return useQuery({
    queryKey: ['emailDraft', 'latest', meetingId],
    queryFn: () => emailDraftService.getLatestDraft(meetingId),
    enabled: !!meetingId,
  });
}

export function useEmailDraftHistory(meetingId: string, draftId?: string) {
  return useQuery({
    queryKey: ['emailDraftHistory', meetingId, draftId],
    queryFn: () => emailDraftService.getDraftHistory(meetingId, draftId!),
    enabled: !!meetingId && !!draftId,
  });
}

export function useEmailDraftEvents(meetingId: string) {
  return useQuery({
    queryKey: ['emailDraftEvents', meetingId],
    queryFn: () => emailDraftService.getDraftEvents(meetingId),
    enabled: !!meetingId,
  });
}

export function useGenerateEmailDraft() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      meeting,
      analysis,
      client,
      commercial,
      options,
    }: {
      meeting: Meeting;
      analysis: MeetingAnalysis;
      client: Client;
      commercial?: Commercial;
      options?: {
        tone?: 'professional' | 'friendly' | 'executive';
        language?: string;
        regenerate?: boolean;
        nonce?: string;
        baseDraftId?: string;
      };
    }) => {
      try {
        const draft: EmailDraft = await apiClient.generateEmailDraft(meeting.id!, {
          ...options,
          clientName: client?.name || meeting.clientName,
          commercialName: commercial?.name,
        });
        await emailDraftService.saveDraft(draft, 'synced');
        return draft;
      } catch {
        const localDraft = await emailDraftService.generateDraftLocally(meeting, analysis, client, commercial, options);
        await emailDraftService.saveDraft(localDraft, 'local-only');
        return localDraft;
      }
    },
    onSuccess: (draft) => {
      queryClient.invalidateQueries({ queryKey: ['emailDrafts', draft.meetingId] });
      queryClient.invalidateQueries({ queryKey: ['emailDraft', 'latest', draft.meetingId] });
      queryClient.invalidateQueries({ queryKey: ['emailDraftHistory', draft.meetingId] });
      queryClient.invalidateQueries({ queryKey: ['emailDraftEvents', draft.meetingId] });
      toast.success('Email draft generated successfully');
    },
    onError: (error) => {
      toast.error('Failed to generate email draft');
      console.error(error);
    },
  });
}

export function useUpdateEmailDraft() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ meetingId, id, updates }: { meetingId: string; id: string; updates: Partial<EmailDraft> }) => {
      await emailDraftService.updateDraft(meetingId, id, updates);
      return emailDraftService.getDraftById(id);
    },
    onSuccess: (draft) => {
      if (draft) {
        queryClient.invalidateQueries({ queryKey: ['emailDrafts', draft.meetingId] });
        queryClient.invalidateQueries({ queryKey: ['emailDraft', 'latest', draft.meetingId] });
        queryClient.invalidateQueries({ queryKey: ['emailDraftHistory', draft.meetingId] });
        queryClient.invalidateQueries({ queryKey: ['emailDraftEvents', draft.meetingId] });
      }
      toast.success('Draft updated');
    },
  });
}

export function useSaveEmailDraftVariant() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ meetingId, id, updates, variantLabel }: { meetingId: string; id: string; updates: Partial<EmailDraft>; variantLabel?: string }) => {
      return emailDraftService.saveDraftVariant(meetingId, id, updates, variantLabel);
    },
    onSuccess: (draft) => {
      if (draft) {
        queryClient.invalidateQueries({ queryKey: ['emailDrafts', draft.meetingId] });
        queryClient.invalidateQueries({ queryKey: ['emailDraft', 'latest', draft.meetingId] });
        queryClient.invalidateQueries({ queryKey: ['emailDraftEvents', draft.meetingId] });
        queryClient.invalidateQueries({ queryKey: ['emailDraftHistory', draft.meetingId] });
      }
      toast.success('New draft variant saved');
    },
    onError: () => {
      toast.error('Failed to save draft variant');
    },
  });
}

export function useDeleteEmailDraft() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, meetingId }: { id: string; meetingId: string }) => {
      await emailDraftService.deleteDraft(meetingId, id);
      return meetingId;
    },
    onSuccess: (meetingId) => {
      queryClient.invalidateQueries({ queryKey: ['emailDrafts', meetingId] });
      queryClient.invalidateQueries({ queryKey: ['emailDraft', 'latest', meetingId] });
      queryClient.invalidateQueries({ queryKey: ['emailDraftHistory', meetingId] });
      queryClient.invalidateQueries({ queryKey: ['emailDraftEvents', meetingId] });
      toast.success('Draft deleted');
    },
  });
}

export function useApproveEmailDraft() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ meetingId, id }: { meetingId: string; id: string }) => {
      await emailDraftService.updateDraft(meetingId, id, { status: 'approved' });
      await apiClient.trackEmailDraftFeedback(meetingId, {
        action: 'approved',
        draftId: id,
        hadEdits: false,
      }).catch(() => {});
      return emailDraftService.getDraftById(id);
    },
    onSuccess: (draft) => {
      if (draft) {
        queryClient.invalidateQueries({ queryKey: ['emailDrafts', draft.meetingId] });
        queryClient.invalidateQueries({ queryKey: ['emailDraft', 'latest', draft.meetingId] });
        queryClient.invalidateQueries({ queryKey: ['emailDraftHistory', draft.meetingId] });
        queryClient.invalidateQueries({ queryKey: ['emailDraftEvents', draft.meetingId] });
      }
      toast.success('Draft approved');
    },
    onError: () => {
      toast.error('Failed to approve draft');
    },
  });
}

export function useMarkEmailDraftSent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ meetingId, id }: { meetingId: string; id: string }) => {
      await emailDraftService.updateDraft(meetingId, id, { status: 'sent' });
      await apiClient.trackEmailDraftFeedback(meetingId, {
        action: 'sent',
        draftId: id,
        hadEdits: false,
      }).catch(() => {});
      return emailDraftService.getDraftById(id);
    },
    onSuccess: (draft) => {
      if (draft) {
        queryClient.invalidateQueries({ queryKey: ['emailDrafts', draft.meetingId] });
        queryClient.invalidateQueries({ queryKey: ['emailDraft', 'latest', draft.meetingId] });
        queryClient.invalidateQueries({ queryKey: ['emailDraftHistory', draft.meetingId] });
        queryClient.invalidateQueries({ queryKey: ['emailDraftEvents', draft.meetingId] });
      }
      toast.success('Draft marked as sent');
    },
    onError: () => {
      toast.error('Failed to mark draft as sent');
    },
  });
}

export function useRestoreEmailDraftVersion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      meetingId,
      draftId,
      version,
    }: {
      meetingId: string;
      draftId: string;
      version: EmailDraftVersion;
    }) => {
      await emailDraftService.updateDraft(meetingId, draftId, {
        subject: version.subject,
        bodyText: version.bodyText,
        bodyHtml: version.bodyHtml,
        assumptions: version.assumptions,
        fieldsToVerify: version.fieldsToVerify,
      });
      await apiClient.trackEmailDraftFeedback(meetingId, {
        action: 'edited',
        draftId,
        hadEdits: true,
      }).catch(() => {});
      return emailDraftService.getDraftById(draftId);
    },
    onSuccess: (draft) => {
      if (draft) {
        queryClient.invalidateQueries({ queryKey: ['emailDrafts', draft.meetingId] });
        queryClient.invalidateQueries({ queryKey: ['emailDraft', 'latest', draft.meetingId] });
        queryClient.invalidateQueries({ queryKey: ['emailDraftHistory', draft.meetingId] });
        queryClient.invalidateQueries({ queryKey: ['emailDraftEvents', draft.meetingId] });
      }
      toast.success('Version restored');
    },
    onError: () => {
      toast.error('Failed to restore version');
    },
  });
}
