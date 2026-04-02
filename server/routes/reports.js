import express from 'express';
import Report, { WORKFLOW } from '../models/Report.js';
import User from '../models/User.js';
import ImProfile from '../models/ImProfile.js';
import { authenticate, requireRole } from '../middleware/auth.js';

const router = express.Router();

const bidManagerPopulate = {
  path: 'bidManagerId',
  select: 'name email opsLeadId',
  populate: { path: 'opsLeadId', select: 'name email' }
};

function populateReport(q) {
  return q
    .populate(bidManagerPopulate)
    .populate('bidderId', 'name email')
    .populate('profileId');
}

router.post('/', authenticate, requireRole('bidder'), async (req, res) => {
  try {
    const { profileId, bidCount, weekStartDate } = req.body;
    if (!profileId || bidCount == null) {
      return res.status(400).json({ error: 'profileId and bidCount required' });
    }
    const bidder = await User.findById(req.user._id);
    if (!bidder || bidder.role !== 'bidder') {
      return res.status(400).json({ error: 'Invalid bidder' });
    }
    if (!bidder.bidManagerId) {
      return res.status(400).json({ error: 'You must be assigned to a bid manager before submitting weekly reports' });
    }
    const profile = await ImProfile.findById(profileId);
    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }
    if (!profile.assignedBidderId || profile.assignedBidderId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'That profile is not assigned to you' });
    }
    const bm = await User.findById(bidder.bidManagerId);
    if (!bm?.opsLeadId || profile.opsLeadId.toString() !== bm.opsLeadId.toString()) {
      return res.status(403).json({ error: 'That profile is not on your Ops team' });
    }

    const rawDate = weekStartDate ? new Date(weekStartDate) : new Date();
    const lastSunday = getPreviousWeekSunday(rawDate);
    const weekStartNormalized = startOfLocalDay(lastSunday);
    const weekEnd = new Date(weekStartNormalized);
    weekEnd.setDate(weekEnd.getDate() + 1);

    const duplicate = await Report.findOne({
      bidderId: req.user._id,
      profileId: profile._id,
      weekStartDate: { $gte: weekStartNormalized, $lt: weekEnd }
    });
    if (duplicate) {
      return res.status(400).json({
        error: 'You already submitted a report for this profile for last week. One submission per profile per week.'
      });
    }

    const report = await Report.create({
      profileId: profile._id,
      bidManagerId: bidder.bidManagerId,
      bidderId: req.user._id,
      bidderName: bidder.name,
      profileName: profile.name,
      bidCount: Number(bidCount),
      bonus: 0,
      bidManagerBonus: 0,
      opsLeadTeamBonus: 0,
      workflowStatus: WORKFLOW.AWAITING_BID_MANAGER,
      weekStartDate: weekStartNormalized
    });
    const populated = await populateReport(Report.findById(report._id));
    res.status(201).json(populated);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/admin/all', authenticate, requireRole('admin'), async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = (page - 1) * limit;
    const filter = {};
    if (req.query.workflowStatus) filter.workflowStatus = req.query.workflowStatus;
    if (req.query.paid === 'unpaid') filter.paidAt = { $exists: false };
    else if (req.query.paid === 'paid') filter.paidAt = { $exists: true };
    const [items, total] = await Promise.all([
      populateReport(Report.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)),
      Report.countDocuments(filter)
    ]);
    res.json({
      items,
      total,
      page,
      limit,
      pages: Math.ceil(total / limit) || 1
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/', authenticate, async (req, res) => {
  try {
    /** Hide fully paid lines per role so dashboards only show actionable work */
    let filter = { paidAt: { $exists: false } };
    if (req.user.role === 'bid_manager') {
      filter.bidManagerId = req.user._id;
      filter.bmPayoutPaidAt = { $exists: false };
    } else if (req.user.role === 'bidder') {
      filter.bidderId = req.user._id;
      filter.bidderPayoutPaidAt = { $exists: false };
    } else if (req.user.role === 'ops_lead') {
      const bmIds = await User.find({
        role: 'bid_manager',
        status: 'approved',
        opsLeadId: req.user._id
      }).distinct('_id');
      filter.bidManagerId = { $in: bmIds };
      filter.opsLeadPayoutPaidAt = { $exists: false };
    }
    const reports = await populateReport(Report.find(filter).sort({ createdAt: -1 }));
    res.json(reports);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

function recordDecline(report, user, role) {
  report.declinedAt = new Date();
  report.declinedBy = user._id;
  report.declinedByRole = role;
}

/** Approve ALL bidder reports at once — each report gets its own bonus via bonuses map */
router.post('/bid-manager/approve-all', authenticate, requireRole('bid_manager'), async (req, res) => {
  try {
    const { bonuses } = req.body;
    const bonusMap = bonuses && typeof bonuses === 'object' ? bonuses : {};
    const reports = await Report.find({
      bidManagerId: req.user._id,
      workflowStatus: WORKFLOW.AWAITING_BID_MANAGER
    });
    if (reports.length === 0) {
      return res.status(400).json({ error: 'No reports awaiting your approval' });
    }
    const ids = [];
    for (const report of reports) {
      const raw = bonusMap[report._id.toString()];
      report.bidManagerBonus = raw != null && !Number.isNaN(Number(raw)) ? Number(raw) : 0;
      report.workflowStatus = WORKFLOW.AWAITING_OPS_LEAD;
      report.bidManagerApprovedAt = new Date();
      report.bidManagerApprovedBy = req.user._id;
      await report.save();
      ids.push(report._id);
    }
    const populated = await populateReport(Report.find({ _id: { $in: ids } }));
    res.json({ count: populated.length, reports: populated });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.patch('/:id/decline-bid-manager', authenticate, requireRole('bid_manager'), async (req, res) => {
  try {
    const { declineReason } = req.body;
    const report = await Report.findOne({ _id: req.params.id, bidManagerId: req.user._id });
    if (!report) return res.status(404).json({ error: 'Report not found' });
    if (report.workflowStatus !== WORKFLOW.AWAITING_BID_MANAGER) {
      return res.status(400).json({ error: 'Report is not awaiting bid manager approval' });
    }
    recordDecline(report, req.user, 'bid_manager');
    if (declineReason) report.declineReason = String(declineReason).slice(0, 500);
    report.workflowStatus = WORKFLOW.AWAITING_BIDDER_REVISION;
    await report.save();
    const populated = await populateReport(Report.findById(report._id));
    res.json(populated);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** Approve ALL reports from all bid teams under this Ops Lead — each BM gets its own bonus via bonuses map */
router.post('/ops-lead/approve-all', authenticate, requireRole('ops_lead'), async (req, res) => {
  try {
    const { bonuses } = req.body;
    const bonusMap = bonuses && typeof bonuses === 'object' ? bonuses : {};
    const bmIds = await User.find({
      role: 'bid_manager', status: 'approved', opsLeadId: req.user._id
    }).distinct('_id');
    const reports = await Report.find({
      bidManagerId: { $in: bmIds },
      workflowStatus: WORKFLOW.AWAITING_OPS_LEAD
    });
    if (reports.length === 0) {
      return res.status(400).json({ error: 'No reports awaiting your approval' });
    }
    const ids = [];
    for (const report of reports) {
      const bmId = report.bidManagerId.toString();
      const raw = bonusMap[bmId];
      report.opsLeadTeamBonus = raw != null && !Number.isNaN(Number(raw)) ? Number(raw) : 0;
      report.workflowStatus = WORKFLOW.CONFIRMED;
      report.opsLeadApprovedAt = new Date();
      report.opsLeadApprovedBy = req.user._id;
      await report.save();
      ids.push(report._id);
    }
    const populated = await populateReport(Report.find({ _id: { $in: ids } }));
    res.json({ count: populated.length, reports: populated });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** Decline an entire bid manager team — sends all their awaiting reports back to BM */
router.post('/ops-lead/decline-team', authenticate, requireRole('ops_lead'), async (req, res) => {
  try {
    const { bidManagerId, declineReason } = req.body;
    if (!bidManagerId) return res.status(400).json({ error: 'bidManagerId required' });
    const bm = await User.findOne({ _id: bidManagerId, role: 'bid_manager', opsLeadId: req.user._id });
    if (!bm) return res.status(403).json({ error: 'Not your bid manager team' });
    const reports = await Report.find({
      bidManagerId,
      workflowStatus: WORKFLOW.AWAITING_OPS_LEAD
    });
    if (reports.length === 0) {
      return res.status(400).json({ error: 'No reports awaiting approval for this team' });
    }
    for (const report of reports) {
      recordDecline(report, req.user, 'ops_lead');
      if (declineReason) report.declineReason = String(declineReason).slice(0, 500);
      report.workflowStatus = WORKFLOW.AWAITING_BID_MANAGER;
      report.opsLeadApprovedAt = null;
      report.opsLeadApprovedBy = null;
      report.opsLeadTeamBonus = 0;
      report.bidManagerApprovedAt = null;
      report.bidManagerApprovedBy = null;
      report.bidManagerBonus = 0;
      await report.save();
    }
    res.json({ count: reports.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});


router.patch('/:id', authenticate, requireRole('bidder'), async (req, res) => {
  try {
    const { bidCount, weekStartDate, profileId } = req.body;
    const report = await Report.findOne({ _id: req.params.id, bidderId: req.user._id });
    if (!report) return res.status(404).json({ error: 'Report not found' });
    if (report.workflowStatus !== WORKFLOW.AWAITING_BIDDER_REVISION) {
      return res.status(400).json({ error: 'This report is not awaiting your revision' });
    }
    if (profileId) {
      const profile = await ImProfile.findById(profileId);
      if (!profile) return res.status(404).json({ error: 'Profile not found' });
      if (!profile.assignedBidderId || profile.assignedBidderId.toString() !== req.user._id.toString()) {
        return res.status(403).json({ error: 'That profile is not assigned to you' });
      }
      const bidder = await User.findById(req.user._id);
      const bm = await User.findById(bidder.bidManagerId);
      if (!bm?.opsLeadId || profile.opsLeadId.toString() !== bm.opsLeadId.toString()) {
        return res.status(403).json({ error: 'That profile is not on your Ops team' });
      }
      report.profileId = profile._id;
      report.profileName = profile.name;
    }
    if (bidCount != null && !Number.isNaN(Number(bidCount))) {
      report.bidCount = Math.max(0, Number(bidCount));
    }
    if (weekStartDate != null && weekStartDate !== '') {
      const rawDate = new Date(weekStartDate);
      const sunday = getSunday(rawDate);
      const weekStartNormalized = startOfLocalDay(sunday);
      const weekEnd = new Date(weekStartNormalized);
      weekEnd.setDate(weekEnd.getDate() + 1);
      const dup = await Report.findOne({
        _id: { $ne: report._id },
        bidderId: req.user._id,
        profileId: report.profileId,
        weekStartDate: { $gte: weekStartNormalized, $lt: weekEnd }
      });
      if (dup) {
        return res.status(400).json({
          error: 'You already have another report for this profile for that week.'
        });
      }
      report.weekStartDate = weekStartNormalized;
    }
    report.workflowStatus = WORKFLOW.AWAITING_BID_MANAGER;
    await report.save();
    const populated = await populateReport(Report.findById(report._id));
    res.json(populated);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/:id', authenticate, requireRole('bidder'), async (req, res) => {
  try {
    const report = await Report.findOne({ _id: req.params.id, bidderId: req.user._id });
    if (!report) return res.status(404).json({ error: 'Report not found' });
    if (
      report.workflowStatus !== WORKFLOW.AWAITING_BID_MANAGER &&
      report.workflowStatus !== WORKFLOW.AWAITING_BIDDER_REVISION
    ) {
      return res.status(400).json({ error: 'You can only delete reports that have not yet been approved by your bid manager' });
    }
    await Report.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

function getSunday(d) {
  const date = new Date(d);
  const day = date.getDay();
  date.setDate(date.getDate() - day);
  return date;
}

function getPreviousWeekSunday(d) {
  const sunday = getSunday(d);
  sunday.setDate(sunday.getDate() - 7);
  return sunday;
}

function startOfLocalDay(d) {
  const x = new Date(d);
  return new Date(x.getFullYear(), x.getMonth(), x.getDate(), 0, 0, 0, 0);
}

export default router;
