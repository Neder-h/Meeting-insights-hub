import { Queue, Worker, QueueEvents } from 'bullmq';
import Redis from 'ioredis';
import config from '../config.js';
import { runMeetingProcessing } from '../services/meetingProcessingService.js';
import Meeting from '../models/Meeting.js';
import { logSystemMeetingEvent } from '../services/auditLogService.js';

let meetingQueue = null;
let queueEvents = null;
let redisConnection = null;

export function getQueueStatus() {
  return {
    enabled: config.redisEnabled,
    connected: !!meetingQueue,
    redisUrl: config.redisUrl,
    mode: meetingQueue ? 'bullmq' : 'inline',
  };
}

export async function getQueueDiagnostics() {
  const base = {
    enabled: config.redisEnabled,
    connected: !!meetingQueue,
    mode: meetingQueue ? 'bullmq' : 'inline',
    redisUrl: config.redisUrl,
    counts: {
      waiting: 0,
      active: 0,
      completed: 0,
      failed: 0,
      delayed: 0,
      paused: 0,
    },
  };

  if (!meetingQueue) return base;

  try {
    const counts = await meetingQueue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed', 'paused');
    return {
      ...base,
      counts: {
        waiting: counts.waiting || 0,
        active: counts.active || 0,
        completed: counts.completed || 0,
        failed: counts.failed || 0,
        delayed: counts.delayed || 0,
        paused: counts.paused || 0,
      },
    };
  } catch (error) {
    return {
      ...base,
      error: error?.message || 'Unable to fetch queue counts',
    };
  }
}

export async function initMeetingQueue() {
  if (!config.redisEnabled) {
    console.log('ℹ Redis queue disabled (REDIS_ENABLED=false). Using inline processing mode.');
    meetingQueue = null;
    return;
  }

  try {
    redisConnection = new Redis(config.redisUrl, {
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
      lazyConnect: true,
    });

    redisConnection.on('error', (err) => {
      // Prevent unhandled Redis connection errors from crashing startup
      console.warn('Redis connection warning:', err?.message || err);
    });

    await redisConnection.connect();

    meetingQueue = new Queue('meeting-processing', {
      connection: redisConnection,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 1500,
        },
        removeOnComplete: 50,
        removeOnFail: 100,
      },
    });

    queueEvents = new QueueEvents('meeting-processing', {
      connection: redisConnection,
    });

    const worker = new Worker(
      'meeting-processing',
      async (job) => {
        const meetingId = job.data.meetingId;
        const meeting = await Meeting.findById(meetingId).select('_id user_id');
        await logSystemMeetingEvent({
          meetingId,
          userId: meeting?.user_id || null,
          eventType: 'queue_job_started',
          metadata: {
            jobId: job.id,
            attemptsMade: job.attemptsMade,
            maxAttempts: job.opts?.attempts || null,
            queueMode: 'bullmq',
          },
        });

        await runMeetingProcessing(meetingId, {
          attempt: job.attemptsMade,
          jobId: job.id,
        });
      },
      {
        connection: redisConnection,
        concurrency: 2,
      }
    );

    worker.on('failed', (job, err) => {
      console.error(`Meeting job failed (${job?.id}):`, err?.message || err);
      const meetingId = job?.data?.meetingId;
      if (meetingId) {
        Meeting.findById(meetingId)
          .select('_id user_id')
          .then((meeting) => logSystemMeetingEvent({
            meetingId,
            userId: meeting?.user_id || null,
            eventType: 'queue_job_failed',
            metadata: {
              jobId: job?.id || null,
              attemptsMade: job?.attemptsMade ?? null,
              maxAttempts: job?.opts?.attempts ?? null,
              error: err?.message || String(err),
              queueMode: 'bullmq',
            },
          }))
          .catch(() => {});
      }
    });

    worker.on('completed', (job) => {
      console.log(`Meeting job completed (${job.id})`);
      const meetingId = job?.data?.meetingId;
      if (meetingId) {
        Meeting.findById(meetingId)
          .select('_id user_id')
          .then((meeting) => logSystemMeetingEvent({
            meetingId,
            userId: meeting?.user_id || null,
            eventType: 'queue_job_completed',
            metadata: {
              jobId: job?.id || null,
              attemptsMade: job?.attemptsMade ?? null,
              queueMode: 'bullmq',
            },
          }))
          .catch(() => {});
      }
    });

    await queueEvents.waitUntilReady();
    console.log('✅ Meeting processing queue initialized');
  } catch (error) {
    console.warn('⚠ Queue init failed, processing will run inline:', error?.message || error);
    meetingQueue = null;
    queueEvents = null;
    if (redisConnection) {
      try {
        redisConnection.disconnect();
      } catch {
        // noop
      }
    }
    redisConnection = null;
  }
}

export async function enqueueMeetingProcessing(meetingId) {
  const meeting = await Meeting.findById(meetingId).select('_id user_id');

  if (meetingQueue) {
    const job = await meetingQueue.add('process-meeting', { meetingId });
    await Meeting.findByIdAndUpdate(meetingId, {
      status: 'queued',
      processing_meta: {
        queue: {
          jobId: job.id,
          enqueuedAt: new Date().toISOString(),
          mode: 'bullmq',
        },
      },
    });

    await logSystemMeetingEvent({
      meetingId,
      userId: meeting?.user_id || null,
      eventType: 'queue_job_enqueued',
      metadata: {
        jobId: job.id,
        queueMode: 'bullmq',
      },
    });

    return { queued: true, jobId: job.id };
  }

  // Fallback when Redis unavailable
  await Meeting.findByIdAndUpdate(meetingId, {
    status: 'queued',
    processing_meta: {
      queue: {
        mode: 'inline',
        enqueuedAt: new Date().toISOString(),
      },
    },
  });

  runMeetingProcessing(meetingId, { attempt: 0 }).catch((e) => {
    console.error('Inline processing failed:', e?.message || e);
  });

  await logSystemMeetingEvent({
    meetingId,
    userId: meeting?.user_id || null,
    eventType: 'queue_job_enqueued',
    metadata: {
      jobId: null,
      queueMode: 'inline',
    },
  });

  await logSystemMeetingEvent({
    meetingId,
    userId: meeting?.user_id || null,
    eventType: 'queue_job_started',
    metadata: {
      jobId: null,
      attemptsMade: 0,
      maxAttempts: 1,
      queueMode: 'inline',
    },
  });

  return { queued: true, jobId: null };
}
