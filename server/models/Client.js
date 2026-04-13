import mongoose from 'mongoose';

const clientSchema = new mongoose.Schema({
  /** Company / account name — same record holds contact details. */
  name: { type: String, required: true, trim: true },
  email: { type: String, default: '', trim: true },
  /** Set when a user signs up as role `client` — one Client document per client user. */
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { timestamps: true });

clientSchema.index({ userId: 1 }, { unique: true, sparse: true });
clientSchema.index({ name: 1 }, { unique: true });

export default mongoose.model('Client', clientSchema);
