import { Router } from 'express';
import User from '../models/User.js';
import Meeting from '../models/Meeting.js';
import MeetingAnalysis from '../models/MeetingAnalysis.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';

const router = Router();
router.use(authenticate, requireAdmin);

// GET /api/users — list all users with meeting counts
router.get('/', async (req, res) => {
  try {
    const users = await User.find().sort({ createdAt: 1 });

    const counts = await Meeting.aggregate([
      { $group: { _id: '$user_id', count: { $sum: 1 } } },
    ]);
    const countMap = new Map(counts.map((c) => [c._id.toString(), c.count]));

    const result = users.map((u) => ({
      ...u.toJSON(),
      meeting_count: countMap.get(u._id.toString()) || 0,
    }));

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/users — create user
router.post('/', async (req, res) => {
  try {
    const { email, password, full_name } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email et mot de passe requis' });
    }

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) {
      return res.status(409).json({ error: 'Cet utilisateur existe déjà' });
    }

    const user = await User.create({
      email,
      password,
      full_name: full_name || email,
      role: 'user',
    });

    res.status(201).json(user.toJSON());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/users/:id — delete user + all their data
router.delete('/:id', async (req, res) => {
  try {
    const userId = req.params.id;

    if (userId === req.user._id.toString()) {
      return res.status(400).json({ error: 'Impossible de supprimer votre propre compte' });
    }

    const targetUser = await User.findById(userId);
    if (!targetUser) {
      return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }

    // Delete user's meeting analyses
    const meetings = await Meeting.find({ user_id: userId });
    const meetingIds = meetings.map((m) => m._id);
    await MeetingAnalysis.deleteMany({ meeting_id: { $in: meetingIds } });

    // Delete user's meetings
    await Meeting.deleteMany({ user_id: userId });

    // Delete user
    await User.findByIdAndDelete(userId);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
