import { useState, useEffect, useMemo } from 'react'
import { api } from '../api'

export default function OpsLeadAssignments() {
  const [bidManagers, setBidManagers] = useState([])
  const [bidders, setBidders] = useState([])
  const [loading, setLoading] = useState(true)
  const [assignBidderId, setAssignBidderId] = useState('')
  const [assignBmId, setAssignBmId] = useState('')
  const [assigning, setAssigning] = useState(false)
  const [showForm, setShowForm] = useState(false)

  useEffect(() => {
    Promise.all([api.get('/users/bid-managers'), api.get('/users/bidders')])
      .then(([r1, r2]) => {
        setBidManagers(r1.data)
        setBidders(r2.data)
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

  if (loading) return <div className="page-loading"><div className="spinner" /></div>

  return (
    <div className="page">
      <div className="page-header">
        <h2>Assignments</h2>
        <p className="page-desc">Assign bidders to bid managers on your team.</p>
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

      {/* Grouped by bid manager */}
      {grouped.groups.map(({ bm, bidders: bmBidders }) => (
        <div key={bm._id} className="card">
          <div className="card-header">
            <h3>{bm.name}</h3>
            <span className="badge badge-role badge-bid_manager">bid manager</span>
            <span className="card-subtitle">{bm.email}</span>
            <span className="card-subtitle" style={{ marginLeft: 'auto' }}>
              {bmBidders.length} bidder{bmBidders.length !== 1 ? 's' : ''}
            </span>
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
            <span className="card-subtitle">{grouped.unassigned.length} bidder{grouped.unassigned.length !== 1 ? 's' : ''} without a bid manager</span>
          </div>
          <div className="assignment-list">
            {grouped.unassigned.map(b => (
              <div key={b._id} className="assignment-item">
                <div className="assignment-info">
                  <span className="assignment-name">{b.name}</span>
                  <span className="assignment-email">{b.email}</span>
                </div>
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

      {bidders.length === 0 && grouped.groups.every(g => g.bidders.length === 0) && (
        <div className="card">
          <p className="empty-state">No bidders visible yet.</p>
        </div>
      )}
    </div>
  )
}
