import { useState, useEffect } from 'react'
import { api } from '../api'

const ROLES = [
  { value: 'bidder', label: 'Bidder' },
  { value: 'bid_manager', label: 'Bid manager' }
]

const LEVELS = [
  { value: 'junior', label: 'Junior' },
  { value: 'mid_level', label: 'Mid-level' },
  { value: 'senior', label: 'Senior' },
  { value: 'staff', label: 'Staff' }
]

export default function OpsLeadOnboarding() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [savingId, setSavingId] = useState(null)
  const [selection, setSelection] = useState({})
  const [rejectModal, setRejectModal] = useState(null)
  const [rejectReason, setRejectReason] = useState('')
  const [rejecting, setRejecting] = useState(false)

  const load = () => {
    setLoading(true)
    api.get('/users/pending-ops')
      .then(({ data }) => setRows(data))
      .catch(() => setError('Failed to load applicants'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  useEffect(() => {
    setSelection(prev => {
      const next = { ...prev }
      rows.forEach(u => {
        if (!next[u._id]) next[u._id] = { role: 'bidder', level: 'mid_level' }
      })
      return next
    })
  }, [rows])

  const openNationalId = async (userId) => {
    try {
      const res = await api.get(`/users/${userId}/national-id`, { responseType: 'blob' })
      const url = URL.createObjectURL(res.data)
      window.open(url, '_blank', 'noopener,noreferrer')
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch {
      alert('Could not open national ID file')
    }
  }

  const openPhoto = async (userId) => {
    try {
      const res = await api.get(`/users/${userId}/photo`, { responseType: 'blob' })
      const url = URL.createObjectURL(res.data)
      window.open(url, '_blank', 'noopener,noreferrer')
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch {
      alert('Could not open profile photo')
    }
  }

  const submitForApproval = async (userId) => {
    const sel = selection[userId]
    if (!sel?.role || !sel?.level) return
    setSavingId(userId)
    setError('')
    try {
      await api.patch(`/users/${userId}/submit-for-approval`, {
        role: sel.role,
        level: sel.level
      })
      setRows(prev => prev.filter(r => r._id !== userId))
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to submit')
    } finally {
      setSavingId(null)
    }
  }

  const openRejectModal = (u) => {
    setRejectModal(u)
    setRejectReason('')
  }

  const confirmReject = async () => {
    if (!rejectModal) return
    if (!rejectReason.trim()) {
      alert('Please provide a reason for rejection.')
      return
    }
    setRejecting(true)
    setError('')
    try {
      await api.patch(`/users/${rejectModal._id}/reject`, { reason: rejectReason.trim() })
      setRows(prev => prev.filter(r => r._id !== rejectModal._id))
      setRejectModal(null)
      setRejectReason('')
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to reject')
    } finally {
      setRejecting(false)
    }
  }

  if (loading) return <div className="page-loading"><div className="spinner" /></div>

  return (
    <div className="page">
      <div className="page-header">
        <h2>Onboarding</h2>
        <p className="page-desc">
          Review applicants, assign role and level, then send to admin for final approval — or reject with feedback so they can fix their application.
        </p>
      </div>

      {/* ── Summary ── */}
      <div className="card">
        <div className="card-header">
          <h3>Applicants</h3>
          <span className="card-subtitle">{rows.length} pending</span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={load} style={{ marginLeft: 'auto' }}>Refresh</button>
        </div>

        {error && <p className="error-msg" style={{ marginBottom: '1rem' }}>{error}</p>}

        {rows.length === 0 ? (
          <div className="payout-empty">
            <div className="payout-empty-icon">&#10003;</div>
            <p>No applicants waiting</p>
            <span>New applicants will appear here after they complete onboarding.</span>
          </div>
        ) : (
          <div className="onboard-list">
            {rows.map(u => {
              const sel = selection[u._id] || { role: 'bidder', level: 'mid_level' }
              const isSaving = savingId === u._id
              return (
                <div key={u._id} className="onboard-item">
                  <div className="onboard-item-person">
                    <span className="onboard-item-name">{u.name}</span>
                    <span className="onboard-item-email">{u.email}</span>
                    <div className="onboard-item-meta">
                      {u.phone && <span>{u.phone}</span>}
                      {u.country && <span>{u.country}</span>}
                      {u.legalFirstName && (
                        <span className="text-muted">
                          {[u.legalFirstName, u.legalMiddleName, u.legalLastName].filter(Boolean).join(' ')}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="onboard-item-docs">
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => openPhoto(u._id)}>Photo</button>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => openNationalId(u._id)}>ID</button>
                  </div>

                  <div className="onboard-item-assign">
                    <div className="onboard-select-group">
                      <label>Role</label>
                      <select
                        value={sel.role}
                        onChange={e => setSelection(s => ({
                          ...s,
                          [u._id]: { ...s[u._id], role: e.target.value }
                        }))}
                      >
                        {ROLES.map(r => (
                          <option key={r.value} value={r.value}>{r.label}</option>
                        ))}
                      </select>
                    </div>
                    <div className="onboard-select-group">
                      <label>Level</label>
                      <select
                        value={sel.level}
                        onChange={e => setSelection(s => ({
                          ...s,
                          [u._id]: { ...s[u._id], level: e.target.value }
                        }))}
                      >
                        {LEVELS.map(l => (
                          <option key={l.value} value={l.value}>{l.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="onboard-item-actions">
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      disabled={isSaving}
                      onClick={() => submitForApproval(u._id)}
                    >
                      {isSaving ? 'Sending...' : 'Send to admin'}
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm btn-danger"
                      disabled={isSaving}
                      onClick={() => openRejectModal(u)}
                    >
                      Reject
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {rejectModal && (
        <div className="modal-backdrop" onClick={() => !rejecting && setRejectModal(null)}>
          <div className="modal-pay" onClick={e => e.stopPropagation()}>
            <h3>Reject applicant</h3>
            <p className="text-muted" style={{ marginBottom: '0.75rem' }}>
              <strong>{rejectModal.name}</strong> ({rejectModal.email}) will be sent back to onboarding and can resubmit after reviewing your feedback.
            </p>
            <label className="pending-reject-label">Reason for rejection *</label>
            <textarea
              className="pending-reject-textarea"
              rows={3}
              placeholder="Explain what needs to be corrected…"
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
            />
            <div className="modal-pay-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setRejectModal(null)} disabled={rejecting}>Cancel</button>
              <button type="button" className="btn btn-danger" onClick={confirmReject} disabled={rejecting || !rejectReason.trim()}>
                {rejecting ? 'Rejecting…' : 'Confirm rejection'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
