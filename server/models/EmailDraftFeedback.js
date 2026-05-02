import mongoose from 'mongoose';

const emailDraftFeedbackSchema = new mongoose.Schema({
  meeting_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Meeting', required: true },
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  draft_id: { type: String },
  variant: { type: String, enum: ['A', 'B'], default: 'A' },
  action: {
    type: String,
    enum: ['generated', 'regenerated', 'accepted', 'approved', 'edited', 'sent', 'deleted'],
    required: true,
  },
  hadEdits: { type: Boolean, default: false },
}, { timestamps: true });

export default mongoose.model('EmailDraftFeedback', emailDraftFeedbackSchema);
