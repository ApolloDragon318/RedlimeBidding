import express from 'express';
import Client from '../models/Client.js';
import ImProfile from '../models/ImProfile.js';
import User from '../models/User.js';
import { authenticate, requireRole } from '../middleware/auth.js';

const router = express.Router();

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

router.get('/', authenticate, requireRole('ops_lead', 'admin'), async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    const filter = req.user.role === 'admin' ? {} : { opsLeadId: req.user._id };
    if (q) {
      const rx = new RegExp(escapeRegex(q), 'i');
      filter.$or = [{ name: rx }, { email: rx }];
    }
    const clients = await Client.find(filter)
      .populate('opsLeadId', 'name email')
      .sort({ name: 1 })
      .limit(q ? 80 : 500);
    res.json(clients);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/', authenticate, requireRole('ops_lead', 'admin'), async (req, res) => {
  try {
    const { name, email, opsLeadId: bodyOpsId } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'name is required' });
    let opsLeadId = req.user._id;
    if (req.user.role === 'admin') {
      if (!bodyOpsId) return res.status(400).json({ error: 'opsLeadId is required for admin' });
      const ol = await User.findOne({ _id: bodyOpsId, role: 'ops_lead', status: 'approved' });
      if (!ol) return res.status(400).json({ error: 'Invalid Ops Lead' });
      opsLeadId = bodyOpsId;
    }
    const client = await Client.create({
      name: name.trim(),
      email: (email || '').trim(),
      opsLeadId
    });
    const populated = await Client.findById(client._id).populate('opsLeadId', 'name email');
    res.status(201).json(populated);
  } catch (e) {
    if (e.code === 11000) return res.status(400).json({ error: 'A client with this name already exists for that Ops team' });
    res.status(500).json({ error: e.message });
  }
});

router.patch('/:id', authenticate, requireRole('ops_lead', 'admin'), async (req, res) => {
  try {
    const { name, email } = req.body;
    const filter = req.user.role === 'admin' ? { _id: req.params.id } : { _id: req.params.id, opsLeadId: req.user._id };
    const client = await Client.findOne(filter);
    if (!client) return res.status(404).json({ error: 'Client not found' });
    if (name != null) client.name = String(name).trim();
    if (email != null) client.email = String(email).trim();
    await client.save();
    const populated = await Client.findById(client._id).populate('opsLeadId', 'name email');
    res.json(populated);
  } catch (e) {
    if (e.code === 11000) return res.status(400).json({ error: 'Name already in use for this team' });
    res.status(500).json({ error: e.message });
  }
});

router.delete('/:id', authenticate, requireRole('ops_lead', 'admin'), async (req, res) => {
  try {
    const filter = req.user.role === 'admin' ? { _id: req.params.id } : { _id: req.params.id, opsLeadId: req.user._id };
    const client = await Client.findOne(filter);
    if (!client) return res.status(404).json({ error: 'Client not found' });
    const cnt = await ImProfile.countDocuments({ clientId: client._id });
    if (cnt > 0) return res.status(400).json({ error: 'Cannot delete client that still has profiles' });
    await Client.findByIdAndDelete(client._id);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
