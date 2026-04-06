import { useState, useEffect, useMemo } from 'react'
import { api } from '../api'
import SearchableCombo from '../components/SearchableCombo.jsx'

function clientLabel(c) {
  if (!c) return ''
  return c.email ? `${c.name} · ${c.email}` : c.name
}

export default function AdminClientsProfiles() {
  const [opsLeads, setOpsLeads] = useState([])
  const [selectedOl, setSelectedOl] = useState('')
  const [profiles, setProfiles] = useState([])
  const [clients, setClients] = useState([])
  const [bidders, setBidders] = useState([])
  const [bidManagers, setBidManagers] = useState([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newClientId, setNewClientId] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [editName, setEditName] = useState('')
  const [assignState, setAssignState] = useState({})

  const [newClientName, setNewClientName] = useState('')
  const [newClientEmail, setNewClientEmail] = useState('')
  const [savingClient, setSavingClient] = useState(false)

  const load = () => {
    return Promise.all([
      api.get('/profiles'),
      api.get('/users/bidders'),
      api.get('/users/bid-managers'),
      api.get('/clients'),
      api.get('/users/ops-leads')
    ]).then(([p, b, bm, c, ol]) => {
      setProfiles(p.data)
      setBidders(b.data)
      setBidManagers(bm.data)
      setClients(c.data)
      setOpsLeads(ol.data)
    })
  }

  useEffect(() => {
    load().catch(console.error).finally(() => setLoading(false))
  }, [])

  const filteredClients = useMemo(() => {
    if (!selectedOl) return []
    return clients.filter(c => String(c.opsLeadId?._id || c.opsLeadId) === selectedOl)
  }, [clients, selectedOl])

  const filteredProfiles = useMemo(() => {
    if (!selectedOl) return []
    return profiles.filter(p => String(p.opsLeadId?._id || p.opsLeadId) === selectedOl)
  }, [profiles, selectedOl])

  const teamBMs = useMemo(() => {
    if (!selectedOl) return []
    return bidManagers.filter(bm => String(bm.opsLeadId?._id || bm.opsLeadId) === selectedOl)
  }, [bidManagers, selectedOl])

  const biddersByManager = useMemo(() => {
    const map = {}
    teamBMs.forEach(bm => { map[bm._id] = [] })
    map['__unassigned'] = []
    const teamBmIds = new Set(teamBMs.map(b => String(b._id)))
    bidders.forEach(b => {
      const bmId = b.bidManagerId?._id || b.bidManagerId
      const bmStr = bmId ? String(bmId) : ''
      if (bmStr && teamBmIds.has(bmStr)) map[bmStr].push(b)
      else map['__unassigned'].push(b)
    })
    return map
  }, [bidders, teamBMs])

  useEffect(() => {
    setAssignState(prev => {
      const next = { ...prev }
      filteredProfiles.forEach(u => {
        if (!next[u._id]) next[u._id] = {}
      })
      return next
    })
  }, [filteredProfiles])

  const addClient = async (e) => {
    e.preventDefault()
    if (!newClientName.trim() || !selectedOl) return
    setSavingClient(true)
    try {
      const { data } = await api.post('/clients', {
        name: newClientName.trim(),
        email: newClientEmail.trim(),
        opsLeadId: selectedOl
      })
      setClients(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)))
      setNewClientName('')
      setNewClientEmail('')
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to add client')
    } finally {
      setSavingClient(false)
    }
  }

  const createProfile = async (e) => {
    e.preventDefault()
    if (!newName.trim() || !newClientId || !selectedOl) {
      alert('Choose Ops team, client, and profile name.')
      return
    }
    setCreating(true)
    try {
      const { data } = await api.post('/profiles', {
        name: newName.trim(),
        clientId: newClientId,
        opsLeadId: selectedOl
      })
      setProfiles(prev => [data, ...prev])
      setNewName('')
      setNewClientId('')
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
    const bm = teamBMs.find(m => m._id === String(bmId))
    return bm?.name || null
  }

  const clientLine = (p) => clientLabel(p.clientId) || '—'

  if (loading) return <div className="page-loading"><div className="spinner" /></div>

  const assigned = filteredProfiles.filter(p => p.assignedBidderId)
  const unassigned = filteredProfiles.filter(p => !p.assignedBidderId)

  return (
    <div className="page">
      <div className="page-header">
        <h2>Clients &amp; profiles</h2>
        <p className="page-desc">
          Clients combine account name and contact email. Pick an Ops team, then manage that team&apos;s directory and profiles.
        </p>
      </div>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="card-header">
          <h3>Ops team</h3>
          <span className="card-subtitle">Choose who this directory belongs to</span>
        </div>
        <select
          value={selectedOl}
          onChange={e => setSelectedOl(e.target.value)}
          className="prof-create-input"
          style={{ maxWidth: '420px' }}
        >
          <option value="">Select Ops Lead…</option>
          {opsLeads.map(o => (
            <option key={o._id} value={o._id}>{o.name} ({o.email})</option>
          ))}
        </select>
      </div>

      {!selectedOl ? (
        <div className="card">
          <p className="empty-state">Select an Ops team to manage clients and profiles.</p>
        </div>
      ) : (
        <>
          <div className="card client-contact-card" style={{ marginBottom: '1rem' }}>
            <div className="card-header">
              <h3>Clients &amp; contacts</h3>
              <span className="card-subtitle">One row per client — name and email together</span>
            </div>
            <form onSubmit={addClient} className="prof-inline-form prof-inline-form-2">
              <div className="prof-create-input-wrap">
                <label className="prof-field-label">Company / account name</label>
                <input
                  value={newClientName}
                  onChange={e => setNewClientName(e.target.value)}
                  placeholder="e.g. Acme Corp"
                  className="prof-create-input"
                />
              </div>
              <div className="prof-create-input-wrap">
                <label className="prof-field-label">Contact email</label>
                <input
                  value={newClientEmail}
                  onChange={e => setNewClientEmail(e.target.value)}
                  placeholder="optional"
                  className="prof-create-input"
                  type="email"
                />
              </div>
              <button type="submit" className="btn btn-primary" disabled={savingClient}>
                {savingClient ? '…' : 'Add'}
              </button>
            </form>
            {filteredClients.length > 0 && (
              <div className="client-im-chips">
                {filteredClients.map(c => (
                  <span key={c._id} className="client-chip" title={c.email || c.name}>
                    {clientLabel(c)}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="page-header" style={{ paddingTop: 0 }}>
            <button type="button" className="btn btn-primary" onClick={() => setShowCreate(s => !s)}>
              {showCreate ? 'Cancel' : '+ New profile'}
            </button>
          </div>

          {showCreate && (
            <div className="card prof-create-card">
              <div className="report-form-header">
                <h3>New profile</h3>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowCreate(false)}>Close</button>
              </div>
              <form onSubmit={createProfile} className="prof-create-form prof-create-form-stack">
                <SearchableCombo
                  label="Client *"
                  options={filteredClients}
                  value={newClientId}
                  onChange={setNewClientId}
                  placeholder="Type to filter by name or email…"
                  getLabel={clientLabel}
                />
                <div className="prof-create-input-wrap">
                  <label className="prof-field-label">Profile name *</label>
                  <input
                    value={newName}
                    onChange={e => setNewName(e.target.value)}
                    placeholder="e.g. Alpha campaign"
                    required
                    className="prof-create-input"
                  />
                </div>
                <button type="submit" disabled={creating} className="btn btn-primary">
                  {creating ? 'Creating…' : 'Create profile'}
                </button>
              </form>
            </div>
          )}

          <div className="prof-stats">
            <div className="prof-stat">
              <span className="prof-stat-num">{filteredProfiles.length}</span>
              <span className="prof-stat-label">Profiles</span>
            </div>
            <div className="prof-stat">
              <span className="prof-stat-num">{assigned.length}</span>
              <span className="prof-stat-label">Assigned</span>
            </div>
            <div className="prof-stat">
              <span className="prof-stat-num">{unassigned.length}</span>
              <span className="prof-stat-label">Unassigned</span>
            </div>
          </div>

          {filteredProfiles.length === 0 ? (
            <div className="card">
              <div className="empty-state-box">
                <span className="empty-state-icon">📋</span>
                <p>No profiles for this team yet.</p>
              </div>
            </div>
          ) : (
            <div className="prof-grid">
              {filteredProfiles.map(p => {
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

                    <div className="prof-card-meta-block prof-card-meta-single">
                      <span className="prof-meta-label">Client &amp; contact</span>
                      <span className="prof-meta-value">{clientLine(p)}</span>
                    </div>

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

                    <div className="prof-card-assign">
                      <div className="prof-card-select-row">
                        <label className="prof-field-label">Team (Bid Manager)</label>
                        <select
                          value={selectedBmId}
                          onChange={e => handleBmChange(p._id, e.target.value)}
                        >
                          <option value="">— Select team —</option>
                          {teamBMs.map(bm => (
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

                    <div className="prof-card-footer">
                      <button type="button" className="btn btn-ghost btn-sm btn-danger" onClick={() => remove(p._id)}>Delete</button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}
