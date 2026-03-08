import { useState } from 'react'
import { api } from '../api'

export default function Login({ onLogin }) {
  const [mode, setMode] = useState('login') // 'login' | 'signup'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [role, setRole] = useState('bid_manager')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)

  const handleLogin = async (e) => {
    e.preventDefault()
    setError('')
    setSuccess('')
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
    setLoading(true)
    try {
      const { data } = await api.post('/auth/register', { email, password, name, role })
      setSuccess(data.message || 'Sign up successful. Admin will approve your account soon.')
      setEmail('')
      setPassword('')
      setName('')
      setRole('bid_manager')
    } catch (err) {
      setError(err.response?.data?.error || 'Sign up failed')
    } finally {
      setLoading(false)
    }
  }

  const switchMode = () => {
    setMode(m => m === 'login' ? 'signup' : 'login')
    setError('')
    setSuccess('')
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <h1>Redlime Bidding</h1>
        <p className="login-subtitle">
          {mode === 'login' ? 'Sign in with your email' : 'Create an account'}
        </p>

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
            <input
              type="text"
              placeholder="Name"
              value={name}
              onChange={e => setName(e.target.value)}
              required
              autoFocus
            />
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              minLength={6}
            />
            <div className="form-row">
              <label>Role</label>
              <select value={role} onChange={e => setRole(e.target.value)}>
                <option value="bid_manager">Bid Manager</option>
                <option value="investigation_manager">Investigation Manager</option>
              </select>
            </div>
            {error && <p className="error-msg">{error}</p>}
            {success && <p className="success-msg">{success}</p>}
            <button type="submit" disabled={loading} className="btn btn-primary btn-block">
              {loading ? 'Signing up...' : 'Sign Up'}
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
