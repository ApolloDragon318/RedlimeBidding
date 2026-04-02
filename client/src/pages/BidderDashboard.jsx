import { useState, useEffect, useMemo, Fragment } from 'react'
import { api } from '../api'
import { bidderStatusLabel } from '../workflowLabels'

function getSunday(d) {
  const date = new Date(d)
  const day = date.getDay()
  date.setDate(date.getDate() - day)
  date.setHours(0, 0, 0, 0)
  return date
}

function getPreviousWeekSunday(d) {
  const sunday = getSunday(d)
  sunday.setDate(sunday.getDate() - 7)
  return sunday
}

function getLastSaturday(d) {
  const sun = getPreviousWeekSunday(d)
  const sat = new Date(sun)
  sat.setDate(sat.getDate() + 6)
  return sat
}

function toDateStr(d) {
  return new Date(d).toISOString().slice(0, 10)
}

function normalizeProfiles(data) {
  if (Array.isArray(data)) return data
  if (data && data._id) return [data]
  return []
}

function weekStamp(value) {
  const d = typeof value === 'string' && value.length === 10
    ? new Date(`${value}T12:00:00`)
    : new Date(value)
  return getSunday(d).getTime()
}

export default function BidderDashboard() {
  const [reports, setReports] = useState([])
  const [myProfiles, setMyProfiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ profileId: '', bidCount: '' })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [showExpectedPay, setShowExpectedPay] = useState(false)
  const [expectedPayData, setExpectedPayData] = useState(null)
  const [revisionDraft, setRevisionDraft] = useState(null)
  const [revisionSubmitting, setRevisionSubmitting] = useState(false)
  const [revisionError, setRevisionError] = useState('')
  const [bidRate, setBidRate] = useState(0.08)

  useEffect(() => {
    api.get('/auth/me').then(({ data }) => {
      const sp = data.user?.salaryPerBid
      if (sp != null && !Number.isNaN(Number(sp))) setBidRate(Number(sp))
    }).catch(() => {})
  }, [])

  useEffect(() => {
    Promise.all([
      api.get('/reports'),
      api.get('/profiles/me')
    ]).then(([r1, r2]) => {
      setReports(r1.data)
      const profiles = normalizeProfiles(r2.data)
      setMyProfiles(profiles)
      if (profiles.length) {
        setForm(f => ({ ...f, profileId: profiles[0]._id }))
      }
    }).catch(console.error).finally(() => setLoading(false))
  }, [])

  const openForm = () => {
    setShowForm(s => {
      const next = !s
      if (next && myProfiles.length) {
        setForm(f => ({ ...f, profileId: f.profileId || myProfiles[0]._id }))
      }
      return next
    })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (!form.profileId) { setError('Select a profile'); return }
    if (hasWeekConflict) { setError('You already have a report for this profile for last week.'); return }
    setSubmitting(true)
    try {
      const { data } = await api.post('/reports', {
        profileId: form.profileId,
        bidCount: form.bidCount,
        weekStartDate: new Date().toISOString()
      })
      setReports(prev => [data, ...prev])
      setForm(f => ({ profileId: f.profileId, bidCount: '' }))
      setShowForm(false)
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to submit report')
    } finally {
      setSubmitting(false)
    }
  }

  const openRevision = (r) => {
    if (revisionDraft?.reportId === r._id) {
      setRevisionDraft(null)
      setRevisionError('')
      return
    }
    const pid = r.profileId?._id || r.profileId
    setRevisionError('')
    setRevisionDraft({
      reportId: r._id,
      bidCount: String(r.bidCount),
      weekStartDate: toDateStr(r.weekStartDate),
      profileId: pid ? String(pid) : ''
    })
  }

  const handleRevisionSubmit = async (e) => {
    e.preventDefault()
    if (!revisionDraft) return
    setRevisionError('')
    setRevisionSubmitting(true)
    try {
      const { data } = await api.patch(`/reports/${revisionDraft.reportId}`, {
        bidCount: revisionDraft.bidCount,
        weekStartDate: revisionDraft.weekStartDate,
        profileId: revisionDraft.profileId || undefined
      })
      setReports(prev => prev.map(x => (x._id === data._id ? data : x)))
      setRevisionDraft(null)
    } catch (err) {
      setRevisionError(err.response?.data?.error || 'Failed to resubmit')
    } finally {
      setRevisionSubmitting(false)
    }
  }

  const handleDelete = async (id) => {
    if (!confirm('Delete this report? Only allowed before your bid manager acts.')) return
    try {
      await api.delete(`/reports/${id}`)
      setReports(prev => prev.filter(r => r._id !== id))
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to delete')
    }
  }

  const hasWeekConflict = useMemo(() => {
    if (!form.profileId) return false
    const t = getPreviousWeekSunday(new Date()).getTime()
    return reports.some(r => {
      const pid = r.profileId?._id || r.profileId
      if (String(pid) !== String(form.profileId)) return false
      return weekStamp(r.weekStartDate) === t
    })
  }, [reports, form.profileId])

  const fetchExpectedPay = async () => {
    try {
      const { data } = await api.get('/salary/expected-pay-bidder')
      setExpectedPayData(data)
      setShowExpectedPay(true)
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to load expected pay')
    }
  }

  if (loading) return <div className="page-loading"><div className="spinner" /></div>

  const hasProfiles = myProfiles.length > 0

  return (
    <div className="page">
      <div className="page-header">
        <h2>My Work</h2>
        <p className="page-desc">
          Submit last week's report per profile. Paid reports move to <strong>Payment history</strong>.
        </p>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button type="button" onClick={fetchExpectedPay} className="btn btn-ghost">Expected Pay</button>
          {hasProfiles && (
            <button type="button" onClick={openForm} className="btn btn-primary">
              {showForm ? 'Cancel' : '+ New report'}
            </button>
          )}
        </div>
      </div>

      {!hasProfiles && (
        <div className="card">
          <p className="empty-state">
            No profiles assigned yet. Your Ops Lead must create profiles before you can submit reports.
          </p>
        </div>
      )}

      {hasProfiles && !showForm && (
        <div className="card">
          <div className="card-header">
            <h3>Your profiles</h3>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            {myProfiles.map(p => (
              <span key={p._id} className="badge" style={{ background: 'var(--surface-hover)', color: 'var(--text)', padding: '0.4rem 0.75rem', fontSize: '0.85rem' }}>
                {p.name} &middot; {p.opsLeadId?.name || 'Ops'}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ── New report form ── */}
      {showForm && hasProfiles && (
        <div className="card report-form-card">
          <div className="report-form-header">
            <h3>New weekly report</h3>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowForm(false)}>Cancel</button>
          </div>

          <div className="report-form-info">
            <div className="payout-pay-row" style={{ margin: '0 0 1rem', background: 'var(--bg)' }}>
              <div className="payout-amounts">
                <span className="payout-label">Reporting for</span>
                <span className="payout-value" style={{ color: 'var(--accent)' }}>
                  {getPreviousWeekSunday(new Date()).toLocaleDateString()} – {getLastSaturday(new Date()).toLocaleDateString()}
                </span>
              </div>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="report-form-body">
            <div className="form-row">
              <label>Profile</label>
              <select value={form.profileId} onChange={e => setForm(f => ({ ...f, profileId: e.target.value }))} required>
                <option value="">Select profile...</option>
                {myProfiles.map(p => (
                  <option key={p._id} value={p._id}>{p.name} ({p.opsLeadId?.name || 'Ops'})</option>
                ))}
              </select>
            </div>

            <div className="form-row">
              <label>Bid count (this week)</label>
              <input
                type="number"
                min="0"
                value={form.bidCount}
                onChange={e => setForm(f => ({ ...f, bidCount: e.target.value }))}
                placeholder="Enter total bids completed"
                required
              />
            </div>

            {hasWeekConflict && (
              <p className="error-msg">You already submitted for this profile for last week.</p>
            )}
            {error && <p className="error-msg">{error}</p>}

            <button type="submit" disabled={submitting || hasWeekConflict} className="btn btn-primary">
              {submitting ? 'Submitting...' : 'Submit report'}
            </button>
          </form>
        </div>
      )}

      {/* ── Reports table ── */}
      <div className="card">
        <div className="card-header">
          <h3>My reports</h3>
          <span className="card-subtitle">{reports.length} report(s)</span>
        </div>
        {reports.length === 0 ? (
          <p className="empty-state">No reports yet. Submit your first weekly report above.</p>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Profile</th>
                  <th>Bids</th>
                  <th>Week</th>
                  <th>Pay</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {reports.map(r => (
                  <Fragment key={r._id}>
                    <tr>
                      <td>{r.profileName}</td>
                      <td>{r.bidCount}</td>
                      <td>{new Date(r.weekStartDate).toLocaleDateString()}</td>
                      <td>
                        {r.workflowStatus === 'confirmed'
                          ? `$${(Number(r.bidCount) * bidRate + (Number(r.bidManagerBonus) || 0)).toFixed(2)}`
                          : '—'}
                      </td>
                      <td>
                        <span className="badge badge-pending">{bidderStatusLabel(r)}</span>
                        {r.workflowStatus === 'awaiting_bidder_revision' && r.declineReason && (
                          <div className="text-muted" style={{ fontSize: '0.8rem', marginTop: '0.35rem', maxWidth: '14rem' }}>
                            Reason: {r.declineReason}
                          </div>
                        )}
                      </td>
                      <td>
                        {r.workflowStatus === 'awaiting_bid_manager' && (
                          <button type="button" onClick={() => handleDelete(r._id)} className="btn btn-ghost btn-sm btn-danger">Delete</button>
                        )}
                        {r.workflowStatus === 'awaiting_bidder_revision' && (
                          <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                            <button type="button" onClick={() => openRevision(r)} className="btn btn-primary btn-sm">
                              {revisionDraft?.reportId === r._id ? 'Close' : 'Revise'}
                            </button>
                            <button type="button" onClick={() => handleDelete(r._id)} className="btn btn-ghost btn-sm btn-danger">Delete</button>
                          </div>
                        )}
                      </td>
                    </tr>

                    {/* ── Inline revision form ── */}
                    {revisionDraft?.reportId === r._id && r.workflowStatus === 'awaiting_bidder_revision' && (
                      <tr className="revision-row">
                        <td colSpan={6}>
                          <div className="revision-form-wrap">
                            <form onSubmit={handleRevisionSubmit}>
                              <p className="card-subtitle" style={{ marginBottom: '0.75rem' }}>
                                Update and resubmit — goes back to your bid manager for approval.
                              </p>
                              <div className="report-form-body">
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem' }}>
                                  <div className="form-row">
                                    <label>Profile</label>
                                    <select
                                      value={revisionDraft.profileId}
                                      onChange={e => setRevisionDraft(d => ({ ...d, profileId: e.target.value }))}
                                      required
                                    >
                                      {myProfiles.map(p => (
                                        <option key={p._id} value={p._id}>{p.name}</option>
                                      ))}
                                    </select>
                                  </div>
                                  <div className="form-row">
                                    <label>Bid count</label>
                                    <input
                                      type="number"
                                      min="0"
                                      value={revisionDraft.bidCount}
                                      onChange={e => setRevisionDraft(d => ({ ...d, bidCount: e.target.value }))}
                                      required
                                    />
                                  </div>
                                  <div className="form-row">
                                    <label>Week start (Sunday)</label>
                                    <input
                                      type="date"
                                      value={revisionDraft.weekStartDate}
                                      onChange={e => setRevisionDraft(d => ({ ...d, weekStartDate: e.target.value }))}
                                      required
                                    />
                                  </div>
                                </div>
                                {revisionError && <p className="error-msg">{revisionError}</p>}
                                <div className="revision-actions">
                                  <button type="submit" disabled={revisionSubmitting} className="btn btn-primary btn-sm">
                                    {revisionSubmitting ? 'Submitting...' : 'Resubmit'}
                                  </button>
                                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRevisionDraft(null)}>Cancel</button>
                                </div>
                              </div>
                            </form>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

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
                    {expectedPayData.formulaSummary || 'bid count x rate + BM bonus (confirmed reports only)'}
                  </p>
                  {expectedPayData.perProfile?.length > 0 && (
                    <div className="table-wrap">
                      <table className="data-table">
                        <thead>
                          <tr><th>Profile</th><th>Week</th><th>BM bonus</th><th>Amount</th></tr>
                        </thead>
                        <tbody>
                          {expectedPayData.perProfile.map((p, i) => (
                            <tr key={p.reportId || i}>
                              <td>{p.profileName}</td>
                              <td>{new Date(p.weekStartDate).toLocaleDateString()}</td>
                              <td>${p.bmBonus ?? '0.00'}</td>
                              <td>${p.amount}</td>
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
