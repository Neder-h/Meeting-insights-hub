import mongoose from 'mongoose';

const meetingEmailFactsSchema = new mongoose.Schema({
  meeting_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Meeting', required: true, unique: true },
  transcript_signature: { type: String, required: true },
  analysis_signature: { type: String, required: true },
  prompt_variant: { type: String, enum: ['A', 'B'], required: true },
  confidence_score: { type: Number, default: 0 },
  facts: { type: Object, required: true },
}, { timestamps: true });

export default mongoose.model('MeetingEmailFacts', meetingEmailFactsSchema);
