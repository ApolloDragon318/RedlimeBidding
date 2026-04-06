import mongoose from 'mongoose';

const walletChangeRequestSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  previousWallet: { type: String, default: null },
  requestedWallet: { type: String, required: true },
  userNote: { type: String, default: '' },
  status: { type: String, enum: ['pending', 'approved', 'declined'], default: 'pending' },
  declineReason: { type: String, default: '' },
  decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  decidedAt: { type: Date, default: null }
}, { timestamps: true });

walletChangeRequestSchema.index({ status: 1, createdAt: -1 });
walletChangeRequestSchema.index({ userId: 1, status: 1 });

export default mongoose.model('WalletChangeRequest', walletChangeRequestSchema);
