import Meeting from '../models/Meeting.js';
import { enqueueMeetingProcessing } from '../queue/meetingQueue.js';

export async function queueMeetingProcessing(meetingId) {
  return enqueueMeetingProcessing(meetingId);
}

export async function getOwnedMeetingOrThrow(meetingId, reqUser) {
  const meeting = await Meeting.findById(meetingId);
  if (!meeting) {
    const err = new Error('Meeting not found');
    err.status = 404;
    throw err;
  }

  if (reqUser.role !== 'admin' && meeting.user_id.toString() !== reqUser._id.toString()) {
    const err = new Error('Access denied');
    err.status = 403;
    throw err;
  }

  return meeting;
}
