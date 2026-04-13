import express from 'express';
import Client from '../models/Client.js';
import ImProfile from '../models/ImProfile.js';
import { authenticate, requireRole, requireApprovedIfClient } from '../middleware/auth.js';

const router = express.Router();

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Client user: their org record */
router.get('/me', authenticate, requireRole('client'), requireApprovedIfClient, async (req, res) => {
  try {
    const client = await Client.findOne({ userId: req.user._id });
    if (!client) return res.status(404).json({ error: 'Client record not found' });
    res.json(client);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.patch('/me', authenticate, requireRole('client'), requireApprovedIfClient, async (req, res) => {
  try {
    const { name, email } = req.body;
    const client = await Client.findOne({ userId: req.user._id });
    if (!client) return res.status(404).json({ error: 'Client record not found' });
    if (name != null) client.name = String(name).trim();
    if (email != null) client.email = String(email).trim().toLowerCase();
    await client.save();
    const { default: User } = await import('../models/User.js');
    const user = await User.findById(req.user._id);
    if (name != null) {
      user.name = client.name;
      await user.save();
    }
    res.json(client);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** All clients — visible to ops_lead and admin (clients are global). */
router.get('/', authenticate, requireRole('ops_lead', 'admin'), async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    const filter = {};
    if (q) {
      const rx = new RegExp(escapeRegex(q), 'i');
      filter.$or = [{ name: rx }, { email: rx }];
    }
    const clients = await Client.find(filter)
      .sort({ name: 1 })
      .limit(q ? 80 : 500);
    res.json(clients);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** Only admins create client directory rows. */
router.post('/', authenticate, requireRole('admin'), async (req, res) => {
  try {
    const { name, email } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'name is required' });
    const client = await Client.create({
      name: name.trim(),
      email: (email || '').trim(),
      userId: null
    });
    res.status(201).json(client);
  } catch (e) {
    if (e.code === 11000) return res.status(400).json({ error: 'A client with this name already exists' });
    res.status(500).json({ error: e.message });
  }
});

router.patch('/:id', authenticate, requireRole('admin'), async (req, res) => {
  try {
    const { name, email } = req.body;
    const client = await Client.findById(req.params.id);
    if (!client) return res.status(404).json({ error: 'Client not found' });
    if (name != null) client.name = String(name).trim();
    if (email != null) client.email = String(email).trim();
    await client.save();
    res.json(client);
  } catch (e) {
    if (e.code === 11000) return res.status(400).json({ error: 'Name already in use' });
    res.status(500).json({ error: e.message });
  }
});

router.delete('/:id', authenticate, requireRole('admin'), async (req, res) => {
  try {
    const client = await Client.findById(req.params.id);
    if (!client) return res.status(404).json({ error: 'Client not found' });
    if (client.userId) {
      return res.status(400).json({ error: 'Cannot delete a client account that signed up on the platform' });
    }
    const cnt = await ImProfile.countDocuments({ clientId: client._id });
    if (cnt > 0) return res.status(400).json({ error: 'Cannot delete client that still has profiles' });
    await Client.findByIdAndDelete(client._id);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
