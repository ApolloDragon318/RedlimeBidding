import express from 'express';
import SalaryConfig from '../models/SalaryConfig.js';
import Report from '../models/Report.js';
import User from '../models/User.js';
import PaymentHistory from '../models/PaymentHistory.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { TAX_PER_PROFILE, TAX_PER_BID } from '../constants/tax.js';

const router = express.Router();

const DEFAULT_BM_SALARY = 10;
const DEFAULT_BIDDER_SALARY = 0.08;

function getConfigForBidManager(bidManagerId, configsMap) {
  const id = (bidManagerId?._id ?? bidManagerId)?.toString?.();
  const c = configsMap.get(id);
  return {
    bidManagerSalaryPerProfile: Number(c?.bidManagerSalaryPerProfile ?? DEFAULT_BM_SALARY),
    bidderSalaryPerBid: Number(c?.bidderSalaryPerBid ?? DEFAULT_BIDDER_SALARY)
  };
}

router.get('/', authenticate, requireRole('admin'), async (req, res) => {
  try {
    const configs = await SalaryConfig.find().populate('bidManagerId', 'name email');
    const bidManagers = await User.find({ role: 'bid_manager', status: 'approved' }).select('-password');
    const configMap = Object.fromEntries(configs.map(c => [c.bidManagerId?._id?.toString(), c]));
    const result = bidManagers.map(bm => {
      const cfg = configMap[bm._id.toString()];
      return {
        bidManagerId: bm._id,
        bidManager: { id: bm._id, name: bm.name, email: bm.email },
        bidManagerSalaryPerProfile: cfg?.bidManagerSalaryPerProfile ?? DEFAULT_BM_SALARY,
        bidderSalaryPerBid: cfg?.bidderSalaryPerBid ?? DEFAULT_BIDDER_SALARY
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
    const { bidManagerSalaryPerProfile, bidderSalaryPerBid } = req.body;
    const bm = await User.findOne({ _id: bidManagerId, role: 'bid_manager' });
    if (!bm) return res.status(404).json({ error: 'Bid manager not found' });
    let config = await SalaryConfig.findOne({ bidManagerId });
    if (!config) config = new SalaryConfig({ bidManagerId });
    if (bidManagerSalaryPerProfile != null) config.bidManagerSalaryPerProfile = Number(bidManagerSalaryPerProfile);
    if (bidderSalaryPerBid != null) config.bidderSalaryPerBid = Number(bidderSalaryPerBid);
    await config.save();
    const populated = await SalaryConfig.findById(config._id).populate('bidManagerId', 'name email');
    res.json(populated);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/calculations', authenticate, requireRole('admin'), async (req, res) => {
  try {
    const configs = await SalaryConfig.find();
    const configsMap = new Map(configs.map(c => [c.bidManagerId?.toString(), c]));
    const reports = await Report.find({ status: 'approved', paidAt: { $exists: false } })
      .populate('investigationManagerId', 'name')
      .populate('bidManagerId', 'name');

    const calculations = [];
    let totalDeductions = 0;
    for (const r of reports) {
      const cfg = getConfigForBidManager(r.bidManagerId, configsMap);
      const bidCount = Number(r.bidCount) || 0;
      const bonus = Number(r.bonus) || 0;
      const bidderAmount = bidCount * cfg.bidderSalaryPerBid;
      const bidManagerAmount = 1 * cfg.bidManagerSalaryPerProfile;
      const gross = bidderAmount + bidManagerAmount + bonus;
      const deductions = 1 * TAX_PER_PROFILE + bidCount * TAX_PER_BID;
      totalDeductions += deductions;
      const totalAmount = gross;
      calculations.push({
        reportId: r._id,
        profileName: r.profileName,
        bidderName: r.bidderName,
        investigationManager: r.investigationManagerId?.name,
        bidManager: r.bidManagerId?.name,
        bidManagerId: r.bidManagerId?._id,
        weekStartDate: r.weekStartDate,
        bidCount,
        bonus,
        bidderAmount: bidderAmount.toFixed(2),
        bidManagerAmount: bidManagerAmount.toFixed(2),
        totalAmount: totalAmount.toFixed(2),
        rates: `$${cfg.bidManagerSalaryPerProfile}/profile, $${cfg.bidderSalaryPerBid}/bid`
      });
    }

    const grandTotal = calculations.reduce((sum, c) => sum + parseFloat(c.totalAmount), 0);

    res.json({
      calculations,
      grandTotal: grandTotal.toFixed(2),
      totalDeductions: totalDeductions.toFixed(2)
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/expected-pay', authenticate, requireRole('bid_manager'), async (req, res) => {
  try {
    const configs = await SalaryConfig.find();
    const configsMap = new Map(configs.map(c => [c.bidManagerId?.toString(), c]));
    const cfg = getConfigForBidManager(req.user._id, configsMap);
    const reports = await Report.find({ bidManagerId: req.user._id, status: 'approved', paidAt: { $exists: false } })
      .populate('investigationManagerId', 'name');
    const bmRate = cfg.bidManagerSalaryPerProfile;
    const bidderRate = cfg.bidderSalaryPerBid;
    const perProfile = reports.map(r => {
      const bc = Number(r.bidCount) || 0;
      const bn = Number(r.bonus) || 0;
      const safe = (n) => (typeof n === 'number' && !isNaN(n) ? n : 0);
      const profilePay = bc * bidderRate;
      const bidManagementPay = 1 * bmRate;
      const gross = profilePay + bidManagementPay + bn;
      const deductions = 1 * TAX_PER_PROFILE + bc * TAX_PER_BID;
      const net = gross - deductions;
      const formulaParts = [
        1 > 0 && `1 × $${bmRate}`,
        bc > 0 && `${bc} × $${bidderRate}`,
        bn > 0 && `$${bn} bonus`
      ].filter(Boolean);
      const formula = formulaParts.length
        ? `${formulaParts.join(' + ')} - $${safe(deductions).toFixed(2)} = $${safe(net).toFixed(2)}`
        : `—`;
      const bidderFormulaParts = [
        bc > 0 && `${bc} × $${bidderRate}`,
        bn > 0 && `$${bn} bonus`
      ].filter(Boolean);
      const bidderDeduction = bc * TAX_PER_BID;
      const bidManagementDeduction = 1 * TAX_PER_PROFILE;
      const bidderNet = profilePay + bn - bidderDeduction;
      const bidManagementNet = bidManagementPay - bidManagementDeduction;
      const tableFormula = bidderFormulaParts.length
        ? `${bidderFormulaParts.join(' + ')} - $${safe(bidderDeduction).toFixed(2)} = $${safe(bidderNet).toFixed(2)}`
        : `—`;
      return {
        reportId: r._id,
        profileName: r.profileName,
        bidderName: r.bidderName,
        weekStartDate: r.weekStartDate,
        bidCount: bc,
        bonus: bn,
        gross: safe(gross).toFixed(2),
        profilePay: safe(profilePay).toFixed(2),
        bidManagementPay: safe(bidManagementPay).toFixed(2),
        bidderNet: safe(bidderNet).toFixed(2),
        bidManagementNet: safe(bidManagementNet).toFixed(2),
        deductions: safe(deductions).toFixed(2),
        net: safe(net).toFixed(2),
        formula,
        tableFormula,
        bmRate,
        bidderRate,
        rates: `$${bmRate}/profile, $${bidderRate}/bid`
      };
    });
    const totalBidderWorkNet = perProfile.reduce((s, p) => s + parseFloat(p.bidderNet || 0), 0);
    const totalBidManagementNet = perProfile.reduce((s, p) => s + parseFloat(p.bidManagementNet || 0), 0);
    const totalNet = totalBidderWorkNet + totalBidManagementNet;
    res.json({
      perProfile,
      total: (isNaN(totalNet) ? 0 : totalNet).toFixed(2),
      totalBidderWork: (isNaN(totalBidderWorkNet) ? 0 : totalBidderWorkNet).toFixed(2),
      totalBidManagement: (isNaN(totalBidManagementNet) ? 0 : totalBidManagementNet).toFixed(2),
      taxDeducted: true
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/expected-pay-im', authenticate, requireRole('investigation_manager'), async (req, res) => {
  try {
    const configs = await SalaryConfig.find();
    const configsMap = new Map(configs.map(c => [c.bidManagerId?.toString(), c]));
    const reports = await Report.find({ investigationManagerId: req.user._id, status: 'approved', paidAt: { $exists: false } })
      .populate('bidManagerId', 'name');
    const perProfile = reports.map(r => {
      const c = getConfigForBidManager(r.bidManagerId, configsMap);
      const bidCount = Number(r.bidCount) || 0;
      const bonus = Number(r.bonus) || 0;
      const bidManagerAmount = 1 * c.bidManagerSalaryPerProfile;
      const bidderAmount = bidCount * c.bidderSalaryPerBid;
      const gross = bidManagerAmount + bidderAmount + bonus;
      const formulaParts = [
        `1 × $${c.bidManagerSalaryPerProfile}`,
        bidCount > 0 && `${bidCount} × $${c.bidderSalaryPerBid}`,
        bonus > 0 && `$${bonus} bonus`
      ].filter(Boolean);
      const formula = `${formulaParts.join(' + ')} = $${gross.toFixed(2)}`;
      const bmRate = c.bidManagerSalaryPerProfile;
      const bidderRate = c.bidderSalaryPerBid;
      return {
        reportId: r._id,
        profileName: r.profileName,
        bidderName: r.bidderName,
        bidManager: r.bidManagerId?.name,
        bidManagerId: r.bidManagerId?._id,
        weekStartDate: r.weekStartDate,
        bidCount,
        bonus,
        gross: gross.toFixed(2),
        bidManagerAmount: bidManagerAmount.toFixed(2),
        bidderAmount: bidderAmount.toFixed(2),
        formula,
        bmRate,
        bidderRate,
        rates: `$${bmRate}/profile, $${bidderRate}/bid`
      };
    });
    const totalGross = perProfile.reduce((s, p) => s + parseFloat(p.gross), 0);
    res.json({ perProfile, total: totalGross.toFixed(2), taxDeducted: false });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/pay-per-team', authenticate, requireRole('admin'), async (req, res) => {
  try {
    const configs = await SalaryConfig.find();
    const configsMap = new Map(configs.map(c => [c.bidManagerId?.toString(), c]));
    const reports = await Report.find({ status: 'approved', paidAt: { $exists: false } })
      .populate('bidManagerId', 'name');
    const byTeam = {};
    for (const r of reports) {
      const cfg = getConfigForBidManager(r.bidManagerId, configsMap);
      const bidCount = Number(r.bidCount) || 0;
      const bonus = Number(r.bonus) || 0;
      const gross = 1 * cfg.bidManagerSalaryPerProfile + bidCount * cfg.bidderSalaryPerBid + bonus;
      const deductions = 1 * TAX_PER_PROFILE + bidCount * TAX_PER_BID;
      const net = gross - deductions;
      const bmId = r.bidManagerId?.toString?.() || 'unknown';
      if (!byTeam[bmId]) byTeam[bmId] = { bidManager: r.bidManagerId?.name || 'Unknown', totalPay: 0 };
      byTeam[bmId].totalPay += net;
    }
    const teams = Object.entries(byTeam).map(([id, t]) => ({ bidManagerId: id, bidManager: t.bidManager, totalPay: t.totalPay.toFixed(2) }));
    res.json({ teams });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/mark-paid', authenticate, requireRole('admin'), async (req, res) => {
  try {
    const reports = await Report.find({ status: 'approved', paidAt: { $exists: false } });
    if (reports.length === 0) return res.status(400).json({ error: 'No reports to mark as paid' });

    const configs = await SalaryConfig.find();
    const configsMap = new Map(configs.map(c => [c.bidManagerId?.toString(), c]));
    let grandTotal = 0;
    let totalDeductions = 0;
    for (const r of reports) {
      const cfg = getConfigForBidManager(r.bidManagerId, configsMap);
      const bidCount = Number(r.bidCount) || 0;
      const bonus = Number(r.bonus) || 0;
      const gross = 1 * cfg.bidManagerSalaryPerProfile + bidCount * cfg.bidderSalaryPerBid + bonus;
      const deductions = 1 * TAX_PER_PROFILE + bidCount * TAX_PER_BID;
      grandTotal += gross;
      totalDeductions += deductions;
    }

    const history = await PaymentHistory.create({
      grandTotal,
      totalDeducted: totalDeductions,
      reportCount: reports.length
    });

    await Report.updateMany(
      { status: 'approved', paidAt: { $exists: false } },
      { $set: { paidAt: new Date() } }
    );

    res.json({ success: true, history });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/history', authenticate, requireRole('admin'), async (req, res) => {
  try {
    const history = await PaymentHistory.find().sort({ createdAt: -1 });
    res.json(history);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
