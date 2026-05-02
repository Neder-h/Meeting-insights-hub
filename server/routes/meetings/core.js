import { Router } from 'express';
import Meeting from '../../models/Meeting.js';
import MeetingAnalysis from '../../models/MeetingAnalysis.js';
import { parsePositiveInt, safeString } from '../../services/meetingRouteUtils.js';
import { hasMeetingAccess } from '../../services/meetingAccessService.js';
import { logAuditEvent } from '../../services/auditLogService.js';

const router = Router({ mergeParams: true });

// GET /api/meetings — list (own only, or all if admin)
router.get('/', async (req, res) => {
  try {
    const includeDeleted = req.query.includeDeleted === '1' || req.query.includeDeleted === 'true';
    const page = parsePositiveInt(req.query.page, 1, { min: 1, max: 100000 });
    const limit = parsePositiveInt(req.query.limit, 20, { min: 1, max: 100 });
    const search = safeString(req.query.search, '');
    const stage = safeString(req.query.stage, '');
    const sentiment = safeString(req.query.sentiment, '');
    const status = safeString(req.query.status, '');
    const sortBy = safeString(req.query.sortBy, 'createdAt');
    const sortOrder = safeString(req.query.sortOrder, 'desc').toLowerCase() === 'asc' ? 1 : -1;

    const filter = req.user.role === 'admin' ? {} : { user_id: req.user._id };
    if (!includeDeleted) {
      filter.deleted_at = { $in: [null, undefined, ''] };
    }

    if (status) {
      filter.status = status;
    }

    if (search) {
      const regex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [
        { title: regex },
        { transcript: regex },
        { raw_transcript: regex },
        { client_name: regex },
      ];
    }

    const analysisFilter = {};
    if (stage) analysisFilter.sales_stage = stage;
    if (sentiment) analysisFilter.sentiment = sentiment;

    let meetings = [];
    let total = 0;
    let meetingIdsForPage = null;

    if (stage || sentiment) {
      const matchingAnalyses = await MeetingAnalysis.find(analysisFilter).select('meeting_id');
      const meetingIds = matchingAnalyses.map((a) => a.meeting_id);
      filter._id = { $in: meetingIds.length ? meetingIds : [] };
    }

    total = await Meeting.countDocuments(filter);

    const sortField = ['createdAt', 'updatedAt', 'title', 'status'].includes(sortBy) ? sortBy : 'createdAt';
    meetings = await Meeting.find(filter)
      .sort({ [sortField]: sortOrder })
      .skip((page - 1) * limit)
      .limit(limit);

    meetingIdsForPage = meetings.map((m) => m._id);

    const analyses = await MeetingAnalysis.find({ meeting_id: { $in: meetingIdsForPage } });
    const analysisMap = new Map(analyses.map((a) => [a.meeting_id.toString(), a]));

    const items = meetings.map((m) => {
      const mJson = m.toJSON();
      const analysis = analysisMap.get(m._id.toString());
      return { ...mJson, meeting_analyses: analysis ? [analysis.toJSON()] : [] };
    });

    res.set('Cache-Control', 'private, max-age=15, stale-while-revalidate=30');
    res.json({
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
      filters: {
        search,
        stage: stage || null,
        sentiment: sentiment || null,
        status: status || null,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/meetings/:id
router.get('/:id', async (req, res) => {
  try {
    const includeDeleted = req.query.includeDeleted === '1' || req.query.includeDeleted === 'true';
    const meeting = await Meeting.findById(req.params.id);
    if (!meeting) return res.status(404).json({ error: 'Not found' });

    if (!hasMeetingAccess(req, meeting)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (!includeDeleted && safeString(meeting.deleted_at)) {
      return res.status(404).json({ error: 'Not found' });
    }

    const analysis = await MeetingAnalysis.findOne({ meeting_id: meeting._id });
    res.set('Cache-Control', 'private, max-age=10, stale-while-revalidate=30');
    res.json({
      ...meeting.toJSON(),
      meeting_analyses: analysis ? [analysis.toJSON()] : [],
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/meetings
router.post('/', async (req, res) => {
  try {
    const meeting = await Meeting.create({
      ...req.body,
      user_id: req.user._id,
    });
    await logAuditEvent({
      req,
      meetingId: meeting._id,
      entityType: 'meeting',
      entityId: meeting._id.toString(),
      eventType: 'meeting_created',
      after: {
        status: meeting.status,
        title: meeting.title,
        client_id: meeting.client_id,
      },
    });
    res.status(201).json({ id: meeting._id.toString() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/meetings/:id
router.patch('/:id', async (req, res) => {
  try {
    const meeting = await Meeting.findById(req.params.id);
    if (!meeting) return res.status(404).json({ error: 'Not found' });

    if (!hasMeetingAccess(req, meeting)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const before = {
      status: meeting.status,
      deal_status: meeting.deal_status,
      deal_value: meeting.deal_value,
      client_id: meeting.client_id,
      commercial_id: meeting.commercial_id,
    };

    Object.assign(meeting, req.body);
    await meeting.save();

    const after = {
      status: meeting.status,
      deal_status: meeting.deal_status,
      deal_value: meeting.deal_value,
      client_id: meeting.client_id,
      commercial_id: meeting.commercial_id,
    };

    if (JSON.stringify(before) !== JSON.stringify(after)) {
      await logAuditEvent({
        req,
        meetingId: meeting._id,
        entityType: 'meeting',
        entityId: meeting._id.toString(),
        eventType: 'meeting_state_changed',
        before,
        after,
      });
    }

    res.json(meeting.toJSON());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/meetings/:id/analysis
router.post('/:id/analysis', async (req, res) => {
  try {
    const meeting = await Meeting.findById(req.params.id);
    if (!meeting) return res.status(404).json({ error: 'Meeting not found' });

    if (!hasMeetingAccess(req, meeting)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await MeetingAnalysis.deleteOne({ meeting_id: meeting._id });

    const analysis = await MeetingAnalysis.create({
      ...req.body,
      meeting_id: meeting._id,
    });

    await logAuditEvent({
      req,
      meetingId: meeting._id,
      entityType: 'analysis',
      entityId: analysis._id.toString(),
      eventType: 'meeting_analysis_upserted',
      after: {
        sales_stage: analysis.sales_stage,
        sentiment: analysis.sentiment,
        win_probability: analysis.win_probability,
      },
    });

    res.status(201).json(analysis.toJSON());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
