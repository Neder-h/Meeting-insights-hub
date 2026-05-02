import { processMeetingPipeline } from './meetingProcessor.js';

export async function runMeetingProcessing(meetingId, opts = {}) {
  return processMeetingPipeline(meetingId, opts);
}
