import mongoose from 'mongoose';

const personPayoutHistorySchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  name: { type: String, required: true },
  role: { type: String, required: true },
  basePay: { type: Number, required: true },
  adminBonus: { type: Number, required: true, default: 0 },
  totalPay: { type: Number, required: true },
  walletAddress: { type: String, default: null },
  /** On-chain or transfer reference proving payment */
  txId: { type: String, default: '', trim: true }
}, { timestamps: true });

export default mongoose.model('PersonPayoutHistory', personPayoutHistorySchema);
