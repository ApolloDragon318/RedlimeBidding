import { useState } from 'react'
import { api } from '../api'

export default function Login({ onLogin, bannerMessage, onDismissBanner }) {
  const [mode, setMode] = useState('login')
  const [signupEmail, setSignupEmail] = useState('')
  const [signupPassword, setSignupPassword] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)

  const handleLogin = async (e) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    if (onDismissBanner) onDismissBanner()
    setLoading(true)
    try {
      const { data } = await api.post('/auth/login', { email, password })
      localStorage.setItem('token', data.token)
      onLogin(data.user)
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  const handleSignUp = async (e) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    if (onDismissBanner) onDismissBanner()
    setLoading(true)
    try {
      const { data } = await api.post('/auth/register', {
        email: signupEmail,
        password: signupPassword
      })
      localStorage.setItem('token', data.token)
      onLogin(data.user)
    } catch (err) {
      setError(err.response?.data?.error || 'Sign up failed')
    } finally {
      setLoading(false)
    }
  }

  const switchMode = () => {
    setMode(m => (m === 'login' ? 'signup' : 'login'))
    setError('')
    setSuccess('')
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <h1>Redlime Bidding</h1>
        <p className="login-subtitle">
          {mode === 'login' ? 'Sign in with your email' : 'Create your account'}
        </p>

        {bannerMessage && (
          <p className="success-msg" style={{ marginBottom: '1rem' }}>{bannerMessage}</p>
        )}

        {mode === 'login' ? (
          <form onSubmit={handleLogin} className="login-form">
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoFocus
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
            />
            {error && <p className="error-msg">{error}</p>}
            <button type="submit" disabled={loading} className="btn btn-primary btn-block">
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleSignUp} className="login-form">
            <p className="page-desc" style={{ fontSize: '0.9rem', marginBottom: '0.5rem' }}>
              Start with email and password. You&apos;ll complete your profile (ID, photo, wallet) next.
            </p>
            <input
              type="email"
              placeholder="Email"
              value={signupEmail}
              onChange={e => setSignupEmail(e.target.value)}
              required
              autoFocus
            />
            <input
              type="password"
              placeholder="Password (min 6 characters)"
              value={signupPassword}
              onChange={e => setSignupPassword(e.target.value)}
              required
              minLength={6}
            />
            {error && <p className="error-msg">{error}</p>}
            {success && <p className="success-msg">{success}</p>}
            <button type="submit" disabled={loading} className="btn btn-primary btn-block">
              {loading ? 'Creating account…' : 'Continue'}
            </button>
          </form>
        )}

        <button type="button" onClick={switchMode} className="btn btn-ghost btn-block btn-switch">
          {mode === 'login' ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
        </button>

        {mode === 'login' && (
          <p className="login-hint">
            Demo: admin@redlime.com / admin123
          </p>
        )}
      </div>
    </div>
  )
}
