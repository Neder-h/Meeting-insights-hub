import mongoose from 'mongoose';

const auditEventSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: false, default: null },
  meeting_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Meeting' },
  entity_type: { type: String, enum: ['meeting', 'analysis', 'client'], required: true },
  entity_id: { type: String, required: true },
  event_type: { type: String, required: true },
  before: { type: mongoose.Schema.Types.Mixed, default: null },
  after: { type: mongoose.Schema.Types.Mixed, default: null },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: true });

// Immutable by design
// eslint-disable-next-line func-names
auditEventSchema.pre('save', function (next) {
  if (!this.isNew) {
    return next(new Error('Audit events are immutable and cannot be updated'));
  }
  return next();
});

const blockMutation = function (next) {
  next(new Error('Audit events are immutable and cannot be modified or deleted'));
};

auditEventSchema.pre('updateOne', blockMutation);
auditEventSchema.pre('findOneAndUpdate', blockMutation);
auditEventSchema.pre('replaceOne', blockMutation);
auditEventSchema.pre('deleteOne', blockMutation);
auditEventSchema.pre('deleteMany', blockMutation);
auditEventSchema.pre('findOneAndDelete', blockMutation);

auditEventSchema.methods.toJSON = function () {
  const obj = this.toObject();
  obj.id = obj._id.toString();
  obj.user_id = obj.user_id?.toString?.() || null;
  obj.meeting_id = obj.meeting_id?.toString?.() || null;
  obj.created_at = obj.createdAt?.toISOString();
  return obj;
};

export default mongoose.model('AuditEvent', auditEventSchema);
