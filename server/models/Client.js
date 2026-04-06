import mongoose from 'mongoose';

const clientSchema = new mongoose.Schema({
  /** Company / account name — same record holds contact details (no separate “investigation manager” entity). */
  name: { type: String, required: true, trim: true },
  email: { type: String, default: '', trim: true },
  opsLeadId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

clientSchema.index({ opsLeadId: 1, name: 1 }, { unique: true });

export default mongoose.model('Client', clientSchema);
