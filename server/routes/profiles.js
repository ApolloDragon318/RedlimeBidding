import express from 'express';
import ImProfile from '../models/ImProfile.js';
import Client from '../models/Client.js';
import User from '../models/User.js';
import Report, { WORKFLOW } from '../models/Report.js';
import { authenticate, requireRole, requireApprovedIfClient } from '../middleware/auth.js';

const router = express.Router();

const profilePopulate = [
  { path: 'opsLeadId', select: 'name email' },
  { path: 'assignedBidderId', select: 'name email bidManagerId' },
  { path: 'clientId', select: 'name email userId' }
];

/** Bidder IDs under this Ops Lead's bid managers */
async function bidderIdsForOpsLead(opsLeadId) {
  const bmIds = await User.find({
    role: 'bid_manager',
    status: 'approved',
    opsLeadId
  }).distinct('_id');
  return User.find({
    role: 'bidder',
    status: 'approved',
    bidManagerId: { $in: bmIds }
  }).distinct('_id');
}

/**
 * Ops Lead sees:
 *  - unassigned profiles (opsLeadId is null, assignedBidderId is null)
 *  - profiles already assigned to their team (opsLeadId === them)
 */
async function opsLeadProfileFilter(opsLeadId) {
  return {
    $or: [
      { opsLeadId: null, assignedBidderId: null },
      { opsLeadId: opsLeadId }
    ]
  };
}

async function getClientDocForUser(userId) {
  return Client.findOne({ userId });
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

/** Client org: all profiles for their Client record */
router.get('/client', authenticate, requireRole('client'), requireApprovedIfClient, async (req, res) => {
  try {
    const clientDoc = await getClientDocForUser(req.user._id);
    if (!clientDoc) return res.status(404).json({ error: 'Client record not found' });
    const profiles = await ImProfile.find({ clientId: clientDoc._id })
      .populate(profilePopulate)
      .sort({ updatedAt: -1 });
    res.json(profiles);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/', authenticate, requireRole('ops_lead', 'admin'), async (req, res) => {
  try {
    let filter = {};
    if (req.user.role === 'ops_lead') {
      filter = await opsLeadProfileFilter(req.user._id);
    }
    const profiles = await ImProfile.find(filter)
      .populate(profilePopulate)
      .sort({ updatedAt: -1 });
    res.json(profiles);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/', authenticate, requireApprovedIfClient, requireRole('ops_lead', 'admin', 'client'), async (req, res) => {
  try {
    const { name, clientId } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'name required' });
    if (!clientId) {
      return res.status(400).json({ error: 'clientId is required' });
    }

    const client = await Client.findById(clientId);
    if (!client) return res.status(400).json({ error: 'Client not found' });

    if (req.user.role === 'client') {
      const mine = await getClientDocForUser(req.user._id);
      if (!mine || String(mine._id) !== String(clientId)) {
        return res.status(403).json({ error: 'You can only create profiles for your own organization' });
      }
    }

    const profile = await ImProfile.create({
      opsLeadId: null,
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

async function findProfileForPatch(req) {
  const { id } = req.params;
  if (req.user.role === 'admin') {
    return ImProfile.findById(id);
  }
  if (req.user.role === 'client') {
    const clientDoc = await getClientDocForUser(req.user._id);
    if (!clientDoc) return null;
    return ImProfile.findOne({ _id: id, clientId: clientDoc._id });
  }
  if (req.user.role === 'ops_lead') {
    const filter = await opsLeadProfileFilter(req.user._id);
    return ImProfile.findOne({ _id: id, ...filter });
  }
  return null;
}

router.patch('/:id', authenticate, requireApprovedIfClient, requireRole('ops_lead', 'admin', 'client'), async (req, res) => {
  try {
    const profile = await findProfileForPatch(req);
    if (!profile) return res.status(404).json({ error: 'Profile not found' });

    const { name, assignedBidderId, clientId } = req.body;

    if (req.user.role === 'client') {
      if (name != null) profile.name = String(name).trim();
      if (assignedBidderId !== undefined || clientId !== undefined) {
        return res.status(403).json({ error: 'Only Ops Leads can assign bidders or change client' });
      }
      await profile.save();
      const populated = await ImProfile.findById(profile._id).populate(profilePopulate);
      return res.json(populated);
    }

    if (name != null) profile.name = String(name).trim();

    if (clientId != null) {
      const c = await Client.findById(clientId);
      if (!c) return res.status(400).json({ error: 'Client not found' });
      profile.clientId = clientId;
    }

    if (assignedBidderId !== undefined) {
      if (assignedBidderId === null || assignedBidderId === '') {
        profile.assignedBidderId = null;
        profile.opsLeadId = null;
      } else {
        const bidder = await User.findById(assignedBidderId).select('bidManagerId');
        if (!bidder?.bidManagerId) {
          return res.status(400).json({ error: 'Bidder must have a bid manager' });
        }
        const bm = await User.findById(bidder.bidManagerId).select('opsLeadId');
        if (!bm?.opsLeadId) {
          return res.status(400).json({ error: 'Bid manager must be under an Ops Lead' });
        }
        if (req.user.role === 'ops_lead') {
          if (String(bm.opsLeadId) !== String(req.user._id)) {
            return res.status(403).json({ error: 'You can only assign bidders on your bid managers' });
          }
        }
        profile.assignedBidderId = assignedBidderId;
        profile.opsLeadId = bm.opsLeadId;
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

router.delete('/:id', authenticate, requireApprovedIfClient, requireRole('ops_lead', 'admin', 'client'), async (req, res) => {
  try {
    const profile = await findProfileForPatch(req);
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
