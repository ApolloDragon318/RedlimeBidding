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

/** Admin creates client: creates a User account + Client record together. */
router.post('/', authenticate, requireRole('admin'), async (req, res) => {
  try {
    const { firstName, lastName, email, password, clientType } = req.body;
    const type = clientType === 'internal' ? 'internal' : 'external';
    if (!firstName?.trim()) return res.status(400).json({ error: 'First name is required' });
    if (type === 'external' && !lastName?.trim()) {
      return res.status(400).json({ error: 'Last name is required for external clients' });
    }
    if (!email?.trim()) return res.status(400).json({ error: 'Email is required' });
    if (!password || String(password).length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    const normalizedEmail = email.trim().toLowerCase();
    const { default: User } = await import('../models/User.js');
    const existing = await User.findOne({ email: normalizedEmail });
    if (existing) {
      return res.status(400).json({ error: 'A user with this email already exists' });
    }
    const ln = lastName?.trim() || '';
    const displayName = [firstName.trim(), ln].filter(Boolean).join(' ');
    const user = await User.create({
      email: normalizedEmail,
      password,
      name: displayName,
      legalFirstName: firstName.trim(),
      legalLastName: ln,
      role: 'client',
      status: 'approved'
    });
    const client = await Client.create({
      name: displayName,
      email: normalizedEmail,
      clientType: type,
      userId: user._id
    });
    res.status(201).json(client);
  } catch (e) {
    if (e.code === 11000) return res.status(400).json({ error: 'A client with this name or email already exists' });
    res.status(500).json({ error: e.message });
  }
});

router.patch('/:id', authenticate, requireRole('admin'), async (req, res) => {
  try {
    const { firstName, lastName, email, clientType } = req.body;
    const client = await Client.findById(req.params.id);
    if (!client) return res.status(404).json({ error: 'Client not found' });

    if (clientType != null && ['internal', 'external'].includes(clientType)) {
      client.clientType = clientType;
    }
    const effectiveType = client.clientType || 'external';
    if (effectiveType === 'external' && lastName != null && !String(lastName).trim()) {
      return res.status(400).json({ error: 'Last name is required for external clients' });
    }

    const fn = firstName != null ? String(firstName).trim() : null;
    const ln = lastName != null ? String(lastName).trim() : null;
    if (email != null) client.email = String(email).trim().toLowerCase();

    if (fn != null || ln != null) {
      const { default: User } = await import('../models/User.js');
      const user = client.userId ? await User.findById(client.userId) : null;
      const curFirst = user?.legalFirstName || client.name.split(' ')[0] || '';
      const curLast = user?.legalLastName || client.name.split(' ').slice(1).join(' ') || '';
      const newFirst = fn ?? curFirst;
      const newLast = ln ?? curLast;
      const displayName = [newFirst, newLast].filter(Boolean).join(' ');
      client.name = displayName;
      if (user) {
        user.name = displayName;
        user.legalFirstName = newFirst;
        user.legalLastName = newLast;
        if (email != null) user.email = client.email;
        await user.save();
      }
    } else if (email != null && client.userId) {
      const { default: User } = await import('../models/User.js');
      const user = await User.findById(client.userId);
      if (user) { user.email = client.email; await user.save(); }
    }

    await client.save();
    res.json(client);
  } catch (e) {
    if (e.code === 11000) return res.status(400).json({ error: 'Name or email already in use' });
    res.status(500).json({ error: e.message });
  }
});

router.delete('/:id', authenticate, requireRole('admin'), async (req, res) => {
  try {
    const client = await Client.findById(req.params.id);
    if (!client) return res.status(404).json({ error: 'Client not found' });
    const cnt = await ImProfile.countDocuments({ clientId: client._id });
    if (cnt > 0) return res.status(400).json({ error: 'Cannot delete client that still has profiles' });
    if (client.userId) {
      const { default: User } = await import('../models/User.js');
      await User.findByIdAndDelete(client.userId);
    }
    await Client.findByIdAndDelete(client._id);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
