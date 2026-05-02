import { Router } from 'express';
import { randomUUID } from 'crypto';
import Meeting from '../../models/Meeting.js';
import MeetingAnalysis from '../../models/MeetingAnalysis.js';
import EmailDraft from '../../models/EmailDraft.js';
import EmailDraftFeedback from '../../models/EmailDraftFeedback.js';
import EmailDraftVersion from '../../models/EmailDraftVersion.js';
import config from '../../config.js';
import { safeArray, safeString } from '../../services/meetingRouteUtils.js';
import { hasMeetingAccess } from '../../services/meetingAccessService.js';
import { generateEmailDraftPayload } from '../../services/emailDraftGenerationService.js';

const router = Router({ mergeParams: true });

function normalizeInferredFields(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const field = safeString(item.field);
      const val = safeString(item.value);
      if (!field || !val) return null;
      const source = ['analysis', 'transcript', 'fallback', 'manual'].includes(safeString(item.source))
        ? safeString(item.source)
        : 'analysis';
      const confidence = Number(item.confidence);
      return {
        field,
        value: val,
        source,
        confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(100, Math.round(confidence))) : 0,
      };
    })
    .filter(Boolean);
}

async function createVersionSnapshot({ draft, meetingId, userId, eventType = 'edited', metadata = {} }) {
  const latest = await EmailDraftVersion.findOne({ draft_uuid: draft.draft_uuid }).sort({ version: -1 });
  const nextVersion = (latest?.version || 0) + 1;

  return EmailDraftVersion.create({
    meeting_id: meetingId,
    user_id: userId || null,
    draft_uuid: draft.draft_uuid,
    root_draft_uuid: draft.root_draft_uuid || draft.draft_uuid,
    version: nextVersion,
    eventType,
    status: draft.status,
    subject: draft.subject,
    bodyText: draft.bodyText,
    bodyHtml: draft.bodyHtml,
    assumptions: safeArray(draft.assumptions),
    fieldsToVerify: safeArray(draft.fieldsToVerify),
    inferredFields: normalizeInferredFields(draft.inferredFields),
    metadata,
  }).catch(() => null);
}

async function recordFeedback({ meetingId, userId, draftId, action, variant = 'A', hadEdits = false }) {
  return EmailDraftFeedback.create({
    meeting_id: meetingId,
    user_id: userId,
    draft_id: draftId,
    variant,
    action,
    hadEdits,
  }).catch(() => null);
}

async function nextVariantLabel(meetingId) {
  const total = await EmailDraft.countDocuments({
    meeting_id: meetingId,
    deleted_at: { $in: [null, undefined, ''] },
  });
  return `Variant ${total + 1}`;
}

// POST /api/meetings/:id/email-drafts
router.post('/:id/email-drafts', async (req, res) => {
  try {
    if (!config.geminiApiKey) {
      return res.status(503).json({ error: 'AI generation unavailable' });
    }

    const meeting = await Meeting.findById(req.params.id);
    if (!meeting) return res.status(404).json({ error: 'Meeting not found' });

    if (!hasMeetingAccess(req, meeting)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const analysis = await MeetingAnalysis.findOne({ meeting_id: meeting._id });
    if (!analysis) {
      return res.status(400).json({ error: 'Meeting analysis not found' });
    }

    const { emailDraft, promptVariant, tooShort } = await generateEmailDraftPayload({
      meeting,
      analysis,
      req,
      config,
      params: req.body || {},
    });

    const baseDraftId = safeString(req.body?.baseDraftId);
    const baseDraft = baseDraftId
      ? await EmailDraft.findOne({ draft_uuid: baseDraftId, meeting_id: meeting._id })
      : null;
    const rootDraftId = baseDraft?.root_draft_uuid || baseDraft?.draft_uuid || emailDraft.id;

    const persisted = await EmailDraft.create({
      user_id: req.user._id,
      meeting_id: meeting._id,
      draft_uuid: emailDraft.id,
      root_draft_uuid: rootDraftId,
      parent_draft_uuid: baseDraft?.draft_uuid || null,
      variantLabel: await nextVariantLabel(meeting._id),
      clientId: emailDraft.clientId,
      clientName: emailDraft.clientName,
      commercialId: emailDraft.commercialId,
      commercialName: emailDraft.commercialName,
      subject: emailDraft.subject,
      bodyText: emailDraft.bodyText,
      bodyHtml: emailDraft.bodyHtml,
      language: emailDraft.language,
      tone: emailDraft.tone,
      type: emailDraft.type,
      offerSummary: emailDraft.offerSummary,
      cta: emailDraft.cta,
      assumptions: emailDraft.assumptions,
      fieldsToVerify: emailDraft.fieldsToVerify,
      inferredFields: normalizeInferredFields(emailDraft.inferredFields),
      offerRecommendation: emailDraft.offerRecommendation,
      status: 'draft',
      version: 1,
      deleted_at: null,
      deleted_by: null,
    });

    const action = !!req.body?.regenerate || tooShort ? 'regenerated' : 'generated';
    await recordFeedback({
      meetingId: meeting._id,
      userId: req.user._id,
      draftId: emailDraft.id,
      variant: promptVariant,
      action,
      hadEdits: false,
    });
    await createVersionSnapshot({
      draft: persisted,
      meetingId: meeting._id,
      userId: req.user._id,
      eventType: action,
      metadata: { promptVariant },
    });

    res.status(201).json(persisted.toClientJSON());
  } catch (err) {
    console.error('Email draft generation failed:', err);
    res.status(503).json({
      error: 'AI generation unavailable',
      details: process.env.NODE_ENV === 'production' ? undefined : err?.message,
    });
  }
});

// GET /api/meetings/:id/email-drafts/events
router.get('/:id/email-drafts/events', async (req, res) => {
  try {
    const meeting = await Meeting.findById(req.params.id);
    if (!meeting) return res.status(404).json({ error: 'Meeting not found' });
    if (!hasMeetingAccess(req, meeting)) return res.status(403).json({ error: 'Access denied' });

    const rows = await EmailDraftFeedback.find({ meeting_id: meeting._id }).sort({ createdAt: -1 }).limit(300);
    const drafts = await EmailDraft.find({ meeting_id: meeting._id });
    const byDraft = new Map(drafts.map((d) => [d.draft_uuid, d]));

    res.json(rows.map((row) => ({
      id: row._id.toString(),
      meetingId: meeting._id.toString(),
      draftId: row.draft_id || null,
      variant: row.variant,
      action: row.action,
      hadEdits: !!row.hadEdits,
      status: row.draft_id && byDraft.get(row.draft_id)?.status ? byDraft.get(row.draft_id).status : null,
      createdAt: row.createdAt?.toISOString(),
      updatedAt: row.updatedAt?.toISOString(),
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/meetings/:id/email-drafts
router.get('/:id/email-drafts', async (req, res) => {
  try {
    const meeting = await Meeting.findById(req.params.id);
    if (!meeting) return res.status(404).json({ error: 'Meeting not found' });
    if (!hasMeetingAccess(req, meeting)) return res.status(403).json({ error: 'Access denied' });

    const includeDeleted = req.query.includeDeleted === '1' || req.query.includeDeleted === 'true';
    const docs = await EmailDraft.find({
      meeting_id: meeting._id,
      ...(includeDeleted ? {} : { deleted_at: { $in: [null, undefined, ''] } }),
    }).sort({ createdAt: -1 });

    res.json(docs.map((d) => d.toClientJSON()));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/meetings/:id/email-drafts/latest
router.get('/:id/email-drafts/latest', async (req, res) => {
  try {
    const meeting = await Meeting.findById(req.params.id);
    if (!meeting) return res.status(404).json({ error: 'Meeting not found' });
    if (!hasMeetingAccess(req, meeting)) return res.status(403).json({ error: 'Access denied' });

    const draft = await EmailDraft.findOne({
      meeting_id: meeting._id,
      deleted_at: { $in: [null, undefined, ''] },
    }).sort({ createdAt: -1 });

    if (!draft) return res.status(404).json({ error: 'Not found' });
    res.json(draft.toClientJSON());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/meetings/:id/email-drafts/:draftId/history
router.get('/:id/email-drafts/:draftId/history', async (req, res) => {
  try {
    const meeting = await Meeting.findById(req.params.id);
    if (!meeting) return res.status(404).json({ error: 'Meeting not found' });
    if (!hasMeetingAccess(req, meeting)) return res.status(403).json({ error: 'Access denied' });

    const draft = await EmailDraft.findOne({ draft_uuid: req.params.draftId, meeting_id: meeting._id });
    if (!draft) return res.status(404).json({ error: 'Draft not found' });

    const history = await EmailDraftVersion.find({ draft_uuid: draft.draft_uuid }).sort({ version: -1, createdAt: -1 });
    res.json(history.map((item) => item.toClientJSON()));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/meetings/:id/email-drafts/:draftId
router.patch('/:id/email-drafts/:draftId', async (req, res) => {
  try {
    const meeting = await Meeting.findById(req.params.id);
    if (!meeting) return res.status(404).json({ error: 'Meeting not found' });
    if (!hasMeetingAccess(req, meeting)) return res.status(403).json({ error: 'Access denied' });

    const draft = await EmailDraft.findOne({ draft_uuid: req.params.draftId, meeting_id: meeting._id });
    if (!draft) return res.status(404).json({ error: 'Draft not found' });

    if (safeString(draft.deleted_at)) {
      return res.status(409).json({ error: 'Draft is deleted' });
    }

    const updates = {
      subject: req.body?.subject !== undefined ? safeString(req.body.subject, draft.subject) : draft.subject,
      bodyText: req.body?.bodyText !== undefined ? safeString(req.body.bodyText, draft.bodyText) : draft.bodyText,
      bodyHtml: req.body?.bodyHtml !== undefined ? safeString(req.body.bodyHtml, draft.bodyHtml) : draft.bodyHtml,
      offerSummary: req.body?.offerSummary !== undefined ? safeString(req.body.offerSummary, draft.offerSummary) : draft.offerSummary,
      cta: req.body?.cta !== undefined ? safeString(req.body.cta, draft.cta) : draft.cta,
      assumptions: Array.isArray(req.body?.assumptions) ? safeArray(req.body.assumptions) : safeArray(draft.assumptions),
      fieldsToVerify: Array.isArray(req.body?.fieldsToVerify) ? safeArray(req.body.fieldsToVerify) : safeArray(draft.fieldsToVerify),
      inferredFields: Array.isArray(req.body?.inferredFields) ? normalizeInferredFields(req.body.inferredFields) : normalizeInferredFields(draft.inferredFields),
      status: ['draft', 'approved', 'sent'].includes(safeString(req.body?.status)) ? safeString(req.body.status) : draft.status,
    };
    const prevStatus = draft.status;
    const createVariant = req.body?.asVariant === true;

    if (createVariant) {
      const variant = await EmailDraft.create({
        user_id: req.user._id,
        meeting_id: meeting._id,
        draft_uuid: randomUUID(),
        root_draft_uuid: draft.root_draft_uuid || draft.draft_uuid,
        parent_draft_uuid: draft.draft_uuid,
        variantLabel: safeString(req.body?.variantLabel, await nextVariantLabel(meeting._id)),
        clientId: draft.clientId,
        clientName: draft.clientName,
        commercialId: draft.commercialId,
        commercialName: draft.commercialName,
        language: draft.language,
        tone: draft.tone,
        type: draft.type,
        offerRecommendation: draft.offerRecommendation,
        deleted_at: null,
        deleted_by: null,
        version: 1,
        ...updates,
      });

      await recordFeedback({
        meetingId: meeting._id,
        userId: req.user._id,
        draftId: variant.draft_uuid,
        action: 'edited',
        hadEdits: true,
      });
      await createVersionSnapshot({
        draft: variant,
        meetingId: meeting._id,
        userId: req.user._id,
        eventType: 'edited',
        metadata: { asVariant: true, parentDraftId: draft.draft_uuid },
      });

      return res.status(201).json(variant.toClientJSON());
    }

    draft.subject = updates.subject;
    draft.bodyText = updates.bodyText;
    draft.bodyHtml = updates.bodyHtml;
    draft.offerSummary = updates.offerSummary;
    draft.cta = updates.cta;
    draft.assumptions = updates.assumptions;
    draft.fieldsToVerify = updates.fieldsToVerify;
    draft.inferredFields = updates.inferredFields;
    draft.status = updates.status;
    if (draft.status === 'approved' && prevStatus !== 'approved') {
      draft.approved_at = new Date().toISOString();
      draft.approved_by = req.user._id;
    }
    if (draft.status === 'sent' && prevStatus !== 'sent') {
      draft.sent_at = new Date().toISOString();
      draft.sent_by = req.user._id;
    }

    draft.version = Number(draft.version || 1) + 1;
    await draft.save();

    const statusChanged = prevStatus !== draft.status;
    await createVersionSnapshot({
      draft,
      meetingId: meeting._id,
      userId: req.user._id,
      eventType: statusChanged ? 'status_changed' : 'edited',
      metadata: statusChanged ? { from: prevStatus, to: draft.status } : {},
    });

    if (statusChanged && draft.status === 'approved') {
      await recordFeedback({
        meetingId: meeting._id,
        userId: req.user._id,
        draftId: draft.draft_uuid,
        action: 'accepted',
        hadEdits: false,
      });
    }
    if (statusChanged && draft.status === 'sent') {
      await recordFeedback({
        meetingId: meeting._id,
        userId: req.user._id,
        draftId: draft.draft_uuid,
        action: 'sent',
        hadEdits: false,
      });
    }

    return res.json(draft.toClientJSON());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/meetings/:id/email-drafts/:draftId (soft delete)
router.delete('/:id/email-drafts/:draftId', async (req, res) => {
  try {
    const meeting = await Meeting.findById(req.params.id);
    if (!meeting) return res.status(404).json({ error: 'Meeting not found' });
    if (!hasMeetingAccess(req, meeting)) return res.status(403).json({ error: 'Access denied' });

    const draft = await EmailDraft.findOne({ draft_uuid: req.params.draftId, meeting_id: meeting._id });
    if (!draft) return res.status(404).json({ error: 'Draft not found' });

    if (safeString(draft.deleted_at)) return res.json({ success: true, alreadyDeleted: true });

    draft.deleted_at = new Date().toISOString();
    draft.deleted_by = req.user._id;
    draft.version = Number(draft.version || 1) + 1;
    await draft.save();

    await createVersionSnapshot({
      draft,
      meetingId: meeting._id,
      userId: req.user._id,
      eventType: 'deleted',
    });
    await recordFeedback({
      meetingId: meeting._id,
      userId: req.user._id,
      draftId: draft.draft_uuid,
      action: 'deleted',
      hadEdits: false,
    });

    res.json({ success: true, deleted_at: draft.deleted_at });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/meetings/:id/email-drafts/feedback
router.post('/:id/email-drafts/feedback', async (req, res) => {
  try {
    const meeting = await Meeting.findById(req.params.id);
    if (!meeting) return res.status(404).json({ error: 'Meeting not found' });

    if (!hasMeetingAccess(req, meeting)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const actionRaw = safeString(req.body?.action, '').toLowerCase();
    const action = ['generated', 'regenerated', 'accepted', 'approved', 'edited', 'sent', 'deleted'].includes(actionRaw)
      ? actionRaw
      : null;
    if (!action) return res.status(400).json({ error: 'Invalid action' });

    const variantRaw = safeString(req.body?.variant, 'A').toUpperCase();
    const variant = ['A', 'B'].includes(variantRaw) ? variantRaw : 'A';

    await EmailDraftFeedback.create({
      meeting_id: meeting._id,
      user_id: req.user._id,
      draft_id: safeString(req.body?.draftId, undefined),
      variant,
      action,
      hadEdits: !!req.body?.hadEdits,
    });

    res.status(201).json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
