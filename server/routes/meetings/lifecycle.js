import { Router } from 'express';
import Meeting from '../../models/Meeting.js';
import AuditEvent from '../../models/AuditEvent.js';
import { safeString } from '../../services/meetingRouteUtils.js';
import { hasMeetingAccess } from '../../services/meetingAccessService.js';
import { logAuditEvent } from '../../services/auditLogService.js';

const router = Router({ mergeParams: true });

// GET /api/meetings/:id/events
router.get('/:id/events', async (req, res) => {
  try {
    const meeting = await Meeting.findById(req.params.id);
    if (!meeting) return res.status(404).json({ error: 'Meeting not found' });

    if (!hasMeetingAccess(req, meeting)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const events = await AuditEvent.find({ meeting_id: meeting._id }).sort({ createdAt: -1 }).limit(200);
    res.json(events.map((e) => e.toJSON()));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/meetings/:id
router.delete('/:id', async (req, res) => {
  try {
    const meeting = await Meeting.findById(req.params.id);
    if (!meeting) return res.status(404).json({ error: 'Not found' });

    if (!hasMeetingAccess(req, meeting)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (safeString(meeting.deleted_at)) {
      return res.json({ success: true, alreadyDeleted: true });
    }

    meeting.deleted_at = new Date().toISOString();
    meeting.deleted_by = req.user._id;
    await meeting.save();

    await logAuditEvent({
      req,
      meetingId: meeting._id,
      entityType: 'meeting',
      entityId: meeting._id.toString(),
      eventType: 'meeting_soft_deleted',
      before: { deleted_at: null },
      after: { deleted_at: meeting.deleted_at },
    });

    res.json({ success: true, softDeleted: true, deleted_at: meeting.deleted_at });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/meetings/:id/restore
router.post('/:id/restore', async (req, res) => {
  try {
    const meeting = await Meeting.findById(req.params.id);
    if (!meeting) return res.status(404).json({ error: 'Not found' });

    if (!hasMeetingAccess(req, meeting)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (!safeString(meeting.deleted_at)) {
      return res.json({ success: true, restored: false, reason: 'Meeting is not deleted' });
    }

    const beforeDeletedAt = meeting.deleted_at;
    meeting.deleted_at = null;
    meeting.deleted_by = null;
    await meeting.save();

    await logAuditEvent({
      req,
      meetingId: meeting._id,
      entityType: 'meeting',
      entityId: meeting._id.toString(),
      eventType: 'meeting_restored',
      before: { deleted_at: beforeDeletedAt },
      after: { deleted_at: null },
    });

    res.json({ success: true, restored: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
