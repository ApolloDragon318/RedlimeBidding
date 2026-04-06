import mongoose from 'mongoose';

/** User asked Admin / FM to process their pending balance */
const payoutRequestSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  role: { type: String, required: true },
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'fulfilled', 'declined'],
    default: 'pending'
  },
  /** Set when Admin / Financial confirms a pending request (payment allowed after this). */
  confirmedAt: { type: Date },
  confirmedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  fulfilledAt: { type: Date },
  declineReason: { type: String, default: '' },
  declinedAt: { type: Date },
  declinedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { timestamps: true });

payoutRequestSchema.index({ userId: 1, status: 1 });

export default mongoose.model('PayoutRequest', payoutRequestSchema);
