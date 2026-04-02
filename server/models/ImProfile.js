import mongoose from 'mongoose';

const imProfileSchema = new mongoose.Schema({
  opsLeadId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  name: { type: String, required: true, trim: true },
  assignedBidderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { timestamps: true });

imProfileSchema.index({ opsLeadId: 1, name: 1 }, { unique: true });

export default mongoose.model('ImProfile', imProfileSchema);
