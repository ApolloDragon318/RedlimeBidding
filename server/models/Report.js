import mongoose from 'mongoose';

export const WORKFLOW = {
  AWAITING_BID_MANAGER: 'awaiting_bid_manager',
  /** Bid manager sent back to bidder; PATCH resubmits to awaiting_bid_manager */
  AWAITING_BIDDER_REVISION: 'awaiting_bidder_revision',
  AWAITING_OPS_LEAD: 'awaiting_ops_lead',
  CONFIRMED: 'confirmed',
  /** Legacy rows only; new declines rewind workflow instead */
  DECLINED: 'declined',
  /** @deprecated — no longer assigned; kept for legacy DB documents */
  AWAITING_INVESTIGATION: 'awaiting_investigation'
};

const reportSchema = new mongoose.Schema({
  profileId: { type: mongoose.Schema.Types.ObjectId, ref: 'ImProfile' },
  bidManagerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  bidderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  bidderName: { type: String, required: true },
  profileName: { type: String, required: true },
  bidCount: { type: Number, required: true, min: 0 },
  /** @deprecated use bidManagerBonus + opsLeadTeamBonus; kept for legacy rows */
  bonus: { type: Number, default: 0 },
  bidManagerBonus: { type: Number, default: 0 },
  opsLeadTeamBonus: { type: Number, default: 0 },
  workflowStatus: {
    type: String,
    enum: Object.values(WORKFLOW),
    default: WORKFLOW.AWAITING_BID_MANAGER
  },
  bidManagerApprovedAt: { type: Date },
  bidManagerApprovedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  opsLeadApprovedAt: { type: Date },
  opsLeadApprovedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  declinedAt: { type: Date },
  declinedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  declinedByRole: { type: String },
  declineReason: { type: String },
  weekStartDate: { type: Date, required: true },
  /** Legacy batch flag; prefer per-role payout flags below */
  paidAt: { type: Date },
  bidderPayoutPaidAt: { type: Date },
  bmPayoutPaidAt: { type: Date },
  opsLeadPayoutPaidAt: { type: Date }
}, { timestamps: true });

export default mongoose.model('Report', reportSchema);
