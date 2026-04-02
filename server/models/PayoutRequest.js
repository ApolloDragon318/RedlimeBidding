import mongoose from 'mongoose';

/** User asked Admin / FM to process their pending balance */
const payoutRequestSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  role: { type: String, required: true },
  status: { type: String, enum: ['pending', 'fulfilled'], default: 'pending' },
  fulfilledAt: { type: Date }
}, { timestamps: true });

payoutRequestSchema.index({ userId: 1, status: 1 });

export default mongoose.model('PayoutRequest', payoutRequestSchema);
