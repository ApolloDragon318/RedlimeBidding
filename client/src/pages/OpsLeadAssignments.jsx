import { useState, useEffect, useMemo } from 'react'
import { api } from '../api'

const LEVELS = [
  { value: 'junior', label: 'Junior' },
  { value: 'mid_level', label: 'Mid-level' },
  { value: 'senior', label: 'Senior' },
  { value: 'staff', label: 'Staff' }
]

const levelLabel = (l) => LEVELS.find(x => x.value === l)?.label || (l || '—').replace(/_/g, ' ')

export default function OpsLeadAssignments() {
  const [bidManagers, setBidManagers] = useState([])
  const [bidders, setBidders] = useState([])
  const [loading, setLoading] = useState(true)
  const [assignBidderId, setAssignBidderId] = useState('')
  const [assignBmId, setAssignBmId] = useState('')
  const [assigning, setAssigning] = useState(false)
  const [showForm, setShowForm] = useState(false)

  const [levelRequests, setLevelRequests] = useState([])
  const [lvlModal, setLvlModal] = useState(null)
  const [lvlNewLevel, setLvlNewLevel] = useState('')
  const [lvlReason, setLvlReason] = useState('')
  const [lvlSubmitting, setLvlSubmitting] = useState(false)

  const [rejectModal, setRejectModal] = useState(null)
  const [rejectReason, setRejectReason] = useState('')
  const [rejecting, setRejecting] = useState(false)

  const [tab, setTab] = useState('team')

  useEffect(() => {
    Promise.all([
      api.get('/users/bid-managers'),
      api.get('/users/bidders'),
      api.get('/users/level-requests/my').catch(() => ({ data: [] }))
    ])
      .then(([r1, r2, r3]) => {
        setBidManagers(r1.data)
        setBidders(r2.data)
        setLevelRequests(r3.data || [])
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const assignBidder = async (e) => {
    e.preventDefault()
    if (!assignBidderId || !assignBmId) return
    setAssigning(true)
    try {
      const { data } = await api.patch(`/users/${assignBidderId}/assign-bid-manager`, { bidManagerId: assignBmId })
      setBidders(prev => prev.map(b => b._id === data._id ? data : b))
      setAssignBidderId('')
      setAssignBmId('')
      setShowForm(false)
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to assign')
    } finally {
      setAssigning(false)
    }
  }

  const reassign = async (bidderId, bmId) => {
    setAssigning(true)
    try {
      const { data } = await api.patch(`/users/${bidderId}/assign-bid-manager`, { bidManagerId: bmId || null })
      setBidders(prev => prev.map(b => b._id === data._id ? data : b))
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to reassign')
    } finally {
      setAssigning(false)
    }
  }

  const grouped = useMemo(() => {
    const map = {}
    bidManagers.forEach(bm => { map[bm._id] = { bm, bidders: [] } })
    const unassigned = []
    bidders.forEach(b => {
      const bmId = b.bidManagerId?._id || b.bidManagerId
      if (bmId && map[bmId]) map[bmId].bidders.push(b)
      else unassigned.push(b)
    })
    return { groups: Object.values(map), unassigned }
  }, [bidManagers, bidders])

  const allTeamMembers = useMemo(() => {
    const members = []
    bidManagers.forEach(bm => members.push({ ...bm, _role: 'bid_manager' }))
    bidders.forEach(b => members.push({ ...b, _role: 'bidder' }))
    return members
  }, [bidManagers, bidders])

  const pendingRequestUserIds = new Set(
    levelRequests.filter(r => r.status === 'pending').map(r => r.userId?._id || r.userId)
  )

  const openLevelModal = (member) => {
    setLvlModal(member)
    setLvlNewLevel('')
    setLvlReason('')
  }

  const submitLevelRequest = async () => {
    if (!lvlNewLevel || !lvlReason.trim()) return
    setLvlSubmitting(true)
    try {
      const { data } = await api.post('/users/level-requests', {
        userId: lvlModal._id,
        newLevel: lvlNewLevel,
        reason: lvlReason.trim()
      })
      setLevelRequests(prev => [data, ...prev])
      setLvlModal(null)
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to submit')
    } finally {
      setLvlSubmitting(false)
    }
  }

  const confirmRejectBidder = async () => {
    if (!rejectModal?._id) return
    if (!rejectReason.trim()) {
      alert('Please provide a reason.')
      return
    }
    setRejecting(true)
    try {
      await api.patch(`/users/${rejectModal._id}/reject`, { reason: rejectReason.trim() })
      setBidders(prev => prev.filter(b => b._id !== rejectModal._id))
      setRejectModal(null)
      setRejectReason('')
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to reject')
    } finally {
      setRejecting(false)
    }
  }

  if (loading) return <div className="page-loading"><div className="spinner" /></div>

  return (
    <div className="page">
      <div className="page-header">
        <h2>Team management</h2>
        <p className="page-desc">
          Assignments and level promotions for your team. You can reject a bidder with a reason (only from this list — there is no global user search).
        </p>
      </div>

      <div className="tabs" style={{ marginBottom: '1rem' }}>
        <button type="button" className={tab === 'team' ? 'tab active' : 'tab'} onClick={() => setTab('team')}>
          Assignments
        </button>
        <button type="button" className={tab === 'levels' ? 'tab active' : 'tab'} onClick={() => setTab('levels')}>
          Level requests
          {levelRequests.filter(r => r.status === 'pending').length > 0 && (
            <span className="tab-badge">{levelRequests.filter(r => r.status === 'pending').length}</span>
          )}
        </button>
      </div>

      {/* ── Assignments Tab ── */}
      {tab === 'team' && (
        <>
          <div style={{ marginBottom: '1rem' }}>
            <button type="button" className="btn btn-primary" onClick={() => setShowForm(f => !f)}>
              {showForm ? 'Cancel' : '+ Assign bidder'}
            </button>
          </div>

          {showForm && (
            <div className="card report-form-card">
              <div className="report-form-header">
                <h3>Assign bidder</h3>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowForm(false)}>Cancel</button>
              </div>
              <form onSubmit={assignBidder} className="report-form-body">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div className="form-row">
                    <label>Bidder</label>
                    <select value={assignBidderId} onChange={e => setAssignBidderId(e.target.value)} required>
                      <option value="">Select bidder...</option>
                      {bidders.map(b => (
                        <option key={b._id} value={b._id}>{b.name} ({b.email})</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-row">
                    <label>Bid manager</label>
                    <select value={assignBmId} onChange={e => setAssignBmId(e.target.value)} required>
                      <option value="">Select bid manager...</option>
                      {bidManagers.map(bm => (
                        <option key={bm._id} value={bm._id}>{bm.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <button type="submit" disabled={assigning} className="btn btn-primary btn-sm">
                  {assigning ? 'Saving...' : 'Save assignment'}
                </button>
              </form>
            </div>
          )}

          {grouped.groups.map(({ bm, bidders: bmBidders }) => (
            <div key={bm._id} className="card">
              <div className="card-header">
                <h3>{bm.name}</h3>
                <span className="badge badge-role badge-bid_manager">bid manager</span>
                <span className="badge badge-level">{levelLabel(bm.level)}</span>
                <span className="card-subtitle" style={{ marginLeft: 'auto' }}>
                  {bmBidders.length} bidder{bmBidders.length !== 1 ? 's' : ''}
                </span>
                {!pendingRequestUserIds.has(bm._id) && (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => openLevelModal(bm)} title="Request level change">
                    Level ↑
                  </button>
                )}
              </div>
              {bmBidders.length === 0 ? (
                <p className="empty-state" style={{ padding: '1rem' }}>No bidders assigned yet.</p>
              ) : (
                <div className="assignment-list">
                  {bmBidders.map(b => (
                    <div key={b._id} className="assignment-item">
                      <div className="assignment-info">
                        <span className="assignment-name">{b.name}</span>
                        <span className="assignment-email">{b.email}</span>
                      </div>
                      <span className="badge badge-level">{levelLabel(b.level)}</span>
                      {!pendingRequestUserIds.has(b._id) && (
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => openLevelModal(b)} title="Request level change">
                          Level ↑
                        </button>
                      )}
                      {pendingRequestUserIds.has(b._id) && (
                        <span className="badge badge-pending">Pending</span>
                      )}
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm btn-danger"
                        disabled={assigning}
                        onClick={() => { setRejectModal(b); setRejectReason('') }}
                        title="Reject bidder from the platform"
                      >
                        Reject
                      </button>
                      <select
                        value={bm._id}
                        onChange={e => reassign(b._id, e.target.value)}
                        disabled={assigning}
                        className="assignment-select"
                      >
                        <option value="">— Unassign —</option>
                        {bidManagers.map(m => (
                          <option key={m._id} value={m._id}>{m.name}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}

          {grouped.unassigned.length > 0 && (
            <div className="card">
              <div className="card-header">
                <h3>Unassigned</h3>
                <span className="card-subtitle">{grouped.unassigned.length} bidder{grouped.unassigned.length !== 1 ? 's' : ''}</span>
              </div>
              <div className="assignment-list">
                {grouped.unassigned.map(b => (
                  <div key={b._id} className="assignment-item">
                    <div className="assignment-info">
                      <span className="assignment-name">{b.name}</span>
                      <span className="assignment-email">{b.email}</span>
                    </div>
                    <span className="badge badge-level">{levelLabel(b.level)}</span>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm btn-danger"
                      disabled={assigning}
                      onClick={() => { setRejectModal(b); setRejectReason('') }}
                      title="Reject bidder from the platform"
                    >
                      Reject
                    </button>
                    <select
                      defaultValue=""
                      onChange={e => reassign(b._id, e.target.value)}
                      disabled={assigning}
                      className="assignment-select"
                    >
                      <option value="">— Unassigned —</option>
                      {bidManagers.map(m => (
                        <option key={m._id} value={m._id}>{m.name}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Level Requests Tab ── */}
      {tab === 'levels' && (
        <>
          <div className="card">
            <div className="card-header">
              <h3>Request a level change</h3>
              <span className="card-subtitle">Select a team member below</span>
            </div>
            <div className="lvl-member-grid">
              {allTeamMembers.map(m => {
                const hasPending = pendingRequestUserIds.has(m._id)
                return (
                  <button
                    key={m._id}
                    type="button"
                    className={`lvl-member-card ${hasPending ? 'lvl-member-pending' : ''}`}
                    onClick={() => !hasPending && openLevelModal(m)}
                    disabled={hasPending}
                  >
                    <span className="lvl-member-name">{m.name}</span>
                    <div className="lvl-member-meta">
                      <span className={`badge badge-role badge-${m._role || m.role}`}>
                        {(m._role || m.role || '').replace(/_/g, ' ')}
                      </span>
                      <span className="badge badge-level">{levelLabel(m.level)}</span>
                    </div>
                    {hasPending && <span className="lvl-member-status">Request pending</span>}
                  </button>
                )
              })}
              {allTeamMembers.length === 0 && (
                <p className="empty-state">No team members found.</p>
              )}
            </div>
          </div>

          {levelRequests.length > 0 && (
            <div className="card">
              <div className="card-header">
                <h3>Your requests</h3>
                <span className="card-subtitle">History of level change requests you've submitted</span>
              </div>
              <div className="lvl-request-list">
                {levelRequests.map(r => (
                  <div key={r._id} className={`lvl-request-item lvl-request-${r.status}`}>
                    <div className="lvl-request-header">
                      <span className="lvl-request-name">{r.userId?.name || 'User'}</span>
                      <span className={`badge badge-role badge-${r.userId?.role}`}>
                        {(r.userId?.role || '').replace(/_/g, ' ')}
                      </span>
                      <span className={`badge badge-${r.status}`}>
                        {r.status}
                      </span>
                    </div>
                    <div className="lvl-request-levels">
                      <span className="badge badge-level">{levelLabel(r.currentLevel)}</span>
                      <span className="lvl-arrow">&rarr;</span>
                      <span className="badge badge-level lvl-new">{levelLabel(r.newLevel)}</span>
                    </div>
                    <p className="lvl-request-reason">{r.reason}</p>
                    {r.status === 'declined' && r.declineReason && (
                      <p className="lvl-request-decline">Declined: {r.declineReason}</p>
                    )}
                    <span className="lvl-request-date">{new Date(r.createdAt).toLocaleDateString()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Level request modal ── */}
      {lvlModal && (
        <div className="modal-overlay" onClick={() => !lvlSubmitting && setLvlModal(null)}>
          <div className="modal modal-pay" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Request level change</h3>
              <button type="button" className="modal-close" onClick={() => setLvlModal(null)} disabled={lvlSubmitting}>&times;</button>
            </div>
            <div className="modal-body">
              <div className="lvl-modal-person">
                <span className="lvl-modal-person-name">{lvlModal.name}</span>
                <span className={`badge badge-role badge-${lvlModal._role || lvlModal.role}`}>
                  {(lvlModal._role || lvlModal.role || '').replace(/_/g, ' ')}
                </span>
              </div>

              <div className="lvl-modal-levels">
                <div className="lvl-modal-level-box">
                  <span className="lvl-modal-level-label">Current level</span>
                  <span className="badge badge-level">{levelLabel(lvlModal.level)}</span>
                </div>
                <span className="lvl-arrow lvl-arrow-lg">&rarr;</span>
                <div className="lvl-modal-level-box">
                  <span className="lvl-modal-level-label">New level</span>
                  <select
                    value={lvlNewLevel}
                    onChange={e => setLvlNewLevel(e.target.value)}
                    className="lvl-modal-select"
                    disabled={lvlSubmitting}
                  >
                    <option value="">Select level...</option>
                    {LEVELS.filter(l => l.value !== lvlModal.level).map(l => (
                      <option key={l.value} value={l.value}>{l.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="form-row" style={{ marginTop: '1rem' }}>
                <label>Reason for this change *</label>
                <textarea
                  rows={3}
                  placeholder="Performance improvements, tenure, expanded responsibilities..."
                  value={lvlReason}
                  onChange={e => setLvlReason(e.target.value)}
                  disabled={lvlSubmitting}
                  className="lvl-modal-textarea"
                />
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={lvlSubmitting || !lvlNewLevel || !lvlReason.trim()}
                  onClick={submitLevelRequest}
                >
                  {lvlSubmitting ? 'Submitting...' : 'Submit request'}
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => setLvlModal(null)} disabled={lvlSubmitting}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {rejectModal && (
        <div className="modal-overlay" onClick={() => !rejecting && setRejectModal(null)}>
          <div className="modal modal-pay" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Reject bidder</h3>
              <button type="button" className="modal-close" onClick={() => setRejectModal(null)} disabled={rejecting}>&times;</button>
            </div>
            <div className="modal-body">
              <p className="text-muted" style={{ marginBottom: '0.75rem' }}>
                <strong>{rejectModal.name}</strong> ({rejectModal.email}) will lose access to the platform. This cannot be undone from here; they would need admin support to return.
              </p>
              <div className="form-row">
                <label>Reason *</label>
                <textarea
                  rows={4}
                  placeholder="Explain why this bidder is being removed…"
                  value={rejectReason}
                  onChange={e => setRejectReason(e.target.value)}
                  disabled={rejecting}
                  className="lvl-modal-textarea"
                />
              </div>
              <div className="modal-actions">
                <button
                  type="button"
                  className="btn btn-danger"
                  disabled={rejecting || !rejectReason.trim()}
                  onClick={confirmRejectBidder}
                >
                  {rejecting ? 'Rejecting…' : 'Confirm rejection'}
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => setRejectModal(null)} disabled={rejecting}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
