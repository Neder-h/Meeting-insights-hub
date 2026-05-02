import AuditEvent from '../models/AuditEvent.js';
import mongoose from 'mongoose';

function normalizeObjectId(value) {
  if (!value) return null;
  if (mongoose.isValidObjectId(value)) return value;
  return null;
}

export async function logAuditEvent({ req, meetingId = null, entityType, entityId, eventType, before = null, after = null, metadata = {} }) {
  try {
    await AuditEvent.create({
      user_id: req.user._id,
      meeting_id: meetingId,
      entity_type: entityType,
      entity_id: entityId,
      event_type: eventType,
      before,
      after,
      metadata,
    });
  } catch (err) {
    console.warn('Audit log write failed:', err?.message || err);
  }
}

export async function logSystemAuditEvent({ userId = null, meetingId = null, entityType, entityId, eventType, before = null, after = null, metadata = {} }) {
  try {
    if (mongoose.connection.readyState !== 1) {
      return;
    }

    await AuditEvent.create({
      user_id: normalizeObjectId(userId),
      meeting_id: normalizeObjectId(meetingId),
      entity_type: entityType,
      entity_id: entityId,
      event_type: eventType,
      before,
      after,
      metadata,
    });
  } catch (err) {
    console.warn('System audit log write failed:', err?.message || err);
  }
}

export async function logSystemMeetingEvent({ meetingId, userId = null, eventType, before = null, after = null, metadata = {} }) {
  if (!meetingId) return;
  await logSystemAuditEvent({
    userId,
    meetingId,
    entityType: 'meeting',
    entityId: meetingId.toString(),
    eventType,
    before,
    after,
    metadata,
  });
}
