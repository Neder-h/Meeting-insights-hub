import mongoose from 'mongoose';

const clientSchema = new mongoose.Schema({
  client_id: { type: String, required: true, index: true },
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  name: { type: String, required: true, trim: true },
  industry: { type: String, default: '' },
  size: { type: String, enum: ['startup', 'small', 'medium', 'large', 'enterprise', ''], default: '' },
  contactPerson: { type: String, default: '' },
  email: { type: String, default: '' },
  phone: { type: String, default: '' },
  address: { type: String, default: '' },
  website: { type: String, default: '' },
  logo: { type: String, default: '' },
  notes: { type: String, default: '' },
  status: { type: String, enum: ['prospect', 'active', 'inactive', 'churned'], default: 'prospect' },
  tags: { type: [String], default: [] },
  assignedCommercialId: { type: String, default: '' },
  lastContactDate: { type: String, default: '' },
  totalMeetings: { type: Number, default: 0 },
  totalRevenue: { type: Number, default: 0 },
  deleted_at: { type: String, default: null },
  deleted_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  version: { type: Number, default: 1 },
}, { timestamps: true });

clientSchema.index({ user_id: 1, client_id: 1 }, { unique: true });

clientSchema.methods.toJSON = function toJSON() {
  const obj = this.toObject();
  obj.id = obj.client_id;
  obj.user_id = obj.user_id?.toString?.() || null;
  obj.deleted_by = obj.deleted_by?.toString?.() || null;
  obj.createdAt = obj.createdAt?.toISOString();
  obj.updatedAt = obj.updatedAt?.toISOString();
  obj.syncMeta = {
    version: obj.version || 1,
    lastSyncedAt: obj.updatedAt || null,
    dirty: false,
    syncState: 'synced',
    deletedAt: obj.deleted_at || null,
  };
  return obj;
};

export default mongoose.model('Client', clientSchema);
