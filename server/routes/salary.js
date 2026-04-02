import express from 'express';
import SalaryConfig from '../models/SalaryConfig.js';
import Report, { WORKFLOW } from '../models/Report.js';
import User from '../models/User.js';
import PaymentHistory from '../models/PaymentHistory.js';
import PersonPayoutHistory from '../models/PersonPayoutHistory.js';
import PayoutRequest from '../models/PayoutRequest.js';
import { authenticate, requireRole } from '../middleware/auth.js';

const router = express.Router();

const DEFAULT_BM_SALARY = 10;
const DEFAULT_BIDDER_SALARY = 0.08;

function getConfigForBidManager(bidManagerId, configsMap) {
  const id = (bidManagerId?._id ?? bidManagerId)?.toString?.();
  const c = configsMap.get(id);
  return {
    bidManagerSalaryPerProfile: Number(c?.bidManagerSalaryPerProfile ?? DEFAULT_BM_SALARY)
  };
}

async function getBidderRateMap() {
  const bidders = await User.find({ role: 'bidder' }).select('salaryPerBid');
  return new Map(
    bidders.map(b => [b._id.toString(), Number(b.salaryPerBid ?? DEFAULT_BIDDER_SALARY)])
  );
}

function getBidderRate(bidderId, bidderMap) {
  if (!bidderId) return DEFAULT_BIDDER_SALARY;
  const id = (bidderId?._id ?? bidderId)?.toString?.();
  const r = bidderMap.get(id);
  return typeof r === 'number' && !isNaN(r) ? r : DEFAULT_BIDDER_SALARY;
}

/** Bidder: sum(bidCount × bid rate + BM bonus) — eligible after Ops Lead confirms; unpaid only */
async function computeBidderBasePay(bidderId, bidderMap) {
  const reports = await Report.find({
    bidderId,
    workflowStatus: WORKFLOW.CONFIRMED,
    bidderPayoutPaidAt: { $exists: false }
  });
  let base = 0;
  for (const r of reports) {
    const rate = getBidderRate(bidderId, bidderMap);
    base += (Number(r.bidCount) || 0) * rate + (Number(r.bidManagerBonus) || 0);
  }
  return { base, reports };
}

/** BM: sum(profile × profile rate + Ops bonus per report). Ops bonus = opsLeadTeamBonus */
async function computeBmBasePay(bmId, configsMap) {
  const reports = await Report.find({
    bidManagerId: bmId,
    workflowStatus: WORKFLOW.CONFIRMED,
    bmPayoutPaidAt: { $exists: false }
  });
  const cfg = getConfigForBidManager(bmId, configsMap);
  const profileRate = cfg.bidManagerSalaryPerProfile;
  let base = 0;
  for (const r of reports) {
    base += 1 * profileRate + (Number(r.opsLeadTeamBonus) || 0);
  }
  return { base, reports, profileRate };
}

/** Ops: people count × ops lead rate (people = distinct approved bidders under the ops lead's bid managers, with confirmed unpaid reports) */
async function computeOpsBasePay(opsLeadId) {
  const bmIds = await User.find({ role: 'bid_manager', status: 'approved', opsLeadId }).distinct('_id');
  const reports = await Report.find({
    bidManagerId: { $in: bmIds },
    workflowStatus: WORKFLOW.CONFIRMED,
    opsLeadPayoutPaidAt: { $exists: false }
  });
  const people = new Set(reports.map(r => r.bidderId.toString()));
  const peopleCount = people.size;
  const ol = await User.findById(opsLeadId).select('opsTeamRate');
  const opsRate = Number(ol?.opsTeamRate) || 0;
  const base = peopleCount * opsRate;
  return { base, reports, peopleCount, opsRate };
}

router.get('/', authenticate, requireRole('admin', 'financial_manager'), async (req, res) => {
  try {
    const configs = await SalaryConfig.find().populate('bidManagerId', 'name email');
    const bidManagers = await User.find({ role: 'bid_manager', status: 'approved' }).select('-password');
    const configMap = Object.fromEntries(configs.map(c => [c.bidManagerId?._id?.toString(), c]));
    const result = bidManagers.map(bm => {
      const cfg = configMap[bm._id.toString()];
      return {
        bidManagerId: bm._id,
        bidManager: { id: bm._id, name: bm.name, email: bm.email },
        bidManagerSalaryPerProfile: cfg?.bidManagerSalaryPerProfile ?? DEFAULT_BM_SALARY
      };
    });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put('/:bidManagerId', authenticate, requireRole('admin'), async (req, res) => {
  try {
    const { bidManagerId } = req.params;
    const { bidManagerSalaryPerProfile } = req.body;
    const bm = await User.findOne({ _id: bidManagerId, role: 'bid_manager' });
    if (!bm) return res.status(404).json({ error: 'Bid manager not found' });
    let config = await SalaryConfig.findOne({ bidManagerId });
    if (!config) config = new SalaryConfig({ bidManagerId });
    if (bidManagerSalaryPerProfile != null) config.bidManagerSalaryPerProfile = Number(bidManagerSalaryPerProfile);
    await config.save();
    const populated = await SalaryConfig.findById(config._id).populate('bidManagerId', 'name email');
    res.json(populated);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/calculations', authenticate, requireRole('admin', 'financial_manager'), async (req, res) => {
  try {
    const configs = await SalaryConfig.find();
    const configsMap = new Map(configs.map(c => [c.bidManagerId?.toString(), c]));
    const bidderMap = await getBidderRateMap();
    const reports = await Report.find({
      workflowStatus: WORKFLOW.CONFIRMED
    })
      .populate({ path: 'bidManagerId', select: 'name', populate: { path: 'opsLeadId', select: 'name' } })
      .populate('bidderId', 'name')
      .sort({ weekStartDate: -1 });

    const lines = [];
    let outstanding = 0;
    for (const r of reports) {
      const cfg = getConfigForBidManager(r.bidManagerId, configsMap);
      const bidCount = Number(r.bidCount) || 0;
      const bidderRate = getBidderRate(r.bidderId, bidderMap);
      const bmBonus = Number(r.bidManagerBonus) || 0;
      const bidderPay = bidCount * bidderRate + bmBonus;
      const bidderPaid = Boolean(r.bidderPayoutPaidAt);
      if (!bidderPaid) outstanding += bidderPay;

      const confirmed = r.workflowStatus === WORKFLOW.CONFIRMED;
      const bmCut = confirmed
        ? cfg.bidManagerSalaryPerProfile + (Number(r.opsLeadTeamBonus) || 0)
        : null;

      lines.push({
        reportId: r._id,
        profileName: r.profileName,
        bidderName: r.bidderId?.name || r.bidderName,
        bidManager: r.bidManagerId?.name,
        opsLead: r.bidManagerId?.opsLeadId?.name,
        weekStartDate: r.weekStartDate,
        bidCount,
        bidderRate: bidderRate.toFixed(4),
        bmBonus: bmBonus.toFixed(2),
        bidderPay: bidderPay.toFixed(2),
        bidderPaid,
        workflowStatus: r.workflowStatus,
        bmPayAfterOps: bmCut != null ? bmCut.toFixed(2) : '—',
        bmPaid: Boolean(r.bmPayoutPaidAt),
        opsLeadPaid: Boolean(r.opsLeadPayoutPaidAt)
      });
    }

    res.json({
      lines,
      grandTotalBidderOutstanding: outstanding.toFixed(2)
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/payout-queue', authenticate, requireRole('admin', 'financial_manager'), async (req, res) => {
  try {
    const bidderMap = await getBidderRateMap();
    const configs = await SalaryConfig.find();
    const configsMap = new Map(configs.map(c => [c.bidManagerId?.toString(), c]));

    const tree = [];
    const flatRows = [];

    const opsLeads = await User.find({ role: 'ops_lead', status: 'approved' }).select('name email usdtErc20Wallet opsTeamRate');
    for (const ol of opsLeads) {
      const { base: opsBase, reports: opsReports, peopleCount, opsRate } = await computeOpsBasePay(ol._id);
      const bmIds = await User.find({ role: 'bid_manager', status: 'approved', opsLeadId: ol._id }).distinct('_id');
      const bms = await User.find({ _id: { $in: bmIds } }).select('name email usdtErc20Wallet');

      const bmNodes = [];
      for (const bm of bms) {
        const { base: bmBase, reports: bmReports, profileRate } = await computeBmBasePay(bm._id, configsMap);
        const bidderIds = await User.find({ role: 'bidder', status: 'approved', bidManagerId: bm._id }).distinct('_id');
        const bidderUsers = await User.find({ _id: { $in: bidderIds } }).select('name email usdtErc20Wallet salaryPerBid');

        const bidderNodes = [];
        for (const b of bidderUsers) {
          const { base: bBase, reports: bReports } = await computeBidderBasePay(b._id, bidderMap);
          if (bReports.length === 0) continue;
          const node = {
            userId: b._id, name: b.name, role: 'bidder',
            basePay: Number(bBase.toFixed(2)),
            address: b.usdtErc20Wallet || null,
            breakdown: `${bReports.length} report(s) × rate + BM bonus`
          };
          bidderNodes.push(node);
          flatRows.push(node);
        }

        if (bmReports.length > 0) {
          const bmNode = {
            userId: bm._id, name: bm.name, role: 'bid_manager',
            basePay: Number(bmBase.toFixed(2)),
            address: bm.usdtErc20Wallet || null,
            breakdown: `${bmReports.length} profile(s) × $${profileRate} + Ops bonus`
          };
          flatRows.push(bmNode);
          bmNodes.push({ ...bmNode, bidders: bidderNodes });
        } else if (bidderNodes.length > 0) {
          bmNodes.push({
            userId: bm._id, name: bm.name, role: 'bid_manager',
            basePay: 0, address: bm.usdtErc20Wallet || null,
            breakdown: 'No confirmed BM pay yet',
            bidders: bidderNodes
          });
        }
      }

      if (opsReports.length > 0 || bmNodes.length > 0) {
        const opsNode = {
          userId: ol._id, name: ol.name, role: 'ops_lead',
          basePay: Number(opsBase.toFixed(2)),
          address: ol.usdtErc20Wallet || null,
          peopleCount, opsRate,
          breakdown: `${peopleCount} people × $${opsRate}`
        };
        if (opsReports.length > 0) flatRows.push(opsNode);
        tree.push({ ...opsNode, bidManagers: bmNodes });
      }
    }

    res.json({ tree, rows: flatRows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/pay/:userId', authenticate, requireRole('admin', 'financial_manager'), async (req, res) => {
  try {
    const { adminBonus, txId } = req.body;
    let tx = txId != null ? String(txId).trim() : '';
    if (!tx) {
      return res.status(400).json({ error: 'TxID is required to record this payment' });
    }
    if (tx.length > 500) {
      return res.status(400).json({ error: 'TxID is too long (max 500 characters)' });
    }
    const ab = Number(adminBonus) || 0;
    const user = await User.findById(req.params.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!['bidder', 'bid_manager', 'ops_lead'].includes(user.role)) {
      return res.status(400).json({ error: 'Payout not enabled for this role' });
    }

    const bidderMap = await getBidderRateMap();
    const configs = await SalaryConfig.find();
    const configsMap = new Map(configs.map(c => [c.bidManagerId?.toString(), c]));

    let base = 0;
    let reportsToMark = [];

    if (user.role === 'bidder') {
      const x = await computeBidderBasePay(user._id, bidderMap);
      base = x.base;
      reportsToMark = x.reports;
    } else if (user.role === 'bid_manager') {
      const x = await computeBmBasePay(user._id, configsMap);
      base = x.base;
      reportsToMark = x.reports;
    } else if (user.role === 'ops_lead') {
      const x = await computeOpsBasePay(user._id);
      base = x.base;
      reportsToMark = x.reports;
    }

    if (!reportsToMark.length) {
      return res.status(400).json({ error: 'No pending payout for this user' });
    }

    const totalPay = base + ab;
    if (totalPay <= 0) {
      return res.status(400).json({ error: 'Nothing to pay (total must be > 0)' });
    }
    if (!user.usdtErc20Wallet) {
      return res.status(400).json({ error: 'User has no USDT wallet address on file' });
    }

    const ids = reportsToMark.map(r => r._id);
    if (user.role === 'bidder') {
      await Report.updateMany({ _id: { $in: ids } }, { $set: { bidderPayoutPaidAt: new Date() } });
    } else if (user.role === 'bid_manager') {
      await Report.updateMany({ _id: { $in: ids } }, { $set: { bmPayoutPaidAt: new Date() } });
    } else if (user.role === 'ops_lead') {
      await Report.updateMany({ _id: { $in: ids } }, { $set: { opsLeadPayoutPaidAt: new Date() } });
    }

    const record = await PersonPayoutHistory.create({
      userId: user._id,
      name: user.name,
      role: user.role,
      basePay: Number(base.toFixed(2)),
      adminBonus: Number(ab.toFixed(2)),
      totalPay: Number(totalPay.toFixed(2)),
      walletAddress: user.usdtErc20Wallet,
      txId: tx
    });

    await PayoutRequest.updateMany(
      { userId: user._id, status: 'pending' },
      { $set: { status: 'fulfilled', fulfilledAt: new Date() } }
    );

    res.json({ success: true, payout: record });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/expected-pay', authenticate, requireRole('bid_manager'), async (req, res) => {
  try {
    const configs = await SalaryConfig.find();
    const configsMap = new Map(configs.map(c => [c.bidManagerId?.toString(), c]));
    const cfg = getConfigForBidManager(req.user._id, configsMap);
    const profileRate = cfg.bidManagerSalaryPerProfile;
    const reports = await Report.find({
      bidManagerId: req.user._id,
      workflowStatus: WORKFLOW.CONFIRMED,
      bmPayoutPaidAt: { $exists: false }
    });

    const perProfile = reports.map(r => {
      const opsBonus = Number(r.opsLeadTeamBonus) || 0;
      const bmPay = 1 * profileRate + opsBonus;
      return {
        reportId: r._id,
        profileName: r.profileName,
        weekStartDate: r.weekStartDate,
        bmPay: bmPay.toFixed(2),
        profileRate,
        opsBonus: opsBonus.toFixed(2)
      };
    });
    const total = perProfile.reduce((s, p) => s + parseFloat(p.bmPay), 0);
    res.json({
      perProfile,
      profilesCount: reports.length,
      total: total.toFixed(2),
      profileRate,
      formulaSummary: 'profile × rate + Ops Lead bonus (after Ops Lead confirms)'
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/expected-pay-bidder', authenticate, requireRole('bidder'), async (req, res) => {
  try {
    const bidderMap = await getBidderRateMap();
    const bidderRate = getBidderRate(req.user._id, bidderMap);
    const reports = await Report.find({
      bidderId: req.user._id,
      workflowStatus: WORKFLOW.CONFIRMED,
      bidderPayoutPaidAt: { $exists: false }
    })
      .populate('bidManagerId', 'name');

    const perProfile = reports.map(r => {
      const bc = Number(r.bidCount) || 0;
      const bmBonus = Number(r.bidManagerBonus) || 0;
      const amount = bc * bidderRate + bmBonus;
      return {
        reportId: r._id,
        profileName: r.profileName,
        bidManager: r.bidManagerId?.name,
        weekStartDate: r.weekStartDate,
        bidCount: bc,
        bmBonus: bmBonus.toFixed(2),
        amount: amount.toFixed(2),
        bidderRate
      };
    });
    const total = perProfile.reduce((s, p) => s + parseFloat(p.amount), 0);
    res.json({
      perProfile,
      total: total.toFixed(2),
      bidderRate,
      formulaSummary: 'bid count × rate + BM bonus (after Ops Lead approves all; unpaid only)'
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/expected-pay-ops-lead', authenticate, requireRole('ops_lead'), async (req, res) => {
  try {
    const { base, peopleCount, opsRate, reports } = await computeOpsBasePay(req.user._id);
    res.json({
      peopleCount,
      opsRate,
      basePay: base.toFixed(2),
      pendingReports: reports.length,
      formulaSummary: 'people × ops lead rate (+ admin bonus at payout)'
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/pay-per-team', authenticate, requireRole('admin', 'financial_manager'), async (req, res) => {
  try {
    const configs = await SalaryConfig.find();
    const configsMap = new Map(configs.map(c => [c.bidManagerId?.toString(), c]));
    const bidderMap = await getBidderRateMap();
    const reports = await Report.find({ workflowStatus: WORKFLOW.CONFIRMED })
      .populate('bidManagerId', 'name')
      .populate('bidderId');

    const byTeam = {};
    for (const r of reports) {
      const cfg = getConfigForBidManager(r.bidManagerId, configsMap);
      const bidCount = Number(r.bidCount) || 0;
      const bidderRate = getBidderRate(r.bidderId, bidderMap);
      const bidderPart = bidCount * bidderRate;
      const bmPart = 1 * cfg.bidManagerSalaryPerProfile + (Number(r.opsLeadTeamBonus) || 0);
      const gross = bidderPart + bmPart;
      const bmId = r.bidManagerId?.toString?.() || 'unknown';
      if (!byTeam[bmId]) byTeam[bmId] = { bidManager: r.bidManagerId?.name || 'Unknown', totalPay: 0 };
      byTeam[bmId].totalPay += gross;
    }
    const teams = Object.entries(byTeam).map(([id, t]) => ({ bidManagerId: id, bidManager: t.bidManager, totalPay: t.totalPay.toFixed(2) }));
    res.json({ teams });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/history', authenticate, requireRole('admin', 'financial_manager'), async (req, res) => {
  try {
    const person = await PersonPayoutHistory.find().sort({ createdAt: -1 }).limit(500);
    const legacy = await PaymentHistory.find().sort({ createdAt: -1 }).limit(50);
    res.json({ personPayouts: person, legacyBatchPayouts: legacy });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** Logged-in user: their own payout records (all roles) */
router.get('/my-payments', authenticate, async (req, res) => {
  try {
    const payments = await PersonPayoutHistory.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .limit(500)
      .lean();
    res.json({ payments });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** Bidder, bid manager, or Ops Lead: ask Admin / FM to run payout (appears in payout-requests list) */
router.post('/request-payout', authenticate, requireRole('bidder', 'bid_manager', 'ops_lead'), async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const bidderMap = await getBidderRateMap();
    const configs = await SalaryConfig.find();
    const configsMap = new Map(configs.map(c => [c.bidManagerId?.toString(), c]));

    let base = 0;
    if (user.role === 'bidder') {
      const x = await computeBidderBasePay(user._id, bidderMap);
      base = x.base;
    } else if (user.role === 'bid_manager') {
      const x = await computeBmBasePay(user._id, configsMap);
      base = x.base;
    } else if (user.role === 'ops_lead') {
      const x = await computeOpsBasePay(user._id);
      base = x.base;
    }

    if (base <= 0) {
      return res.status(400).json({ error: 'No unpaid balance to request. Nothing is owed right now.' });
    }

    const open = await PayoutRequest.findOne({ userId: user._id, status: 'pending' });
    if (open) {
      return res.status(400).json({ error: 'You already have a pending payout request.' });
    }

    await PayoutRequest.create({
      userId: user._id,
      role: user.role,
      status: 'pending'
    });

    res.json({
      message: 'Request submitted. Admin or Financial manager will review the payout queue and record payment with a TxID.'
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/payout-requests', authenticate, requireRole('admin', 'financial_manager'), async (req, res) => {
  try {
    const requests = await PayoutRequest.find({ status: 'pending' })
      .populate('userId', 'name email role')
      .sort({ createdAt: -1 })
      .lean();
    res.json({ requests });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
