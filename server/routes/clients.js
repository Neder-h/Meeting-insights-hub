import { Router } from 'express';
import { randomUUID } from 'crypto';
import Client from '../models/Client.js';
import Meeting from '../models/Meeting.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();
router.use(authenticate);

function safeString(value, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function parsePositiveInt(value, fallback, { min = 1, max = 200 } = {}) {
  const n = Number.parseInt(String(value || ''), 10);
  if (!Number.isFinite(n) || Number.isNaN(n)) return fallback;
  return clamp(n, min, max);
}

function userFilter(req) {
  return req.user.role === 'admin' ? {} : { user_id: req.user._id };
}

// GET /api/clients
router.get('/', async (req, res) => {
  try {
    const page = parsePositiveInt(req.query.page, 1, { min: 1, max: 100000 });
    const limit = parsePositiveInt(req.query.limit, 50, { min: 1, max: 200 });
    const search = safeString(req.query.search, '');
    const includeDeleted = req.query.includeDeleted === '1' || req.query.includeDeleted === 'true';

    const filter = {
      ...userFilter(req),
      ...(includeDeleted ? {} : { deleted_at: { $in: [null, undefined, ''] } }),
    };

    if (search) {
      const regex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [
        { name: regex },
        { email: regex },
        { contactPerson: regex },
        { industry: regex },
      ];
    }

    const total = await Client.countDocuments(filter);
    const items = await Client.find(filter)
      .sort({ updatedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    res.json({
      items: items.map((c) => c.toJSON()),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/clients/:id
router.get('/:id', async (req, res) => {
  try {
    const includeDeleted = req.query.includeDeleted === '1' || req.query.includeDeleted === 'true';
    const client = await Client.findOne({ client_id: req.params.id });
    if (!client) return res.status(404).json({ error: 'Client not found' });

    if (req.user.role !== 'admin' && client.user_id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (!includeDeleted && safeString(client.deleted_at)) {
      return res.status(404).json({ error: 'Client not found' });
    }

    res.json(client.toJSON());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/clients
router.post('/', async (req, res) => {
  try {
    const name = safeString(req.body?.name);
    if (!name) return res.status(400).json({ error: 'Client name is required' });

    const payload = {
      client_id: safeString(req.body?.id, randomUUID()),
      user_id: req.user._id,
      name,
      industry: safeString(req.body?.industry),
      size: safeString(req.body?.size),
      contactPerson: safeString(req.body?.contactPerson),
      email: safeString(req.body?.email),
      phone: safeString(req.body?.phone),
      address: safeString(req.body?.address),
      website: safeString(req.body?.website),
      logo: safeString(req.body?.logo),
      notes: safeString(req.body?.notes),
      status: ['prospect', 'active', 'inactive', 'churned'].includes(safeString(req.body?.status))
        ? safeString(req.body?.status)
        : 'prospect',
      tags: Array.isArray(req.body?.tags) ? req.body.tags.filter((t) => typeof t === 'string').map((t) => t.trim()).filter(Boolean) : [],
      assignedCommercialId: safeString(req.body?.assignedCommercialId),
      lastContactDate: safeString(req.body?.lastContactDate),
      totalMeetings: Number(req.body?.totalMeetings || 0),
      totalRevenue: Number(req.body?.totalRevenue || 0),
      version: Number(req.body?.syncMeta?.version || 1),
    };

    const client = await Client.create(payload);
    res.status(201).json(client.toJSON());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/clients/:id
router.patch('/:id', async (req, res) => {
  try {
    const client = await Client.findOne({ client_id: req.params.id });
    if (!client) return res.status(404).json({ error: 'Client not found' });

    if (req.user.role !== 'admin' && client.user_id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const patch = {
      ...(req.body?.name !== undefined ? { name: safeString(req.body.name, client.name) } : {}),
      ...(req.body?.industry !== undefined ? { industry: safeString(req.body.industry) } : {}),
      ...(req.body?.size !== undefined ? { size: safeString(req.body.size) } : {}),
      ...(req.body?.contactPerson !== undefined ? { contactPerson: safeString(req.body.contactPerson) } : {}),
      ...(req.body?.email !== undefined ? { email: safeString(req.body.email) } : {}),
      ...(req.body?.phone !== undefined ? { phone: safeString(req.body.phone) } : {}),
      ...(req.body?.address !== undefined ? { address: safeString(req.body.address) } : {}),
      ...(req.body?.website !== undefined ? { website: safeString(req.body.website) } : {}),
      ...(req.body?.logo !== undefined ? { logo: safeString(req.body.logo) } : {}),
      ...(req.body?.notes !== undefined ? { notes: safeString(req.body.notes) } : {}),
      ...(req.body?.status !== undefined && ['prospect', 'active', 'inactive', 'churned'].includes(safeString(req.body.status))
        ? { status: safeString(req.body.status) }
        : {}),
      ...(Array.isArray(req.body?.tags)
        ? { tags: req.body.tags.filter((t) => typeof t === 'string').map((t) => t.trim()).filter(Boolean) }
        : {}),
      ...(req.body?.assignedCommercialId !== undefined ? { assignedCommercialId: safeString(req.body.assignedCommercialId) } : {}),
      ...(req.body?.lastContactDate !== undefined ? { lastContactDate: safeString(req.body.lastContactDate) } : {}),
      ...(req.body?.totalMeetings !== undefined ? { totalMeetings: Number(req.body.totalMeetings || 0) } : {}),
      ...(req.body?.totalRevenue !== undefined ? { totalRevenue: Number(req.body.totalRevenue || 0) } : {}),
    };

    Object.assign(client, patch);
    client.version = Number(client.version || 1) + 1;
    await client.save();

    res.json(client.toJSON());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/clients/:id (soft delete)
router.delete('/:id', async (req, res) => {
  try {
    const client = await Client.findOne({ client_id: req.params.id });
    if (!client) return res.status(404).json({ error: 'Client not found' });

    if (req.user.role !== 'admin' && client.user_id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (safeString(client.deleted_at)) return res.json({ success: true, alreadyDeleted: true });

    client.deleted_at = new Date().toISOString();
    client.deleted_by = req.user._id;
    client.version = Number(client.version || 1) + 1;
    await client.save();

    res.json({ success: true, deleted_at: client.deleted_at });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/clients/:id/restore
router.post('/:id/restore', async (req, res) => {
  try {
    const client = await Client.findOne({ client_id: req.params.id });
    if (!client) return res.status(404).json({ error: 'Client not found' });

    if (req.user.role !== 'admin' && client.user_id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (!safeString(client.deleted_at)) return res.json({ success: true, restored: false });

    client.deleted_at = null;
    client.deleted_by = null;
    client.version = Number(client.version || 1) + 1;
    await client.save();

    res.json({ success: true, restored: true, client: client.toJSON() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/clients/sync-from-meetings
router.post('/sync-from-meetings', async (req, res) => {
  try {
    const meetings = Array.isArray(req.body?.meetings) ? req.body.meetings : [];
    let upserted = 0;

    for (const m of meetings) {
      const clientId = safeString(m.clientId || m.client_id);
      const clientName = safeString(m.clientName || m.client_name);
      if (!clientId || !clientName) continue;

      const existing = await Client.findOne({ client_id: clientId, ...userFilter(req) }).catch(() => null);
      if (existing) continue;

      await Client.findOneAndUpdate(
        { client_id: clientId, ...userFilter(req) },
        {
          client_id: clientId,
          user_id: req.user._id,
          name: clientName,
          status: 'active',
          lastContactDate: safeString(m.created_at || m.createdAt || ''),
          totalMeetings: 0,
          totalRevenue: 0,
          version: 1,
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      upserted += 1;
    }

    // Update aggregate stats from meeting collection for current user
    const match = req.user.role === 'admin'
      ? { deleted_at: { $in: [null, undefined, ''] } }
      : { user_id: req.user._id, deleted_at: { $in: [null, undefined, ''] } };

    const grouped = await Meeting.aggregate([
      { $match: match },
      {
        $group: {
          _id: '$client_id',
          meetingsCount: { $sum: 1 },
          lastContact: { $max: '$createdAt' },
          wonRevenue: {
            $sum: {
              $cond: [{ $eq: ['$deal_status', 'won'] }, { $ifNull: ['$deal_value', 0] }, 0],
            },
          },
          clientName: { $last: '$client_name' },
        },
      },
    ]);

    for (const g of grouped) {
      const id = safeString(g._id);
      if (!id) continue;
      await Client.findOneAndUpdate(
        { client_id: id, ...userFilter(req) },
        {
          $set: {
            totalMeetings: Number(g.meetingsCount || 0),
            totalRevenue: Number(g.wonRevenue || 0),
            lastContactDate: g.lastContact ? new Date(g.lastContact).toISOString() : '',
            ...(safeString(g.clientName) ? { name: safeString(g.clientName) } : {}),
          },
          $inc: { version: 1 },
        },
        { upsert: false }
      );
    }

    res.json({ success: true, upserted, syncedGroups: grouped.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
