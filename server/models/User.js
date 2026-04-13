import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const ROLE_ENUM = [
  'applicant',
  'bidder',
  'bid_manager',
  'ops_lead',
  'admin',
  'financial_manager',
  'client'
];

const STATUS_ENUM = ['pending_onboarding', 'pending_ops', 'pending_admin', 'approved', 'rejected'];

const LEVEL_ENUM = ['junior', 'mid_level', 'senior', 'staff'];

const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  /** Display name — synced from legal names when present */
  name: { type: String, required: true },
  legalFirstName: { type: String, default: '' },
  legalMiddleName: { type: String, default: '' },
  legalLastName: { type: String, default: '' },
  phone: { type: String, default: '' },
  linkedinUrl: { type: String, default: '' },
  facebookUrl: { type: String, default: '' },
  address: { type: String, default: '' },
  nationality: { type: String, default: '' },
  country: { type: String, default: '' },
  state: { type: String, default: '' },
  nationalIdFile: {
    path: { type: String, default: '' },
    originalName: { type: String, default: '' }
  },
  /** Profile / headshot photo */
  photoFile: {
    path: { type: String, default: '' },
    originalName: { type: String, default: '' }
  },
  role: {
    type: String,
    enum: ROLE_ENUM,
    required: true
  },
  /** Seniority — set by Ops with role */
  level: { type: String, enum: LEVEL_ENUM },
  opsLeadId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  bidManagerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  salaryPerBid: { type: Number, default: 0.08 },
  opsTeamRate: { type: Number, default: 0 },
  usdtErc20Wallet: { type: String, default: null },
  status: {
    type: String,
    enum: STATUS_ENUM,
    default: 'pending_onboarding'
  },
  /** ops_first = Bidder/BM track (Ops then admin); admin_direct = Ops/FM track (admin only) */
  applicationPath: {
    type: String,
    enum: ['ops_first', 'admin_direct'],
    default: 'ops_first'
  },
  rejectionReason: { type: String, default: '' }
}, { timestamps: true });

userSchema.pre('save', async function (next) {
  if (this.isModified('password')) {
    this.password = await bcrypt.hash(this.password, 10);
  }
  const hasLegal = (this.legalFirstName || '').trim() || (this.legalLastName || '').trim();
  if (hasLegal && (this.isModified('legalFirstName') || this.isModified('legalMiddleName') || this.isModified('legalLastName'))) {
    const parts = [
      (this.legalFirstName || '').trim(),
      (this.legalMiddleName || '').trim(),
      (this.legalLastName || '').trim()
    ].filter(Boolean);
    if (parts.length) this.name = parts.join(' ');
  }
  next();
});

userSchema.methods.comparePassword = function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

export const USER_ROLES = ROLE_ENUM;
export const USER_STATUS = STATUS_ENUM;
export default mongoose.model('User', userSchema);
