import mongoose from 'mongoose';

const paymentHistorySchema = new mongoose.Schema({
  grandTotal: { type: Number, required: true },
  totalDeducted: { type: Number, required: true, default: 0 },
  reportCount: { type: Number, required: true, default: 0 }
}, { timestamps: true });

export default mongoose.model('PaymentHistory', paymentHistorySchema);
