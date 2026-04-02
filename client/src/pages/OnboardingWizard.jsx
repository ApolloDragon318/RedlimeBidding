import { useState, useRef } from 'react'
import { api } from '../api'

const STEPS = [
  { key: 'track', label: 'Role' },
  { key: 'name', label: 'Identity' },
  { key: 'contact', label: 'Contact' },
  { key: 'documents', label: 'Documents' },
  { key: 'wallet', label: 'Wallet' }
]

const initialForm = {
  onboardingTrack: 'ops_first',
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
  usdtErc20Wallet: ''
}

export default function OnboardingWizard({ onComplete, rejectionReason }) {
  const [step, setStep] = useState(0)
  const [form, setForm] = useState(initialForm)
  const [nationalIdFile, setNationalIdFile] = useState(null)
  const [photoFile, setPhotoFile] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [stepErrors, setStepErrors] = useState({})
  const photoRef = useRef(null)
  const idRef = useRef(null)

  const setField = (key, value) => setForm(s => ({ ...s, [key]: value }))

  const validateStep = (idx) => {
    const errs = {}
    if (idx === 1) {
      if (!form.legalFirstName.trim()) errs.legalFirstName = 'Required'
      if (!form.legalLastName.trim()) errs.legalLastName = 'Required'
    }
    if (idx === 2) {
      if (!form.phone.trim()) errs.phone = 'Required'
      if (!form.address.trim()) errs.address = 'Required'
      if (!form.nationality.trim()) errs.nationality = 'Required'
      if (!form.country.trim()) errs.country = 'Required'
      if (!form.state.trim()) errs.state = 'Required'
    }
    if (idx === 3) {
      if (!photoFile) errs.photo = 'Please upload a profile photo'
      if (!nationalIdFile) errs.nationalId = 'Please upload a national ID'
    }
    if (idx === 4) {
      if (!form.usdtErc20Wallet.trim()) errs.wallet = 'Required'
    }
    setStepErrors(errs)
    return Object.keys(errs).length === 0
  }

  const goNext = () => {
    if (!validateStep(step)) return
    setStep(s => Math.min(s + 1, STEPS.length - 1))
  }
  const goBack = () => setStep(s => Math.max(s - 1, 0))
  const goToStep = (idx) => {
    if (idx < step) { setStep(idx); return }
    for (let i = step; i < idx; i++) {
      if (!validateStep(i)) return
    }
    setStep(idx)
  }

  const handleSubmit = async () => {
    if (!validateStep(step)) return
    setError('')
    setLoading(true)
    try {
      const fd = new FormData()
      Object.entries(form).forEach(([k, v]) => {
        if (v != null && v !== '') fd.append(k, String(v))
      })
      fd.append('nationalId', nationalIdFile)
      fd.append('photo', photoFile)
      await api.post('/auth/complete-onboarding', fd)
      localStorage.removeItem('token')
      onComplete()
    } catch (err) {
      setError(err.response?.data?.error || 'Submission failed')
    } finally {
      setLoading(false)
    }
  }

  const isLast = step === STEPS.length - 1

  return (
    <div className="onboard-page">
      <div className="onboard-container">
        {/* Header */}
        <div className="onboard-header">
          <h1 className="onboard-title">
            {rejectionReason ? 'Resubmit application' : 'Complete your profile'}
          </h1>
          <p className="onboard-subtitle">
            {rejectionReason
              ? 'Review the feedback below, update your details, and resubmit.'
              : 'Fill in each section to submit your application.'
            }
          </p>
        </div>

        {rejectionReason && (
          <div className="rejection-banner">
            <span className="rejection-banner-icon">!</span>
            <div>
              <strong>Your previous application was returned</strong>
              <p>{rejectionReason}</p>
            </div>
          </div>
        )}

        {/* Step indicator */}
        <div className="onboard-steps">
          {STEPS.map((s, i) => (
            <button
              key={s.key}
              type="button"
              className={`onboard-step-dot${i === step ? ' active' : ''}${i < step ? ' done' : ''}`}
              onClick={() => goToStep(i)}
            >
              <span className="onboard-step-num">{i < step ? '✓' : i + 1}</span>
              <span className="onboard-step-label">{s.label}</span>
            </button>
          ))}
        </div>

        {/* Step content */}
        <div className="onboard-body">
          {/* Step 0: Track */}
          {step === 0 && (
            <div className="onboard-step-content">
              <h2 className="onboard-step-heading">What are you applying for?</h2>
              <p className="onboard-step-desc">Choose the path that fits your intended role.</p>
              <div className="onboard-track-cards">
                <label className={`onboard-track-card${form.onboardingTrack === 'ops_first' ? ' selected' : ''}`}>
                  <input
                    type="radio"
                    name="onboardingTrack"
                    checked={form.onboardingTrack === 'ops_first'}
                    onChange={() => setField('onboardingTrack', 'ops_first')}
                  />
                  <div className="onboard-track-card-body">
                    <strong>Bidder or Bid Manager</strong>
                    <span>Ops Lead assigns your role and level, then admin gives final approval.</span>
                  </div>
                </label>
                <label className={`onboard-track-card${form.onboardingTrack === 'admin_direct' ? ' selected' : ''}`}>
                  <input
                    type="radio"
                    name="onboardingTrack"
                    checked={form.onboardingTrack === 'admin_direct'}
                    onChange={() => setField('onboardingTrack', 'admin_direct')}
                  />
                  <div className="onboard-track-card-body">
                    <strong>Ops Lead or Financial Manager</strong>
                    <span>Admin assigns your role and level directly (no Ops step).</span>
                  </div>
                </label>
              </div>
            </div>
          )}

          {/* Step 1: Identity */}
          {step === 1 && (
            <div className="onboard-step-content">
              <h2 className="onboard-step-heading">Legal name</h2>
              <p className="onboard-step-desc">Exactly as it appears on your government-issued ID.</p>
              <div className="onboard-field-group">
                <div className="onboard-field">
                  <label className="onboard-field-label">First name *</label>
                  <input type="text" value={form.legalFirstName} onChange={e => setField('legalFirstName', e.target.value)} className={stepErrors.legalFirstName ? 'input-error' : ''} />
                  {stepErrors.legalFirstName && <span className="onboard-field-error">{stepErrors.legalFirstName}</span>}
                </div>
                <div className="onboard-field">
                  <label className="onboard-field-label">Middle name</label>
                  <input type="text" value={form.legalMiddleName} onChange={e => setField('legalMiddleName', e.target.value)} />
                </div>
                <div className="onboard-field">
                  <label className="onboard-field-label">Last name *</label>
                  <input type="text" value={form.legalLastName} onChange={e => setField('legalLastName', e.target.value)} className={stepErrors.legalLastName ? 'input-error' : ''} />
                  {stepErrors.legalLastName && <span className="onboard-field-error">{stepErrors.legalLastName}</span>}
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Contact & Address */}
          {step === 2 && (
            <div className="onboard-step-content">
              <h2 className="onboard-step-heading">Contact & address</h2>
              <p className="onboard-step-desc">How we can reach you and where you are located.</p>
              <div className="onboard-field-group">
                <div className="onboard-field onboard-field-full">
                  <label className="onboard-field-label">Phone number *</label>
                  <input type="tel" value={form.phone} onChange={e => setField('phone', e.target.value)} className={stepErrors.phone ? 'input-error' : ''} />
                  {stepErrors.phone && <span className="onboard-field-error">{stepErrors.phone}</span>}
                </div>
                <div className="onboard-field onboard-field-full">
                  <label className="onboard-field-label">Street address *</label>
                  <input type="text" value={form.address} onChange={e => setField('address', e.target.value)} className={stepErrors.address ? 'input-error' : ''} />
                  {stepErrors.address && <span className="onboard-field-error">{stepErrors.address}</span>}
                </div>
                <div className="onboard-field">
                  <label className="onboard-field-label">Nationality *</label>
                  <input type="text" value={form.nationality} onChange={e => setField('nationality', e.target.value)} className={stepErrors.nationality ? 'input-error' : ''} />
                  {stepErrors.nationality && <span className="onboard-field-error">{stepErrors.nationality}</span>}
                </div>
                <div className="onboard-field">
                  <label className="onboard-field-label">Country *</label>
                  <input type="text" value={form.country} onChange={e => setField('country', e.target.value)} className={stepErrors.country ? 'input-error' : ''} />
                  {stepErrors.country && <span className="onboard-field-error">{stepErrors.country}</span>}
                </div>
                <div className="onboard-field">
                  <label className="onboard-field-label">State / region *</label>
                  <input type="text" value={form.state} onChange={e => setField('state', e.target.value)} className={stepErrors.state ? 'input-error' : ''} />
                  {stepErrors.state && <span className="onboard-field-error">{stepErrors.state}</span>}
                </div>
              </div>

              <div className="onboard-divider" />

              <h3 className="onboard-step-subheading">Social profiles (optional)</h3>
              <div className="onboard-field-group">
                <div className="onboard-field">
                  <label className="onboard-field-label">LinkedIn URL</label>
                  <input type="url" value={form.linkedinUrl} onChange={e => setField('linkedinUrl', e.target.value)} placeholder="https://linkedin.com/in/…" />
                </div>
                <div className="onboard-field">
                  <label className="onboard-field-label">Facebook URL</label>
                  <input type="url" value={form.facebookUrl} onChange={e => setField('facebookUrl', e.target.value)} placeholder="https://facebook.com/…" />
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Documents */}
          {step === 3 && (
            <div className="onboard-step-content">
              <h2 className="onboard-step-heading">Documents</h2>
              <p className="onboard-step-desc">Upload a clear photo and your government-issued ID for verification.</p>
              <div className="onboard-upload-cards">
                <div className={`onboard-upload-card${stepErrors.photo ? ' upload-error' : ''}`} onClick={() => photoRef.current?.click()}>
                  <div className="onboard-upload-icon">{photoFile ? '✓' : '📷'}</div>
                  <strong>{photoFile ? photoFile.name : 'Profile photo *'}</strong>
                  <span>JPG, PNG, WebP, or GIF — clear headshot or portrait</span>
                  <input ref={photoRef} type="file" accept=".jpg,.jpeg,.png,.gif,.webp,image/*" onChange={e => { setPhotoFile(e.target.files?.[0] || null); setStepErrors(p => ({ ...p, photo: '' })) }} hidden />
                  <span className="onboard-upload-btn">{photoFile ? 'Change file' : 'Choose file'}</span>
                </div>
                <div className={`onboard-upload-card${stepErrors.nationalId ? ' upload-error' : ''}`} onClick={() => idRef.current?.click()}>
                  <div className="onboard-upload-icon">{nationalIdFile ? '✓' : '🪪'}</div>
                  <strong>{nationalIdFile ? nationalIdFile.name : 'National ID *'}</strong>
                  <span>JPG, PNG, WebP, GIF, or PDF of government-issued ID</span>
                  <input ref={idRef} type="file" accept=".jpg,.jpeg,.png,.gif,.webp,.pdf,image/*,application/pdf" onChange={e => { setNationalIdFile(e.target.files?.[0] || null); setStepErrors(p => ({ ...p, nationalId: '' })) }} hidden />
                  <span className="onboard-upload-btn">{nationalIdFile ? 'Change file' : 'Choose file'}</span>
                </div>
              </div>
              {(stepErrors.photo || stepErrors.nationalId) && (
                <p className="onboard-field-error" style={{ textAlign: 'center', marginTop: '0.5rem' }}>
                  {stepErrors.photo || stepErrors.nationalId}
                </p>
              )}
            </div>
          )}

          {/* Step 4: Wallet */}
          {step === 4 && (
            <div className="onboard-step-content">
              <h2 className="onboard-step-heading">Payout wallet</h2>
              <p className="onboard-step-desc">USDT payments are sent to this ERC-20 address. Double-check before submitting.</p>
              <div className="onboard-field-group">
                <div className="onboard-field onboard-field-full">
                  <label className="onboard-field-label">USDT ERC-20 wallet address *</label>
                  <input
                    type="text"
                    value={form.usdtErc20Wallet}
                    onChange={e => setField('usdtErc20Wallet', e.target.value)}
                    placeholder="0x…"
                    autoComplete="off"
                    spellCheck={false}
                    className={`onboard-wallet-input${stepErrors.wallet ? ' input-error' : ''}`}
                  />
                  {stepErrors.wallet && <span className="onboard-field-error">{stepErrors.wallet}</span>}
                </div>
              </div>

              {/* Review summary */}
              <div className="onboard-divider" />
              <h3 className="onboard-step-subheading">Review</h3>
              <div className="onboard-review-grid">
                <div className="onboard-review-cell">
                  <span className="onboard-review-label">Track</span>
                  <span>{form.onboardingTrack === 'ops_first' ? 'Bidder / Bid Manager' : 'Ops Lead / Financial Manager'}</span>
                </div>
                <div className="onboard-review-cell">
                  <span className="onboard-review-label">Name</span>
                  <span>{[form.legalFirstName, form.legalMiddleName, form.legalLastName].filter(Boolean).join(' ')}</span>
                </div>
                <div className="onboard-review-cell">
                  <span className="onboard-review-label">Phone</span>
                  <span>{form.phone}</span>
                </div>
                <div className="onboard-review-cell">
                  <span className="onboard-review-label">Location</span>
                  <span>{[form.address, form.state, form.country].filter(Boolean).join(', ')}</span>
                </div>
                <div className="onboard-review-cell">
                  <span className="onboard-review-label">Photo</span>
                  <span>{photoFile?.name || '—'}</span>
                </div>
                <div className="onboard-review-cell">
                  <span className="onboard-review-label">National ID</span>
                  <span>{nationalIdFile?.name || '—'}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Error */}
        {error && <p className="error-msg" style={{ textAlign: 'center' }}>{error}</p>}

        {/* Navigation */}
        <div className="onboard-nav">
          {step > 0 ? (
            <button type="button" className="btn btn-ghost" onClick={goBack}>Back</button>
          ) : <span />}
          {isLast ? (
            <button type="button" className="btn btn-primary" onClick={handleSubmit} disabled={loading}>
              {loading ? 'Submitting…' : 'Submit application'}
            </button>
          ) : (
            <button type="button" className="btn btn-primary" onClick={goNext}>Continue</button>
          )}
        </div>
      </div>
    </div>
  )
}
