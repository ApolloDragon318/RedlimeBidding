import { useState } from 'react'
import { api } from '../api'

const ROLE_LABELS = { bidder: 'Bidder', bid_manager: 'Bid Manager', ops_lead: 'Ops Lead' }
const LEVEL_LABELS = { junior: 'Junior', mid_level: 'Mid-level', senior: 'Senior', staff: 'Staff' }
const RATE_UNITS = { bidder: '$ / bid', bid_manager: '$ / profile', ops_lead: '$ / person' }

export default function SalaryRateGrid({ grid, roles, levels, onUpdate }) {
  const [editing, setEditing] = useState(null)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(null)

  const startEdit = (role, level) => {
    const val = grid[role]?.[level] ?? 0
    setEditing(`${role}:${level}`)
    setDraft(String(val))
  }

  const cancel = () => { setEditing(null); setDraft('') }

  const save = async (role, level) => {
    const newVal = Number(draft)
    const oldVal = grid[role]?.[level] ?? 0
    if (isNaN(newVal) || newVal < 0) { cancel(); return }
    if (newVal === oldVal) { cancel(); return }
    const key = `${role}:${level}`
    setSaving(key)
    try {
      const res = await api.put('/salary/rate', { role, level, rate: newVal })
      if (onUpdate) onUpdate(res.data)
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to save')
    } finally {
      setSaving(null)
      setEditing(null)
      setDraft('')
    }
  }

  if (!roles?.length || !levels?.length) {
    return <p className="empty-state">Loading salary configuration...</p>
  }

  return (
    <div className="card">
      <div className="card-header">
        <h3>Salary rates</h3>
        <span className="card-subtitle">Same role &amp; level = same pay rate</span>
      </div>

      <div className="rate-formula-bar">
        <div className="rate-formula">
          <span className="rate-formula-role">Bidder</span>
          <span>bid count &times; rate + BM bonus</span>
        </div>
        <div className="rate-formula">
          <span className="rate-formula-role">Bid Manager</span>
          <span>profiles &times; rate + Ops bonus</span>
        </div>
        <div className="rate-formula">
          <span className="rate-formula-role">Ops Lead</span>
          <span>people &times; rate + admin bonus</span>
        </div>
      </div>

      <div className="rate-grid-wrap">
        <table className="rate-grid">
          <thead>
            <tr>
              <th className="rate-grid-corner">Role \ Level</th>
              {levels.map(l => (
                <th key={l}>{LEVEL_LABELS[l] || l}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {roles.map(role => (
              <tr key={role}>
                <td className="rate-grid-role">
                  <span>{ROLE_LABELS[role] || role}</span>
                  <span className="rate-grid-unit">{RATE_UNITS[role]}</span>
                </td>
                {levels.map(level => {
                  const key = `${role}:${level}`
                  const val = grid[role]?.[level] ?? 0
                  const isEditing = editing === key
                  const isSaving = saving === key

                  return (
                    <td key={level} className="rate-grid-cell">
                      {isEditing ? (
                        <div className="rate-edit-group">
                          <input
                            type="number"
                            step="0.001"
                            min="0"
                            autoFocus
                            className="rate-grid-input rate-grid-input-active"
                            value={draft}
                            disabled={isSaving}
                            onChange={e => setDraft(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') save(role, level)
                              if (e.key === 'Escape') cancel()
                            }}
                          />
                          <div className="rate-edit-actions">
                            <button
                              type="button"
                              className="rate-btn rate-btn-save"
                              disabled={isSaving}
                              onClick={() => save(role, level)}
                              title="Save"
                            >
                              {isSaving ? '...' : '✓'}
                            </button>
                            <button
                              type="button"
                              className="rate-btn rate-btn-cancel"
                              disabled={isSaving}
                              onClick={cancel}
                              title="Cancel"
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="rate-display"
                          onClick={() => startEdit(role, level)}
                          title="Click to edit"
                        >
                          <span className="rate-display-value">
                            {val > 0 ? `$${val}` : '—'}
                          </span>
                          <span className="rate-display-edit">Edit</span>
                        </button>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-muted" style={{ fontSize: '0.78rem', marginTop: '0.75rem' }}>
        Click any cell to edit. All employees with the same role &amp; level share the same rate.
      </p>
    </div>
  )
}
