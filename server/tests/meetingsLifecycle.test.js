import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../models/Meeting.js', () => ({
  default: {
    findById: vi.fn(),
  },
}));

vi.mock('../models/AuditEvent.js', () => ({
  default: {
    find: vi.fn(),
  },
}));

vi.mock('../services/auditLogService.js', () => ({
  logAuditEvent: vi.fn(),
}));

import Meeting from '../models/Meeting.js';
import AuditEvent from '../models/AuditEvent.js';
import { logAuditEvent } from '../services/auditLogService.js';
import lifecycleRouter from '../routes/meetings/lifecycle.js';

function buildApp(user = { _id: 'u1', role: 'user' }) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = user;
    next();
  });
  app.use('/api/meetings', lifecycleRouter);
  return app;
}

describe('meetings lifecycle routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('soft deletes and restores owned meeting', async () => {
    const meeting = {
      _id: 'm1',
      user_id: { toString: () => 'u1' },
      deleted_at: null,
      deleted_by: null,
      save: vi.fn(async () => {}),
    };

    Meeting.findById
      .mockResolvedValueOnce(meeting) // delete
      .mockResolvedValueOnce({ ...meeting, deleted_at: '2026-04-22T10:00:00.000Z', save: vi.fn(async function () {
        this.deleted_at = null;
        this.deleted_by = null;
      }) }); // restore

    const app = buildApp();

    const delRes = await request(app).delete('/api/meetings/m1');
    expect(delRes.status).toBe(200);
    expect(delRes.body.success).toBe(true);
    expect(delRes.body.softDeleted).toBe(true);
    expect(logAuditEvent).toHaveBeenCalled();

    const restoreRes = await request(app).post('/api/meetings/m1/restore');
    expect(restoreRes.status).toBe(200);
    expect(restoreRes.body.success).toBe(true);
    expect(restoreRes.body.restored).toBe(true);
  });

  it('returns 403 for events when user does not own meeting', async () => {
    Meeting.findById.mockResolvedValue({
      _id: 'm2',
      user_id: { toString: () => 'owner-2' },
    });

    const app = buildApp({ _id: 'u1', role: 'user' });
    const res = await request(app).get('/api/meetings/m2/events');

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/Access denied/i);
    expect(AuditEvent.find).not.toHaveBeenCalled();
  });
});
