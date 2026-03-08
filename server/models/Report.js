import mongoose from 'mongoose';

const reportSchema = new mongoose.Schema({
  investigationManagerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  bidManagerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  bidderName: { type: String, required: true },
  profileName: { type: String, required: true },
  bidCount: { type: Number, required: true, min: 0 },
  bonus: { type: Number, required: true, default: 0 },
  status: {
    type: String,
    enum: ['pending', 'approved'],
    default: 'pending'
  },
  weekStartDate: { type: Date, required: true },
  approvedAt: { type: Date },
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  paidAt: { type: Date }
}, { timestamps: true });

export default mongoose.model('Report', reportSchema);
