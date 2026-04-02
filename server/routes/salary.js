import express from 'express';
import SalaryConfig, { SALARY_ROLES, SALARY_LEVELS } from '../models/SalaryConfig.js';
import Report, { WORKFLOW } from '../models/Report.js';
import User from '../models/User.js';
import PaymentHistory from '../models/PaymentHistory.js';
import PersonPayoutHistory from '../models/PersonPayoutHistory.js';
import PayoutRequest from '../models/PayoutRequest.js';
import { authenticate, requireRole } from '../middleware/auth.js';

const router = express.Router();
const TAX_RATE = 0.10;

function applyTax(amount) {
  const tax = +(amount * TAX_RATE).toFixed(2);
  return { tax, net: +(amount - tax).toFixed(2) };
}

async function loadRateMap() {
  const configs = await SalaryConfig.find();
  const map = {};
  for (const c of configs) {
    map[`${c.role}:${c.level}`] = c.rate;
  }
  return map;
}

function getRate(rateMap, role, level) {
  return Number(rateMap[`${role}:${level}`]) || 0;
}

async function getUserRate(userId, rateMap) {
  const user = await User.findById(userId).select('role level');
  if (!user) return 0;
  return getRate(rateMap, user.role, user.level);
}

async function computeBidderBasePay(bidderId, rateMap) {
  const user = await User.findById(bidderId).select('role level');
  const rate = user ? getRate(rateMap, 'bidder', user.level) : 0;
  const reports = await Report.find({
    bidderId,
    workflowStatus: WORKFLOW.CONFIRMED,
    bidderPayoutPaidAt: { $exists: false }
  });
  let base = 0;
  for (const r of reports) {
    base += (Number(r.bidCount) || 0) * rate + (Number(r.bidManagerBonus) || 0);
  }
  return { base, reports, rate };
}

async function computeBmBasePay(bmId, rateMap) {
  const user = await User.findById(bmId).select('role level');
  const profileRate = user ? getRate(rateMap, 'bid_manager', user.level) : 0;
  const reports = await Report.find({
    bidManagerId: bmId,
    workflowStatus: WORKFLOW.CONFIRMED,
    bmPayoutPaidAt: { $exists: false }
  });
  let base = 0;
  for (const r of reports) {
    base += 1 * profileRate + (Number(r.opsLeadTeamBonus) || 0);
  }
  return { base, reports, profileRate };
}

async function computeOpsBasePay(opsLeadId, rateMap) {
  const bmIds = await User.find({ role: 'bid_manager', status: 'approved', opsLeadId }).distinct('_id');
  const reports = await Report.find({
    bidManagerId: { $in: bmIds },
    workflowStatus: WORKFLOW.CONFIRMED,
    opsLeadPayoutPaidAt: { $exists: false }
  });
  const people = new Set(reports.map(r => r.bidderId.toString()));
  const peopleCount = people.size;
  const ol = await User.findById(opsLeadId).select('level');
  const opsRate = ol ? getRate(rateMap, 'ops_lead', ol.level) : 0;
  const base = peopleCount * opsRate;
  return { base, reports, peopleCount, opsRate };
}

/** GET / — return the full role×level rate grid */
router.get('/', authenticate, requireRole('admin', 'financial_manager'), async (req, res) => {
  try {
    const configs = await SalaryConfig.find();
    const grid = {};
    for (const role of SALARY_ROLES) {
      grid[role] = {};
      for (const level of SALARY_LEVELS) {
        grid[role][level] = 0;
      }
    }
    for (const c of configs) {
      if (grid[c.role]) grid[c.role][c.level] = c.rate;
    }
    res.json({ grid, roles: SALARY_ROLES, levels: SALARY_LEVELS });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** PUT /rate — set a single role+level rate */
router.put('/rate', authenticate, requireRole('admin', 'financial_manager'), async (req, res) => {
  try {
    const { role, level, rate } = req.body;
    if (!SALARY_ROLES.includes(role)) return res.status(400).json({ error: 'Invalid role' });
    if (!SALARY_LEVELS.includes(level)) return res.status(400).json({ error: 'Invalid level' });
    if (rate == null || isNaN(Number(rate)) || Number(rate) < 0) {
      return res.status(400).json({ error: 'rate must be a non-negative number' });
    }
    await SalaryConfig.findOneAndUpdate(
      { role, level },
      { rate: Number(rate) },
      { upsert: true, new: true }
    );
    const configs = await SalaryConfig.find();
    const grid = {};
    for (const r of SALARY_ROLES) {
      grid[r] = {};
      for (const l of SALARY_LEVELS) grid[r][l] = 0;
    }
    for (const c of configs) {
      if (grid[c.role]) grid[c.role][c.level] = c.rate;
    }
    res.json({ grid, roles: SALARY_ROLES, levels: SALARY_LEVELS });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/payout-queue', authenticate, requireRole('admin', 'financial_manager'), async (req, res) => {
  try {
    const rateMap = await loadRateMap();
    const tree = [];
    const flatRows = [];

    const opsLeads = await User.find({ role: 'ops_lead', status: 'approved' }).select('name email usdtErc20Wallet level');
    for (const ol of opsLeads) {
      const { base: opsBase, reports: opsReports, peopleCount, opsRate } = await computeOpsBasePay(ol._id, rateMap);
      const bmIds = await User.find({ role: 'bid_manager', status: 'approved', opsLeadId: ol._id }).distinct('_id');
      const bms = await User.find({ _id: { $in: bmIds } }).select('name email usdtErc20Wallet level');

      const bmNodes = [];
      for (const bm of bms) {
        const { base: bmBase, reports: bmReports, profileRate } = await computeBmBasePay(bm._id, rateMap);
        const bidderIds = await User.find({ role: 'bidder', status: 'approved', bidManagerId: bm._id }).distinct('_id');
        const bidderUsers = await User.find({ _id: { $in: bidderIds } }).select('name email usdtErc20Wallet level');

        const bidderNodes = [];
        for (const b of bidderUsers) {
          const { base: bBase, reports: bReports, rate: bidderRate } = await computeBidderBasePay(b._id, rateMap);
          if (bReports.length === 0) continue;
          const node = {
            userId: b._id, name: b.name, role: 'bidder',
            basePay: Number(bBase.toFixed(2)),
            address: b.usdtErc20Wallet || null,
            breakdown: `${bReports.length} report(s) × $${bidderRate}/bid + BM bonus`
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

    res.json({ tree, rows: flatRows, taxRate: TAX_RATE });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/pay/:userId', authenticate, requireRole('admin', 'financial_manager'), async (req, res) => {
  try {
    const { adminBonus, txId } = req.body;
    let tx = txId != null ? String(txId).trim() : '';
    if (!tx) return res.status(400).json({ error: 'TxID is required to record this payment' });
    if (tx.length > 500) return res.status(400).json({ error: 'TxID is too long (max 500 characters)' });
    const ab = Number(adminBonus) || 0;
    const user = await User.findById(req.params.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!['bidder', 'bid_manager', 'ops_lead'].includes(user.role)) {
      return res.status(400).json({ error: 'Payout not enabled for this role' });
    }

    const rateMap = await loadRateMap();
    let base = 0;
    let reportsToMark = [];

    if (user.role === 'bidder') {
      const x = await computeBidderBasePay(user._id, rateMap);
      base = x.base; reportsToMark = x.reports;
    } else if (user.role === 'bid_manager') {
      const x = await computeBmBasePay(user._id, rateMap);
      base = x.base; reportsToMark = x.reports;
    } else if (user.role === 'ops_lead') {
      const x = await computeOpsBasePay(user._id, rateMap);
      base = x.base; reportsToMark = x.reports;
    }

    if (!reportsToMark.length) return res.status(400).json({ error: 'No pending payout for this user' });
    const totalPay = base + ab;
    if (totalPay <= 0) return res.status(400).json({ error: 'Nothing to pay (total must be > 0)' });
    if (!user.usdtErc20Wallet) return res.status(400).json({ error: 'User has no USDT wallet address on file' });

    const ids = reportsToMark.map(r => r._id);
    if (user.role === 'bidder') {
      await Report.updateMany({ _id: { $in: ids } }, { $set: { bidderPayoutPaidAt: new Date() } });
    } else if (user.role === 'bid_manager') {
      await Report.updateMany({ _id: { $in: ids } }, { $set: { bmPayoutPaidAt: new Date() } });
    } else if (user.role === 'ops_lead') {
      await Report.updateMany({ _id: { $in: ids } }, { $set: { opsLeadPayoutPaidAt: new Date() } });
    }

    const { tax, net } = applyTax(totalPay);
    const record = await PersonPayoutHistory.create({
      userId: user._id, name: user.name, role: user.role,
      basePay: Number(base.toFixed(2)), adminBonus: Number(ab.toFixed(2)),
      totalPay: Number(totalPay.toFixed(2)),
      taxRate: TAX_RATE, taxAmount: tax, netPay: net,
      walletAddress: user.usdtErc20Wallet, txId: tx
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
    const rateMap = await loadRateMap();
    const { base, reports, profileRate } = await computeBmBasePay(req.user._id, rateMap);
    const perProfile = reports.map(r => {
      const opsBonus = Number(r.opsLeadTeamBonus) || 0;
      const bmPay = 1 * profileRate + opsBonus;
      return {
        reportId: r._id, profileName: r.profileName, weekStartDate: r.weekStartDate,
        bmPay: bmPay.toFixed(2), profileRate, opsBonus: opsBonus.toFixed(2)
      };
    });
    const total = perProfile.reduce((s, p) => s + parseFloat(p.bmPay), 0);
    const { tax, net } = applyTax(total);
    res.json({
      perProfile, profilesCount: reports.length, total: total.toFixed(2), profileRate,
      taxRate: TAX_RATE, taxAmount: tax.toFixed(2), netPay: net.toFixed(2),
      formulaSummary: 'profile × rate + Ops Lead bonus (after Ops Lead confirms)'
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/expected-pay-bidder', authenticate, requireRole('bidder'), async (req, res) => {
  try {
    const rateMap = await loadRateMap();
    const { base, reports, rate: bidderRate } = await computeBidderBasePay(req.user._id, rateMap);
    const perProfile = reports.map(r => {
      const bc = Number(r.bidCount) || 0;
      const bmBonus = Number(r.bidManagerBonus) || 0;
      const amount = bc * bidderRate + bmBonus;
      return {
        reportId: r._id, profileName: r.profileName,
        weekStartDate: r.weekStartDate, bidCount: bc,
        bmBonus: bmBonus.toFixed(2), amount: amount.toFixed(2), bidderRate
      };
    });
    const total = perProfile.reduce((s, p) => s + parseFloat(p.amount), 0);
    const { tax, net } = applyTax(total);
    res.json({
      perProfile, total: total.toFixed(2), bidderRate,
      taxRate: TAX_RATE, taxAmount: tax.toFixed(2), netPay: net.toFixed(2),
      formulaSummary: 'bid count × rate + BM bonus (after Ops Lead approves all; unpaid only)'
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/expected-pay-ops-lead', authenticate, requireRole('ops_lead'), async (req, res) => {
  try {
    const rateMap = await loadRateMap();
    const { base, peopleCount, opsRate, reports } = await computeOpsBasePay(req.user._id, rateMap);
    const { tax, net } = applyTax(base);
    res.json({
      peopleCount, opsRate, basePay: base.toFixed(2), pendingReports: reports.length,
      taxRate: TAX_RATE, taxAmount: tax.toFixed(2), netPay: net.toFixed(2),
      formulaSummary: 'people × ops lead rate (+ admin bonus at payout)'
    });
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

router.get('/my-payments', authenticate, async (req, res) => {
  try {
    const payments = await PersonPayoutHistory.find({ userId: req.user._id }).sort({ createdAt: -1 }).limit(500).lean();
    res.json({ payments });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/request-payout', authenticate, requireRole('bidder', 'bid_manager', 'ops_lead'), async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const rateMap = await loadRateMap();
    let base = 0;
    if (user.role === 'bidder') { base = (await computeBidderBasePay(user._id, rateMap)).base; }
    else if (user.role === 'bid_manager') { base = (await computeBmBasePay(user._id, rateMap)).base; }
    else if (user.role === 'ops_lead') { base = (await computeOpsBasePay(user._id, rateMap)).base; }
    if (base <= 0) return res.status(400).json({ error: 'No unpaid balance to request.' });
    const open = await PayoutRequest.findOne({ userId: user._id, status: 'pending' });
    if (open) return res.status(400).json({ error: 'You already have a pending payout request.' });
    await PayoutRequest.create({ userId: user._id, role: user.role, status: 'pending' });
    res.json({ message: 'Request submitted. Admin or Financial manager will review.' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/payout-requests', authenticate, requireRole('admin', 'financial_manager'), async (req, res) => {
  try {
    const requests = await PayoutRequest.find({ status: 'pending' }).populate('userId', 'name email role').sort({ createdAt: -1 }).lean();
    res.json({ requests });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
