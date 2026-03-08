import { useState, useEffect } from 'react'
import { api } from '../api'

export default function InvestigationManagerDashboard() {
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [showExpectedPay, setShowExpectedPay] = useState(false)
  const [expectedPayData, setExpectedPayData] = useState(null)

  useEffect(() => {
    api.get('/reports').then(res => setReports(res.data)).catch(console.error).finally(() => setLoading(false))
  }, [])

  const handleApprove = async (id) => {
    try {
      const { data } = await api.patch(`/reports/${id}/approve`)
      setReports(prev => prev.map(r => r._id === id ? data : r))
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to approve')
    }
  }

  const pending = reports.filter(r => r.status === 'pending')
  const approved = reports.filter(r => r.status === 'approved')

  const fetchExpectedPay = async () => {
    try {
      const { data } = await api.get('/salary/expected-pay-im')
      setExpectedPayData(data)
      setShowExpectedPay(true)
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to load expected pay')
    }
  }

  if (loading) return <div className="page-loading"><div className="spinner" /></div>

  return (
    <div className="page">
      <div className="page-header">
        <h2>Investigation Manager Dashboard</h2>
        <p className="page-desc">Review and approve Bid Manager reports</p>
        <button onClick={fetchExpectedPay} className="btn btn-ghost">Expected Pay</button>
      </div>

      <div className="card">
        <h3>Pending Approval ({pending.length})</h3>
        {pending.length === 0 ? (
          <p className="empty-state">No pending reports.</p>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Bid Manager</th>
                  <th>Bidder</th>
                  <th>Profile</th>
                  <th>Bid Count</th>
                  <th>Bonus</th>
                  <th>Week</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {pending.map(r => (
                  <tr key={r._id}>
                    <td>{r.bidManagerId?.name}</td>
                    <td>{r.bidderName}</td>
                    <td>{r.profileName}</td>
                    <td>{r.bidCount}</td>
                    <td>${r.bonus}</td>
                    <td>{new Date(r.weekStartDate).toLocaleDateString()}</td>
                    <td>
                      <button onClick={() => handleApprove(r._id)} className="btn btn-primary btn-sm">Approve</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <h3>Approved ({approved.length})</h3>
        {approved.length === 0 ? (
          <p className="empty-state">No approved reports yet.</p>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Bid Manager</th>
                  <th>Bidder</th>
                  <th>Profile</th>
                  <th>Bid Count</th>
                  <th>Bonus</th>
                  <th>Week</th>
                  <th>Approved</th>
                </tr>
              </thead>
              <tbody>
                {approved.map(r => (
                  <tr key={r._id}>
                    <td>{r.bidManagerId?.name}</td>
                    <td>{r.bidderName}</td>
                    <td>{r.profileName}</td>
                    <td>{r.bidCount}</td>
                    <td>${r.bonus}</td>
                    <td>{new Date(r.weekStartDate).toLocaleDateString()}</td>
                    <td>{r.approvedAt ? new Date(r.approvedAt).toLocaleDateString() : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showExpectedPay && (
        <div className="modal-overlay" onClick={() => setShowExpectedPay(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Expected Pay to Pay</h3>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowExpectedPay(false)}>×</button>
            </div>
            <div className="modal-body">
              {expectedPayData ? (
                <>
                  <div className="report-field">
                    <label>Total Amount to Pay</label>
                    <div className="report-value">${expectedPayData.total}</div>
                  </div>
                  <div className="report-field calc-process-box">
                    <label>Calculation Process</label>
                    <div className="calc-process-desc">
                      (profiles × $/profile) + (bids × $/bid) + bonus = amount per profile. Each bid manager has their own rates set by admin.
                    </div>
                    {expectedPayData.perProfile?.[0]?.formula && (
                      <div className="calc-process-example">
                        Example: {expectedPayData.perProfile[0].formula}
                      </div>
                    )}
                  </div>
                  <div className="report-field">
                    <label>Per Profile</label>
                    {!expectedPayData.perProfile?.length ? (
                      <p className="empty-state">No approved reports yet.</p>
                    ) : (
                      <div className="table-wrap">
                        <table className="data-table">
                          <thead>
                            <tr><th>Profile</th><th>Bidder</th><th>Bid Manager</th><th>Week</th><th>Amount</th><th>Calculation</th></tr>
                          </thead>
                          <tbody>
                            {expectedPayData.perProfile.map((p, i) => (
                              <tr key={p.reportId || i}>
                                <td>{p.profileName}</td>
                                <td>{p.bidderName}</td>
                                <td>{p.bidManager}</td>
                                <td>{new Date(p.weekStartDate).toLocaleDateString()}</td>
                                <td><strong>${p.gross}</strong></td>
                                <td className="formula-cell">
                                  <span className="formula-text">
                                    {p.formula || (() => {
                                      const rc = 1
                                      const bc = p.bidCount ?? 0
                                      const bn = parseFloat(p.bonus) || 0
                                      const bmR = p.bmRate ?? (rc > 0 ? (parseFloat(p.bidManagerAmount) || 0) / rc : 0)
                                      const bdR = p.bidderRate ?? (bc > 0 ? (parseFloat(p.bidderAmount) || 0) / bc : 0)
                                      const parts = [
                                        rc > 0 && `${rc} × $${Number(bmR).toFixed(2)}`,
                                        bc > 0 && `${bc} × $${Number(bdR).toFixed(2)}`,
                                        bn > 0 && `$${bn} bonus`
                                      ].filter(Boolean)
                                      return parts.length ? `${parts.join(' + ')} = $${p.gross}` : `—`
                                    })()}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <p className="empty-state">No approved reports yet.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
