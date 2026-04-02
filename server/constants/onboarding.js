/** Roles Ops Lead may assign before sending to admin */
export const OPS_ASSIGNABLE_ROLES = ['bidder', 'bid_manager'];

/** Roles only admin assigns (applicants skip Ops queue) */
export const ADMIN_ASSIGNABLE_ROLES = ['ops_lead', 'financial_manager'];

export const USER_LEVELS = ['junior', 'mid_level', 'senior', 'staff'];

/** Signup: who reviews first */
export const APPLICATION_PATH = {
  OPS_FIRST: 'ops_first',
  ADMIN_DIRECT: 'admin_direct'
};

export const ACCOUNT_STATUS = {
  PENDING_OPS: 'pending_ops',
  PENDING_ADMIN: 'pending_admin',
  APPROVED: 'approved',
  REJECTED: 'rejected'
};
