import React, { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Mail,
  Copy,
  RefreshCw,
  Save,
  Trash2,
  Check,
  Loader2,
  GitCompare,
  ShieldCheck,
  Send,
  Pencil,
} from 'lucide-react';
import {
  useEmailDrafts,
  useEmailDraftHistory,
  useEmailDraftEvents,
  useGenerateEmailDraft,
  useUpdateEmailDraft,
  useSaveEmailDraftVariant,
  useDeleteEmailDraft,
  useApproveEmailDraft,
  useMarkEmailDraftSent,
  useRestoreEmailDraftVersion,
} from '@/hooks/useEmailDraft';
import { apiClient } from '@/lib/apiClient';
import { emailDraftService } from '@/services/emailDraftService';
import { runBackgroundSync } from '@/services/syncService';
import { ApprovalPipeline } from '@/components/email/ApprovalPipeline';
import { InferredFieldsPanel } from '@/components/email/InferredFieldsPanel';
import { WordDiffView } from '@/components/email/WordDiff';
import { VersionHistory } from '@/components/email/VersionHistory';
import { DraftEventTimeline } from '@/components/email/DraftEventTimeline';
import type { Meeting, MeetingAnalysis, Client, Commercial, EmailDraftVersion } from '@/types/meeting';

interface EmailDraftPanelProps {
  meeting: Meeting;
  analysis: MeetingAnalysis;
  client: Client;
  commercial?: Commercial;
}

export function EmailDraftPanel({ meeting, analysis, client, commercial }: EmailDraftPanelProps) {
  const queryClient = useQueryClient();
  const { data: drafts = [], isLoading: loadingDraft } = useEmailDrafts(meeting.id!);
  const generateMutation = useGenerateEmailDraft();
  const updateMutation = useUpdateEmailDraft();
  const saveVariantMutation = useSaveEmailDraftVariant();
  const deleteMutation = useDeleteEmailDraft();
  const approveMutation = useApproveEmailDraft();
  const markSentMutation = useMarkEmailDraftSent();
  const restoreVersionMutation = useRestoreEmailDraftVersion();

  const [selectedDraftId, setSelectedDraftId] = useState<string | null>(null);
  const [compareDraftId, setCompareDraftId] = useState<string>('none');
  const [compareVersionBody, setCompareVersionBody] = useState<string | null>(null);
  const [compareVersionLabel, setCompareVersionLabel] = useState<string>('');

  const selectedDraft = useMemo(() => drafts.find((d) => d.id === selectedDraftId) || drafts[0] || null, [drafts, selectedDraftId]);
  const compareDraft = useMemo(() => drafts.find((d) => d.id === compareDraftId) || null, [drafts, compareDraftId]);
  const { data: history = [] } = useEmailDraftHistory(meeting.id!, selectedDraft?.id);
  const { data: draftEvents = [] } = useEmailDraftEvents(meeting.id!);

  const [tone, setTone] = useState<'professional' | 'friendly' | 'executive'>('professional');
  const [language, setLanguage] = useState(() =>
    meeting && (meeting as any).language
      ? (meeting as any).language
      : meeting.transcript_language?.startsWith('en')
        ? 'en'
        : 'fr'
  );
  const [editedSubject, setEditedSubject] = useState('');
  const [editedBody, setEditedBody] = useState('');
  const [variantLabel, setVariantLabel] = useState('');
  const [copied, setCopied] = useState(false);
  const [hasEdits, setHasEdits] = useState(false);

  const isLocked = selectedDraft?.status === 'approved' || selectedDraft?.status === 'sent';

  const syncLabel = (() => {
    const s = selectedDraft?.syncMeta?.syncState || 'synced';
    if (s === 'local-only') return 'Local-only';
    if (s === 'pending') return 'Pending sync';
    if (s === 'conflicted') return 'Conflict';
    return 'Synced';
  })();

  useEffect(() => {
    if (drafts.length && !selectedDraftId) {
      setSelectedDraftId(drafts[0].id || null);
    }
  }, [drafts, selectedDraftId]);

  useEffect(() => {
    if (selectedDraft) {
      setEditedSubject(selectedDraft.subject);
      setEditedBody(selectedDraft.bodyText);
      setVariantLabel(`${selectedDraft.variantLabel || 'Variant'} Copy`);
      setHasEdits(false);
      setCompareVersionBody(null);
      setCompareVersionLabel('');
    }
  }, [selectedDraft?.id]);

  const getVariant = (): 'A' | 'B' => {
    const assumptions = selectedDraft?.assumptions || [];
    const marker = assumptions.find((a) => a.startsWith('prompt_variant:'));
    if (!marker) return 'A';
    const v = marker.split(':')[1]?.trim().toUpperCase();
    return v === 'B' ? 'B' : 'A';
  };

  const handleGenerate = async () => {
    const wasExisting = !!selectedDraft;
    try {
      const draft = await generateMutation.mutateAsync({
        meeting,
        analysis,
        client,
        commercial,
        options: {
          tone,
          language,
          regenerate: wasExisting,
          nonce: wasExisting ? crypto.randomUUID() : undefined,
          baseDraftId: selectedDraft?.id,
        },
      });

      await apiClient.trackEmailDraftFeedback(meeting.id!, {
        action: wasExisting ? 'regenerated' : 'generated',
        variant: getVariant(),
        draftId: draft.id,
        hadEdits: false,
      }).catch(() => {});
      setSelectedDraftId(draft.id || null);
    } catch {
      // Error toast handled by mutation hook
    }
  };

  const handleCopy = async () => {
    const text = `Subject: ${editedSubject}\n\n${editedBody}`;
    await navigator.clipboard.writeText(text);
    await apiClient.trackEmailDraftFeedback(meeting.id!, {
      action: 'accepted',
      variant: getVariant(),
      draftId: selectedDraft?.id,
      hadEdits: hasEdits,
    }).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleInlineUpdate = () => {
    if (selectedDraft?.id) {
      updateMutation.mutate({
        meetingId: meeting.id!,
        id: selectedDraft.id,
        updates: {
          subject: editedSubject,
          bodyText: editedBody,
          bodyHtml: editedBody.replace(/\n/g, '<br>'),
        },
      });
      setHasEdits(false);
    }
  };

  const handleSaveVariant = () => {
    if (selectedDraft?.id) {
      saveVariantMutation.mutate({
        meetingId: meeting.id!,
        id: selectedDraft.id,
        updates: {
          subject: editedSubject,
          bodyText: editedBody,
          bodyHtml: editedBody.replace(/\n/g, '<br>'),
        },
        variantLabel: variantLabel || undefined,
      });
      setHasEdits(false);
    }
  };

  const handleApprove = () => {
    if (selectedDraft?.id) {
      approveMutation.mutate({ meetingId: meeting.id!, id: selectedDraft.id });
    }
  };

  const handleMarkSent = () => {
    if (selectedDraft?.id) {
      markSentMutation.mutate({ meetingId: meeting.id!, id: selectedDraft.id });
    }
  };

  const handleDelete = () => {
    if (selectedDraft?.id) {
      deleteMutation.mutate({ id: selectedDraft.id, meetingId: meeting.id! });
    }
  };

  const handleRestoreVersion = (version: EmailDraftVersion) => {
    if (selectedDraft?.id) {
      restoreVersionMutation.mutate({
        meetingId: meeting.id!,
        draftId: selectedDraft.id,
        version,
      });
    }
  };

  const handleCompareVersion = (version: EmailDraftVersion) => {
    setCompareDraftId('none');
    setCompareVersionBody(version.bodyText);
    setCompareVersionLabel(`v${version.version} · ${version.eventType}`);
  };

  const handleResolveConflictKeepLocal = async () => {
    if (!selectedDraft?.id) return;
    await emailDraftService.markDraftConflictResolvedKeepLocal(selectedDraft.id);
    await runBackgroundSync().catch(() => {});
    await queryClient.invalidateQueries({ queryKey: ['emailDraft', 'latest', meeting.id!] });
    await queryClient.invalidateQueries({ queryKey: ['emailDrafts', meeting.id!] });
  };

  const handleResolveConflictUseServer = async () => {
    if (!selectedDraft?.id) return;
    await emailDraftService.overwriteDraftWithServer(meeting.id!, selectedDraft.id).catch(() => null);
    await queryClient.invalidateQueries({ queryKey: ['emailDraft', 'latest', meeting.id!] });
    await queryClient.invalidateQueries({ queryKey: ['emailDrafts', meeting.id!] });
  };

  const handleSubjectChange = (value: string) => {
    setEditedSubject(value);
    setHasEdits(true);
  };

  const handleBodyChange = (value: string) => {
    setEditedBody(value);
    setHasEdits(true);
  };

  // Determine which text to compare against
  const diffOldText = compareVersionBody ?? compareDraft?.bodyText ?? null;
  const diffOldLabel = compareVersionBody ? compareVersionLabel : (compareDraft?.variantLabel || 'selected variant');

  /* ─── Loading state ─── */
  if (loadingDraft) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  /* ─── Empty state ─── */
  if (!selectedDraft) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Follow-up Email
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Generate an AI-powered follow-up email based on this meeting's analysis. The email will include a soft commercial proposal reflecting what was discussed.
          </p>

          <div className="flex flex-wrap gap-4">
            <div className="space-y-1">
              <label className="text-sm font-medium">Tone</label>
              <Select value={tone} onValueChange={(v) => setTone(v as typeof tone)}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="professional">Professional</SelectItem>
                  <SelectItem value="friendly">Friendly</SelectItem>
                  <SelectItem value="executive">Executive</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium">Language</label>
              <Select value={language} onValueChange={setLanguage}>
                <SelectTrigger className="w-[120px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fr">Français</SelectItem>
                  <SelectItem value="en">English</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <Button
            onClick={handleGenerate}
            disabled={generateMutation.isPending}
            className="w-full sm:w-auto"
          >
            {generateMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Mail className="mr-2 h-4 w-4" />
                Generate Follow-up Email
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    );
  }

  /* ─── Main draft view ─── */
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Follow-up Email Draft
          </CardTitle>
          <div className="flex items-center gap-3">
            <ApprovalPipeline
              status={selectedDraft.status}
              approvedAt={selectedDraft.approvedAt}
              sentAt={selectedDraft.sentAt}
            />
            <Badge variant={selectedDraft.syncMeta?.syncState === 'conflicted' ? 'destructive' : 'outline'}>
              {syncLabel}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* ─── Variant + Compare selectors ─── */}
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1">
            <label className="text-sm font-medium">Draft variant</label>
            <Select value={selectedDraft.id || ''} onValueChange={(v) => { setSelectedDraftId(v); setCompareVersionBody(null); }}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {drafts.map((d) => (
                  <SelectItem key={d.id} value={d.id || ''}>
                    {(d.variantLabel || 'Variant')} · {d.status} · {new Date(d.createdAt).toLocaleString()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Compare with</label>
            <Select value={compareDraftId} onValueChange={(v) => { setCompareDraftId(v); setCompareVersionBody(null); }}>
              <SelectTrigger>
                <SelectValue placeholder="Select draft" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No comparison</SelectItem>
                {drafts.filter((d) => d.id !== selectedDraft.id).map((d) => (
                  <SelectItem key={d.id} value={d.id || ''}>
                    {(d.variantLabel || 'Variant')} · {new Date(d.createdAt).toLocaleString()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* ─── Sync banners ─── */}
        {selectedDraft.syncMeta?.syncState === 'local-only' && (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-300">
            Ce brouillon a été généré hors-ligne et n'est pas encore synchronisé avec le backend.
          </div>
        )}

        {selectedDraft.syncMeta?.syncState === 'pending' && (
          <div className="rounded-md border border-blue-300 bg-blue-50 p-3 text-sm text-blue-800 dark:border-blue-700 dark:bg-blue-950 dark:text-blue-300">
            Ce brouillon a des modifications locales en attente de synchronisation.
          </div>
        )}

        {selectedDraft.syncMeta?.syncState === 'conflicted' && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
            <p className="font-medium text-destructive">Conflit de synchronisation détecté</p>
            <p className="mt-1 text-muted-foreground">
              Champs en conflit: {(selectedDraft.syncMeta?.conflictFields || []).join(', ') || 'body'}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={handleResolveConflictKeepLocal}>
                Garder ma version locale
              </Button>
              <Button size="sm" variant="ghost" onClick={handleResolveConflictUseServer}>
                Reprendre version serveur
              </Button>
            </div>
          </div>
        )}

        {/* ─── Locked banner ─── */}
        {isLocked && (
          <div className="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 shrink-0" />
            This draft has been {selectedDraft.status}. Editing is disabled. Use "Save as Variant" to create an editable copy.
          </div>
        )}

        {/* ─── Editor ─── */}
        <div className="space-y-1">
          <label className="text-sm font-medium">Subject</label>
          <Input
            value={editedSubject}
            onChange={(e) => handleSubjectChange(e.target.value)}
            disabled={isLocked}
          />
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium">Email Body</label>
          <Textarea
            value={editedBody}
            onChange={(e) => handleBodyChange(e.target.value)}
            rows={14}
            className="font-mono text-sm"
            disabled={isLocked}
          />
        </div>

        <Separator />

        {/* ─── Word-level diff ─── */}
        {diffOldText !== null && (
          <div className="rounded-md border border-border/60 p-3 space-y-2">
            <p className="flex items-center gap-2 text-sm font-medium">
              <GitCompare className="h-4 w-4" />
              Differences vs {diffOldLabel}
            </p>
            <WordDiffView
              oldText={diffOldText}
              newText={editedBody}
              oldLabel={diffOldLabel}
              newLabel="Current"
            />
          </div>
        )}

        {/* ─── Offer summary ─── */}
        {selectedDraft.offerSummary && (
          <div className="rounded-md border border-blue-200 bg-blue-50 p-3 dark:border-blue-800 dark:bg-blue-950">
            <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
              Offer Summary
            </p>
            <p className="mt-1 text-sm text-blue-800 dark:text-blue-200">
              {selectedDraft.offerSummary}
            </p>
          </div>
        )}

        {/* ─── Inferred fields + verification ─── */}
        <InferredFieldsPanel
          inferredFields={selectedDraft.inferredFields || []}
          fieldsToVerify={selectedDraft.fieldsToVerify || []}
        />

        {/* ─── Assumptions ─── */}
        {selectedDraft.assumptions && selectedDraft.assumptions.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">Assumptions</p>
            <div className="flex flex-wrap gap-2">
              {selectedDraft.assumptions.map((assumption, i) => (
                <Badge key={i} variant="secondary">
                  {assumption}
                </Badge>
              ))}
            </div>
          </div>
        )}

        <Separator />

        {/* ─── Action buttons ─── */}
        <div className="flex flex-wrap gap-2">
          <Button onClick={handleCopy} variant="outline" size="sm">
            {copied ? (
              <>
                <Check className="mr-2 h-4 w-4" />
                Copied!
              </>
            ) : (
              <>
                <Copy className="mr-2 h-4 w-4" />
                Copy to Clipboard
              </>
            )}
          </Button>

          {hasEdits && !isLocked && (
            <Button onClick={handleInlineUpdate} variant="outline" size="sm" disabled={updateMutation.isPending}>
              <Pencil className="mr-2 h-4 w-4" />
              Update Draft
            </Button>
          )}

          {hasEdits && (
            <Button onClick={handleSaveVariant} variant="outline" size="sm" disabled={saveVariantMutation.isPending}>
              <Save className="mr-2 h-4 w-4" />
              Save as Variant
            </Button>
          )}

          {hasEdits && (
            <Input
              value={variantLabel}
              onChange={(e) => setVariantLabel(e.target.value)}
              className="h-8 w-[220px]"
              placeholder="Variant label"
            />
          )}

          {selectedDraft.status === 'draft' && (
            <Button onClick={handleApprove} variant="outline" size="sm" disabled={approveMutation.isPending}>
              <ShieldCheck className="mr-2 h-4 w-4" />
              Approve
            </Button>
          )}

          {selectedDraft.status === 'approved' && (
            <Button onClick={handleMarkSent} variant="outline" size="sm" disabled={markSentMutation.isPending}>
              <Send className="mr-2 h-4 w-4" />
              Mark as Sent
            </Button>
          )}

          <Button
            onClick={handleGenerate}
            variant="outline"
            size="sm"
            disabled={generateMutation.isPending}
          >
            {generateMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Regenerate
          </Button>

          <Button
            onClick={handleDelete}
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive"
            disabled={deleteMutation.isPending}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete Draft
          </Button>
        </div>

        {/* ─── Version history ─── */}
        <VersionHistory
          history={history}
          onRestore={handleRestoreVersion}
          onCompare={handleCompareVersion}
          isRestoring={restoreVersionMutation.isPending}
        />

        {/* ─── Draft event timeline ─── */}
        <DraftEventTimeline events={draftEvents} />

        <p className="text-xs text-muted-foreground">
          Generated {new Date(selectedDraft.createdAt).toLocaleString()} · Tone: {selectedDraft.tone} · Language: {selectedDraft.language}
        </p>
      </CardContent>
    </Card>
  );
}
