import express from 'express';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

router.post('/register', async (req, res) => {
  try {
    const { email, password, name, role } = req.body;
    if (!email || !password || !name || !role) {
      return res.status(400).json({ error: 'Email, password, name and role required' });
    }
    if (!['bid_manager', 'investigation_manager'].includes(role)) {
      return res.status(400).json({ error: 'Role must be bid_manager or investigation_manager' });
    }
    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ error: 'Email already registered' });
    const user = await User.create({ email, password, name, role, status: 'pending' });
    res.status(201).json({
      message: 'Sign up successful. Admin will approve your account soon.',
      user: { id: user._id, email: user.email, name: user.name, role: user.role, status: user.status }
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
    const user = await User.findOne({ email });
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    if (user.status !== 'approved') {
      return res.status(401).json({ error: 'Your account is pending approval. Please wait for admin to approve.' });
    }
    const token = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET || 'secret',
      { expiresIn: '7d' }
    );
    res.json({
      token,
      user: { id: user._id, email: user.email, name: user.name, role: user.role }
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/me', authenticate, (req, res) => {
  res.json({ user: req.user });
});

export default router;
