import { useState, useEffect } from 'react'
import { api } from '../api'

function getMonday(d) {
  const date = new Date(d)
  const day = date.getDay()
  const diff = date.getDate() - day + (day === 0 ? -6 : 1)
  return new Date(date.setDate(diff)).toISOString().slice(0, 10)
}

export default function BidManagerDashboard() {
  const [reports, setReports] = useState([])
  const [investigationManagers, setInvestigationManagers] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({
    investigationManagerId: '',
    bidderName: '',
    profileName: '',
    bidCount: '',
    bonus: '0',
    weekStartDate: getMonday(new Date())
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [showExpectedPay, setShowExpectedPay] = useState(false)
  const [expectedPayData, setExpectedPayData] = useState(null)

  useEffect(() => {
    Promise.all([
      api.get('/reports'),
      api.get('/users/investigation-managers')
    ]).then(([r1, r2]) => {
      setReports(r1.data)
      setInvestigationManagers(r2.data)
    }).catch(console.error).finally(() => setLoading(false))
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      const { data } = await api.post('/reports', form)
      setReports(prev => [data, ...prev])
      setForm({ investigationManagerId: '', bidderName: '', profileName: '', bidCount: '', bonus: '0', weekStartDate: getMonday(new Date()) })
      setShowForm(false)
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create report')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (id) => {
    if (!confirm('Delete this report?')) return
    try {
      await api.delete(`/reports/${id}`)
      setReports(prev => prev.filter(r => r._id !== id))
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to delete')
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

  if (loading) return <div className="page-loading"><div className="spinner" /></div>

  return (
    <div className="page">
      <div className="page-header">
        <h2>Bid Manager Dashboard</h2>
        <p className="page-desc">Report bidder work every Monday</p>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button onClick={fetchExpectedPay} className="btn btn-ghost">Expected Pay</button>
          <button onClick={() => setShowForm(!showForm)} className="btn btn-primary">
            {showForm ? 'Cancel' : '+ New Report'}
          </button>
        </div>
      </div>

      {showForm && (
        <div className="card form-card">
          <h3>New Report</h3>
          <form onSubmit={handleSubmit} className="report-form">
            <div className="form-row">
              <label>Investigation Manager</label>
              <select
                value={form.investigationManagerId}
                onChange={e => setForm(f => ({ ...f, investigationManagerId: e.target.value }))}
                required
              >
                <option value="">Select...</option>
                {investigationManagers.map(im => (
                  <option key={im._id} value={im._id}>{im.name}</option>
                ))}
              </select>
            </div>
            <div className="form-row">
              <label>Bidder Name</label>
              <input
                value={form.bidderName}
                onChange={e => setForm(f => ({ ...f, bidderName: e.target.value }))}
                placeholder="Bidder's name"
                required
              />
            </div>
            <div className="form-row">
              <label>Profile Name</label>
              <input
                value={form.profileName}
                onChange={e => setForm(f => ({ ...f, profileName: e.target.value }))}
                placeholder="Profile name"
                required
              />
            </div>
            <div className="form-row form-row-2">
              <div>
                <label>Bid Count (weekly)</label>
                <input
                  type="number"
                  min="0"
                  value={form.bidCount}
                  onChange={e => setForm(f => ({ ...f, bidCount: e.target.value }))}
                  required
                />
              </div>
              <div>
                <label>Bonus</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.bonus}
                  onChange={e => setForm(f => ({ ...f, bonus: e.target.value }))}
                />
              </div>
            </div>
            <div className="form-row">
              <label>Week Start (Monday)</label>
              <input
                type="date"
                value={form.weekStartDate}
                onChange={e => setForm(f => ({ ...f, weekStartDate: e.target.value }))}
                required
              />
            </div>
            {error && <p className="error-msg">{error}</p>}
            <button type="submit" disabled={submitting} className="btn btn-primary">
              {submitting ? 'Submitting...' : 'Submit Report'}
            </button>
          </form>
        </div>
      )}

      <div className="card">
        <h3>My Reports</h3>
        {reports.length === 0 ? (
          <p className="empty-state">No reports yet. Create one above.</p>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Investigation Manager</th>
                  <th>Bidder</th>
                  <th>Profile</th>
                  <th>Bid Count</th>
                  <th>Bonus</th>
                  <th>Week</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {reports.map(r => (
                  <tr key={r._id}>
                    <td>{r.investigationManagerId?.name}</td>
                    <td>{r.bidderName}</td>
                    <td>{r.profileName}</td>
                    <td>{r.bidCount}</td>
                    <td>${r.bonus}</td>
                    <td>{new Date(r.weekStartDate).toLocaleDateString()}</td>
                    <td>
                      <span className={`badge badge-${r.status}`}>{r.status}</span>
                    </td>
                    <td>
                      {r.status === 'pending' && (
                        <button onClick={() => handleDelete(r._id)} className="btn btn-ghost btn-sm btn-danger">Delete</button>
                      )}
                    </td>
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
              <h3>Expected Pay</h3>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowExpectedPay(false)}>×</button>
            </div>
            <div className="modal-body">
              {expectedPayData ? (
                <>
                  <div className="report-field">
                    <label>Total Expected Pay</label>
                    <div className="report-value">${(expectedPayData.total != null && expectedPayData.total !== 'NaN') ? expectedPayData.total : '0.00'}</div>
                    <div className="total-breakdown">
                      <span>Bidder's work (deducted): ${expectedPayData.totalBidderWork ?? '0.00'}</span>
                      <span>Bid management (deducted): ${expectedPayData.totalBidManagement ?? '0.00'}</span>
                    </div>
                  </div>
                  <div className="report-field calc-process-box">
                    <label>Calculation Process</label>
                    <div className="calc-process-desc">
                      (profiles × $/profile) + (bids × $/bid) + bonus - deductions = amount you receive. Your rates are set by admin.
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
                            <tr><th>Profile</th><th>Bidder</th><th>Week</th><th>Bidder's work (deducted)</th><th>Bid management (deducted)</th><th>Calculation</th></tr>
                          </thead>
                          <tbody>
                            {expectedPayData.perProfile.map((p, i) => (
                              <tr key={p.reportId || i}>
                                <td>{p.profileName}</td>
                                <td>{p.bidderName}</td>
                                <td>{new Date(p.weekStartDate).toLocaleDateString()}</td>
                                <td>${p.bidderNet ?? '0.00'}</td>
                                <td>${p.bidManagementNet ?? '0.00'}</td>
                                <td className="formula-cell">
                                  <span className="formula-text">
                                    {p.tableFormula || (() => {
                                      const bc = p.bidCount ?? 0
                                      const bn = parseFloat(p.bonus) || 0
                                      const bdR = p.bidderRate ?? 0
                                      const bidderDed = bc * 0.01
                                      const profilePay = parseFloat(p.profilePay) || 0
                                      const bidderNet = profilePay + bn - bidderDed
                                      const parts = [
                                        bc > 0 && `${bc} × $${Number(bdR).toFixed(2)}`,
                                        bn > 0 && `$${bn} bonus`
                                      ].filter(Boolean)
                                      return parts.length ? `${parts.join(' + ')} - $${bidderDed.toFixed(2)} = $${bidderNet.toFixed(2)}` : '—'
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
