import { useState, useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { api } from './api'
import Login from './pages/Login'
import Layout from './components/Layout'
import BidManagerDashboard from './pages/BidManagerDashboard'
import InvestigationManagerDashboard from './pages/InvestigationManagerDashboard'
import AdminDashboard from './pages/AdminDashboard'
import './App.css'

function App() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) {
      setLoading(false)
      return
    }
    api.get('/auth/me')
      .then(res => setUser(res.data.user))
      .catch(() => localStorage.removeItem('token'))
      .finally(() => setLoading(false))
  }, [])

  const onLogin = (userData) => {
    setUser(userData)
  }

  const onLogout = () => {
    localStorage.removeItem('token')
    setUser(null)
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <div className="spinner" />
      </div>
    )
  }

  if (!user) {
    return <Login onLogin={onLogin} />
  }

  return (
    <Layout user={user} onLogout={onLogout}>
      <Routes>
        <Route path="/" element={
          user.role === 'admin' ? <Navigate to="/admin" /> :
          user.role === 'investigation_manager' ? <Navigate to="/investigation" /> :
          <Navigate to="/bid-manager" />
        } />
        <Route path="/bid-manager" element={
          user.role === 'bid_manager' ? <BidManagerDashboard /> : <Navigate to="/" />
        } />
        <Route path="/investigation" element={
          user.role === 'investigation_manager' ? <InvestigationManagerDashboard /> : <Navigate to="/" />
        } />
        <Route path="/admin" element={
          user.role === 'admin' ? <AdminDashboard /> : <Navigate to="/" />
        } />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </Layout>
  )
}

export default App
