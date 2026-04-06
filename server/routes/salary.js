import express from 'express';
import SalaryConfig, { SALARY_ROLES, SALARY_LEVELS } from '../models/SalaryConfig.js';
import Report, { WORKFLOW } from '../models/Report.js';
import User from '../models/User.js';
import ImProfile from '../models/ImProfile.js';
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
  /** Ops Lead bonus: one total per BM (stored on one report, 0 on others); sum rows so negatives work. */
  let opsBonusTotal = 0;
  for (const r of reports) {
    base += 1 * profileRate;
    const ob = Number(r.opsLeadTeamBonus);
    opsBonusTotal += Number.isFinite(ob) ? ob : 0;
  }
  base += opsBonusTotal;
  return { base, reports, profileRate, opsBonusTotal };
}

async function computeOpsBasePay(opsLeadId, rateMap) {
  const bmIds = await User.find({ role: 'bid_manager', status: 'approved', opsLeadId }).distinct('_id');
  const reports = await Report.find({
    bidManagerId: { $in: bmIds },
    workflowStatus: WORKFLOW.CONFIRMED,
    opsLeadPayoutPaidAt: { $exists: false }
  });
  const profileCount = reports.length;
  const ol = await User.findById(opsLeadId).select('level');
  const opsRate = ol ? getRate(rateMap, 'ops_lead', ol.level) : 0;
  const base = profileCount * opsRate;
  return { base, reports, profileCount, opsRate };
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
      const { base: opsBase, reports: opsReports, profileCount: opsProfileCount, opsRate } = await computeOpsBasePay(ol._id, rateMap);
      const bmIds = await User.find({ role: 'bid_manager', status: 'approved', opsLeadId: ol._id }).distinct('_id');
      const bms = await User.find({ _id: { $in: bmIds } }).select('name email usdtErc20Wallet level');

      const bmNodes = [];
      for (const bm of bms) {
        const { base: bmBase, reports: bmReports, profileRate, opsBonusTotal } = await computeBmBasePay(bm._id, rateMap);
        const bidderIds = await User.find({ role: 'bidder', status: 'approved', bidManagerId: bm._id }).distinct('_id');
        const bidderUsers = await User.find({ _id: { $in: bidderIds } }).select('name email usdtErc20Wallet level');

        const bidderNodes = [];
        for (const b of bidderUsers) {
          const { base: bBase, reports: bReports, rate: bidderRate } = await computeBidderBasePay(b._id, rateMap);
          if (bReports.length === 0) continue;
          const totalBidCount = bReports.reduce((s, r) => s + (Number(r.bidCount) || 0), 0);
          const totalBmBonus = bReports.reduce((s, r) => s + (Number(r.bidManagerBonus) || 0), 0);
          const node = {
            userId: b._id, name: b.name, role: 'bidder',
            basePay: Number(bBase.toFixed(2)),
            address: b.usdtErc20Wallet || null,
            totalBidCount,
            bmBonusTotal: Number(totalBmBonus.toFixed(2)),
            bidderRate,
            reportCount: bReports.length,
            breakdown: `${totalBidCount} bids × $${bidderRate}/bid + $${totalBmBonus.toFixed(2)} BM bonus`
          };
          bidderNodes.push(node);
          flatRows.push(node);
        }

        if (bmReports.length > 0) {
          const bmNode = {
            userId: bm._id, name: bm.name, role: 'bid_manager',
            basePay: Number(bmBase.toFixed(2)),
            address: bm.usdtErc20Wallet || null,
            profileCount: bmReports.length,
            profileRate,
            opsBonusTotal: Number((opsBonusTotal || 0).toFixed(2)),
            breakdown: `${bmReports.length} profile(s) × $${profileRate} + $${(opsBonusTotal || 0).toFixed(2)} Ops bonus`
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
        const allTeamPaid = opsReports.length > 0 && opsReports.every(r =>
          r.bidderPayoutPaidAt && r.bmPayoutPaidAt
        );
        const opsNode = {
          userId: ol._id, name: ol.name, role: 'ops_lead',
          basePay: Number(opsBase.toFixed(2)),
          address: ol.usdtErc20Wallet || null,
          profileCount: opsProfileCount, opsRate,
          allTeamPaid,
          breakdown: `${opsProfileCount} profile(s) × $${opsRate}`
        };
        if (opsReports.length > 0) flatRows.push(opsNode);
        tree.push({ ...opsNode, bidManagers: bmNodes });
      }
    }

    const confirmedOpsReqs = await PayoutRequest.find({ status: 'confirmed', role: 'ops_lead' }).lean();
    const confirmedOpsIds = new Set(confirmedOpsReqs.map(r => String(r.userId)));
    const filteredTree = tree.filter(ops => confirmedOpsIds.has(String(ops.userId)));

    res.json({ tree: filteredTree, rows: flatRows, taxRate: TAX_RATE });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * Per-profile cost table for clients.
 * POST body accepts { adminBonuses: { [userId]: number } } — the admin bonus
 * entered in the PayoutTree for BMs and Ops Leads.
 * Rules:
 *   - Negative bonuses are NEVER included (can't reduce client cost).
 *   - BM's opsLeadTeamBonus (positive): divided evenly across BM's profile count.
 *   - BM admin bonus (positive): divided evenly across BM's profile count.
 *   - Ops Lead admin bonus (positive): divided evenly across all profiles under them.
 *   - bidManagerBonus to bidder (positive only): included in bidder pay.
 */
router.post('/client-payout-table', authenticate, requireRole('admin', 'financial_manager'), async (req, res) => {
  try {
    const rateMap = await loadRateMap();
    const adminBonuses = req.body.adminBonuses && typeof req.body.adminBonuses === 'object'
      ? req.body.adminBonuses : {};

    const pendingReports = await Report.find({
      workflowStatus: WORKFLOW.CONFIRMED,
      $or: [
        { bidderPayoutPaidAt: { $exists: false } },
        { bidderPayoutPaidAt: null },
        { bmPayoutPaidAt: { $exists: false } },
        { bmPayoutPaidAt: null },
        { opsLeadPayoutPaidAt: { $exists: false } },
        { opsLeadPayoutPaidAt: null }
      ]
    }).lean();

    const bmCache = new Map();
    const bidderCache = new Map();
    const profileCache = new Map();

    async function getBm(id) {
      const k = String(id);
      if (bmCache.has(k)) return bmCache.get(k);
      const u = await User.findById(id).select('name level opsLeadId');
      bmCache.set(k, u);
      return u;
    }
    async function getBidder(id) {
      if (!id) return null;
      const k = String(id);
      if (bidderCache.has(k)) return bidderCache.get(k);
      const u = await User.findById(id).select('name level');
      bidderCache.set(k, u);
      return u;
    }
    async function getProfile(id) {
      if (!id) return null;
      const k = String(id);
      if (profileCache.has(k)) return profileCache.get(k);
      const p = await ImProfile.findById(id).populate('clientId', 'name email');
      profileCache.set(k, p);
      return p;
    }

    /* ── Pre-compute profile counts and bonus totals ── */

    // Ops Lead team bonus per BM (sum of opsLeadTeamBonus on reports)
    const opsTeamBonusByBm = new Map();
    // Number of profiles (pending reports) per BM
    const profileCountByBm = new Map();
    // Number of profiles per Ops Lead
    const profileCountByOps = new Map();
    // Map bmId → opsLeadId
    const bmToOps = new Map();

    for (const r of pendingReports) {
      const bmId = String(r.bidManagerId);
      profileCountByBm.set(bmId, (profileCountByBm.get(bmId) || 0) + 1);

      const ob = Number(r.opsLeadTeamBonus);
      opsTeamBonusByBm.set(bmId, (opsTeamBonusByBm.get(bmId) || 0) + (Number.isFinite(ob) ? ob : 0));
    }

    // Resolve opsLeadId for each BM and count profiles per Ops Lead
    for (const bmId of profileCountByBm.keys()) {
      const bm = await getBm(bmId);
      if (!bm?.opsLeadId) continue;
      const olId = String(bm.opsLeadId);
      bmToOps.set(bmId, olId);
      profileCountByOps.set(olId, (profileCountByOps.get(olId) || 0) + profileCountByBm.get(bmId));
    }

    // Ops base pay per report (ops rate × profiles, divided across all reports = opsRate)
    const opsLeads = await User.find({ role: 'ops_lead', status: 'approved' }).select('_id level');
    const opsBasePerReport = new Map();
    for (const ol of opsLeads) {
      const { reports: opsReports, profileCount: opsProfCount, opsRate } = await computeOpsBasePay(ol._id, rateMap);
      const opsTotal = opsProfCount * opsRate;
      const perReport = opsReports.length > 0 ? opsTotal / opsReports.length : 0;
      opsBasePerReport.set(String(ol._id), perReport);
    }

    /* ── Build rows ── */

    const sortedPending = [...pendingReports].sort((a, b) => {
      const c = String(a.bidManagerId).localeCompare(String(b.bidManagerId));
      if (c !== 0) return c;
      return String(a._id).localeCompare(String(b._id));
    });

    const rows = [];
    for (const r of sortedPending) {
      const bmIdStr = String(r.bidManagerId);
      const olId = bmToOps.get(bmIdStr);
      if (!olId) continue;
      const bm = await getBm(r.bidManagerId);
      const bidder = await getBidder(r.bidderId);
      const bidderRate = bidder ? getRate(rateMap, 'bidder', bidder.level) : 0;

      // Bidder pay: negative BM-to-bidder bonus excluded
      const bmToBidderBonus = Number(r.bidManagerBonus) || 0;
      const bidderPay = (Number(r.bidCount) || 0) * bidderRate + Math.max(0, bmToBidderBonus);

      // BM line: profileRate + evenly-spread positive opsLeadTeamBonus + evenly-spread positive admin BM bonus
      const profileRate = getRate(rateMap, 'bid_manager', bm.level);
      const bmCount = profileCountByBm.get(bmIdStr) || 1;

      const opsTeamBonusRaw = opsTeamBonusByBm.get(bmIdStr) || 0;
      const opsTeamBonusPerProfile = opsTeamBonusRaw > 0 ? opsTeamBonusRaw / bmCount : 0;

      const adminBmBonusRaw = Number(adminBonuses[bmIdStr]) || 0;
      const adminBmBonusPerProfile = adminBmBonusRaw > 0 ? adminBmBonusRaw / bmCount : 0;

      // Ops line: base per report + evenly-spread positive admin Ops bonus
      const opsBasePR = opsBasePerReport.get(olId) || 0;
      const opsCount = profileCountByOps.get(olId) || 1;
      const adminOpsBonusRaw = Number(adminBonuses[olId]) || 0;
      const adminOpsBonusPerProfile = adminOpsBonusRaw > 0 ? adminOpsBonusRaw / opsCount : 0;

      const profilePay = profileRate + opsTeamBonusPerProfile + adminBmBonusPerProfile + opsBasePR + adminOpsBonusPerProfile;
      const total = bidderPay + profilePay;

      const profileDoc = await getProfile(r.profileId);
      const clientName = profileDoc?.clientId?.name || 'Unknown';
      const clientIdStr = profileDoc?.clientId?._id ? String(profileDoc.clientId._id) : 'unknown';

      rows.push({
        reportId: r._id,
        clientId: clientIdStr,
        clientName,
        profileName: r.profileName,
        bidderName: bidder?.name || r.bidderName,
        bidManagerName: bm.name,
        bidderPay: Number(bidderPay.toFixed(2)),
        profilePay: Number(profilePay.toFixed(2)),
        total: Number(total.toFixed(2))
      });
    }

    const summaryMap = new Map();
    for (const row of rows) {
      const key = row.clientId;
      if (!summaryMap.has(key)) {
        summaryMap.set(key, { clientId: row.clientId, clientName: row.clientName, total: 0 });
      }
      summaryMap.get(key).total += row.total;
    }
    for (const s of summaryMap.values()) {
      s.total = Number(s.total.toFixed(2));
    }

    res.json({
      rows,
      clientSummaries: [...summaryMap.values()],
      taxRate: TAX_RATE
    });
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
    const rawAb = Number(adminBonus);
    const ab = Number.isFinite(rawAb) ? rawAb : 0;
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

    const awaitingConfirm = await PayoutRequest.findOne({ userId: user._id, status: 'pending' });
    if (awaitingConfirm) {
      return res.status(400).json({
        error: 'This person has a payout request that is not confirmed yet. Confirm it under Payout requests (or decline it) before paying.'
      });
    }

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
      { userId: user._id, status: 'confirmed' },
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
    const { base, reports, profileRate, opsBonusTotal } = await computeBmBasePay(req.user._id, rateMap);
    const sorted = [...reports].sort((a, b) => String(a._id).localeCompare(String(b._id)));
    let first = true;
    const perProfile = sorted.map(r => {
      const opsBonus = first ? (opsBonusTotal || 0) : 0;
      first = false;
      const bmPay = 1 * profileRate + opsBonus;
      return {
        reportId: r._id, profileName: r.profileName, weekStartDate: r.weekStartDate,
        bmPay: bmPay.toFixed(2), profileRate, opsBonus: opsBonus.toFixed(2)
      };
    });
    const total = base;
    const { tax, net } = applyTax(total);
    res.json({
      perProfile,
      profilesCount: reports.length,
      opsBonusTotal: (opsBonusTotal || 0).toFixed(2),
      total: total.toFixed(2),
      profileRate,
      taxRate: TAX_RATE, taxAmount: tax.toFixed(2), netPay: net.toFixed(2),
      formulaSummary: 'profiles × rate + one Ops Lead bonus total (not per profile)'
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
    const { base, profileCount, opsRate, reports } = await computeOpsBasePay(req.user._id, rateMap);
    const { tax, net } = applyTax(base);
    res.json({
      profileCount, opsRate, basePay: base.toFixed(2), pendingReports: reports.length,
      taxRate: TAX_RATE, taxAmount: tax.toFixed(2), netPay: net.toFixed(2),
      formulaSummary: 'profiles × ops lead rate (+ admin bonus at payout)'
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
    const open = await PayoutRequest.findOne({ userId: user._id, status: { $in: ['pending', 'confirmed'] } });
    if (open) return res.status(400).json({ error: 'You already have an open payout request (awaiting confirmation or payment).' });
    await PayoutRequest.create({ userId: user._id, role: user.role, status: 'pending' });
    res.json({ message: 'Request submitted. Admin or Financial manager will review.' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/payout-requests', authenticate, requireRole('admin', 'financial_manager'), async (req, res) => {
  try {
    const requests = await PayoutRequest.find({ status: { $in: ['pending', 'confirmed'] } })
      .populate('userId', 'name email role')
      .populate('confirmedBy', 'name email')
      .sort({ createdAt: -1 })
      .lean();
    requests.sort((a, b) => {
      const order = { pending: 0, confirmed: 1 };
      const oa = order[a.status] ?? 9;
      const ob = order[b.status] ?? 9;
      if (oa !== ob) return oa - ob;
      return new Date(b.createdAt) - new Date(a.createdAt);
    });

    const rateMap = await loadRateMap();
    for (const r of requests) {
      if (r.role !== 'ops_lead' || !r.userId?._id) continue;
      const bmIds = await User.find({ role: 'bid_manager', status: 'approved', opsLeadId: r.userId._id }).distinct('_id');
      const bms = await User.find({ _id: { $in: bmIds } }).select('name level');
      const teamBreakdown = [];
      for (const bm of bms) {
        const { reports: bmReports, profileRate, opsBonusTotal } = await computeBmBasePay(bm._id, rateMap);
        const bidderIds = await User.find({ role: 'bidder', status: 'approved', bidManagerId: bm._id }).distinct('_id');
        const bidderUsers = await User.find({ _id: { $in: bidderIds } }).select('name level');
        const bidders = [];
        for (const b of bidderUsers) {
          const { reports: bReports, rate: bidderRate } = await computeBidderBasePay(b._id, rateMap);
          if (bReports.length === 0) continue;
          const totalBids = bReports.reduce((s, rep) => s + (Number(rep.bidCount) || 0), 0);
          const bmBonus = bReports.reduce((s, rep) => s + (Number(rep.bidManagerBonus) || 0), 0);
          bidders.push({
            name: b.name,
            totalBidCount: totalBids,
            bmBonusTotal: Number(bmBonus.toFixed(2)),
            bidderRate,
            reportCount: bReports.length
          });
        }
        if (bidders.length > 0 || bmReports.length > 0) {
          teamBreakdown.push({
            bmName: bm.name,
            profileCount: bmReports.length,
            profileRate,
            opsBonusTotal: Number((opsBonusTotal || 0).toFixed(2)),
            bidders
          });
        }
      }
      r.teamBreakdown = teamBreakdown;
    }

    res.json({ requests });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/payout-requests/:id/confirm', authenticate, requireRole('admin', 'financial_manager'), async (req, res) => {
  try {
    const pr = await PayoutRequest.findById(req.params.id);
    if (!pr) return res.status(404).json({ error: 'Request not found' });
    if (pr.status !== 'pending') {
      return res.status(400).json({ error: 'Only requests awaiting confirmation can be confirmed' });
    }
    pr.status = 'confirmed';
    pr.confirmedAt = new Date();
    pr.confirmedBy = req.user._id;
    await pr.save();
    const populated = await PayoutRequest.findById(pr._id)
      .populate('userId', 'name email role')
      .populate('confirmedBy', 'name email')
      .lean();
    res.json({ success: true, request: populated });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/payout-requests/:id/decline', authenticate, requireRole('admin', 'financial_manager'), async (req, res) => {
  try {
    const { reason } = req.body;
    if (!reason || !String(reason).trim()) {
      return res.status(400).json({ error: 'A decline reason is required' });
    }
    const pr = await PayoutRequest.findById(req.params.id);
    if (!pr) return res.status(404).json({ error: 'Request not found' });
    if (pr.status === 'confirmed') {
      return res.status(400).json({ error: 'This request has already been confirmed and cannot be declined. Proceed to payment.' });
    }
    if (pr.status !== 'pending') {
      return res.status(400).json({ error: 'This request can no longer be declined' });
    }
    pr.status = 'declined';
    pr.declineReason = String(reason).trim().slice(0, 2000);
    pr.declinedAt = new Date();
    pr.declinedBy = req.user._id;
    await pr.save();
    const populated = await PayoutRequest.findById(pr._id)
      .populate('userId', 'name email role')
      .populate('declinedBy', 'name email')
      .lean();
    res.json({ success: true, request: populated });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** Current user: open payout request (pending = awaiting confirm, or confirmed = ready to pay) + most recent decline. */
router.get('/payout-request/me', authenticate, requireRole('bidder', 'bid_manager', 'ops_lead'), async (req, res) => {
  try {
    const pending = await PayoutRequest.findOne({ userId: req.user._id, status: { $in: ['pending', 'confirmed'] } })
      .sort({ createdAt: -1 })
      .lean();
    const lastDeclined = await PayoutRequest.findOne({ userId: req.user._id, status: 'declined' })
      .sort({ declinedAt: -1 })
      .lean();
    res.json({
      pending: pending || null,
      lastDeclined: lastDeclined
        ? {
            reason: lastDeclined.declineReason || '',
            declinedAt: lastDeclined.declinedAt
          }
        : null
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
