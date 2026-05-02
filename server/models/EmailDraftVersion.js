import mongoose from 'mongoose';

const inferredFieldSchema = new mongoose.Schema({
  field: { type: String, required: true },
  value: { type: String, default: '' },
  source: { type: String, enum: ['analysis', 'transcript', 'fallback', 'manual'], default: 'analysis' },
  confidence: { type: Number, default: 0 },
}, { _id: false });

const emailDraftVersionSchema = new mongoose.Schema({
  meeting_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Meeting', required: true, index: true },
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: false, default: null },
  draft_uuid: { type: String, required: true, index: true },
  root_draft_uuid: { type: String, required: true, index: true },
  version: { type: Number, required: true },
  eventType: {
    type: String,
    enum: ['generated', 'regenerated', 'edited', 'accepted', 'approved', 'sent', 'deleted', 'status_changed'],
    default: 'edited',
  },
  status: { type: String, enum: ['draft', 'approved', 'sent'], default: 'draft' },
  subject: { type: String, default: '' },
  bodyText: { type: String, default: '' },
  bodyHtml: { type: String, default: '' },
  assumptions: { type: [String], default: [] },
  fieldsToVerify: { type: [String], default: [] },
  inferredFields: { type: [inferredFieldSchema], default: [] },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: true });

emailDraftVersionSchema.index({ draft_uuid: 1, version: -1 }, { unique: true });

emailDraftVersionSchema.methods.toClientJSON = function toClientJSON() {
  const obj = this.toObject();
  return {
    id: obj._id?.toString?.(),
    meetingId: obj.meeting_id?.toString?.() || null,
    draftId: obj.draft_uuid,
    rootDraftId: obj.root_draft_uuid,
    version: obj.version,
    eventType: obj.eventType,
    status: obj.status,
    subject: obj.subject,
    bodyText: obj.bodyText,
    bodyHtml: obj.bodyHtml,
    assumptions: obj.assumptions || [],
    fieldsToVerify: obj.fieldsToVerify || [],
    inferredFields: obj.inferredFields || [],
    metadata: obj.metadata || {},
    createdAt: obj.createdAt?.toISOString(),
    updatedAt: obj.updatedAt?.toISOString(),
  };
};

export default mongoose.model('EmailDraftVersion', emailDraftVersionSchema);
