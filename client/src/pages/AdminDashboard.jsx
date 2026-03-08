import { useState, useEffect } from 'react'
import { api } from '../api'

export default function AdminDashboard() {
  const [reports, setReports] = useState([])
  const [calculations, setCalculations] = useState(null)
  const [salaryConfigs, setSalaryConfigs] = useState([])
  const [pendingUsers, setPendingUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('reports')
  const [savingConfig, setSavingConfig] = useState(false)
  const [showReportModal, setShowReportModal] = useState(false)
  const [showPayPerTeam, setShowPayPerTeam] = useState(false)
  const [payPerTeamData, setPayPerTeamData] = useState(null)
  const [paymentHistory, setPaymentHistory] = useState([])
  const [markingPaid, setMarkingPaid] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      const [reportsRes, calcRes, configRes, pendingRes, historyRes] = await Promise.all([
        api.get('/reports').catch(() => ({ data: [] })),
        api.get('/salary/calculations').catch(() => ({ data: null })),
        api.get('/salary').catch(() => ({ data: [] })),
        api.get('/users/pending').catch(() => ({ data: [] })),
        api.get('/salary/history').catch(() => ({ data: [] }))
      ])
      setReports(reportsRes.data)
      setCalculations(calcRes.data)
      setSalaryConfigs(configRes.data || [])
      setPendingUsers(pendingRes.data)
      setPaymentHistory(historyRes.data || [])
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  const handleApprove = async (userId) => {
    try {
      await api.patch(`/users/${userId}/approve`)
      setPendingUsers(prev => prev.filter(u => u._id !== userId))
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to approve')
    }
  }

  const handleSaveConfig = async (bidManagerId, cfg) => {
    setSavingConfig(true)
    try {
      await api.put(`/salary/${bidManagerId}`, {
        bidManagerSalaryPerProfile: Number(cfg.bidManagerSalaryPerProfile),
        bidderSalaryPerBid: Number(cfg.bidderSalaryPerBid)
      })
      await loadData()
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to save')
    } finally {
      setSavingConfig(false)
    }
  }

  const updateConfigLocal = (bidManagerId, field, value) => {
    const id = String(bidManagerId)
    setSalaryConfigs(prev => prev.map(c =>
      String(c.bidManagerId) === id ? { ...c, [field]: value } : c
    ))
  }

  const generateReport = () => {
    if (!calculations?.calculations?.length) return null
    const byIM = {}
    calculations.calculations.forEach(c => {
      const name = c.investigationManager || 'Unknown'
      if (!byIM[name]) byIM[name] = 0
      byIM[name] += parseFloat(c.totalAmount)
    })
    const totalAmount = Object.values(byIM).reduce((s, v) => s + v, 0)
    const reportString = Object.entries(byIM)
      .map(([name, amt]) => `${name}(${Number(amt).toFixed(2)})`)
      .join('/')
    return { totalAmount, reportString }
  }

  const reportData = generateReport()

  const handleMarkPaid = async () => {
    if (!confirm('Have you paid all of those?')) return
    setMarkingPaid(true)
    try {
      await api.post('/salary/mark-paid')
      await loadData()
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to mark as paid')
    } finally {
      setMarkingPaid(false)
    }
  }

  const fetchPayPerTeam = async () => {
    try {
      const { data } = await api.get('/salary/pay-per-team')
      setPayPerTeamData(data)
      setShowPayPerTeam(true)
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to load pay per team')
    }
  }

  if (loading) return <div className="page-loading"><div className="spinner" /></div>

  return (
    <div className="page">
      <div className="page-header">
        <h2>Admin Dashboard</h2>
        <p className="page-desc">View all reports, set salaries, and see calculated totals</p>
      </div>

      <div className="tabs">
        <button className={activeTab === 'reports' ? 'tab active' : 'tab'} onClick={() => setActiveTab('reports')}>
          All Reports
        </button>
        <button className={activeTab === 'calculations' ? 'tab active' : 'tab'} onClick={() => setActiveTab('calculations')}>
          Calculations
        </button>
        <button className={activeTab === 'pending' ? 'tab active' : 'tab'} onClick={() => setActiveTab('pending')}>
          Pending Approvals {pendingUsers.length > 0 && `(${pendingUsers.length})`}
        </button>
        <button className={activeTab === 'salary' ? 'tab active' : 'tab'} onClick={() => setActiveTab('salary')}>
          Salary Config
        </button>
        <button className={activeTab === 'history' ? 'tab active' : 'tab'} onClick={() => setActiveTab('history')}>
          History
        </button>
      </div>

      {activeTab === 'reports' && (
        <div className="card">
          <h3>All Reports & Approvals</h3>
          {reports.length === 0 ? (
            <p className="empty-state">No reports yet.</p>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Investigation Manager</th>
                    <th>Bid Manager</th>
                    <th>Bidder</th>
                    <th>Profile</th>
                    <th>Bid Count</th>
                    <th>Bonus</th>
                    <th>Week</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {reports.map(r => (
                    <tr key={r._id}>
                      <td>{r.investigationManagerId?.name}</td>
                      <td>{r.bidManagerId?.name}</td>
                      <td>{r.bidderName}</td>
                      <td>{r.profileName}</td>
                      <td>{r.bidCount}</td>
                      <td>${r.bonus}</td>
                      <td>{new Date(r.weekStartDate).toLocaleDateString()}</td>
                      <td><span className={`badge badge-${r.status}`}>{r.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === 'calculations' && (
        <div className="card">
          <h3>Calculated Amounts (Approved Reports Only)</h3>
          {!calculations || calculations.calculations.length === 0 ? (
            <p className="empty-state">No approved reports to calculate.</p>
          ) : (
            <>
              <div className="calc-summary">
                <strong>Grand Total: ${calculations.grandTotal}</strong>
                <span className="text-muted">Per bid manager rates applied</span>
                <button type="button" onClick={() => setShowReportModal(true)} className="btn btn-primary">
                  Generate Report
                </button>
                <button type="button" onClick={fetchPayPerTeam} className="btn btn-ghost">
                  Pay per Team
                </button>
                <button type="button" onClick={handleMarkPaid} disabled={markingPaid} className="btn btn-primary">
                  {markingPaid ? 'Processing...' : 'Paid'}
                </button>
              </div>
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Profile</th>
                      <th>Bidder</th>
                      <th>Investigation Manager</th>
                      <th>Bid Manager</th>
                      <th>Rates</th>
                      <th>Week</th>
                      <th>Bid Count</th>
                      <th>Bonus</th>
                      <th>Bidder Amount</th>
                      <th>BM Amount</th>
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {calculations.calculations.map((c, i) => (
                      <tr key={c.reportId || i}>
                        <td>{c.profileName}</td>
                        <td>{c.bidderName}</td>
                        <td>{c.investigationManager}</td>
                        <td>{c.bidManager}</td>
                        <td><span className="text-muted" style={{ fontSize: '0.8rem' }}>{c.rates}</span></td>
                        <td>{new Date(c.weekStartDate).toLocaleDateString()}</td>
                        <td>{c.bidCount}</td>
                        <td>${c.bonus}</td>
                        <td>${c.bidderAmount}</td>
                        <td>${c.bidManagerAmount}</td>
                        <td><strong>${c.totalAmount}</strong></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {activeTab === 'pending' && (
        <div className="card">
          <h3>Pending Sign-up Approvals</h3>
          <p className="page-desc">Approve new users so they can sign in</p>
          {pendingUsers.length === 0 ? (
            <p className="empty-state">No pending sign-up requests.</p>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Requested</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {pendingUsers.map(u => (
                    <tr key={u._id}>
                      <td>{u.name}</td>
                      <td>{u.email}</td>
                      <td><span className="badge badge-pending">{u.role?.replace('_', ' ')}</span></td>
                      <td>{u.createdAt ? new Date(u.createdAt).toLocaleDateString() : '-'}</td>
                      <td>
                        <button onClick={() => handleApprove(u._id)} className="btn btn-primary btn-sm">Approve</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === 'history' && (
        <div className="card">
          <h3>Payment History</h3>
          <p className="page-desc">Past payments marked as paid</p>
          {paymentHistory.length === 0 ? (
            <p className="empty-state">No payment history yet.</p>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Grand Total</th>
                    <th>Total Deducted</th>
                    <th>Reports Paid</th>
                  </tr>
                </thead>
                <tbody>
                  {paymentHistory.map(h => (
                    <tr key={h._id}>
                      <td>{new Date(h.createdAt).toLocaleDateString()}</td>
                      <td><strong>${h.grandTotal?.toFixed(2) ?? '0.00'}</strong></td>
                      <td>${h.totalDeducted?.toFixed(2) ?? '0.00'}</td>
                      <td>{h.reportCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === 'salary' && (
        <div className="card">
          <h3>Salary Configuration (Admin Only)</h3>
          <p className="page-desc">Set bid manager & bidder salary per each bid manager's team</p>
          {salaryConfigs.length === 0 ? (
            <p className="empty-state">No approved bid managers yet.</p>
          ) : (
            <div className="salary-config-list">
              {salaryConfigs.map(cfg => (
                <div key={String(cfg.bidManagerId)} className="salary-config-item">
                  <h4>{cfg.bidManager?.name || 'Bid Manager'}</h4>
                  <div className="salary-config-fields">
                    <div className="form-row">
                      <label>Bid Manager Salary (per profile per week)</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={cfg.bidManagerSalaryPerProfile}
                        onChange={e => updateConfigLocal(String(cfg.bidManagerId), 'bidManagerSalaryPerProfile', e.target.value)}
                      />
                    </div>
                    <div className="form-row">
                      <label>Bidder Salary (per bid)</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={cfg.bidderSalaryPerBid}
                        onChange={e => updateConfigLocal(String(cfg.bidManagerId), 'bidderSalaryPerBid', e.target.value)}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => handleSaveConfig(String(cfg.bidManagerId), cfg)}
                      disabled={savingConfig}
                      className="btn btn-primary btn-sm"
                    >
                      {savingConfig ? 'Saving...' : 'Save'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {showPayPerTeam && (
        <div className="modal-overlay" onClick={() => setShowPayPerTeam(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Pay per Team</h3>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowPayPerTeam(false)}>×</button>
            </div>
            <div className="modal-body">
              {payPerTeamData?.teams?.length ? (
                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr><th>Bid Manager</th><th>Total Pay</th></tr>
                    </thead>
                    <tbody>
                      {payPerTeamData.teams.map((t, i) => (
                        <tr key={i}>
                          <td>{t.bidManager || 'Unknown'}</td>
                          <td><strong>${t.totalPay}</strong></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="empty-state">No approved reports yet.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {showReportModal && (
        <div className="modal-overlay" onClick={() => setShowReportModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Generated Report</h3>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowReportModal(false)}>×</button>
            </div>
            <div className="modal-body">
              {reportData ? (
                <>
                  <div className="report-field">
                    <label>Total Amount</label>
                    <div className="report-value">${reportData.totalAmount.toFixed(2)}</div>
                  </div>
                  <div className="report-field">
                    <label>Report String</label>
                    <div className="report-string-row">
                      <div className="report-value report-string">{reportData.reportString}</div>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => {
                          navigator.clipboard.writeText(reportData.reportString)
                          alert('Copied to clipboard')
                        }}
                      >
                        Copy
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <p className="empty-state">No data to generate report.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
