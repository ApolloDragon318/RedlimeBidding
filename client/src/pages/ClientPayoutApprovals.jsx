import { useState, useEffect, useCallback } from 'react'
import { api } from '../api'

function fmtMoney(n) {
  const x = Number(n)
  return Number.isFinite(x) ? x.toFixed(2) : '0.00'
}

function ReportBreakdownLines({ line }) {
  const b = line.breakdown
  if (!b) return null
  const rateBid = Number(b.bidderRatePerBid || 0).toFixed(4)
  const rateBm = Number(b.bmRatePerProfile || 0).toFixed(4)
  const parts = []
  parts.push(
    `${b.bidCount} bid${b.bidCount === 1 ? '' : 's'} × $${rateBid}/bid = $${fmtMoney(b.bidderPayFromBids)}`
  )
  if (b.bidManagerBonusToBidder > 0) {
    parts.push(`+ BM→bidder bonus $${fmtMoney(b.bidManagerBonusToBidder)}`)
  }
  const bidderExpr = parts.join(' ')
  return (
    <div className="client-payout-breakdown-report">
      <div className="client-payout-breakdown-report-title">
        Report: <strong>{line.reportTitle || 'Work'}</strong>
        <span className="text-muted"> · Bidder: {line.bidderName || '—'} · BM: {line.bidManagerName || '—'}</span>
      </div>
      <ol className="client-payout-breakdown-steps">
        <li>
          <span className="client-payout-breakdown-label">Bidder pay</span>
          <code className="client-payout-breakdown-math">
            {bidderExpr} = <strong>${fmtMoney(line.bidderPay)}</strong>
          </code>
        </li>
        <li>
          <span className="client-payout-breakdown-label">BM layer (per profile)</span>
          <code className="client-payout-breakdown-math">
            BM rate ${rateBm}/profile
            {b.opsTeamBonusShare > 0 ? ` + team bonus share $${fmtMoney(b.opsTeamBonusShare)}` : ''}
            {b.adminBmBonusShare > 0 ? ` + admin BM bonus share $${fmtMoney(b.adminBmBonusShare)}` : ''}
            {' '}= <strong>${fmtMoney(b.bmLayerSubtotal)}</strong>
          </code>
        </li>
        <li>
          <span className="client-payout-breakdown-label">Ops layer (per report)</span>
          <code className="client-payout-breakdown-math">
            Ops base share ${fmtMoney(b.opsBaseShare)}
            {b.adminOpsBonusShare > 0 ? ` + admin Ops bonus share $${fmtMoney(b.adminOpsBonusShare)}` : ''}
            {' '}= <strong>${fmtMoney(b.opsLayerSubtotal)}</strong>
          </code>
        </li>
        <li>
          <span className="client-payout-breakdown-label">Profile pay</span>
          <code className="client-payout-breakdown-math">
            BM layer + Ops layer = <strong>${fmtMoney(b.profilePay)}</strong>
          </code>
        </li>
        <li className="client-payout-breakdown-total">
          <span className="client-payout-breakdown-label">This report</span>
          <code className="client-payout-breakdown-math">
            Bidder pay + Profile pay = <strong>${fmtMoney(line.total)}</strong>
          </code>
        </li>
      </ol>
    </div>
  )
}

export default function ClientPayoutApprovals() {
  const [approvals, setApprovals] = useState([])
  const [loading, setLoading] = useState(true)
  const [workingId, setWorkingId] = useState(null)

  const load = useCallback(async () => {
    try {
      const { data } = await api.get('/salary/profile-payout-approvals/me')
      setApprovals(data.approvals || [])
    } catch {
      setApprovals([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const approve = async id => {
    setWorkingId(id)
    try {
      await api.post(`/salary/profile-payout-approvals/${id}/client-approve`)
      await load()
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to approve')
    } finally {
      setWorkingId(null)
    }
  }

  if (loading) {
    return (
      <div className="page-loading">
        <div className="spinner" />
      </div>
    )
  }

  return (
    <div className="page">
      <div className="page-header">
        <h2>Profile payout approvals</h2>
        <p className="page-desc">
          Each card shows how the total is built (bids × rate, bonuses, BM and Ops shares) before you approve. Tax and net pay are handled by our team — you confirm the client cost total for your organization.
        </p>
      </div>

      <div className="card">
        <div className="card-header">
          <h3>Pending</h3>
        </div>
        {approvals.length === 0 ? (
          <p className="payout-requests-empty">Nothing needs your approval right now.</p>
        ) : (
          <div className="profile-approvals-list">
            {approvals.map(a => {
              const clientOk = !!a.clientApprovedAt
              const adminOk = !!a.adminApprovedAt
              const profileReady = clientOk || adminOk
              return (
                <div key={a._id} className="payout-request-card">
                  <div className="payout-request-item">
                    <div>
                      <strong>{a.profileName || 'Profile'}</strong>
                      <span className="text-muted" style={{ marginLeft: '0.5rem' }}>Ops Lead: {a.opsLeadName || '—'}</span>
                    </div>
                    <p style={{ margin: '0.35rem 0' }}>
                      Total: <strong>${Number(a.totalAmount || 0).toFixed(2)}</strong>
                      {a.reportCount ? (
                        <span className="text-muted" style={{ marginLeft: '0.5rem' }}>({a.reportCount} report(s))</span>
                      ) : null}
                    </p>

                    {a.reportBreakdown?.length > 0 && (
                      <div className="client-payout-breakdown">
                        <p className="client-payout-breakdown-intro">How we reach this total (same math as payouts):</p>
                        {a.reportBreakdown.map(row => (
                          <ReportBreakdownLines key={String(row.reportId)} line={row} />
                        ))}
                        {typeof a.breakdownTotalCheck === 'number' && (
                          <p className="client-payout-breakdown-sum text-muted">
                            Sum of report lines: <strong>${fmtMoney(a.breakdownTotalCheck)}</strong>
                            {Math.abs(a.breakdownTotalCheck - Number(a.totalAmount || 0)) < 0.02
                              ? ' — matches profile total above'
                              : (
                                <span> · Profile total stored: <strong>${fmtMoney(a.totalAmount)}</strong></span>
                              )}
                          </p>
                        )}
                      </div>
                    )}

                    <div className="profile-approval-badges">
                      <span className={`badge ${profileReady ? 'badge-approved' : 'badge-pending'}`}>
                        {profileReady
                          ? (clientOk && adminOk
                            ? 'Approved (you + company)'
                            : clientOk
                              ? 'Approved by you'
                              : 'Approved by company')
                          : 'Needs your approval or company approval'}
                      </span>
                    </div>
                    {a.canApprove && (
                      <div className="payout-request-actions" style={{ marginTop: '0.5rem' }}>
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          onClick={() => approve(a._id)}
                          disabled={workingId === a._id}
                        >
                          {workingId === a._id ? '…' : 'Approve this profile'}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
