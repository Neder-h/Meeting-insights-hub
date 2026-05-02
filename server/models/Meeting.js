import mongoose from 'mongoose';

const meetingSchema = new mongoose.Schema({
  title: { type: String, required: true },
  status: {
    type: String,
    enum: ['uploading', 'queued', 'transcribing', 'translating', 'analyzing', 'completed', 'error'],
    default: 'uploading',
  },
  audio_url: String,
  transcript: String,
  raw_transcript: String,
  error_message: String,
  duration_seconds: { type: Number, default: 0 },
  transcript_engine: String,
  transcript_language: String,
  client_id: String,
  client_name: String,
  commercial_id: String,
  commercial_name: String,
  deal_value: Number,
  deal_currency: String,
  deal_status: { type: String, enum: ['pending', 'won', 'lost'] },
  closed_date: String,
  deleted_at: String,
  deleted_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  processing_meta: { type: mongoose.Schema.Types.Mixed, default: {} },
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });

meetingSchema.methods.toJSON = function () {
  const obj = this.toObject();
  obj.id = obj._id.toString();
  obj.created_at = obj.createdAt?.toISOString();
  obj.updated_at = obj.updatedAt?.toISOString();
  obj.user_id = obj.user_id?.toString();
  obj.deleted_by = obj.deleted_by?.toString?.() || null;
  return obj;
};

export default mongoose.model('Meeting', meetingSchema);
