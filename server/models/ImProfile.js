import mongoose from 'mongoose';

const imProfileSchema = new mongoose.Schema({
  /** Set when an Ops Lead creates the profile or when a bidder is assigned (from BM’s Ops Lead). Client-created profiles start null. */
  opsLeadId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  clientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Client',
    default: null
  },
  name: { type: String, required: true, trim: true },
  assignedBidderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { timestamps: true });

/** Profile names are unique per client (sparse allows legacy rows without clientId). */
imProfileSchema.index({ clientId: 1, name: 1 }, { unique: true, sparse: true });

export default mongoose.model('ImProfile', imProfileSchema);
