import mongoose from 'mongoose';

const salaryConfigSchema = new mongoose.Schema({
  bidManagerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  bidManagerSalaryPerProfile: { type: Number, required: true, default: 10 }
}, { timestamps: true });

export default mongoose.model('SalaryConfig', salaryConfigSchema);
