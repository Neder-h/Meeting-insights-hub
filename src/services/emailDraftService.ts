import { db } from '@/integrations/local/client';
import { EmailDraft, Meeting, MeetingAnalysis, Client, Commercial } from '@/types/meeting';
import { apiClient } from '@/lib/apiClient';

function markSynced(draft: EmailDraft): EmailDraft {
  return {
    ...draft,
    syncMeta: {
      version: draft.syncMeta?.version || 1,
      lastSyncedAt: draft.syncMeta?.lastSyncedAt || new Date().toISOString(),
      dirty: false,
      syncState: 'synced',
      deletedAt: draft.syncMeta?.deletedAt || null,
    },
  };
}

function markWithState(draft: EmailDraft, syncState: 'synced' | 'local-only' | 'pending' | 'conflicted', options: { conflictFields?: string[]; lastSyncedAt?: string | null } = {}): EmailDraft {
  return {
    ...draft,
    syncMeta: {
      version: draft.syncMeta?.version || 1,
      lastSyncedAt: syncState === 'synced' ? (options.lastSyncedAt || draft.syncMeta?.lastSyncedAt || new Date().toISOString()) : (options.lastSyncedAt || draft.syncMeta?.lastSyncedAt || null),
      dirty: syncState !== 'synced',
      syncState,
      deletedAt: draft.syncMeta?.deletedAt || null,
      conflictFields: options.conflictFields || draft.syncMeta?.conflictFields || [],
    },
  };
}

async function cacheDrafts(drafts: EmailDraft[]) {
  if (!drafts.length) return;
  await db.emailDrafts.bulkPut(drafts.map(markSynced));
}

export const emailDraftService = {
  // Save to cache (backend generation route already persists server-side)
  async saveDraft(draft: EmailDraft, syncState: 'synced' | 'local-only' | 'pending' = 'synced'): Promise<string> {
    const now = new Date().toISOString();
    const id = draft.id || crypto.randomUUID();
    const base = {
      ...draft,
      id,
      createdAt: draft.createdAt || now,
      updatedAt: now,
    };
    const record = syncState === 'synced' ? markSynced(base) : markWithState(base, syncState);
    await db.emailDrafts.put(record);
    return id;
  },

  // Backend-first list + cache fallback
  async getDraftsByMeetingId(meetingId: string): Promise<EmailDraft[]> {
    try {
      const drafts = await apiClient.getMeetingEmailDrafts(meetingId);
      await cacheDrafts(drafts);
      return drafts;
    } catch {
      return db.emailDrafts.where('meetingId').equals(meetingId).reverse().sortBy('createdAt');
    }
  },

  // Get a single draft by id
  async getDraftById(id: string): Promise<EmailDraft | null> {
    return (await db.emailDrafts.get(id)) ?? null;
  },

  async getDraftHistory(meetingId: string, draftId: string) {
    return apiClient.getMeetingEmailDraftHistory(meetingId, draftId);
  },

  async getDraftEvents(meetingId: string) {
    return apiClient.getMeetingEmailDraftEvents(meetingId);
  },

  // Update draft backend-first + mark cache dirty if offline
  async updateDraft(meetingId: string, id: string, updates: Partial<EmailDraft>): Promise<EmailDraft | null> {
    const now = new Date().toISOString();
    try {
      const updated = await apiClient.updateMeetingEmailDraft(meetingId, id, updates);
      await db.emailDrafts.put(markSynced({ ...updated, updatedAt: updated.updatedAt || now }));
      return updated;
    } catch {
      await db.emailDrafts.update(id, {
        ...updates,
        updatedAt: now,
        syncMeta: {
          version: ((await db.emailDrafts.get(id))?.syncMeta?.version || 1),
          lastSyncedAt: (await db.emailDrafts.get(id))?.syncMeta?.lastSyncedAt || null,
          dirty: true,
          syncState: 'pending',
          deletedAt: (await db.emailDrafts.get(id))?.syncMeta?.deletedAt || null,
          conflictFields: (await db.emailDrafts.get(id))?.syncMeta?.conflictFields || [],
        },
      } as any);
      return (await db.emailDrafts.get(id)) ?? null;
    }
  },

  async saveDraftVariant(meetingId: string, id: string, updates: Partial<EmailDraft>, variantLabel?: string): Promise<EmailDraft | null> {
    const created = await apiClient.updateMeetingEmailDraft(meetingId, id, {
      ...updates,
      asVariant: true as any,
      variantLabel,
    } as any);
    await db.emailDrafts.put(markSynced(created));
    return created;
  },

  // Delete draft backend-first + pending tombstone when offline
  async deleteDraft(meetingId: string, id: string): Promise<void> {
    try {
      await apiClient.deleteMeetingEmailDraft(meetingId, id);
      await db.emailDrafts.delete(id);
    } catch {
      await db.emailDrafts.update(id, {
        syncMeta: {
          version: 1,
          lastSyncedAt: null,
          dirty: true,
          syncState: 'pending',
          deletedAt: new Date().toISOString(),
        },
      } as any);
    }
  },

  // Get latest draft for a meeting
  async getLatestDraft(meetingId: string): Promise<EmailDraft | null> {
    try {
      const draft = await apiClient.getLatestMeetingEmailDraft(meetingId);
      if (draft) await db.emailDrafts.put(markSynced(draft));
      return draft;
    } catch {
      const drafts = await this.getDraftsByMeetingId(meetingId);
      return drafts.length > 0 ? drafts[0] : null;
    }
  },

  async generateDraftLocally(
    meeting: Meeting,
    analysis: MeetingAnalysis,
    client: Client,
    commercial?: Commercial,
    options: { tone?: 'professional' | 'friendly' | 'executive'; language?: string } = {}
  ): Promise<EmailDraft> {
    const tone = options.tone || 'professional';
    const lang = options.language || (meeting as any).language || meeting.transcript_language || 'fr';
    const isFr = `${lang}`.toLowerCase().startsWith('fr');

    const needsIdentified: string[] = (analysis as any).needsIdentified || (analysis as any).needs_identified || [];
    const painPoints: string[] = (analysis as any).painPoints || (analysis as any).key_topics || [];
    const objections: string[] = (analysis as any).objections || [];
    const nextActions: string[] = (analysis as any).nextActions || (analysis as any).next_actions || [];
    const winProbability: number = (analysis as any).winProbability ?? (analysis as any).win_probability ?? 0;

    const clientDisplayName = (client as any).contactName || client.contactPerson || client.name;
    const commercialDisplayName = commercial?.name || 'Our team';
    const meetingDate = (meeting as any).date || meeting.created_at;

    const cleanList = (items: string[], max = 4) =>
      items
        .map((t) => (t || '').toString().trim())
        .filter(Boolean)
        .slice(0, max);

    const topics = cleanList((analysis as any).key_topics || []);
    const needs = cleanList(needsIdentified);
    const pains = cleanList(painPoints);

    const meetingContext = (() => {
      const parts: string[] = [];
      if (needs.length) {
        parts.push(isFr ? `vos besoins autour de ${needs.join(', ')}` : `your needs around ${needs.join(', ')}`);
      }
      if (pains.length) {
        parts.push(isFr ? `les enjeux ${pains.join(', ')}` : `the challenges ${pains.join(', ')}`);
      }
      if (!parts.length && topics.length) {
        parts.push(isFr ? `les sujets ${topics.join(', ')}` : `topics like ${topics.join(', ')}`);
      }
      return parts.length
        ? parts.join(isFr ? ' et ' : ' and ')
        : isFr
          ? 'vos objectifs et priorités'
          : 'your goals and priorities';
    })();

    const offerSummary = needsIdentified.length > 0
      ? (isFr
        ? `Solution proposée pour répondre aux besoins identifiés : ${needsIdentified.join(', ')}.`
        : `Proposed solution addressing identified needs: ${needsIdentified.join(', ')}.`)
      : (isFr
        ? 'Suite à notre échange, nous souhaitons vous proposer une offre adaptée à vos objectifs.'
        : 'Following our discussion, we would like to propose a tailored offer aligned with your objectives.');

    const objectionText = objections.length > 0
      ? (isFr
        ? `\n\nNous avons bien noté vos préoccupations concernant ${objections.join(', ')}. Nous sommes prêts à en discuter en détail pour trouver les meilleures solutions.`
        : `\n\nWe have noted your concerns regarding ${objections.join(', ')}. We are ready to discuss these in detail to find the best solutions.`)
      : '';

    const cta = isFr
      ? 'Seriez-vous disponible la semaine prochaine pour un point de suivi ?'
      : 'Would you be available next week for a follow-up meeting?';

    const subject = isFr
      ? 'Suite à notre échange – Proposition adaptée à vos besoins'
      : 'Following our discussion – Tailored proposal for your needs';

    const bodyText = isFr
      ? `Bonjour ${clientDisplayName},

    Merci d'avoir pris le temps d'échanger avec nous${meetingDate ? ` le ${new Date(meetingDate).toLocaleDateString('fr-FR')}` : ''}. Cet échange nous a permis de comprendre ${meetingContext}.

    ${offerSummary}${objectionText}

${cta}

Cordialement,
${commercialDisplayName}`
      : `Hello ${clientDisplayName},

    Thank you for taking the time to speak with us${meetingDate ? ` on ${new Date(meetingDate).toLocaleDateString('en-US')}` : ''}. We focused on ${meetingContext}.

    ${offerSummary}${objectionText}

${cta}

Best regards,
${commercialDisplayName}`;

    const fieldsToVerify: string[] = [];
    if (!painPoints || painPoints.length === 0) {
      fieldsToVerify.push(isFr ? 'Points de douleur non identifiés clairement' : 'Pain points not clearly identified');
    }
    if (isFr) {
      fieldsToVerify.push('Tarification non confirmée lors de la réunion');
      fieldsToVerify.push('Calendrier de mise en œuvre non discuté');
    } else {
      fieldsToVerify.push('Pricing not confirmed during the meeting');
      fieldsToVerify.push('Implementation timeline not discussed');
    }

    const baseConfidence = Math.min(
      100,
      Math.round(((analysis.confidence || 0) + (winProbability || 0)) / 2)
    );

    const inferredFields: import('@/types/meeting').EmailDraftInferredField[] = [
      {
        field: 'clientNeeds',
        value: needs.join(', '),
        source: needs.length > 0 ? 'analysis' : 'fallback',
        confidence: needs.length > 0 ? baseConfidence : 20,
      },
      {
        field: 'painPoints',
        value: pains.join(', '),
        source: pains.length > 0 ? 'analysis' : 'fallback',
        confidence: pains.length > 0 ? baseConfidence : 15,
      },
      {
        field: 'objections',
        value: objections.join(', '),
        source: objections.length > 0 ? 'analysis' : 'fallback',
        confidence: objections.length > 0 ? baseConfidence : 10,
      },
      {
        field: 'ctaAngle',
        value: cta,
        source: nextActions.length > 0 ? 'analysis' : 'fallback',
        confidence: nextActions.length > 0 ? baseConfidence : 30,
      },
      {
        field: 'meetingContext',
        value: meetingContext,
        source: topics.length > 0 || needs.length > 0 ? 'analysis' : 'fallback',
        confidence: topics.length > 0 || needs.length > 0 ? baseConfidence : 25,
      },
    ].filter((f) => f.value);

    const draft: EmailDraft = {
      id: crypto.randomUUID(),
      meetingId: meeting.id!,
      clientId: meeting.clientId,
      clientName: client.name,
      commercialId: commercial?.id,
      commercialName: commercial?.name,
      subject,
      bodyText,
      bodyHtml: bodyText.replace(/\n/g, '<br>'),
      language: lang,
      tone,
      type: 'follow_up_offer',
      offerSummary,
      cta,
      assumptions: [],
      fieldsToVerify,
      inferredFields,
      offerRecommendation: {
        summary: offerSummary,
        proposedSolution: needsIdentified.join(', ') || '',
        businessNeed: painPoints.join(', ') || '',
        clientPainPoints: painPoints,
        objectionHandling: objections,
        nextStepOffer: nextActions[0] || cta,
        pricingMentioned: null,
        confidence: winProbability || 0,
      },
      status: 'draft',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    return draft;
  },

  async syncPendingDrafts(): Promise<{ synced: number; conflicted: number }> {
    const all = await db.emailDrafts.toArray();
    const pending = all.filter((d: any) => d?.syncMeta?.dirty || d?.syncMeta?.syncState === 'pending');
    let synced = 0;
    let conflicted = 0;

    for (const draft of pending) {
      try {
        if (!draft.meetingId || !draft.id) continue;

        if (draft.syncMeta?.deletedAt) {
          await apiClient.deleteMeetingEmailDraft(draft.meetingId, draft.id);
          await db.emailDrafts.delete(draft.id);
          synced += 1;
          continue;
        }

        const updated = await apiClient.updateMeetingEmailDraft(draft.meetingId, draft.id, {
          subject: draft.subject,
          bodyText: draft.bodyText,
          bodyHtml: draft.bodyHtml,
          offerSummary: draft.offerSummary,
          cta: draft.cta,
          assumptions: draft.assumptions,
          fieldsToVerify: draft.fieldsToVerify,
          status: draft.status,
        });
        await db.emailDrafts.put(markSynced(updated));
        synced += 1;
      } catch {
        conflicted += 1;
        await db.emailDrafts.update(draft.id, {
          syncMeta: {
            ...(draft.syncMeta || { version: 1 }),
            dirty: true,
            syncState: 'conflicted',
            conflictFields: ['bodyText', 'bodyHtml'],
          },
        } as any);
      }
    }

    return { synced, conflicted };
  },

  async markDraftConflictResolvedKeepLocal(id: string): Promise<void> {
    const draft = await db.emailDrafts.get(id);
    if (!draft) return;
    await db.emailDrafts.update(id, {
      syncMeta: {
        ...(draft.syncMeta || { version: 1 }),
        dirty: true,
        syncState: 'pending',
        conflictFields: [],
      },
    } as any);
  },

  async overwriteDraftWithServer(meetingId: string, id: string): Promise<EmailDraft | null> {
    const remote = await apiClient.getMeetingEmailDrafts(meetingId);
    const target = remote.find((d) => d.id === id) || null;
    if (!target) return null;
    await db.emailDrafts.put(markSynced(target));
    return target;
  },
};
