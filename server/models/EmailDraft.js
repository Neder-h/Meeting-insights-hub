import mongoose from 'mongoose';

const offerRecommendationSchema = new mongoose.Schema({
  summary: { type: String, default: '' },
  proposedSolution: { type: String, default: '' },
  businessNeed: { type: String, default: '' },
  clientPainPoints: { type: [String], default: [] },
  objectionHandling: { type: [String], default: [] },
  nextStepOffer: { type: String, default: '' },
  pricingMentioned: { type: String, default: null },
  confidence: { type: Number, default: 0 },
}, { _id: false });

const inferredFieldSchema = new mongoose.Schema({
  field: { type: String, required: true },
  value: { type: String, default: '' },
  source: { type: String, enum: ['analysis', 'transcript', 'fallback', 'manual'], default: 'analysis' },
  confidence: { type: Number, default: 0 },
}, { _id: false });

const emailDraftSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  meeting_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Meeting', required: true, index: true },
  draft_uuid: { type: String, required: true, index: true, unique: true },
  root_draft_uuid: { type: String, default: '', index: true },
  parent_draft_uuid: { type: String, default: null, index: true },
  variantLabel: { type: String, default: '' },
  clientId: { type: String, required: true },
  clientName: { type: String, required: true },
  commercialId: { type: String, default: '' },
  commercialName: { type: String, default: '' },
  subject: { type: String, default: '' },
  bodyText: { type: String, default: '' },
  bodyHtml: { type: String, default: '' },
  language: { type: String, default: 'fr' },
  tone: { type: String, enum: ['professional', 'friendly', 'executive'], default: 'professional' },
  type: { type: String, default: 'follow_up_offer' },
  offerSummary: { type: String, default: '' },
  cta: { type: String, default: '' },
  assumptions: { type: [String], default: [] },
  fieldsToVerify: { type: [String], default: [] },
  inferredFields: { type: [inferredFieldSchema], default: [] },
  offerRecommendation: { type: offerRecommendationSchema, default: {} },
  status: { type: String, enum: ['draft', 'approved', 'sent'], default: 'draft' },
  approved_at: { type: String, default: null },
  approved_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  sent_at: { type: String, default: null },
  sent_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  deleted_at: { type: String, default: null },
  deleted_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  version: { type: Number, default: 1 },
}, { timestamps: true });

emailDraftSchema.methods.toClientJSON = function toClientJSON() {
  const obj = this.toObject();
  return {
    id: obj.draft_uuid,
    rootDraftId: obj.root_draft_uuid || obj.draft_uuid,
    parentDraftId: obj.parent_draft_uuid || null,
    variantLabel: obj.variantLabel || '',
    meetingId: obj.meeting_id?.toString?.() || null,
    clientId: obj.clientId,
    clientName: obj.clientName,
    commercialId: obj.commercialId || undefined,
    commercialName: obj.commercialName || undefined,
    subject: obj.subject,
    bodyText: obj.bodyText,
    bodyHtml: obj.bodyHtml,
    language: obj.language,
    tone: obj.tone,
    type: obj.type,
    offerSummary: obj.offerSummary,
    cta: obj.cta,
    assumptions: obj.assumptions || [],
    fieldsToVerify: obj.fieldsToVerify || [],
    inferredFields: obj.inferredFields || [],
    offerRecommendation: obj.offerRecommendation || undefined,
    status: obj.status,
    approvedAt: obj.approved_at || null,
    sentAt: obj.sent_at || null,
    createdAt: obj.createdAt?.toISOString(),
    updatedAt: obj.updatedAt?.toISOString(),
    syncMeta: {
      version: obj.version || 1,
      lastSyncedAt: obj.updatedAt?.toISOString?.() || null,
      dirty: false,
      syncState: 'synced',
      deletedAt: obj.deleted_at || null,
    },
  };
};

export default mongoose.model('EmailDraft', emailDraftSchema);
