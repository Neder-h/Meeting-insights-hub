import { Router } from 'express';
import Meeting from '../../models/Meeting.js';
import AuditEvent from '../../models/AuditEvent.js';
import { requireAdmin } from '../../middleware/auth.js';
import { getQueueDiagnostics } from '../../queue/meetingQueue.js';

const router = Router({ mergeParams: true });

// GET /api/meetings/diagnostics/processing
router.get('/diagnostics/processing', requireAdmin, async (req, res) => {
  try {
    const queue = await getQueueDiagnostics();

    const recentFailures = await Meeting.find({ status: 'error' })
      .sort({ updatedAt: -1 })
      .limit(25)
      .select('_id title status error_message processing_meta updatedAt createdAt user_id');

    const recentEvents = await AuditEvent.find({
      event_type: {
        $in: [
          'queue_job_enqueued',
          'queue_job_started',
          'queue_job_failed',
          'queue_job_completed',
          'processing_pipeline_started',
          'processing_pipeline_completed',
          'processing_pipeline_failed',
          'processing_transcription_failed',
          'processing_translation_fallback',
          'processing_analysis_failed',
          'processing_analysis_parse_failed',
        ],
      },
    })
      .sort({ createdAt: -1 })
      .limit(200);

    res.json({
      queue,
      summary: {
        recentFailureCount: recentFailures.length,
        recentEventCount: recentEvents.length,
      },
      failures: recentFailures.map((m) => ({
        id: m._id.toString(),
        title: m.title,
        status: m.status,
        error_message: m.error_message || null,
        processing_meta: m.processing_meta || {},
        updated_at: m.updatedAt?.toISOString?.() || null,
        created_at: m.createdAt?.toISOString?.() || null,
        user_id: m.user_id?.toString?.() || null,
      })),
      events: recentEvents.map((e) => e.toJSON()),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
