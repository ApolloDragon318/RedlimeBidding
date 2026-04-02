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
  usdtErc20Wallet: '',
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
          state: u.state || '',
          usdtErc20Wallet: u.usdtErc20Wallet || ''
        })
        loadPhoto()
      })
      .catch(() => setError('Failed to load profile'))
      .finally(() => setLoading(false))
  }, [loadPhoto])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    return () => {
      if (photoUrl) URL.revokeObjectURL(photoUrl)
    }
  }, [photoUrl])

  const setField = (key, value) => setForm(f => ({ ...f, [key]: value }))

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
      fd.append('usdtErc20Wallet', form.usdtErc20Wallet)
      if (form.newPassword) {
        fd.append('currentPassword', form.currentPassword)
        fd.append('newPassword', form.newPassword)
      }
      if (photoFile) fd.append('photo', photoFile)

      await api.patch('/auth/profile', fd)
      setSuccess('Profile saved successfully.')
      setPhotoFile(null)
      setForm(f => ({ ...f, currentPassword: '', newPassword: '' }))
      loadPhoto()
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
        <p className="page-desc">Manage your personal information, documents, and payout wallet.</p>
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
            <div className="profile-upload-area">
              <label className="upload-label" onClick={() => photoRef.current?.click()}>
                <span>{photoFile ? photoFile.name : 'Change photo'}</span>
              </label>
              <input ref={photoRef} type="file" accept=".jpg,.jpeg,.png,.gif,.webp,image/*" onChange={e => setPhotoFile(e.target.files?.[0] || null)} />
            </div>
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
                  <input type="text" value={form.legalLastName} onChange={e => setField('legalLastName', e.target.value)} required />
                </div>
              </div>
            </div>

            <div className="profile-section">
              <h4 className="profile-section-title">Contact</h4>
              <div className="profile-fields profile-fields-2">
                <div className="form-row">
                  <label>Phone</label>
                  <input type="tel" value={form.phone} onChange={e => setField('phone', e.target.value)} required />
                </div>
              </div>
            </div>

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

            <div className="profile-section">
              <h4 className="profile-section-title">ERC-20 payout wallet</h4>
              <div className="profile-fields">
                <div className="form-row">
                  <label>USDT wallet address</label>
                  <input type="text" value={form.usdtErc20Wallet} onChange={e => setField('usdtErc20Wallet', e.target.value)} placeholder="0x..." spellCheck={false} autoComplete="off" />
                </div>
              </div>
            </div>

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
