import express from 'express';
import path from 'path';
import fs from 'fs';
import User from '../models/User.js';
import LevelRequest from '../models/LevelRequest.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import {
  OPS_ASSIGNABLE_ROLES,
  ADMIN_ASSIGNABLE_ROLES,
  USER_LEVELS
} from '../constants/onboarding.js';
import { UPLOADS_ROOT, isCloudinary } from '../middleware/uploadOnboarding.js';

const uploadsRoot = path.resolve(UPLOADS_ROOT);

function isUrl(p) { return p && (p.startsWith('http://') || p.startsWith('https://')); }

function serveFileOrRedirect(res, filePath) {
  if (isUrl(filePath)) {
    return res.redirect(filePath);
  }
  const full = path.join(uploadsRoot, filePath);
  const resolved = path.resolve(full);
  if (!resolved.startsWith(path.resolve(uploadsRoot))) {
    return res.status(400).json({ error: 'Invalid path' });
  }
  if (!fs.existsSync(resolved)) return res.status(404).json({ error: 'File missing' });
  res.sendFile(resolved);
}

const router = express.Router();

router.get('/', authenticate, requireRole('admin', 'bid_manager'), async (req, res) => {
  try {
    const role = req.query.role;
    const filter = {};
    if (req.user.role === 'bid_manager') {
      filter.role = 'bidder';
      filter.status = 'approved';
      filter.bidManagerId = req.user._id;
    } else if (req.user.role === 'admin') {
      if (role) filter.role = role;
    }
    const users = await User.find(filter).select('-password')
      .populate('opsLeadId', 'name email')
      .populate('bidManagerId', 'name email');
    res.json(users);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/ops-leads', authenticate, requireRole('admin'), async (req, res) => {
  try {
    const users = await User.find({ role: 'ops_lead', status: 'approved' }).select('-password').sort({ name: 1 });
    res.json(users);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/bid-managers', authenticate, requireRole('admin', 'ops_lead'), async (req, res) => {
  try {
    const filter = { role: 'bid_manager', status: 'approved' };
    if (req.user.role === 'ops_lead') {
      filter.opsLeadId = req.user._id;
    }
    const users = await User.find(filter).select('-password').populate('opsLeadId', 'name email').sort({ name: 1 });
    res.json(users);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/bidders', authenticate, requireRole('admin', 'bid_manager', 'ops_lead'), async (req, res) => {
  try {
    const filter = { role: 'bidder', status: 'approved' };
    if (req.user.role === 'bid_manager') {
      filter.bidManagerId = req.user._id;
    } else if (req.user.role === 'ops_lead') {
      const myBidManagerIds = await User.find({
        role: 'bid_manager',
        status: 'approved',
        opsLeadId: req.user._id
      }).distinct('_id');
      filter.$or = [
        { bidManagerId: null },
        { bidManagerId: { $in: myBidManagerIds } }
      ];
    }
    const users = await User.find(filter).select('-password').populate('bidManagerId', 'name email').sort({ name: 1 });
    res.json(users);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/search', authenticate, requireRole('admin'), async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.trim().length < 2) return res.json([]);
    const regex = new RegExp(q.trim(), 'i');
    const users = await User.find({
      status: 'approved',
      $or: [
        { legalFirstName: regex },
        { legalLastName: regex },
        { name: regex },
        { email: regex }
      ]
    }).select('-password').limit(10).sort({ name: 1 });
    res.json(users);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

const ORG_SELECT = 'name role level photoFile';
const ORG_LIMIT = 200;

router.get('/org/context', authenticate, async (req, res) => {
  try {
    const me = req.user;
    const self = { _id: me._id, name: me.name, role: me.role, level: me.level, hasPhoto: !!me.photoFile?.path };
    let parent = null;
    let siblings = [];
    let children = [];

    const toNode = (u) => ({ _id: u._id, name: u.name, role: u.role, level: u.level, hasPhoto: !!u.photoFile?.path });

    if (me.role === 'admin') {
      const opsLeads = await User.find({ role: 'ops_lead', status: 'approved' }).select(ORG_SELECT).sort({ name: 1 }).limit(ORG_LIMIT);
      const fms = await User.find({ role: 'financial_manager', status: 'approved' }).select(ORG_SELECT).sort({ name: 1 }).limit(ORG_LIMIT);
      children = [...fms.map(toNode), ...opsLeads.map(toNode)];
    } else if (me.role === 'ops_lead') {
      const admin = await User.findOne({ role: 'admin', status: 'approved' }).select(ORG_SELECT);
      if (admin) parent = toNode(admin);
      const sibs = await User.find({ role: 'ops_lead', status: 'approved', _id: { $ne: me._id } }).select(ORG_SELECT).sort({ name: 1 }).limit(ORG_LIMIT);
      siblings = sibs.map(toNode);
      const bms = await User.find({ role: 'bid_manager', status: 'approved', opsLeadId: me._id }).select(ORG_SELECT).sort({ name: 1 }).limit(ORG_LIMIT);
      children = bms.map(toNode);
    } else if (me.role === 'financial_manager') {
      const admin = await User.findOne({ role: 'admin', status: 'approved' }).select(ORG_SELECT);
      if (admin) parent = toNode(admin);
      const sibs = await User.find({ role: 'financial_manager', status: 'approved', _id: { $ne: me._id } }).select(ORG_SELECT).sort({ name: 1 }).limit(ORG_LIMIT);
      siblings = sibs.map(toNode);
    } else if (me.role === 'bid_manager') {
      if (me.opsLeadId) {
        const ol = await User.findById(me.opsLeadId).select(ORG_SELECT);
        if (ol) parent = toNode(ol);
        const sibs = await User.find({ role: 'bid_manager', status: 'approved', opsLeadId: me.opsLeadId, _id: { $ne: me._id } }).select(ORG_SELECT).sort({ name: 1 }).limit(ORG_LIMIT);
        siblings = sibs.map(toNode);
      }
      const bidders = await User.find({ role: 'bidder', status: 'approved', bidManagerId: me._id }).select(ORG_SELECT).sort({ name: 1 }).limit(ORG_LIMIT);
      children = bidders.map(toNode);
    } else if (me.role === 'bidder') {
      if (me.bidManagerId) {
        const bm = await User.findById(me.bidManagerId).select(ORG_SELECT);
        if (bm) parent = toNode(bm);
        const sibs = await User.find({ role: 'bidder', status: 'approved', bidManagerId: me.bidManagerId, _id: { $ne: me._id } }).select(ORG_SELECT).sort({ name: 1 }).limit(ORG_LIMIT);
        siblings = sibs.map(toNode);
      }
    }

    res.json({ self, parent, siblings, children });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/org/:id/children', authenticate, async (req, res) => {
  try {
    const target = await User.findById(req.params.id).select('role opsLeadId bidManagerId');
    if (!target) return res.status(404).json({ error: 'Not found' });
    const toNode = (u) => ({ _id: u._id, name: u.name, role: u.role, level: u.level, hasPhoto: !!u.photoFile?.path });
    let children = [];

    if (target.role === 'admin') {
      const opsLeads = await User.find({ role: 'ops_lead', status: 'approved' }).select(ORG_SELECT).sort({ name: 1 }).limit(ORG_LIMIT);
      const fms = await User.find({ role: 'financial_manager', status: 'approved' }).select(ORG_SELECT).sort({ name: 1 }).limit(ORG_LIMIT);
      children = [...fms.map(toNode), ...opsLeads.map(toNode)];
    } else if (target.role === 'ops_lead') {
      const bms = await User.find({ role: 'bid_manager', status: 'approved', opsLeadId: target._id }).select(ORG_SELECT).sort({ name: 1 }).limit(ORG_LIMIT);
      children = bms.map(toNode);
    } else if (target.role === 'bid_manager') {
      const bidders = await User.find({ role: 'bidder', status: 'approved', bidManagerId: target._id }).select(ORG_SELECT).sort({ name: 1 }).limit(ORG_LIMIT);
      children = bidders.map(toNode);
    }
    res.json(children);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/org/:id/photo', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('photoFile');
    if (!user?.photoFile?.path) return res.status(404).json({ error: 'No photo' });
    serveFileOrRedirect(res, user.photoFile.path);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** Legacy alias — same as pending-admin */
router.get('/pending', authenticate, requireRole('admin'), async (req, res) => {
  try {
    const users = await User.find({ status: 'pending_admin' }).select('-password').sort({ createdAt: -1 });
    res.json(users);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/pending-admin', authenticate, requireRole('admin'), async (req, res) => {
  try {
    const users = await User.find({ status: 'pending_admin' }).select('-password').sort({ createdAt: -1 });
    res.json(users);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/pending-ops', authenticate, requireRole('ops_lead', 'admin'), async (req, res) => {
  try {
    const users = await User.find({ status: 'pending_ops' }).select('-password').sort({ createdAt: -1 });
    res.json(users);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.patch('/:id/submit-for-approval', authenticate, requireRole('ops_lead'), async (req, res) => {
  try {
    const { role, level } = req.body;
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.status !== 'pending_ops') {
      return res.status(400).json({ error: 'This user is not waiting for Ops assignment' });
    }
    if (!role || !OPS_ASSIGNABLE_ROLES.includes(role)) {
      return res.status(400).json({ error: `Invalid role. Choose one of: ${OPS_ASSIGNABLE_ROLES.join(', ')}` });
    }
    if (!level || !USER_LEVELS.includes(level)) {
      return res.status(400).json({ error: `Level is required: ${USER_LEVELS.join(', ')}` });
    }
    user.role = role;
    user.level = level;
    user.status = 'pending_admin';
    await user.save();
    const safe = await User.findById(user._id).select('-password');
    res.json(safe);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/:id/national-id', authenticate, requireRole('admin', 'ops_lead'), async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('nationalIdFile');
    if (!user?.nationalIdFile?.path) return res.status(404).json({ error: 'No national ID on file' });
    serveFileOrRedirect(res, user.nationalIdFile.path);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/:id/photo', authenticate, requireRole('admin', 'ops_lead'), async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('photoFile');
    if (!user?.photoFile?.path) return res.status(404).json({ error: 'No photo on file' });
    serveFileOrRedirect(res, user.photoFile.path);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.patch('/:id/approve', authenticate, requireRole('admin'), async (req, res) => {
  try {
    const { role, level } = req.body;
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.status === 'approved') return res.status(400).json({ error: 'User already approved' });
    if (user.status !== 'pending_admin') {
      return res.status(400).json({ error: 'User must be pending final admin approval.' });
    }
    /** Direct-to-admin applicants (Ops Lead / FM / IM): admin assigns role + level on approve */
    if (user.role === 'applicant') {
      if (!role || !ADMIN_ASSIGNABLE_ROLES.includes(role)) {
        return res.status(400).json({
          error: `Choose role and level. For Ops Lead or Financial manager: ${ADMIN_ASSIGNABLE_ROLES.join(', ')}`
        });
      }
      if (!level || !USER_LEVELS.includes(level)) {
        return res.status(400).json({ error: `Level required: ${USER_LEVELS.join(', ')}` });
      }
      user.role = role;
      user.level = level;
    }
    user.status = 'approved';
    await user.save();
    res.json({
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        role: user.role,
        level: user.level,
        status: user.status
      }
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.patch('/:id/reject', authenticate, requireRole('admin', 'ops_lead'), async (req, res) => {
  try {
    const { reason } = req.body;
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.status === 'approved') return res.status(400).json({ error: 'Cannot reject an approved user' });
    if (req.user.role === 'ops_lead' && user.status !== 'pending_ops') {
      return res.status(403).json({
        error: 'Ops Lead can only reject applicants waiting in the Ops review queue (before they are sent to admin).'
      });
    }
    user.status = 'pending_onboarding';
    user.rejectionReason = reason || 'Your application was not approved.';
    user.role = 'applicant';
    await user.save();
    res.json({ success: true, status: user.status });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.patch('/:id/ops-team-rate', authenticate, requireRole('admin'), async (req, res) => {
  try {
    const { opsTeamRate } = req.body;
    if (opsTeamRate == null || Number.isNaN(Number(opsTeamRate))) {
      return res.status(400).json({ error: 'opsTeamRate (number) required' });
    }
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.role !== 'ops_lead') return res.status(400).json({ error: 'opsTeamRate applies only to Ops Lead users' });
    user.opsTeamRate = Number(opsTeamRate);
    await user.save();
    const safe = await User.findById(user._id).select('-password');
    res.json(safe);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.patch('/:id/salary-per-bid', authenticate, requireRole('admin'), async (req, res) => {
  try {
    const { salaryPerBid } = req.body;
    if (salaryPerBid == null || Number.isNaN(Number(salaryPerBid))) {
      return res.status(400).json({ error: 'salaryPerBid (number) required' });
    }
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.role !== 'bidder') return res.status(400).json({ error: 'Salary per bid applies only to bidders' });
    user.salaryPerBid = Number(salaryPerBid);
    await user.save();
    const safe = await User.findById(user._id).select('-password');
    res.json(safe);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.patch('/:id/assign-ops-lead', authenticate, requireRole('admin'), async (req, res) => {
  try {
    const { opsLeadId } = req.body;
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.role !== 'bid_manager') return res.status(400).json({ error: 'User must be a bid manager' });
    if (opsLeadId) {
      const ol = await User.findOne({ _id: opsLeadId, role: 'ops_lead', status: 'approved' });
      if (!ol) return res.status(400).json({ error: 'Invalid ops lead' });
      await User.findByIdAndUpdate(req.params.id, { $set: { opsLeadId } });
    } else {
      await User.findByIdAndUpdate(req.params.id, { $unset: { opsLeadId: 1 } });
    }
    const safe = await User.findById(req.params.id).select('-password').populate('opsLeadId', 'name email');
    res.json(safe);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.patch('/:id/assign-bid-manager', authenticate, requireRole('admin', 'ops_lead'), async (req, res) => {
  try {
    const { bidManagerId } = req.body;
    const bidder = await User.findById(req.params.id);
    if (!bidder) return res.status(404).json({ error: 'User not found' });
    if (bidder.role !== 'bidder') return res.status(400).json({ error: 'User must be a bidder' });
    if (bidManagerId) {
      const bm = await User.findOne({ _id: bidManagerId, role: 'bid_manager', status: 'approved' });
      if (!bm) return res.status(400).json({ error: 'Invalid bid manager' });
      if (req.user.role === 'ops_lead') {
        if (!bm.opsLeadId || bm.opsLeadId.toString() !== req.user._id.toString()) {
          return res.status(403).json({ error: 'You can only assign bidders to your bid managers' });
        }
      }
      await User.findByIdAndUpdate(req.params.id, { $set: { bidManagerId } });
    } else {
      await User.findByIdAndUpdate(req.params.id, { $unset: { bidManagerId: 1 } });
    }
    const safe = await User.findById(req.params.id).select('-password').populate('bidManagerId', 'name email');
    res.json(safe);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** Ops Lead creates a level-change request for a bidder or bid manager under them */
router.post('/level-requests', authenticate, requireRole('ops_lead'), async (req, res) => {
  try {
    const { userId, newLevel, reason } = req.body;
    if (!userId || !newLevel || !reason?.trim()) {
      return res.status(400).json({ error: 'userId, newLevel, and reason are required' });
    }
    if (!USER_LEVELS.includes(newLevel)) {
      return res.status(400).json({ error: 'Invalid level' });
    }
    const target = await User.findById(userId);
    if (!target) return res.status(404).json({ error: 'User not found' });
    if (!['bidder', 'bid_manager'].includes(target.role)) {
      return res.status(400).json({ error: 'Level requests are only for bidders and bid managers' });
    }
    if (target.level === newLevel) {
      return res.status(400).json({ error: 'New level is the same as the current level' });
    }
    const existing = await LevelRequest.findOne({ userId, status: 'pending' });
    if (existing) {
      return res.status(400).json({ error: 'A pending request already exists for this person' });
    }
    const lr = await LevelRequest.create({
      userId,
      requestedBy: req.user._id,
      currentLevel: target.level || 'junior',
      newLevel,
      reason: reason.trim()
    });
    const populated = await LevelRequest.findById(lr._id)
      .populate('userId', 'name email role level')
      .populate('requestedBy', 'name');
    res.json(populated);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** Ops Lead gets their own pending requests */
router.get('/level-requests/my', authenticate, requireRole('ops_lead'), async (req, res) => {
  try {
    const requests = await LevelRequest.find({ requestedBy: req.user._id })
      .populate('userId', 'name email role level')
      .populate('requestedBy', 'name')
      .populate('decidedBy', 'name')
      .sort({ createdAt: -1 })
      .limit(50);
    res.json(requests);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** Admin gets all pending level requests */
router.get('/level-requests', authenticate, requireRole('admin'), async (req, res) => {
  try {
    const requests = await LevelRequest.find({ status: 'pending' })
      .populate('userId', 'name email role level')
      .populate('requestedBy', 'name')
      .sort({ createdAt: -1 });
    res.json(requests);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** Admin approves a level request — updates the user's level */
router.patch('/level-requests/:id/approve', authenticate, requireRole('admin'), async (req, res) => {
  try {
    const lr = await LevelRequest.findById(req.params.id);
    if (!lr) return res.status(404).json({ error: 'Request not found' });
    if (lr.status !== 'pending') return res.status(400).json({ error: 'Request already decided' });
    const user = await User.findById(lr.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    user.level = lr.newLevel;
    await user.save();
    lr.status = 'approved';
    lr.decidedBy = req.user._id;
    lr.decidedAt = new Date();
    await lr.save();
    const populated = await LevelRequest.findById(lr._id)
      .populate('userId', 'name email role level')
      .populate('requestedBy', 'name')
      .populate('decidedBy', 'name');
    res.json(populated);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** Admin declines a level request */
router.patch('/level-requests/:id/decline', authenticate, requireRole('admin'), async (req, res) => {
  try {
    const { reason } = req.body;
    const lr = await LevelRequest.findById(req.params.id);
    if (!lr) return res.status(404).json({ error: 'Request not found' });
    if (lr.status !== 'pending') return res.status(400).json({ error: 'Request already decided' });
    lr.status = 'declined';
    lr.declineReason = reason || '';
    lr.decidedBy = req.user._id;
    lr.decidedAt = new Date();
    await lr.save();
    const populated = await LevelRequest.findById(lr._id)
      .populate('userId', 'name email role level')
      .populate('requestedBy', 'name')
      .populate('decidedBy', 'name');
    res.json(populated);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
