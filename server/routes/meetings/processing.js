import { Router } from 'express';
import Meeting from '../../models/Meeting.js';
import { queueMeetingProcessing } from '../../services/meetingJobService.js';
import { logAuditEvent } from '../../services/auditLogService.js';
import { hasMeetingAccess } from '../../services/meetingAccessService.js';

const router = Router({ mergeParams: true });

// POST /api/meetings/:id/process
router.post('/:id/process', async (req, res) => {
  try {
    const meeting = await Meeting.findById(req.params.id);
    if (!meeting) return res.status(404).json({ error: 'Meeting not found' });

    if (!hasMeetingAccess(req, meeting)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const result = await queueMeetingProcessing(meeting._id.toString());

    await logAuditEvent({
      req,
      meetingId: meeting._id,
      entityType: 'meeting',
      entityId: meeting._id.toString(),
      eventType: 'meeting_processing_enqueued',
      metadata: {
        queueJobId: result.jobId,
      },
    });

    res.status(202).json({
      queued: true,
      jobId: result.jobId,
      status: 'queued',
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
