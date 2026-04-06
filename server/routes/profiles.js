import express from 'express';
import ImProfile from '../models/ImProfile.js';
import Client from '../models/Client.js';
import User from '../models/User.js';
import Report, { WORKFLOW } from '../models/Report.js';
import { authenticate, requireRole } from '../middleware/auth.js';

const router = express.Router();

const profilePopulate = [
  { path: 'opsLeadId', select: 'name email' },
  { path: 'assignedBidderId', select: 'name email bidManagerId' },
  { path: 'clientId', select: 'name email opsLeadId' }
];

async function opsOwnsBidder(opsLeadId, bidderId) {
  const bidder = await User.findById(bidderId);
  if (!bidder || bidder.role !== 'bidder') return false;
  if (!bidder.bidManagerId) return false;
  const bm = await User.findById(bidder.bidManagerId);
  return bm && bm.opsLeadId?.toString() === opsLeadId.toString();
}

async function clientBelongsToOps(opsLeadId, clientId) {
  if (!clientId) return false;
  const client = await Client.findById(clientId);
  return client && client.opsLeadId.toString() === opsLeadId.toString();
}

/** Bidder: all profiles assigned to them */
router.get('/me', authenticate, requireRole('bidder'), async (req, res) => {
  try {
    const profiles = await ImProfile.find({ assignedBidderId: req.user._id })
      .populate(profilePopulate)
      .sort({ name: 1 });
    res.json(profiles);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/', authenticate, requireRole('ops_lead', 'admin'), async (req, res) => {
  try {
    const filter = req.user.role === 'admin' ? {} : { opsLeadId: req.user._id };
    const profiles = await ImProfile.find(filter)
      .populate(profilePopulate)
      .sort({ updatedAt: -1 });
    res.json(profiles);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/', authenticate, requireRole('ops_lead', 'admin'), async (req, res) => {
  try {
    const { name, clientId, opsLeadId: bodyOpsId } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'name required' });
    if (!clientId) {
      return res.status(400).json({ error: 'clientId is required' });
    }
    let opsLeadId = req.user._id;
    if (req.user.role === 'admin') {
      if (!bodyOpsId) return res.status(400).json({ error: 'opsLeadId is required when creating a profile as admin' });
      const ol = await User.findOne({ _id: bodyOpsId, role: 'ops_lead', status: 'approved' });
      if (!ol) return res.status(400).json({ error: 'Invalid Ops Lead' });
      opsLeadId = bodyOpsId;
    }
    const ok = await clientBelongsToOps(opsLeadId, clientId);
    if (!ok) return res.status(400).json({ error: 'Client must belong to the selected Ops team' });

    const profile = await ImProfile.create({
      opsLeadId,
      name: name.trim(),
      clientId
    });
    const populated = await ImProfile.findById(profile._id).populate(profilePopulate);
    res.status(201).json(populated);
  } catch (e) {
    if (e.code === 11000) return res.status(400).json({ error: 'Profile name already exists for this client' });
    res.status(500).json({ error: e.message });
  }
});

router.patch('/:id', authenticate, requireRole('ops_lead', 'admin'), async (req, res) => {
  try {
    const { name, assignedBidderId, clientId } = req.body;
    const filter = req.user.role === 'admin'
      ? { _id: req.params.id }
      : { _id: req.params.id, opsLeadId: req.user._id };
    const profile = await ImProfile.findOne(filter);
    if (!profile) return res.status(404).json({ error: 'Profile not found' });

    const opsLeadId = profile.opsLeadId;

    if (name != null) profile.name = String(name).trim();

    if (clientId != null) {
      const ok = await clientBelongsToOps(opsLeadId, clientId);
      if (!ok) return res.status(400).json({ error: 'Client must belong to this Ops team' });
      profile.clientId = clientId;
    }

    if (assignedBidderId !== undefined) {
      if (assignedBidderId === null || assignedBidderId === '') {
        profile.assignedBidderId = null;
      } else {
        const ok = await opsOwnsBidder(opsLeadId, assignedBidderId);
        if (!ok) return res.status(403).json({ error: 'You can only assign bidders on your bid managers' });
        profile.assignedBidderId = assignedBidderId;
      }
    }

    await profile.save();
    const populated = await ImProfile.findById(profile._id).populate(profilePopulate);
    res.json(populated);
  } catch (e) {
    if (e.code === 11000) return res.status(400).json({ error: 'Profile name already exists for this client' });
    res.status(500).json({ error: e.message });
  }
});

router.delete('/:id', authenticate, requireRole('ops_lead', 'admin'), async (req, res) => {
  try {
    const filter = req.user.role === 'admin'
      ? { _id: req.params.id }
      : { _id: req.params.id, opsLeadId: req.user._id };
    const profile = await ImProfile.findOne(filter);
    if (!profile) return res.status(404).json({ error: 'Profile not found' });
    const open = await Report.countDocuments({
      profileId: req.params.id,
      workflowStatus: { $nin: [WORKFLOW.CONFIRMED, WORKFLOW.DECLINED] },
      paidAt: { $exists: false }
    });
    if (open > 0) {
      return res.status(400).json({ error: 'Cannot delete profile with reports still in the pipeline' });
    }
    await ImProfile.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
