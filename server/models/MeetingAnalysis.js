import mongoose from 'mongoose';

const analysisSchema = new mongoose.Schema({
  meeting_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Meeting', required: true },
  summary: String,
  sales_stage: {
    type: String,
    enum: ['contact_visits', 'value_proposition', 'offer_negotiation', 'closing', 'closed_lost'],
  },
  objections: [String],
  risks: [String],
  next_actions: [String],
  key_topics: [String],
  sentiment: { type: String, enum: ['positive', 'neutral', 'negative'] },
  win_probability: { type: Number, default: 0 },
  confidence: { type: Number, default: 0 },
  duration_minutes: { type: Number, default: 0 },
}, { timestamps: true });

analysisSchema.methods.toJSON = function () {
  const obj = this.toObject();
  obj.id = obj._id.toString();
  obj.meeting_id = obj.meeting_id?.toString();
  obj.created_at = obj.createdAt?.toISOString();
  return obj;
};

export default mongoose.model('MeetingAnalysis', analysisSchema);
