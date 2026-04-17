import express from 'express';
import mongoose from 'mongoose';
import SalaryConfig, { SALARY_ROLES, SALARY_LEVELS } from '../models/SalaryConfig.js';
import Report, { WORKFLOW } from '../models/Report.js';
import User from '../models/User.js';
import ImProfile from '../models/ImProfile.js';
import Client from '../models/Client.js';
import PaymentHistory from '../models/PaymentHistory.js';
import PersonPayoutHistory from '../models/PersonPayoutHistory.js';
import PayoutRequest from '../models/PayoutRequest.js';
import ProfilePayoutApproval from '../models/ProfilePayoutApproval.js';
import { authenticate, requireRole, requireApprovedIfClient } from '../middleware/auth.js';

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

const PENDING_ANY_ROLE_UNPAID = [
  { bidderPayoutPaidAt: { $exists: false } },
  { bidderPayoutPaidAt: null },
  { bmPayoutPaidAt: { $exists: false } },
  { bmPayoutPaidAt: null },
  { opsLeadPayoutPaidAt: { $exists: false } },
  { opsLeadPayoutPaidAt: null }
];

/** Profile ids that still have at least one confirmed report with any payout leg unpaid — same basis as payout queue / “all paid out”. */
async function getUnpaidProfileIds() {
  const pendingReports = await Report.find({
    workflowStatus: WORKFLOW.CONFIRMED,
    $or: PENDING_ANY_ROLE_UNPAID
  }).select('profileId').lean();
  return [...new Set(pendingReports.map(r => r.profileId).filter(Boolean))];
}

async function filterReportsByProfileApproval(reports) {
  if (!reports.length) return [];
  const profileIds = [...new Set(reports.map(r => r.profileId).filter(Boolean))];
  const noProfile = reports.filter(r => !r.profileId);
  if (profileIds.length === 0) return noProfile;
  const [docs, profiles] = await Promise.all([
    ProfilePayoutApproval.find({ profileId: { $in: profileIds } }).lean(),
    ImProfile.find({ _id: { $in: profileIds } }).select('clientId').lean()
  ]);
  const docMap = new Map(docs.map(d => [String(d.profileId), d]));
  const profMap = new Map(profiles.map(p => [String(p._id), p]));
  function isApproved(profileId) {
    if (!profileId) return true;
    const doc = docMap.get(String(profileId));
    const prof = profMap.get(String(profileId));
    if (!doc) return false;
    const needsClient = !!prof?.clientId;
    const adminOk = !!doc.adminApprovedAt;
    const clientOk = !!doc.clientApprovedAt;
    if (needsClient) return adminOk || clientOk;
    return adminOk;
  }
  return reports.filter(r => (r.profileId ? isApproved(r.profileId) : true));
}

async function computeBidderBasePay(bidderId, rateMap) {
  const user = await User.findById(bidderId).select('role level');
  const rate = user ? getRate(rateMap, 'bidder', user.level) : 0;
  let reports = await Report.find({
    bidderId,
    workflowStatus: WORKFLOW.CONFIRMED,
    bidderPayoutPaidAt: { $exists: false }
  });
  reports = await filterReportsByProfileApproval(reports);
  let base = 0;
  for (const r of reports) {
    base += (Number(r.bidCount) || 0) * rate + (Number(r.bidManagerBonus) || 0);
  }
  return { base, reports, rate };
}

async function computeBmBasePay(bmId, rateMap) {
  const user = await User.findById(bmId).select('role level');
  const profileRate = user ? getRate(rateMap, 'bid_manager', user.level) : 0;
  let reports = await Report.find({
    bidManagerId: bmId,
    workflowStatus: WORKFLOW.CONFIRMED,
    bmPayoutPaidAt: { $exists: false }
  });
  reports = await filterReportsByProfileApproval(reports);
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

/** Unfiltered — used for client cost table / sync allocation math (must not depend on approval gates). */
async function computeOpsBasePayRaw(opsLeadId, rateMap) {
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

async function computeOpsBasePay(opsLeadId, rateMap) {
  const raw = await computeOpsBasePayRaw(opsLeadId, rateMap);
  const reports = await filterReportsByProfileApproval(raw.reports);
  const profileCount = reports.length;
  const base = profileCount * raw.opsRate;
  return { base, reports, profileCount, opsRate: raw.opsRate };
}

/**
 * Same rules as POST /client-payout-table — adminBonuses from FM at payout time (often empty in sync).
 * Rows include profileId, bmShare, opsShare for totals and admin tax view.
 */
async function buildPayoutRowsFromPendingReports(pendingReports, rateMap, adminBonuses) {
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

  const opsTeamBonusByBm = new Map();
  const profileCountByBm = new Map();
  const profileCountByOps = new Map();
  const bmToOps = new Map();

  for (const r of pendingReports) {
    const bmId = String(r.bidManagerId);
    profileCountByBm.set(bmId, (profileCountByBm.get(bmId) || 0) + 1);
    const ob = Number(r.opsLeadTeamBonus);
    opsTeamBonusByBm.set(bmId, (opsTeamBonusByBm.get(bmId) || 0) + (Number.isFinite(ob) ? ob : 0));
  }

  for (const bmId of profileCountByBm.keys()) {
    const bm = await getBm(bmId);
    if (!bm?.opsLeadId) continue;
    const olId = String(bm.opsLeadId);
    bmToOps.set(bmId, olId);
    profileCountByOps.set(olId, (profileCountByOps.get(olId) || 0) + profileCountByBm.get(bmId));
  }

  const opsLeads = await User.find({ role: 'ops_lead', status: 'approved' }).select('_id level');
  const opsBasePerReport = new Map();
  for (const ol of opsLeads) {
    const { reports: opsReports, profileCount: opsProfCount, opsRate } = await computeOpsBasePayRaw(ol._id, rateMap);
    const opsTotal = opsProfCount * opsRate;
    const perReport = opsReports.length > 0 ? opsTotal / opsReports.length : 0;
    opsBasePerReport.set(String(ol._id), perReport);
  }

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
    const bmToBidderBonus = Number(r.bidManagerBonus) || 0;
    const bidderPay = (Number(r.bidCount) || 0) * bidderRate + Math.max(0, bmToBidderBonus);
    const profileRate = getRate(rateMap, 'bid_manager', bm.level);
    const bmCount = profileCountByBm.get(bmIdStr) || 1;
    const opsTeamBonusRaw = opsTeamBonusByBm.get(bmIdStr) || 0;
    const opsTeamBonusPerProfile = opsTeamBonusRaw > 0 ? opsTeamBonusRaw / bmCount : 0;
    const adminBmBonusRaw = Number(adminBonuses[bmIdStr]) || 0;
    const adminBmBonusPerProfile = adminBmBonusRaw > 0 ? adminBmBonusRaw / bmCount : 0;
    const opsBasePR = opsBasePerReport.get(olId) || 0;
    const opsCount = profileCountByOps.get(olId) || 1;
    const adminOpsBonusRaw = Number(adminBonuses[olId]) || 0;
    const adminOpsBonusPerProfile = adminOpsBonusRaw > 0 ? adminOpsBonusRaw / opsCount : 0;
    const bmShare = profileRate + opsTeamBonusPerProfile + adminBmBonusPerProfile;
    const opsShare = opsBasePR + adminOpsBonusPerProfile;
    const profilePay = bmShare + opsShare;
    const total = bidderPay + profilePay;
    const profileDoc = await getProfile(r.profileId);
    const clientName = profileDoc?.clientId?.name || 'Unknown';
    const clientIdStr = profileDoc?.clientId?._id ? String(profileDoc.clientId._id) : 'unknown';
    const bidCountN = Number(r.bidCount) || 0;
    const bidderPayFromBids = bidCountN * bidderRate;
    const bmBonusToBidder = Math.max(0, bmToBidderBonus);
    rows.push({
      reportId: r._id,
      profileId: r.profileId,
      clientId: clientIdStr,
      clientName,
      profileName: r.profileName,
      bidderName: bidder?.name || r.bidderName,
      bidManagerName: bm.name,
      bidderPay: Number(bidderPay.toFixed(2)),
      bmShare: Number(bmShare.toFixed(2)),
      opsShare: Number(opsShare.toFixed(2)),
      profilePay: Number(profilePay.toFixed(2)),
      total: Number(total.toFixed(2)),
      clientBreakdown: {
        bidCount: bidCountN,
        bidderRatePerBid: Number(bidderRate.toFixed(4)),
        bidderLevel: bidder?.level || null,
        bidderPayFromBids: Number(bidderPayFromBids.toFixed(2)),
        bidManagerBonusToBidder: Number(bmBonusToBidder.toFixed(2)),
        bmRatePerProfile: Number(profileRate.toFixed(4)),
        bmLevel: bm.level || null,
        opsTeamBonusShare: Number(opsTeamBonusPerProfile.toFixed(2)),
        adminBmBonusShare: Number(adminBmBonusPerProfile.toFixed(2)),
        bmLayerSubtotal: Number(bmShare.toFixed(2)),
        opsBaseShare: Number(opsBasePR.toFixed(2)),
        adminOpsBonusShare: Number(adminOpsBonusPerProfile.toFixed(2)),
        opsLayerSubtotal: Number(opsShare.toFixed(2)),
        profilePay: Number(profilePay.toFixed(2)),
        total: Number(total.toFixed(2))
      }
    });
  }
  return rows;
}

/** Upsert ProfilePayoutApproval per profile with unpaid confirmed reports; reset approvals when report set changes. */
async function syncProfilePayoutApprovals() {
  const rateMap = await loadRateMap();
  const pendingReports = await Report.find({
    workflowStatus: WORKFLOW.CONFIRMED,
    $or: PENDING_ANY_ROLE_UNPAID
  }).lean();

  const groups = new Map();
  for (const r of pendingReports) {
    if (!r.profileId) continue;
    const k = String(r.profileId);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  }

  const rows = await buildPayoutRowsFromPendingReports(pendingReports, rateMap, {});
  const byProfile = new Map();
  for (const row of rows) {
    if (!row.profileId) continue;
    const k = String(row.profileId);
    if (!byProfile.has(k)) byProfile.set(k, { clientSum: 0, workerSum: 0 });
    const o = byProfile.get(k);
    o.clientSum += row.total;
    o.workerSum += row.bidderPay + row.profilePay;
  }

  const activeIds = [...groups.keys()].map(id => new mongoose.Types.ObjectId(id));
  if (activeIds.length === 0) {
    await ProfilePayoutApproval.deleteMany({});
    return;
  }
  await ProfilePayoutApproval.deleteMany({ profileId: { $nin: activeIds } });

  for (const [pidStr, reps] of groups) {
    const sorted = [...reps].sort((a, b) => String(a._id).localeCompare(String(b._id)));
    const sig = sorted.map(r => String(r._id)).join(',');
    const first = sorted[0];
    const bm = await User.findById(first.bidManagerId).select('opsLeadId').lean();
    if (!bm?.opsLeadId) {
      await ProfilePayoutApproval.deleteMany({ profileId: new mongoose.Types.ObjectId(pidStr) });
      continue;
    }
    const sums = byProfile.get(pidStr) || { clientSum: 0, workerSum: 0 };
    let doc = await ProfilePayoutApproval.findOne({ profileId: pidStr });
    if (!doc) {
      await ProfilePayoutApproval.create({
        profileId: new mongoose.Types.ObjectId(pidStr),
        opsLeadId: bm.opsLeadId,
        reportIds: sorted.map(r => r._id),
        reportIdsSignature: sig,
        clientVisibleTotal: Number(sums.clientSum.toFixed(2)),
        workerGrossTotal: Number(sums.workerSum.toFixed(2))
      });
    } else {
      if (doc.reportIdsSignature !== sig) {
        doc.clientApprovedAt = null;
        doc.clientApprovedBy = null;
        doc.adminApprovedAt = null;
        doc.adminApprovedBy = null;
      }
      doc.reportIds = sorted.map(r => r._id);
      doc.reportIdsSignature = sig;
      doc.opsLeadId = bm.opsLeadId;
      doc.clientVisibleTotal = Number(sums.clientSum.toFixed(2));
      doc.workerGrossTotal = Number(sums.workerSum.toFixed(2));
      await doc.save();
    }
  }
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
    await syncProfilePayoutApprovals();
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

    res.json({ tree, rows: flatRows, taxRate: TAX_RATE });
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
    await syncProfilePayoutApprovals();
    const rateMap = await loadRateMap();
    const adminBonuses = req.body.adminBonuses && typeof req.body.adminBonuses === 'object'
      ? req.body.adminBonuses : {};

    const pendingReports = await Report.find({
      workflowStatus: WORKFLOW.CONFIRMED,
      $or: PENDING_ANY_ROLE_UNPAID
    }).lean();

    const rows = await buildPayoutRowsFromPendingReports(pendingReports, rateMap, adminBonuses);

    const Client = (await import('../models/Client.js')).default;
    const allClients = await Client.find({}).lean();
    const clientTypeMap = new Map(allClients.map(c => [String(c._id), c.clientType || 'external']));

    const internalRows = rows.filter(r => clientTypeMap.get(r.clientId) === 'internal');

    const summaryMap = new Map();
    for (const row of internalRows) {
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
      rows: internalRows,
      clientSummaries: [...summaryMap.values()],
      taxRate: TAX_RATE
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/pay/:userId', authenticate, requireRole('admin', 'financial_manager'), async (req, res) => {
  try {
    await syncProfilePayoutApprovals();
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
      { userId: user._id, status: { $in: ['pending', 'confirmed'] } },
      { $set: { status: 'fulfilled', fulfilledAt: new Date() } }
    );

    res.json({ success: true, payout: record });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/expected-pay', authenticate, requireRole('bid_manager'), async (req, res) => {
  try {
    await syncProfilePayoutApprovals();
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
    await syncProfilePayoutApprovals();
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
    await syncProfilePayoutApprovals();
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
    await syncProfilePayoutApprovals();
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
    await PayoutRequest.create({
      userId: user._id,
      role: user.role,
      status: 'confirmed',
      confirmedAt: new Date()
    });
    res.json({ message: 'Request submitted. Per-profile approval (client or admin/FM when the profile has a client) is still required before payout.' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/payout-requests', authenticate, requireRole('admin', 'financial_manager'), async (req, res) => {
  try {
    await syncProfilePayoutApprovals();
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

router.get('/profile-payout-approvals', authenticate, requireRole('admin', 'financial_manager'), async (req, res) => {
  try {
    await syncProfilePayoutApprovals();
    const profileIdsWithUnpaid = await getUnpaidProfileIds();
    const list = profileIdsWithUnpaid.length === 0
      ? []
      : await ProfilePayoutApproval.find({ profileId: { $in: profileIdsWithUnpaid } })
        .populate('profileId', 'name clientId')
        .populate('opsLeadId', 'name email')
        .populate('clientApprovedBy', 'name email')
        .populate('adminApprovedBy', 'name email')
        .sort({ updatedAt: -1 })
        .lean();
    const approvals = list.map(a => {
      const wg = Number(a.workerGrossTotal) || 0;
      const { tax, net } = applyTax(wg);
      return {
        ...a,
        taxRate: TAX_RATE,
        taxAmount: tax,
        netAfterTax: net
      };
    });
    res.json({ approvals });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/profile-payout-approvals/me', authenticate, requireRole('client'), requireApprovedIfClient, async (req, res) => {
  try {
    await syncProfilePayoutApprovals();
    const clientDoc = await Client.findOne({ userId: req.user._id });
    if (!clientDoc) return res.json({ approvals: [] });
    const profiles = await ImProfile.find({ clientId: clientDoc._id }).select('_id').lean();
    const unpaidProfileIds = await getUnpaidProfileIds();
    const unpaidSet = new Set(unpaidProfileIds.map(id => String(id)));
    const pids = profiles.map(p => p._id).filter(pid => unpaidSet.has(String(pid)));
    const list = pids.length === 0
      ? []
      : await ProfilePayoutApproval.find({ profileId: { $in: pids } })
      .populate('profileId', 'name')
      .populate('opsLeadId', 'name')
      .sort({ updatedAt: -1 })
      .lean();

    const rateMap = await loadRateMap();
    const pendingReports = await Report.find({
      workflowStatus: WORKFLOW.CONFIRMED,
      $or: PENDING_ANY_ROLE_UNPAID
    }).lean();
    const payoutRows = await buildPayoutRowsFromPendingReports(pendingReports, rateMap, {});
    const rowsByProfile = new Map();
    for (const row of payoutRows) {
      const pid = String(row.profileId);
      if (!rowsByProfile.has(pid)) rowsByProfile.set(pid, []);
      rowsByProfile.get(pid).push(row);
    }

    const approvals = list.map(a => {
      const pid = String(a.profileId?._id || a.profileId);
      const lines = rowsByProfile.get(pid) || [];
      const reportBreakdown = lines.map(row => ({
        reportId: row.reportId,
        reportTitle: row.profileName,
        bidderName: row.bidderName,
        bidManagerName: row.bidManagerName,
        bidderPay: row.bidderPay,
        profilePay: row.profilePay,
        total: row.total,
        breakdown: row.clientBreakdown
      }));
      const sumFromLines = reportBreakdown.reduce((s, x) => s + x.total, 0);
      return {
        _id: a._id,
        profileId: a.profileId,
        profileName: a.profileId?.name,
        opsLeadName: a.opsLeadId?.name,
        totalAmount: a.clientVisibleTotal,
        reportCount: (a.reportIds || []).length,
        clientApprovedAt: a.clientApprovedAt,
        adminApprovedAt: a.adminApprovedAt,
        canApprove: !(a.clientApprovedAt || a.adminApprovedAt),
        reportBreakdown,
        breakdownTotalCheck: Number(sumFromLines.toFixed(2))
      };
    });
    res.json({ approvals });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/profile-payout-approvals/:id/client-approve', authenticate, requireRole('client'), requireApprovedIfClient, async (req, res) => {
  try {
    await syncProfilePayoutApprovals();
    const clientDoc = await Client.findOne({ userId: req.user._id });
    if (!clientDoc) return res.status(403).json({ error: 'No client account linked' });
    const doc = await ProfilePayoutApproval.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Not found' });
    const prof = await ImProfile.findById(doc.profileId);
    if (!prof || String(prof.clientId) !== String(clientDoc._id)) {
      return res.status(403).json({ error: 'Not your profile' });
    }
    doc.clientApprovedAt = new Date();
    doc.clientApprovedBy = req.user._id;
    await doc.save();
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/profile-payout-approvals/:id/admin-approve', authenticate, requireRole('admin', 'financial_manager'), async (req, res) => {
  try {
    await syncProfilePayoutApprovals();
    const doc = await ProfilePayoutApproval.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Not found' });
    doc.adminApprovedAt = new Date();
    doc.adminApprovedBy = req.user._id;
    await doc.save();
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export { syncProfilePayoutApprovals };
export default router;
