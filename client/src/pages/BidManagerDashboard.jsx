import { useState, useEffect, useMemo } from 'react'
import { api } from '../api'
import { labelWorkflow } from '../workflowLabels'

function startOfWeekSunday(d) {
  const date = new Date(d)
  const day = date.getDay()
  date.setDate(date.getDate() - day)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

export default function BidManagerDashboard() {
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [showExpectedPay, setShowExpectedPay] = useState(false)
  const [expectedPayData, setExpectedPayData] = useState(null)
  const [bonuses, setBonuses] = useState({})
  const [approving, setApproving] = useState(false)

  useEffect(() => {
    api.get('/reports').then(res => {
      setReports(res.data)
      const b = {}
      res.data.forEach(r => {
        if (r.workflowStatus === 'awaiting_bid_manager') b[r._id] = r.bidManagerBonus ?? 0
      })
      setBonuses(b)
    }).catch(console.error).finally(() => setLoading(false))
  }, [])

  const setBonus = (id, v) => setBonuses(prev => ({ ...prev, [id]: v }))

  const approveAll = async () => {
    const bonusMap = {}
    for (const [id, v] of Object.entries(bonuses)) {
      const n = Number(v)
      if (Number.isNaN(n)) { alert('One of the bonus values is invalid'); return }
      bonusMap[id] = n
    }
    setApproving(true)
    try {
      await api.post('/reports/bid-manager/approve-all', { bonuses: bonusMap })
      const { data } = await api.get('/reports')
      setReports(data)
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to approve')
    } finally {
      setApproving(false)
    }
  }

  const decline = async (id) => {
    const reason = prompt('Decline reason:')
    if (reason == null) return
    try {
      const { data } = await api.patch(`/reports/${id}/decline-bid-manager`, { declineReason: reason })
      setReports(prev => prev.map(r => r._id === id ? data : r))
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to decline')
    }
  }

  const fetchExpectedPay = async () => {
    try {
      const { data } = await api.get('/salary/expected-pay')
      setExpectedPayData(data)
      setShowExpectedPay(true)
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to load expected pay')
    }
  }

  const awaiting = reports.filter(r => r.workflowStatus === 'awaiting_bid_manager')
  const rest = reports.filter(r => r.workflowStatus !== 'awaiting_bid_manager')

  const profilesThisWeek = useMemo(() => {
    const t = startOfWeekSunday(new Date())
    const names = new Set()
    reports.forEach(r => {
      if (startOfWeekSunday(new Date(r.weekStartDate)) === t) names.add(String(r.profileName))
    })
    return names.size
  }, [reports])

  if (loading) return <div className="page-loading"><div className="spinner" /></div>

  return (
    <div className="page">
      <div className="page-header">
        <h2>My Reports</h2>
        <p className="page-desc">
          Review bidder work, set individual bonuses, then approve all at once. Your pay = profiles &times; rate + Ops Lead bonus.
        </p>
        <button type="button" onClick={fetchExpectedPay} className="btn btn-ghost">Expected Pay</button>
      </div>

      {/* ── Week summary ── */}
      <div className="card">
        <div className="card-header">
          <h3>This week</h3>
        </div>
        <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
          <div className="stat-block">
            <span className="stat-value">{profilesThisWeek}</span>
            <span className="stat-label">Active profiles</span>
          </div>
          <div className="stat-block">
            <span className="stat-value">{awaiting.length}</span>
            <span className="stat-label">Pending approval</span>
          </div>
          <div className="stat-block">
            <span className="stat-value">{rest.length}</span>
            <span className="stat-label">Other stages</span>
          </div>
        </div>
      </div>

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
          <p className="empty-state">All caught up — nothing pending.</p>
        ) : (
          <div className="approval-list">
            {awaiting.map(r => (
              <div key={r._id} className="approval-item">
                <div className="approval-item-main">
                  <div className="approval-item-info">
                    <span className="approval-item-bidder">{r.bidderId?.name || r.bidderName}</span>
                    <span className="approval-item-profile">{r.profileName}</span>
                  </div>
                  <div className="approval-item-details">
                    <div className="approval-detail">
                      <span className="approval-detail-label">Bids</span>
                      <span className="approval-detail-value">{r.bidCount}</span>
                    </div>
                    <div className="approval-detail">
                      <span className="approval-detail-label">Week</span>
                      <span className="approval-detail-value">{new Date(r.weekStartDate).toLocaleDateString()}</span>
                    </div>
                    {r.bidManagerId?.opsLeadId?.name && (
                      <div className="approval-detail">
                        <span className="approval-detail-label">Ops Lead</span>
                        <span className="approval-detail-value">{r.bidManagerId.opsLeadId.name}</span>
                      </div>
                    )}
                  </div>
                </div>
                <div className="approval-item-actions">
                  <div className="approval-bonus">
                    <label>Bonus $</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0"
                      value={bonuses[r._id] ?? ''}
                      onChange={e => setBonus(r._id, e.target.value)}
                    />
                  </div>
                  <button type="button" onClick={() => decline(r._id)} className="btn btn-ghost btn-sm btn-danger">Decline</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Pipeline ── */}
      {rest.length > 0 && (
        <div className="card">
          <div className="card-header">
            <h3>Pipeline</h3>
            <span className="card-subtitle">{rest.length} report{rest.length !== 1 ? 's' : ''} in other stages</span>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Bidder</th>
                  <th>Profile</th>
                  <th>Week</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rest.map(r => (
                  <tr key={r._id}>
                    <td>{r.bidderId?.name || r.bidderName}</td>
                    <td>{r.profileName}</td>
                    <td>{new Date(r.weekStartDate).toLocaleDateString()}</td>
                    <td><span className="badge badge-pending">{labelWorkflow(r.workflowStatus)}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Expected Pay modal ── */}
      {showExpectedPay && (
        <div className="modal-overlay" onClick={() => setShowExpectedPay(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Expected Pay</h3>
              <button type="button" className="modal-close" onClick={() => setShowExpectedPay(false)}>&times;</button>
            </div>
            <div className="modal-body">
              {expectedPayData ? (
                <>
                  <div className="pay-summary-grid" style={{ gridTemplateColumns: '1fr' }}>
                    <div className="pay-summary-item pay-summary-total">
                      <span className="pay-summary-label">Total expected</span>
                      <span className="pay-summary-value">${expectedPayData.total}</span>
                    </div>
                  </div>
                  <p className="card-subtitle" style={{ margin: '0.75rem 0' }}>
                    {expectedPayData.formulaSummary}
                  </p>
                  {expectedPayData.perProfile?.length > 0 && (
                    <div className="table-wrap">
                      <table className="data-table">
                        <thead>
                          <tr><th>Profile</th><th>Week</th><th>Ops bonus</th><th>Your pay</th></tr>
                        </thead>
                        <tbody>
                          {expectedPayData.perProfile.map((p, i) => (
                            <tr key={p.reportId || i}>
                              <td>{p.profileName}</td>
                              <td>{new Date(p.weekStartDate).toLocaleDateString()}</td>
                              <td>${p.opsBonus ?? '0.00'}</td>
                              <td>${p.bmPay}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              ) : (
                <p className="empty-state">Loading...</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
