import mongoose from 'mongoose';

const passwordResetRequestSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  status: {
    type: String,
    enum: ['pending', 'approved', 'dismissed'],
    default: 'pending'
  },
  approvedAt: { type: Date },
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { timestamps: true });

passwordResetRequestSchema.index({ userId: 1, status: 1 });

export default mongoose.model('PasswordResetRequest', passwordResetRequestSchema);
