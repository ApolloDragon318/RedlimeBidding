import { useState, useEffect } from 'react'
import { api } from '../api'

function clientLabel(c) {
  if (!c) return ''
  return c.email ? `${c.name} · ${c.email}` : c.name
}

export default function ClientProfiles() {
  const [clientDoc, setClientDoc] = useState(null)
  const [profiles, setProfiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [editName, setEditName] = useState('')

  const load = () => {
    return Promise.all([
      api.get('/clients/me'),
      api.get('/profiles/client')
    ]).then(([c, p]) => {
      setClientDoc(c.data)
      setProfiles(p.data)
    })
  }

  useEffect(() => {
    load().catch(() => setError('Failed to load')).finally(() => setLoading(false))
  }, [])

  const createProfile = async (e) => {
    e.preventDefault()
    if (!newName.trim() || !clientDoc?._id) return
    setCreating(true)
    setError('')
    try {
      const { data } = await api.post('/profiles', {
        name: newName.trim(),
        clientId: clientDoc._id
      })
      setProfiles(prev => [data, ...prev])
      setNewName('')
      setShowCreate(false)
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create profile')
    } finally {
      setCreating(false)
    }
  }

  const saveRename = async (profileId) => {
    if (!editName.trim()) return
    try {
      const { data } = await api.patch(`/profiles/${profileId}`, { name: editName.trim() })
      setProfiles(prev => prev.map(p => p._id === profileId ? data : p))
      setEditingId(null)
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to rename')
    }
  }

  const remove = async (profileId) => {
    if (!confirm('Delete this profile?')) return
    try {
      await api.delete(`/profiles/${profileId}`)
      setProfiles(prev => prev.filter(p => p._id !== profileId))
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to delete')
    }
  }

  if (loading) return <div className="page-loading"><div className="spinner" /></div>

  return (
    <div className="page">
      <div className="page-header">
        <h2>Your profiles</h2>
        <p className="page-desc">
          Create investigation profiles for your organization. Ops Leads can assign bidders to them from their dashboard.
        </p>
        <button type="button" className="btn btn-primary" onClick={() => setShowCreate(s => !s)}>
          {showCreate ? 'Cancel' : '+ New profile'}
        </button>
      </div>

      {clientDoc && (
        <div className="card" style={{ marginBottom: '1rem' }}>
          <div className="card-header">
            <h3>Organization</h3>
          </div>
          <p className="text-muted" style={{ padding: '0 0 0.5rem' }}>
            <strong>{clientLabel(clientDoc)}</strong>
          </p>
        </div>
      )}

      {error && <p className="error-msg" style={{ marginBottom: '1rem' }}>{error}</p>}

      {showCreate && clientDoc && (
        <div className="card prof-create-card" style={{ marginBottom: '1rem' }}>
          <div className="report-form-header">
            <h3>New profile</h3>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowCreate(false)}>Close</button>
          </div>
          <form onSubmit={createProfile} className="prof-create-form prof-create-form-stack">
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

      {profiles.length === 0 ? (
        <div className="card">
          <div className="empty-state-box">
            <span className="empty-state-icon">📋</span>
            <p>No profiles yet. Create one to get started.</p>
          </div>
        </div>
      ) : (
        <div className="prof-grid">
          {profiles.map(p => {
            const isEditing = editingId === p._id
            const ownerName = p.assignedBidderId?.name
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
                <div className="prof-card-owner">
                  {ownerName ? (
                    <>
                      <span className="prof-card-owner-dot assigned" />
                      <span className="prof-card-owner-name">Assigned: {ownerName}</span>
                    </>
                  ) : (
                    <>
                      <span className="prof-card-owner-dot" />
                      <span className="prof-card-owner-none">Unassigned — Ops Lead will assign a bidder</span>
                    </>
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
    </div>
  )
}
