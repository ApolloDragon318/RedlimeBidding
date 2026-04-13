import { useState, useEffect, useCallback, useRef } from 'react'
import { api } from '../api'

const emptyForm = {
  legalFirstName: '',
  legalMiddleName: '',
  legalLastName: '',
  phone: '',
  linkedinUrl: '',
  facebookUrl: '',
  address: '',
  nationality: '',
  country: '',
  state: '',
  currentPassword: '',
  newPassword: ''
}

export default function ProfilePage({ onSaved }) {
  const [form, setForm] = useState(emptyForm)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [photoUrl, setPhotoUrl] = useState(null)
  const [photoFile, setPhotoFile] = useState(null)
  const [meta, setMeta] = useState({ email: '', role: '', level: '', name: '' })
  const [currentWallet, setCurrentWallet] = useState('')
  const [walletPending, setWalletPending] = useState(null)
  const [newWalletRequest, setNewWalletRequest] = useState('')
  const [walletUserNote, setWalletUserNote] = useState('')
  const [walletSubmitting, setWalletSubmitting] = useState(false)
  const [walletMsg, setWalletMsg] = useState({ error: '', success: '' })
  const photoRef = useRef(null)

  const loadPhoto = useCallback(() => {
    api.get('/auth/profile-photo', { responseType: 'blob' })
      .then(res => {
        setPhotoUrl(prev => {
          if (prev) URL.revokeObjectURL(prev)
          return URL.createObjectURL(res.data)
        })
      })
      .catch(() => {
        setPhotoUrl(prev => {
          if (prev) URL.revokeObjectURL(prev)
          return null
        })
      })
  }, [])

  const load = useCallback(() => {
    setLoading(true)
    api.get('/auth/me')
      .then(({ data }) => {
        const u = data.user
        setMeta({
          email: u.email || '',
          role: u.role || '',
          level: u.level || '',
          name: u.name || ''
        })
        setForm({
          ...emptyForm,
          legalFirstName: u.legalFirstName || '',
          legalMiddleName: u.legalMiddleName || '',
          legalLastName: u.legalLastName || '',
          phone: u.phone || '',
          linkedinUrl: u.linkedinUrl || '',
          facebookUrl: u.facebookUrl || '',
          address: u.address || '',
          nationality: u.nationality || '',
          country: u.country || '',
          state: u.state || ''
        })
        setCurrentWallet(u.usdtErc20Wallet || '')
        if (u.role !== 'client') loadPhoto()
      })
      .catch(() => setError('Failed to load profile'))
      .finally(() => setLoading(false))
  }, [loadPhoto])

  const loadWalletPending = useCallback(() => {
    api.get('/auth/wallet-change-request/me')
      .then(({ data }) => setWalletPending(data.pending))
      .catch(() => setWalletPending(null))
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (meta.role && meta.role !== 'client') loadWalletPending()
  }, [meta.role, loadWalletPending])

  useEffect(() => {
    return () => {
      if (photoUrl) URL.revokeObjectURL(photoUrl)
    }
  }, [photoUrl])

  const setField = (key, value) => setForm(f => ({ ...f, [key]: value }))

  const submitWalletChangeRequest = async () => {
    setWalletMsg({ error: '', success: '' })
    setWalletSubmitting(true)
    try {
      await api.post('/auth/wallet-change-request', {
        requestedWallet: newWalletRequest.trim(),
        userNote: walletUserNote.trim()
      })
      setWalletMsg({ error: '', success: 'Request submitted. An admin or financial manager will review it.' })
      setNewWalletRequest('')
      setWalletUserNote('')
      loadWalletPending()
    } catch (err) {
      setWalletMsg({ error: err.response?.data?.error || 'Request failed', success: '' })
    } finally {
      setWalletSubmitting(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    setSaving(true)
    try {
      const fd = new FormData()
      fd.append('legalFirstName', form.legalFirstName)
      fd.append('legalMiddleName', form.legalMiddleName)
      fd.append('legalLastName', form.legalLastName)
      fd.append('phone', form.phone)
      fd.append('linkedinUrl', form.linkedinUrl)
      fd.append('facebookUrl', form.facebookUrl)
      fd.append('address', form.address)
      fd.append('nationality', form.nationality)
      fd.append('country', form.country)
      fd.append('state', form.state)
      if (form.newPassword) {
        fd.append('currentPassword', form.currentPassword)
        fd.append('newPassword', form.newPassword)
      }
      if (photoFile) fd.append('photo', photoFile)

      await api.patch('/auth/profile', fd)
      if (meta.role === 'client') {
        const display = [form.legalFirstName, form.legalMiddleName, form.legalLastName].filter(Boolean).join(' ').trim()
        if (display) {
          await api.patch('/clients/me', { name: display }).catch(() => {})
        }
      }
      setSuccess('Profile saved successfully.')
      setPhotoFile(null)
      setForm(f => ({ ...f, currentPassword: '', newPassword: '' }))
      if (meta.role !== 'client') loadPhoto()
      const me = await api.get('/auth/me')
      setCurrentWallet(me.data.user?.usdtErc20Wallet || '')
      if (onSaved) onSaved()
    } catch (err) {
      setError(err.response?.data?.error || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="page-loading"><div className="spinner" /></div>

  return (
    <div className="page">
      <div className="page-header">
        <h2>My profile</h2>
        <p className="page-desc">
          {meta.role === 'client'
            ? 'Update your name and password. Manage investigation profiles from My profiles.'
            : 'Manage your personal information and documents. USDT payout wallet changes require admin or finance approval.'}
        </p>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="profile-grid">
          {/* ── Sidebar ── */}
          <div className="card profile-sidebar">
            <div className="profile-avatar">
              {photoUrl
                ? <img src={photoUrl} alt="Profile" />
                : <span className="profile-avatar-empty">No photo</span>}
            </div>
            <div className="profile-user-info">
              <span className="profile-user-name">{meta.name}</span>
              <span className="profile-user-email">{meta.email}</span>
              <div>
                <span className="badge badge-role badge-pending">{meta.role?.replace(/_/g, ' ')}</span>
                {meta.level && (
                  <span className="badge" style={{ marginLeft: '0.35rem', background: 'var(--surface-hover)', color: 'var(--text-muted)' }}>
                    {String(meta.level).replace(/_/g, ' ')}
                  </span>
                )}
              </div>
            </div>
            {meta.role !== 'client' && (
              <div className="profile-upload-area">
                <label className="upload-label" onClick={() => photoRef.current?.click()}>
                  <span>{photoFile ? photoFile.name : 'Change photo'}</span>
                </label>
                <input ref={photoRef} type="file" accept=".jpg,.jpeg,.png,.gif,.webp,image/*" onChange={e => setPhotoFile(e.target.files?.[0] || null)} />
              </div>
            )}
          </div>

          {/* ── Main form ── */}
          <div className="card profile-main-form">
            <div className="profile-section">
              <h4 className="profile-section-title">Legal name</h4>
              <div className="profile-fields profile-fields-3">
                <div className="form-row">
                  <label>First name</label>
                  <input type="text" value={form.legalFirstName} onChange={e => setField('legalFirstName', e.target.value)} required />
                </div>
                <div className="form-row">
                  <label>Middle name</label>
                  <input type="text" value={form.legalMiddleName} onChange={e => setField('legalMiddleName', e.target.value)} />
                </div>
                <div className="form-row">
                  <label>Last name</label>
                  <input type="text" value={form.legalLastName} onChange={e => setField('legalLastName', e.target.value)} required={meta.role !== 'client'} />
                </div>
              </div>
            </div>

            {meta.role !== 'client' && (
            <div className="profile-section">
              <h4 className="profile-section-title">Contact</h4>
              <div className="profile-fields profile-fields-2">
                <div className="form-row">
                  <label>Phone</label>
                  <input type="tel" value={form.phone} onChange={e => setField('phone', e.target.value)} required />
                </div>
              </div>
            </div>
            )}

            {meta.role !== 'client' && (
            <div className="profile-section">
              <h4 className="profile-section-title">Social</h4>
              <div className="profile-fields profile-fields-2">
                <div className="form-row">
                  <label>LinkedIn</label>
                  <input type="url" value={form.linkedinUrl} onChange={e => setField('linkedinUrl', e.target.value)} placeholder="https://linkedin.com/in/..." />
                </div>
                <div className="form-row">
                  <label>Facebook</label>
                  <input type="url" value={form.facebookUrl} onChange={e => setField('facebookUrl', e.target.value)} placeholder="https://facebook.com/..." />
                </div>
              </div>
            </div>
            )}

            {meta.role !== 'client' && (
            <div className="profile-section">
              <h4 className="profile-section-title">Address</h4>
              <div className="profile-fields">
                <div className="form-row">
                  <label>Street address</label>
                  <input type="text" value={form.address} onChange={e => setField('address', e.target.value)} required />
                </div>
              </div>
              <div className="profile-fields profile-fields-3" style={{ marginTop: '0.75rem' }}>
                <div className="form-row">
                  <label>Nationality</label>
                  <input type="text" value={form.nationality} onChange={e => setField('nationality', e.target.value)} required />
                </div>
                <div className="form-row">
                  <label>Country</label>
                  <input type="text" value={form.country} onChange={e => setField('country', e.target.value)} required />
                </div>
                <div className="form-row">
                  <label>State / Region</label>
                  <input type="text" value={form.state} onChange={e => setField('state', e.target.value)} required />
                </div>
              </div>
            </div>
            )}

            {meta.role !== 'client' && (
            <div className="profile-section">
              <h4 className="profile-section-title">ERC-20 payout wallet</h4>
              <p className="text-muted" style={{ marginBottom: '0.75rem', fontSize: '0.9rem' }}>
                Your registered wallet cannot be edited here. Submit a change request below; it will be applied after approval.
              </p>
              <div className="profile-fields">
                <div className="form-row">
                  <label>Current USDT wallet</label>
                  <code className="profile-wallet-readonly">{currentWallet || '— none on file —'}</code>
                </div>
              </div>
              {walletPending && (
                <div className="profile-wallet-pending" style={{ marginTop: '0.75rem' }}>
                  <strong>Pending change request</strong>
                  <p className="text-muted" style={{ margin: '0.35rem 0 0', fontSize: '0.85rem' }}>
                    Requested: <code className="mono-text">{walletPending.requestedWallet}</code>
                    {walletPending.userNote ? <span> — {walletPending.userNote}</span> : null}
                  </p>
                </div>
              )}
              {!walletPending && (
                <div className="profile-wallet-request" style={{ marginTop: '1rem' }}>
                  <div className="profile-fields">
                    <div className="form-row">
                      <label>New wallet address</label>
                      <input
                        type="text"
                        value={newWalletRequest}
                        onChange={e => setNewWalletRequest(e.target.value)}
                        placeholder="0x..."
                        spellCheck={false}
                        autoComplete="off"
                      />
                    </div>
                    <div className="form-row">
                      <label>Note for reviewers (optional)</label>
                      <input
                        type="text"
                        value={walletUserNote}
                        onChange={e => setWalletUserNote(e.target.value)}
                        placeholder="Brief context"
                        maxLength={500}
                      />
                    </div>
                  </div>
                  {(walletMsg.error || walletMsg.success) && (
                    <div style={{ padding: '0.5rem 0 0' }}>
                      {walletMsg.error && <p className="error-msg">{walletMsg.error}</p>}
                      {walletMsg.success && <p className="success-msg">{walletMsg.success}</p>}
                    </div>
                  )}
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    style={{ marginTop: '0.5rem' }}
                    disabled={walletSubmitting || !newWalletRequest.trim()}
                    onClick={submitWalletChangeRequest}
                  >
                    {walletSubmitting ? 'Submitting…' : 'Request wallet change'}
                  </button>
                </div>
              )}
            </div>
            )}

            <div className="profile-section">
              <h4 className="profile-section-title">Change password</h4>
              <div className="profile-fields profile-fields-2">
                <div className="form-row">
                  <label>Current password</label>
                  <input type="password" value={form.currentPassword} onChange={e => setField('currentPassword', e.target.value)} autoComplete="current-password" />
                </div>
                <div className="form-row">
                  <label>New password</label>
                  <input type="password" value={form.newPassword} onChange={e => setField('newPassword', e.target.value)} autoComplete="new-password" placeholder="Min 6 characters" />
                </div>
              </div>
            </div>

            {(error || success) && (
              <div style={{ padding: '0.75rem 0 0' }}>
                {error && <p className="error-msg">{error}</p>}
                {success && <p className="success-msg">{success}</p>}
              </div>
            )}

            <div style={{ padding: '1rem 0 0' }}>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? 'Saving...' : 'Save profile'}
              </button>
            </div>
          </div>
        </div>
      </form>
    </div>
  )
}
