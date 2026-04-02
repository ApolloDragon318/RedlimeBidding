export const WORKFLOW_LABELS = {
  awaiting_bid_manager: 'Awaiting bid manager',
  awaiting_bidder_revision: 'Returned — update & resubmit',
  awaiting_ops_lead: 'Awaiting Ops Lead',
  /** Legacy — migrate old rows or re-approve via Ops */
  awaiting_investigation: 'Legacy: awaiting investigation',
  confirmed: 'Confirmed (ready for payout)',
  declined: 'Declined (legacy)'
}

export function labelWorkflow(status) {
  return WORKFLOW_LABELS[status] || status || '—'
}

/** Bidder-facing status: Paid once FM/Admin recorded bidder payout for this profile line */
export function bidderStatusLabel(report) {
  if (report?.bidderPayoutPaidAt) return 'Paid'
  return labelWorkflow(report?.workflowStatus)
}
