import express from 'express';
import User from '../models/User.js';
import { authenticate, requireRole } from '../middleware/auth.js';

const router = express.Router();

router.get('/', authenticate, requireRole('admin', 'bid_manager'), async (req, res) => {
  try {
    const role = req.query.role;
    const filter = role ? { role } : {};
    if (req.user.role === 'bid_manager') {
      filter.role = 'investigation_manager';
      filter.status = 'approved';
    }
    const users = await User.find(filter).select('-password');
    res.json(users);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/investigation-managers', authenticate, async (req, res) => {
  try {
    const users = await User.find({ role: 'investigation_manager', status: 'approved' }).select('-password');
    res.json(users);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/pending', authenticate, requireRole('admin'), async (req, res) => {
  try {
    const users = await User.find({ status: 'pending' }).select('-password');
    res.json(users);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.patch('/:id/approve', authenticate, requireRole('admin'), async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.status === 'approved') return res.status(400).json({ error: 'User already approved' });
    user.status = 'approved';
    await user.save();
    res.json({ user: { id: user._id, email: user.email, name: user.name, role: user.role, status: user.status } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
