import mongoose from 'mongoose';

/** Per-profile gate before any payout tied to reports for that profile (client or admin/FM when the profile has a client; admin/FM only otherwise). */
const profilePayoutApprovalSchema = new mongoose.Schema({
  profileId: { type: mongoose.Schema.Types.ObjectId, ref: 'ImProfile', required: true },
  opsLeadId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  reportIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Report' }],
  /** Sorted join of report ObjectIds — when pending report set changes, approvals reset */
  reportIdsSignature: { type: String, default: '' },
  clientApprovedAt: { type: Date, default: null },
  clientApprovedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  adminApprovedAt: { type: Date, default: null },
  adminApprovedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  /** Sum of client-facing totals for this profile (no tax line items; admin bonuses excluded in sync). */
  clientVisibleTotal: { type: Number, default: 0 },
  /** Aggregate worker gross for this profile before withholding (for admin tax display). */
  workerGrossTotal: { type: Number, default: 0 }
}, { timestamps: true });

profilePayoutApprovalSchema.index({ profileId: 1 }, { unique: true });

export default mongoose.model('ProfilePayoutApproval', profilePayoutApprovalSchema);
