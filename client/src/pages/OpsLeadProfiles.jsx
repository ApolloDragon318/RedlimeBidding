import { useState, useEffect, useMemo } from 'react'
import { api } from '../api'

export default function OpsLeadProfiles() {
  const [profiles, setProfiles] = useState([])
  const [bidders, setBidders] = useState([])
  const [bidManagers, setBidManagers] = useState([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [editName, setEditName] = useState('')
  const [assignState, setAssignState] = useState({})

  const load = () => {
    return Promise.all([
      api.get('/profiles'),
      api.get('/users/bidders'),
      api.get('/users/bid-managers')
    ]).then(([p, b, bm]) => {
      setProfiles(p.data)
      setBidders(b.data)
      setBidManagers(bm.data)
    })
  }

  useEffect(() => {
    load().catch(console.error).finally(() => setLoading(false))
  }, [])

  const biddersByManager = useMemo(() => {
    const map = {}
    bidManagers.forEach(bm => { map[bm._id] = [] })
    map['__unassigned'] = []
    bidders.forEach(b => {
      const bmId = b.bidManagerId?._id || b.bidManagerId
      if (bmId && map[bmId]) {
        map[bmId].push(b)
      } else {
        map['__unassigned'].push(b)
      }
    })
    return map
  }, [bidders, bidManagers])

  const createProfile = async (e) => {
    e.preventDefault()
    if (!newName.trim()) return
    setCreating(true)
    try {
      const { data } = await api.post('/profiles', { name: newName.trim() })
      setProfiles(prev => [data, ...prev])
      setNewName('')
      setShowCreate(false)
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to create profile')
    } finally {
      setCreating(false)
    }
  }

  const getAssignBmId = (profileId, profile) => {
    if (assignState[profileId]?.bmId !== undefined) return assignState[profileId].bmId
    const bidder = profile.assignedBidderId
    if (!bidder) return ''
    const bmId = bidder.bidManagerId?._id || bidder.bidManagerId || ''
    return bmId ? String(bmId) : ''
  }

  const handleBmChange = (profileId, bmId) => {
    setAssignState(prev => ({
      ...prev,
      [profileId]: { bmId, bidderId: '' }
    }))
  }

  const handleBidderChange = async (profileId, bidderId) => {
    setAssignState(prev => ({
      ...prev,
      [profileId]: { ...prev[profileId], bidderId }
    }))
    try {
      const { data } = await api.patch(`/profiles/${profileId}`, {
        assignedBidderId: bidderId || null
      })
      setProfiles(prev => prev.map(p => p._id === profileId ? data : p))
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to update')
    }
  }

  const saveRename = async (profileId) => {
    if (!editName.trim()) return
    try {
      const { data } = await api.patch(`/profiles/${profileId}`, { name: editName.trim() })
      setProfiles(prev => prev.map(p => p._id === profileId ? data : p))
      setEditingId(null)
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to rename')
    }
  }

  const remove = async (profileId) => {
    if (!confirm('Delete this profile?')) return
    try {
      await api.delete(`/profiles/${profileId}`)
      setProfiles(prev => prev.filter(p => p._id !== profileId))
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to delete')
    }
  }

  const getBidderName = (p) => {
    if (p.assignedBidderId?.name) return p.assignedBidderId.name
    return null
  }

  const getBmName = (p) => {
    const bidder = p.assignedBidderId
    if (!bidder) return null
    const bmId = bidder.bidManagerId?._id || bidder.bidManagerId
    if (!bmId) return null
    const bm = bidManagers.find(m => m._id === String(bmId))
    return bm?.name || null
  }

  if (loading) return <div className="page-loading"><div className="spinner" /></div>

  const assigned = profiles.filter(p => p.assignedBidderId)
  const unassigned = profiles.filter(p => !p.assignedBidderId)

  return (
    <div className="page">
      <div className="page-header">
        <h2>Profile assignment</h2>
        <p className="page-desc">
          Create work profiles and assign bidders from your teams. Bidders choose a profile when submitting weekly reports.
        </p>
        <button type="button" className="btn btn-primary" onClick={() => setShowCreate(s => !s)}>
          {showCreate ? 'Cancel' : '+ New profile'}
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="card prof-create-card">
          <form onSubmit={createProfile} className="prof-create-form">
            <div className="prof-create-input-wrap">
              <label className="prof-field-label">Profile name</label>
              <input
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="e.g. Client A"
                autoFocus
                required
                className="prof-create-input"
              />
            </div>
            <button type="submit" disabled={creating} className="btn btn-primary">
              {creating ? 'Creating…' : 'Create'}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setShowCreate(false)}>Cancel</button>
          </form>
        </div>
      )}

      {/* Stats */}
      <div className="prof-stats">
        <div className="prof-stat">
          <span className="prof-stat-num">{profiles.length}</span>
          <span className="prof-stat-label">Total profiles</span>
        </div>
        <div className="prof-stat">
          <span className="prof-stat-num">{assigned.length}</span>
          <span className="prof-stat-label">Assigned</span>
        </div>
        <div className="prof-stat">
          <span className="prof-stat-num">{unassigned.length}</span>
          <span className="prof-stat-label">Unassigned</span>
        </div>
        <div className="prof-stat">
          <span className="prof-stat-num">{bidManagers.length}</span>
          <span className="prof-stat-label">Teams</span>
        </div>
      </div>

      {/* Profile cards */}
      {profiles.length === 0 ? (
        <div className="card">
          <div className="empty-state-box">
            <span className="empty-state-icon">📋</span>
            <p>No profiles yet. Create one above to get started.</p>
          </div>
        </div>
      ) : (
        <div className="prof-grid">
          {profiles.map(p => {
            const isEditing = editingId === p._id
            const currentBidderId = p.assignedBidderId?._id || p.assignedBidderId || ''
            const selectedBmId = getAssignBmId(p._id, p)
            const selectedBidderId = assignState[p._id]?.bidderId !== undefined
              ? assignState[p._id].bidderId
              : String(currentBidderId)
            const biddersInTeam = selectedBmId ? (biddersByManager[selectedBmId] || []) : []
            const ownerName = getBidderName(p)
            const teamName = getBmName(p)

            return (
              <div key={p._id} className="prof-card">
                {/* Header with name */}
                <div className="prof-card-header">
                  {isEditing ? (
                    <div className="prof-card-edit">
                      <input
                        value={editName}
                        onChange={e => setEditName(e.target.value)}
                        autoFocus
                        onKeyDown={e => { if (e.key === 'Enter') saveRename(p._id); if (e.key === 'Escape') setEditingId(null) }}
                        className="prof-card-edit-input"
                      />
                      <button type="button" className="btn btn-primary btn-sm" onClick={() => saveRename(p._id)}>Save</button>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditingId(null)}>Cancel</button>
                    </div>
                  ) : (
                    <>
                      <h4 className="prof-card-name">{p.name}</h4>
                      <button
                        type="button"
                        className="prof-card-rename"
                        onClick={() => { setEditingId(p._id); setEditName(p.name) }}
                        title="Rename"
                      >✎</button>
                    </>
                  )}
                </div>

                {/* Owner info */}
                <div className="prof-card-owner">
                  {ownerName ? (
                    <>
                      <span className="prof-card-owner-dot assigned" />
                      <div className="prof-card-owner-info">
                        <span className="prof-card-owner-name">{ownerName}</span>
                        {teamName && <span className="prof-card-owner-team">{teamName}&apos;s team</span>}
                      </div>
                    </>
                  ) : (
                    <>
                      <span className="prof-card-owner-dot" />
                      <span className="prof-card-owner-none">Unassigned</span>
                    </>
                  )}
                </div>

                {/* Assign selects */}
                <div className="prof-card-assign">
                  <div className="prof-card-select-row">
                    <label className="prof-field-label">Team (Bid Manager)</label>
                    <select
                      value={selectedBmId}
                      onChange={e => handleBmChange(p._id, e.target.value)}
                    >
                      <option value="">— Select team —</option>
                      {bidManagers.map(bm => (
                        <option key={bm._id} value={bm._id}>
                          {bm.name} ({(biddersByManager[bm._id] || []).length} bidder{(biddersByManager[bm._id] || []).length !== 1 ? 's' : ''})
                        </option>
                      ))}
                    </select>
                  </div>
                  {selectedBmId && (
                    <div className="prof-card-select-row">
                      <label className="prof-field-label">Bidder</label>
                      <select
                        value={selectedBidderId}
                        onChange={e => handleBidderChange(p._id, e.target.value)}
                      >
                        <option value="">— Select bidder —</option>
                        {biddersInTeam.map(b => (
                          <option key={b._id} value={b._id}>{b.name}</option>
                        ))}
                      </select>
                      {biddersInTeam.length === 0 && (
                        <span className="prof-card-no-bidders">No bidders in this team</span>
                      )}
                    </div>
                  )}
                </div>

                {/* Footer */}
                <div className="prof-card-footer">
                  <button type="button" className="btn btn-ghost btn-sm btn-danger" onClick={() => remove(p._id)}>Delete</button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
