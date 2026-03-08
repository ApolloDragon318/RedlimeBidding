import express from 'express';
import Report from '../models/Report.js';
import { authenticate, requireRole } from '../middleware/auth.js';

const router = express.Router();

router.post('/', authenticate, requireRole('bid_manager'), async (req, res) => {
  try {
    const { investigationManagerId, bidderName, profileName, bidCount, bonus, weekStartDate } = req.body;
    if (!investigationManagerId || !bidderName || !profileName || bidCount == null) {
      return res.status(400).json({ error: 'investigationManagerId, bidderName, profileName, bidCount required' });
    }
    const report = await Report.create({
      investigationManagerId,
      bidManagerId: req.user._id,
      bidderName,
      profileName,
      bidCount: Number(bidCount),
      bonus: Number(bonus) || 0,
      weekStartDate: weekStartDate ? new Date(weekStartDate) : getMonday(new Date())
    });
    const populated = await Report.findById(report._id)
      .populate('investigationManagerId', 'name email')
      .populate('bidManagerId', 'name email');
    res.status(201).json(populated);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/', authenticate, async (req, res) => {
  try {
    let filter = { paidAt: { $exists: false } };
    if (req.user.role === 'bid_manager') {
      filter.bidManagerId = req.user._id;
    } else if (req.user.role === 'investigation_manager') {
      filter.investigationManagerId = req.user._id;
    }
    const reports = await Report.find(filter)
      .populate('investigationManagerId', 'name email')
      .populate('bidManagerId', 'name email')
      .sort({ createdAt: -1 });
    res.json(reports);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.patch('/:id/approve', authenticate, requireRole('investigation_manager'), async (req, res) => {
  try {
    const report = await Report.findOne({
      _id: req.params.id,
      investigationManagerId: req.user._id
    });
    if (!report) return res.status(404).json({ error: 'Report not found' });
    report.status = 'approved';
    report.approvedAt = new Date();
    report.approvedBy = req.user._id;
    await report.save();
    const populated = await Report.findById(report._id)
      .populate('investigationManagerId', 'name email')
      .populate('bidManagerId', 'name email');
    res.json(populated);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/:id', authenticate, requireRole('bid_manager'), async (req, res) => {
  try {
    const report = await Report.findOne({ _id: req.params.id, bidManagerId: req.user._id });
    if (!report) return res.status(404).json({ error: 'Report not found' });
    if (report.status === 'approved') return res.status(400).json({ error: 'Cannot delete approved report' });
    await Report.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

function getMonday(d) {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(date.setDate(diff));
}

export default router;
