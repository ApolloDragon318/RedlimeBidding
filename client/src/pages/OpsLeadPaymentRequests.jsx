import { useState, useEffect, useMemo } from 'react'
import { api } from '../api'
import { labelWorkflow } from '../workflowLabels'

export default function OpsLeadPaymentRequests() {
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [bmBonuses, setBmBonuses] = useState({})
  const [expectedOps, setExpectedOps] = useState(null)
  const [approving, setApproving] = useState(false)
  const [showExpected, setShowExpected] = useState(false)
  const [payoutMe, setPayoutMe] = useState(null)
  const [requestingPayout, setRequestingPayout] = useState(false)

  const loadPayoutMe = async () => {
    try {
      const { data } = await api.get('/salary/payout-request/me')
      setPayoutMe(data)
    } catch {
      setPayoutMe(null)
    }
  }

  useEffect(() => {
    Promise.all([
      api.get('/reports'),
      api.get('/salary/expected-pay-ops-lead').catch(() => ({ data: null })),
      api.get('/salary/payout-request/me').catch(() => ({ data: null }))
    ])
      .then(([r, ex, me]) => {
        setReports(r.data)
        setExpectedOps(ex.data)
        setPayoutMe(me.data || null)
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const awaiting = reports.filter(r => r.workflowStatus === 'awaiting_ops_lead')
  const other = reports.filter(r => r.workflowStatus !== 'awaiting_ops_lead')

  const byBm = useMemo(() => {
    const m = {}
    awaiting.forEach(r => {
      const id = r.bidManagerId?._id || r.bidManagerId
      if (!id) return
      if (!m[id]) m[id] = { bm: r.bidManagerId, rows: [] }
      m[id].rows.push(r)
    })
    return m
  }, [awaiting])

  const pipelineTree = useMemo(() => {
    const m = {}
    other.forEach(r => {
      const bmId = r.bidManagerId?._id || r.bidManagerId || 'unknown'
      if (!m[bmId]) m[bmId] = { bm: r.bidManagerId, bidders: {} }
      const bidderId = r.bidderId?._id || r.bidderId || 'unknown'
      if (!m[bmId].bidders[bidderId]) m[bmId].bidders[bidderId] = { name: r.bidderId?.name || r.bidderName, rows: [] }
      m[bmId].bidders[bidderId].rows.push(r)
    })
    return m
  }, [other])

  const canRequestPayout = useMemo(() => {
    if (!expectedOps) return false
    const raw = expectedOps.netPay ?? expectedOps.basePay ?? '0'
    const n = parseFloat(String(raw))
    return !Number.isNaN(n) && n > 0
  }, [expectedOps])

  const requestPayout = async () => {
    setRequestingPayout(true)
    try {
      await api.post('/salary/request-payout')
      await loadPayoutMe()
      alert('Payment request submitted.')
    } catch (err) {
      alert(err.response?.data?.error || 'Could not submit request')
    } finally {
      setRequestingPayout(false)
    }
  }

  const approveAll = async () => {
    const bonusMap = {}
    for (const bmId of Object.keys(byBm)) {
      const raw = bmBonuses[bmId]
      const n = raw != null && raw !== '' ? Number(raw) : 0
      if (Number.isNaN(n)) {
        alert(`Invalid bonus for ${byBm[bmId].bm?.name || 'a bid manager'}`)
        return
      }
      bonusMap[bmId] = n
    }
    setApproving(true)
    try {
      await api.post('/reports/ops-lead/approve-all', { bonuses: bonusMap })
      const { data } = await api.get('/reports')
      setReports(data)
      const ex = await api.get('/salary/expected-pay-ops-lead').catch(() => ({ data: null }))
      setExpectedOps(ex.data)
      await loadPayoutMe()
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to approve')
    } finally {
      setApproving(false)
    }
  }

  const declineTeam = async (bidManagerId) => {
    const reason = prompt('Decline reason for this team:')
    if (reason == null) return
    try {
      await api.post('/reports/ops-lead/decline-team', { bidManagerId, declineReason: reason })
      const { data } = await api.get('/reports')
      setReports(data)
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to decline')
    }
  }

  if (loading) return <div className="page-loading"><div className="spinner" /></div>

  return (
    <div className="page">
      <div className="page-header">
        <h2>Payment requests</h2>
        <p className="page-desc">
          Enter <strong>one total</strong> bonus per bid manager for this approval (not multiplied by profiles). Approve all when ready. Decline sends the whole team back to their BM.
        </p>
        {expectedOps && (
          <button type="button" className="btn btn-ghost" onClick={() => setShowExpected(s => !s)}>
            Expected Pay
          </button>
        )}
      </div>

      {payoutMe?.lastDeclined && !payoutMe?.pending && (
        <div className="card payout-decline-banner">
          <h4>Your last payment request was declined</h4>
          <p className="payout-decline-reason">{payoutMe.lastDeclined.reason}</p>
          {payoutMe.lastDeclined.declinedAt && (
            <p className="text-muted" style={{ fontSize: '0.8rem', margin: '0.5rem 0 0' }}>
              {new Date(payoutMe.lastDeclined.declinedAt).toLocaleString()}
            </p>
          )}
          <p className="text-muted" style={{ margin: '0.75rem 0 0' }}>
            Address the feedback below, then submit a new request when you have eligible pay.
          </p>
        </div>
      )}

      {payoutMe?.pending && (
        <div className="card" style={{ marginBottom: '1rem' }}>
          <p className="payout-pending-note">
            {payoutMe.pending.status === 'confirmed' ? (
              <>
                Your payment request is <strong>approved</strong>. Admin or Financial can record payment from their <strong>Payouts</strong> queue.
              </>
            ) : (
              <>
                Your request is <strong>waiting for Admin/Financial to confirm</strong>. They must confirm it in <strong>Payout requests</strong> before they can pay you.
              </>
            )}
          </p>
        </div>
      )}

      {canRequestPayout && !payoutMe?.pending && (
        <div className="card" style={{ marginBottom: '1rem' }}>
          <div className="card-header">
            <h3>Request payment</h3>
            <span className="card-subtitle">Notify Admin or Financial that you&apos;re ready for your Ops payout.</span>
          </div>
          <button
            type="button"
            className="btn btn-primary"
            onClick={requestPayout}
            disabled={requestingPayout}
          >
            {requestingPayout ? 'Submitting…' : 'Request payment'}
          </button>
        </div>
      )}

      {/* ── Summary stats ── */}
      <div className="card">
        <div className="card-header">
          <h3>Overview</h3>
        </div>
        <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
          <div className="stat-block">
            <span className="stat-value">{awaiting.length}</span>
            <span className="stat-label">Pending approval</span>
          </div>
          <div className="stat-block">
            <span className="stat-value">{Object.keys(byBm).length}</span>
            <span className="stat-label">Bid manager teams</span>
          </div>
          <div className="stat-block">
            <span className="stat-value">{other.length}</span>
            <span className="stat-label">Pipeline reports</span>
          </div>
          {expectedOps && (
            <div className="stat-block">
              <span className="stat-value" style={{ color: 'var(--accent)' }}>${expectedOps.basePay}</span>
              <span className="stat-label">{expectedOps.profileCount} profile(s) &times; ${expectedOps.opsRate}</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Expected pay detail ── */}
      {showExpected && expectedOps && (
        <div className="card">
          <div className="card-header">
            <h3>Your expected pay</h3>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowExpected(false)}>Hide</button>
          </div>
          <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
            <div className="pay-summary-item">
              <span className="pay-summary-label">Profiles</span>
              <span className="pay-summary-value">{expectedOps.profileCount}</span>
            </div>
            <div className="pay-summary-item">
              <span className="pay-summary-label">Rate</span>
              <span className="pay-summary-value">${expectedOps.opsRate}</span>
            </div>
            <div className="pay-summary-item">
              <span className="pay-summary-label">Gross pay</span>
              <span className="pay-summary-value">${expectedOps.basePay}</span>
            </div>
            <div className="pay-summary-item pay-summary-tax">
              <span className="pay-summary-label">Tax ({((expectedOps.taxRate ?? 0.10) * 100).toFixed(0)}%)</span>
              <span className="pay-summary-value">−${expectedOps.taxAmount ?? '0.00'}</span>
            </div>
            <div className="pay-summary-item pay-summary-total" style={{ border: '1px solid rgba(99,102,241,0.2)', background: 'rgba(99,102,241,0.08)' }}>
              <span className="pay-summary-label">Net pay</span>
              <span className="pay-summary-value">${expectedOps.netPay ?? expectedOps.basePay}</span>
            </div>
          </div>
          <p className="card-subtitle" style={{ marginTop: '0.75rem' }}>
            {expectedOps.pendingReports} report(s) pending Ops payout. Admin adds bonus at final payout.
          </p>
        </div>
      )}

      {/* ── Awaiting approval ── */}
      <div className="card">
        <div className="card-header">
          <h3>Awaiting your approval</h3>
          <span className="card-subtitle">{awaiting.length} report{awaiting.length !== 1 ? 's' : ''}</span>
          {awaiting.length > 0 && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={approveAll}
              disabled={approving}
              style={{ marginLeft: 'auto' }}
            >
              {approving ? 'Approving...' : `Approve all (${awaiting.length})`}
            </button>
          )}
        </div>

        {awaiting.length === 0 ? (
          <p className="empty-state">All caught up -- nothing pending.</p>
        ) : (
          <div className="ops-team-list">
            {Object.entries(byBm).map(([bmId, { bm, rows }]) => (
              <div key={bmId} className="ops-team-group">
                <div className="ops-team-header">
                  <div className="ops-team-header-info">
                    <span className="ops-team-name">{bm?.name || 'Bid manager'}</span>
                    <span className="badge badge-role badge-bid_manager">bid manager</span>
                    <span className="card-subtitle">{rows.length} report{rows.length !== 1 ? 's' : ''}</span>
                  </div>
                  <div className="ops-team-header-actions">
                    <div className="approval-bonus">
                      <label title="Total for this bid manager, not per profile; can be negative">Total bonus $ (+/−)</label>
                      <input
                        type="number"
                        step="0.01"
                        placeholder="0"
                        value={bmBonuses[bmId] ?? ''}
                        onChange={e => setBmBonuses(prev => ({ ...prev, [bmId]: e.target.value }))}
                      />
                    </div>
                    <button type="button" className="btn btn-ghost btn-sm btn-danger" onClick={() => declineTeam(bmId)}>
                      Decline team
                    </button>
                  </div>
                </div>
                <div className="ops-team-reports">
                  {rows.map(r => (
                    <div key={r._id} className="ops-team-report-row">
                      <span className="ops-team-report-bidder">{r.bidderId?.name || r.bidderName}</span>
                      <span className="ops-team-report-profile">{r.profileName}</span>
                      <div className="approval-detail">
                        <span className="approval-detail-label">Bids</span>
                        <span className="approval-detail-value">{r.bidCount}</span>
                      </div>
                      <div className="approval-detail">
                        <span className="approval-detail-label">Week</span>
                        <span className="approval-detail-value">{new Date(r.weekStartDate).toLocaleDateString()}</span>
                      </div>
                      <div className="approval-detail">
                        <span className="approval-detail-label">BM bonus</span>
                        <span className="approval-detail-value">${r.bidManagerBonus ?? 0}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Pipeline ── */}
      {other.length > 0 && (
        <div className="card">
          <div className="card-header">
            <h3>Team pipeline</h3>
            <span className="card-subtitle">{other.length} report{other.length !== 1 ? 's' : ''} in other stages</span>
          </div>
          <div className="ops-pipeline">
            {Object.entries(pipelineTree).map(([bmId, { bm, bidders }]) => (
              <div key={bmId} className="ops-pipeline-bm">
                <div className="ops-pipeline-bm-header">
                  <span className="ops-pipeline-bm-name">{bm?.name || 'Bid manager'}</span>
                  <span className="badge badge-role badge-bid_manager">BM</span>
                </div>
                {Object.entries(bidders).map(([bidderId, { name, rows }]) => (
                  <div key={bidderId} className="ops-pipeline-bidder">
                    <div className="ops-pipeline-bidder-header">
                      <span>{name}</span>
                      <span className="card-subtitle">{rows.length} report{rows.length !== 1 ? 's' : ''}</span>
                    </div>
                    {rows.map(r => (
                      <div key={r._id} className="ops-pipeline-report">
                        <span>{r.profileName}</span>
                        <span className="text-muted">{new Date(r.weekStartDate).toLocaleDateString()}</span>
                        <span className="text-muted">{r.bidCount} bids</span>
                        <span className="badge badge-pending">{labelWorkflow(r.workflowStatus)}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
