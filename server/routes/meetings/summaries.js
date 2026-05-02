import { Router } from 'express';
import Meeting from '../../models/Meeting.js';
import MeetingAnalysis from '../../models/MeetingAnalysis.js';
import EmailDraftFeedback from '../../models/EmailDraftFeedback.js';
import { parsePositiveInt, safeString } from '../../services/meetingRouteUtils.js';

const router = Router({ mergeParams: true });

function normalizePhrase(value) {
  return safeString(value, '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeRegex(input) {
  return safeString(input, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getBucketLabel(date, bucket = 'week') {
  const d = new Date(date);
  if (bucket === 'month') {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }
  const jan1 = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const days = Math.floor((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - jan1.getTime()) / 86400000);
  const week = Math.ceil((days + jan1.getUTCDay() + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

async function fetchAnalysisRowsForUser(req, windowDays = 90) {
  const from = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
  const meetingMatch = req.user.role === 'admin'
    ? { deleted_at: { $in: [null, undefined, ''] }, createdAt: { $gte: from } }
    : { user_id: req.user._id, deleted_at: { $in: [null, undefined, ''] }, createdAt: { $gte: from } };

  const rows = await Meeting.aggregate([
    { $match: meetingMatch },
    {
      $lookup: {
        from: 'meetinganalyses',
        localField: '_id',
        foreignField: 'meeting_id',
        as: 'analysis',
      },
    },
    { $unwind: { path: '$analysis', preserveNullAndEmptyArrays: false } },
    {
      $project: {
        _id: 1,
        createdAt: 1,
        user_id: 1,
        commercial_id: 1,
        commercial_name: 1,
        client_id: 1,
        client_name: 1,
        deal_status: 1,
        deal_value: 1,
        analysis: 1,
      },
    },
  ]);

  return rows;
}

// GET /api/meetings/clients/summary
router.get('/clients/summary', async (req, res) => {
  try {
    const page = parsePositiveInt(req.query.page, 1, { min: 1, max: 100000 });
    const limit = parsePositiveInt(req.query.limit, 20, { min: 1, max: 100 });
    const search = safeString(req.query.search, '');
    const statusFilter = safeString(req.query.status, '').toLowerCase();

    const match = req.user.role === 'admin'
      ? { deleted_at: { $in: [null, undefined, ''] } }
      : { user_id: req.user._id, deleted_at: { $in: [null, undefined, ''] } };

    if (search) {
      const regex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      match.$or = [
        { client_name: regex },
        { title: regex },
      ];
    }

    const grouped = await Meeting.aggregate([
      { $match: match },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: { clientId: '$client_id', clientName: '$client_name' },
          meetingsCount: { $sum: 1 },
          lastContact: { $max: '$createdAt' },
          wonRevenue: {
            $sum: {
              $cond: [
                { $eq: ['$deal_status', 'won'] },
                { $ifNull: ['$deal_value', 0] },
                0,
              ],
            },
          },
        },
      },
      {
        $project: {
          _id: 0,
          clientId: { $ifNull: ['$_id.clientId', 'client_default'] },
          clientName: { $ifNull: ['$_id.clientName', 'Client'] },
          meetingsCount: 1,
          lastContact: 1,
          revenue: '$wonRevenue',
          status: {
            $cond: [
              { $gte: ['$lastContact', new Date(Date.now() - 45 * 24 * 60 * 60 * 1000)] },
              'active',
              'inactive',
            ],
          },
        },
      },
      ...(statusFilter && statusFilter !== 'all' ? [{ $match: { status: statusFilter } }] : []),
      { $sort: { lastContact: -1 } },
      {
        $facet: {
          items: [
            { $skip: (page - 1) * limit },
            { $limit: limit },
          ],
          totalCount: [{ $count: 'count' }],
        },
      },
    ]);

    const payload = grouped[0] || { items: [], totalCount: [] };
    const total = payload.totalCount?.[0]?.count || 0;

    res.set('Cache-Control', 'private, max-age=20, stale-while-revalidate=40');
    res.json({
      items: payload.items || [],
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
      filters: {
        search,
        status: statusFilter || null,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/meetings/analytics/trends
router.get('/analytics/trends', async (req, res) => {
  try {
    const windowDays = parsePositiveInt(req.query.windowDays, 90, { min: 7, max: 730 });
    const bucket = safeString(req.query.bucket, 'week').toLowerCase() === 'month' ? 'month' : 'week';

    const rows = await fetchAnalysisRowsForUser(req, windowDays);

    const objectionMap = new Map();
    const trendMap = new Map();

    for (const row of rows) {
      const createdAt = row.createdAt;
      const a = row.analysis || {};
      const objections = Array.isArray(a.objections) ? a.objections : [];
      const bucketLabel = getBucketLabel(createdAt, bucket);

      if (!trendMap.has(bucketLabel)) {
        trendMap.set(bucketLabel, {
          bucket: bucketLabel,
          totalMeetings: 0,
          positive: 0,
          neutral: 0,
          negative: 0,
          avgWinProbability: 0,
          _sumWin: 0,
          recurringObjectionsCount: 0,
        });
      }
      const t = trendMap.get(bucketLabel);
      t.totalMeetings += 1;
      t._sumWin += Number(a.win_probability || 0);
      if (a.sentiment === 'positive') t.positive += 1;
      else if (a.sentiment === 'negative') t.negative += 1;
      else t.neutral += 1;

      for (const ob of objections) {
        const normalized = normalizePhrase(ob);
        if (!normalized) continue;

        const current = objectionMap.get(normalized) || {
          objection: safeString(ob, ''),
          normalized,
          count: 0,
          lastSeen: null,
          buckets: {},
        };
        current.count += 1;
        current.lastSeen = current.lastSeen ? (new Date(current.lastSeen) > new Date(createdAt) ? current.lastSeen : createdAt) : createdAt;
        current.buckets[bucketLabel] = (current.buckets[bucketLabel] || 0) + 1;
        objectionMap.set(normalized, current);
      }
    }

    const recurringObjections = [...objectionMap.values()]
      .sort((a, b) => b.count - a.count)
      .slice(0, 25)
      .map((o) => ({
        objection: o.objection,
        normalized: o.normalized,
        count: o.count,
        lastSeen: o.lastSeen,
        buckets: o.buckets,
      }));

    const trendBuckets = [...trendMap.values()]
      .map((t) => ({
        bucket: t.bucket,
        totalMeetings: t.totalMeetings,
        positive: t.positive,
        neutral: t.neutral,
        negative: t.negative,
        avgWinProbability: t.totalMeetings ? Math.round((t._sumWin / t.totalMeetings) * 10) / 10 : 0,
      }))
      .sort((a, b) => a.bucket.localeCompare(b.bucket));

    // count recurring objections presence by bucket for quick trend overlays
    const objectionThreshold = 2;
    const recurringSet = new Set(recurringObjections.filter((o) => o.count >= objectionThreshold).map((o) => o.normalized));
    for (const t of trendBuckets) {
      let recurringObjectionsCount = 0;
      for (const o of recurringObjections) {
        if (!recurringSet.has(o.normalized)) continue;
        recurringObjectionsCount += Number(o.buckets[t.bucket] || 0);
      }
      t.recurringObjectionsCount = recurringObjectionsCount;
    }

    res.json({
      windowDays,
      bucket,
      recurringObjections,
      trendBuckets,
      totals: {
        meetingsAnalyzed: rows.length,
        uniqueObjections: objectionMap.size,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/meetings/analytics/coaching
router.get('/analytics/coaching', async (req, res) => {
  try {
    const windowDays = parsePositiveInt(req.query.windowDays, 120, { min: 14, max: 730 });
    const rows = await fetchAnalysisRowsForUser(req, windowDays);
    const meetingIds = rows.map((r) => r._id);

    const feedbackRows = await EmailDraftFeedback.find({
      meeting_id: { $in: meetingIds },
      ...(req.user.role === 'admin' ? {} : { user_id: req.user._id }),
    }).select('meeting_id action hadEdits createdAt');

    const feedbackByMeeting = new Map();
    for (const f of feedbackRows) {
      const key = f.meeting_id?.toString();
      if (!key) continue;
      if (!feedbackByMeeting.has(key)) feedbackByMeeting.set(key, []);
      feedbackByMeeting.get(key).push(f);
    }

    const byCommercial = new Map();

    for (const row of rows) {
      const commercialId = safeString(row.commercial_id, row.user_id?.toString?.() || 'unknown');
      const commercialName = safeString(row.commercial_name, commercialId === 'unknown' ? 'Unknown' : `Commercial ${commercialId.slice(-4)}`);
      const a = row.analysis || {};
      if (!byCommercial.has(commercialId)) {
        byCommercial.set(commercialId, {
          commercialId,
          commercialName,
          totalMeetings: 0,
          completedMeetings: 0,
          wins: 0,
          losses: 0,
          openDeals: 0,
          winProbabilityHistory: [],
          stageCounts: {
            contact_visits: 0,
            value_proposition: 0,
            offer_negotiation: 0,
            closing: 0,
            closed_lost: 0,
          },
          objectionMap: new Map(),
          followupAccepted: 0,
          followupEdited: 0,
          followupGenerated: 0,
          nextActionsScoreSum: 0,
          _feedbackMeetings: 0,
        });
      }

      const agg = byCommercial.get(commercialId);
      agg.totalMeetings += 1;
      agg.completedMeetings += 1;

      const stage = safeString(a.sales_stage, '');
      if (stage && Object.prototype.hasOwnProperty.call(agg.stageCounts, stage)) {
        agg.stageCounts[stage] += 1;
      }

      if (row.deal_status === 'won') agg.wins += 1;
      else if (row.deal_status === 'lost') agg.losses += 1;
      else agg.openDeals += 1;

      const wp = Number(a.win_probability || 0);
      agg.winProbabilityHistory.push({
        date: row.createdAt,
        win_probability: wp,
      });

      const objections = Array.isArray(a.objections) ? a.objections : [];
      for (const ob of objections) {
        const normalized = normalizePhrase(ob);
        if (!normalized) continue;
        agg.objectionMap.set(normalized, {
          objection: safeString(ob, ''),
          count: (agg.objectionMap.get(normalized)?.count || 0) + 1,
        });
      }

      const nextActions = Array.isArray(a.next_actions) ? a.next_actions : [];
      agg.nextActionsScoreSum += Math.min(100, nextActions.length * 25);

      const feedback = feedbackByMeeting.get(row._id.toString()) || [];
      if (feedback.length) agg._feedbackMeetings += 1;
      for (const f of feedback) {
        if (f.action === 'generated' || f.action === 'regenerated') agg.followupGenerated += 1;
        if (f.action === 'accepted') agg.followupAccepted += 1;
        if (f.action === 'edited') agg.followupEdited += 1;
      }
    }

    const coaching = [...byCommercial.values()].map((agg) => {
      const history = [...agg.winProbabilityHistory].sort((a, b) => new Date(a.date) - new Date(b.date));
      const midpoint = Math.floor(history.length / 2) || 1;
      const early = history.slice(0, midpoint);
      const late = history.slice(midpoint);
      const avg = (arr) => arr.length ? arr.reduce((s, x) => s + Number(x.win_probability || 0), 0) / arr.length : 0;
      const earlyAvg = Math.round(avg(early) * 10) / 10;
      const lateAvg = Math.round(avg(late) * 10) / 10;

      const topObjections = [...agg.objectionMap.values()]
        .sort((a, b) => b.count - a.count)
        .slice(0, 6);

      const stageCounts = agg.stageCounts;
      const earlyStage = stageCounts.contact_visits + stageCounts.value_proposition;
      const lateStage = stageCounts.offer_negotiation + stageCounts.closing;
      const conversionRate = earlyStage > 0 ? Math.round((lateStage / earlyStage) * 1000) / 10 : 0;

      const feedbackTotal = agg.followupGenerated + agg.followupAccepted + agg.followupEdited;
      const feedbackQuality = feedbackTotal > 0
        ? Math.round((((agg.followupAccepted * 1.0) + (agg.followupEdited * 0.7)) / feedbackTotal) * 100)
        : Math.round((agg.nextActionsScoreSum / Math.max(1, agg.completedMeetings)));

      return {
        commercialId: agg.commercialId,
        commercialName: agg.commercialName,
        totals: {
          totalMeetings: agg.totalMeetings,
          wins: agg.wins,
          losses: agg.losses,
          openDeals: agg.openDeals,
          avgWinProbability: Math.round(avg(history) * 10) / 10,
        },
        winRateTrend: {
          earlyAvg,
          lateAvg,
          delta: Math.round((lateAvg - earlyAvg) * 10) / 10,
          points: history,
        },
        commonObjections: topObjections,
        stageConversion: {
          stageCounts,
          earlyStage,
          lateStage,
          conversionRate,
        },
        followUpQuality: {
          score: feedbackQuality,
          generated: agg.followupGenerated,
          accepted: agg.followupAccepted,
          edited: agg.followupEdited,
          feedbackMeetings: agg._feedbackMeetings,
        },
      };
    }).sort((a, b) => (b.totals.avgWinProbability || 0) - (a.totals.avgWinProbability || 0));

    res.json({
      windowDays,
      coaching,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/meetings/clients/:clientId/360
router.get('/clients/:clientId/360', async (req, res) => {
  try {
    const clientId = safeString(req.params.clientId, '');
    if (!clientId) return res.status(400).json({ error: 'clientId required' });

    const filter = req.user.role === 'admin'
      ? { client_id: clientId, deleted_at: { $in: [null, undefined, ''] } }
      : { user_id: req.user._id, client_id: clientId, deleted_at: { $in: [null, undefined, ''] } };

    const meetings = await Meeting.find(filter).sort({ createdAt: -1 }).limit(300);
    const meetingIds = meetings.map((m) => m._id);
    const analyses = await MeetingAnalysis.find({ meeting_id: { $in: meetingIds } });
    const analysisByMeeting = new Map(analyses.map((a) => [a.meeting_id.toString(), a]));

    const history = meetings.map((m) => {
      const a = analysisByMeeting.get(m._id.toString());
      return {
        id: m._id.toString(),
        title: m.title,
        createdAt: m.createdAt,
        status: m.status,
        dealStatus: m.deal_status || 'pending',
        dealValue: Number(m.deal_value || 0),
        dealCurrency: safeString(m.deal_currency, 'TND'),
        sentiment: a?.sentiment || 'neutral',
        salesStage: a?.sales_stage || 'value_proposition',
        winProbability: Number(a?.win_probability || 0),
        objections: Array.isArray(a?.objections) ? a.objections : [],
        nextActions: Array.isArray(a?.next_actions) ? a.next_actions : [],
      };
    });

    const lastContactAt = meetings[0]?.createdAt || null;
    const daysSinceLastContact = lastContactAt
      ? Math.max(0, Math.round((Date.now() - new Date(lastContactAt).getTime()) / 86400000))
      : null;

    const sentimentBucketsMap = new Map();
    for (const item of history) {
      const label = getBucketLabel(item.createdAt, 'month');
      if (!sentimentBucketsMap.has(label)) {
        sentimentBucketsMap.set(label, { bucket: label, positive: 0, neutral: 0, negative: 0, _scoreSum: 0, total: 0 });
      }
      const bucket = sentimentBucketsMap.get(label);
      bucket.total += 1;
      if (item.sentiment === 'positive') {
        bucket.positive += 1;
        bucket._scoreSum += 1;
      } else if (item.sentiment === 'negative') {
        bucket.negative += 1;
        bucket._scoreSum -= 1;
      } else {
        bucket.neutral += 1;
      }
    }

    const sentimentTrend = [...sentimentBucketsMap.values()]
      .map((b) => ({
        bucket: b.bucket,
        positive: b.positive,
        neutral: b.neutral,
        negative: b.negative,
        avgSentimentScore: b.total ? Math.round((b._scoreSum / b.total) * 100) / 100 : 0,
      }))
      .sort((a, b) => a.bucket.localeCompare(b.bucket));

    const wonRevenue = history.filter((h) => h.dealStatus === 'won').reduce((s, h) => s + h.dealValue, 0);
    const pendingRevenue = history.filter((h) => h.dealStatus === 'pending').reduce((s, h) => s + h.dealValue, 0);

    const openActions = [];
    const seenActions = new Set();
    for (const item of history) {
      if (item.dealStatus !== 'pending') continue;
      for (const action of item.nextActions || []) {
        const normalized = normalizePhrase(action);
        if (!normalized || seenActions.has(normalized)) continue;
        seenActions.add(normalized);
        openActions.push({ action: safeString(action, ''), meetingId: item.id, createdAt: item.createdAt });
      }
      if (openActions.length >= 15) break;
    }

    res.json({
      clientId,
      clientName: meetings[0]?.client_name || 'Client',
      summary: {
        totalMeetings: history.length,
        wonRevenue,
        pendingRevenue,
        lastContactAt,
        daysSinceLastContact,
        avgWinProbability: history.length
          ? Math.round((history.reduce((s, x) => s + x.winProbability, 0) / history.length) * 10) / 10
          : 0,
      },
      sentimentTrend,
      openActions,
      meetingHistory: history.slice(0, 50),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/meetings/search?q=...
router.get('/search', async (req, res) => {
  try {
    const q = safeString(req.query.q, '').trim();
    const page = parsePositiveInt(req.query.page, 1, { min: 1, max: 100000 });
    const limit = parsePositiveInt(req.query.limit, 20, { min: 1, max: 100 });
    if (!q) {
      return res.json({ items: [], pagination: { page, limit, total: 0, totalPages: 1 }, query: q });
    }

    const regex = new RegExp(escapeRegex(q), 'i');
    const baseFilter = req.user.role === 'admin' ? {} : { user_id: req.user._id };
    baseFilter.deleted_at = { $in: [null, undefined, ''] };

    const analysisHits = await MeetingAnalysis.find({
      $or: [
        { summary: regex },
        { objections: regex },
        { next_actions: regex },
        { key_topics: regex },
      ],
    }).select('meeting_id objections next_actions summary key_topics');

    const analysisMeetingIds = analysisHits.map((a) => a.meeting_id);

    const filter = {
      ...baseFilter,
      $or: [
        { title: regex },
        { transcript: regex },
        { raw_transcript: regex },
        { client_name: regex },
        ...(analysisMeetingIds.length ? [{ _id: { $in: analysisMeetingIds } }] : []),
      ],
    };

    const total = await Meeting.countDocuments(filter);
    const meetings = await Meeting.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit);
    const ids = meetings.map((m) => m._id);
    const analyses = await MeetingAnalysis.find({ meeting_id: { $in: ids } });
    const byId = new Map(analyses.map((a) => [a.meeting_id.toString(), a]));

    const items = meetings.map((m) => {
      const a = byId.get(m._id.toString());
      const keywords = [];
      for (const arr of [a?.objections || [], a?.next_actions || [], a?.key_topics || []]) {
        for (const value of arr) {
          if (regex.test(safeString(value, ''))) keywords.push(value);
        }
      }
      if (a?.summary && regex.test(a.summary)) keywords.push(a.summary.slice(0, 120));

      return {
        ...m.toJSON(),
        meeting_analyses: a ? [a.toJSON()] : [],
        searchMatches: [...new Set(keywords)].slice(0, 8),
      };
    });

    res.json({
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
      query: q,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
