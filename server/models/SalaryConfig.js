import mongoose from 'mongoose';

const SALARY_ROLES = ['bidder', 'bid_manager', 'ops_lead'];
const SALARY_LEVELS = ['junior', 'mid_level', 'senior', 'staff'];

const salaryConfigSchema = new mongoose.Schema({
  role: { type: String, enum: SALARY_ROLES, required: true },
  level: { type: String, enum: SALARY_LEVELS, required: true },
  rate: { type: Number, required: true, default: 0 }
}, { timestamps: true });

salaryConfigSchema.index({ role: 1, level: 1 }, { unique: true });

export { SALARY_ROLES, SALARY_LEVELS };
export default mongoose.model('SalaryConfig', salaryConfigSchema);
