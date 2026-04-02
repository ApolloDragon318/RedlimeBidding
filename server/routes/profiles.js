import express from 'express';
import ImProfile from '../models/ImProfile.js';
import User from '../models/User.js';
import Report, { WORKFLOW } from '../models/Report.js';
import { authenticate, requireRole } from '../middleware/auth.js';

const router = express.Router();

async function opsOwnsBidder(opsLeadId, bidderId) {
  const bidder = await User.findById(bidderId);
  if (!bidder || bidder.role !== 'bidder') return false;
  if (!bidder.bidManagerId) return false;
  const bm = await User.findById(bidder.bidManagerId);
  return bm && bm.opsLeadId?.toString() === opsLeadId.toString();
}

/** Bidder: all profiles assigned to them (a bidder may have several) */
router.get('/me', authenticate, requireRole('bidder'), async (req, res) => {
  try {
    const profiles = await ImProfile.find({ assignedBidderId: req.user._id })
      .populate('opsLeadId', 'name email')
      .populate('assignedBidderId', 'name email')
      .sort({ name: 1 });
    res.json(profiles);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/', authenticate, requireRole('ops_lead'), async (req, res) => {
  try {
    const profiles = await ImProfile.find({ opsLeadId: req.user._id })
      .populate('opsLeadId', 'name email')
      .populate('assignedBidderId', 'name email bidManagerId')
      .sort({ updatedAt: -1 });
    res.json(profiles);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/', authenticate, requireRole('ops_lead'), async (req, res) => {
  try {
    const { name } = req.body;
    if (!name?.trim()) {
      return res.status(400).json({ error: 'name required' });
    }
    const profile = await ImProfile.create({
      opsLeadId: req.user._id,
      name: name.trim()
    });
    const populated = await ImProfile.findById(profile._id)
      .populate('opsLeadId', 'name email')
      .populate('assignedBidderId', 'name email bidManagerId');
    res.status(201).json(populated);
  } catch (e) {
    if (e.code === 11000) return res.status(400).json({ error: 'Profile name already exists for your team' });
    res.status(500).json({ error: e.message });
  }
});

router.patch('/:id', authenticate, requireRole('ops_lead'), async (req, res) => {
  try {
    const { name, assignedBidderId } = req.body;
    const profile = await ImProfile.findOne({ _id: req.params.id, opsLeadId: req.user._id });
    if (!profile) return res.status(404).json({ error: 'Profile not found' });
    if (name != null) profile.name = String(name).trim();
    if (assignedBidderId !== undefined) {
      if (assignedBidderId === null || assignedBidderId === '') {
        profile.assignedBidderId = null;
      } else {
        const ok = await opsOwnsBidder(req.user._id, assignedBidderId);
        if (!ok) return res.status(403).json({ error: 'You can only assign bidders on your bid managers' });
        profile.assignedBidderId = assignedBidderId;
      }
    }
    await profile.save();
    const populated = await ImProfile.findById(profile._id)
      .populate('opsLeadId', 'name email')
      .populate('assignedBidderId', 'name email bidManagerId');
    res.json(populated);
  } catch (e) {
    if (e.code === 11000) return res.status(400).json({ error: 'Profile name already exists for your team' });
    res.status(500).json({ error: e.message });
  }
});

router.delete('/:id', authenticate, requireRole('ops_lead'), async (req, res) => {
  try {
    const profile = await ImProfile.findOne({ _id: req.params.id, opsLeadId: req.user._id });
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
