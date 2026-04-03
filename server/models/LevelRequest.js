import mongoose from 'mongoose';

const levelRequestSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  currentLevel: { type: String, required: true },
  newLevel: { type: String, required: true },
  reason: { type: String, required: true },
  status: { type: String, enum: ['pending', 'approved', 'declined'], default: 'pending' },
  decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  declineReason: { type: String, default: '' },
  decidedAt: { type: Date, default: null }
}, { timestamps: true });

levelRequestSchema.index({ status: 1, createdAt: -1 });

export default mongoose.model('LevelRequest', levelRequestSchema);
