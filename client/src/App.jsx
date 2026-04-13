import { useState, useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { api } from './api'
import Login from './pages/Login'
import OnboardingWizard from './pages/OnboardingWizard'
import Layout from './components/Layout'
import BidManagerDashboard from './pages/BidManagerDashboard'
import AdminDashboard from './pages/AdminDashboard'
import BidderDashboard from './pages/BidderDashboard'
import OpsLeadAssignments from './pages/OpsLeadAssignments'
import AdminClientsProfiles from './pages/AdminClientsProfiles'
import OpsLeadPaymentRequests from './pages/OpsLeadPaymentRequests'
import OpsLeadOnboarding from './pages/OpsLeadOnboarding'
import FinancialDashboard from './pages/FinancialDashboard'
import ProfilePage from './pages/ProfilePage'
import PaymentHistoryPage from './pages/PaymentHistoryPage'
import CompanyOrg from './pages/CompanyOrg'
import ClientProfiles from './pages/ClientProfiles'
import ClientPayoutApprovals from './pages/ClientPayoutApprovals'
import ClientPendingApproval from './pages/ClientPendingApproval'
import './App.css'

function App() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loginBanner, setLoginBanner] = useState('')

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

  const refreshUser = async () => {
    try {
      const { data } = await api.get('/auth/me')
      setUser(data.user)
    } catch {
      /* ignore */
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <div className="spinner" />
      </div>
    )
  }

  if (!user) {
    return (
      <Login
        onLogin={onLogin}
        bannerMessage={loginBanner}
        onDismissBanner={() => setLoginBanner('')}
      />
    )
  }

  const needsProfileOnboarding = user.role === 'applicant' && user.status === 'pending_onboarding'

  if (needsProfileOnboarding) {
    return (
      <Routes>
        <Route
          path="/onboarding"
          element={(
            <OnboardingWizard
              rejectionReason={user.rejectionReason || ''}
              onComplete={() => {
                setLoginBanner('Application submitted. You can sign in once your account is approved.')
                localStorage.removeItem('token')
                setUser(null)
              }}
            />
          )}
        />
        <Route path="*" element={<Navigate to="/onboarding" replace />} />
      </Routes>
    )
  }

  const clientAwaitingAdmin = user.role === 'client' && user.status === 'pending_admin'

  if (clientAwaitingAdmin) {
    return (
      <Routes>
        <Route
          path="*"
          element={(
            <ClientPendingApproval
              user={user}
              onLogout={onLogout}
              onRecheck={refreshUser}
            />
          )}
        />
      </Routes>
    )
  }

  return (
    <Layout user={user} onLogout={onLogout}>
      <Routes>
        <Route path="/" element={
          user.role === 'admin' ? <Navigate to="/admin" /> :
          user.role === 'financial_manager' ? <Navigate to="/financial" /> :
          user.role === 'bidder' ? <Navigate to="/bidder" /> :
          user.role === 'ops_lead' ? <Navigate to="/ops-lead/assignments" /> :
          user.role === 'client' ? <Navigate to="/client" /> :
          <Navigate to="/bid-manager" />
        } />
        <Route path="/bid-manager" element={
          user.role === 'bid_manager' ? <BidManagerDashboard /> : <Navigate to="/" />
        } />
        <Route path="/admin" element={
          user.role === 'admin' ? <AdminDashboard /> : <Navigate to="/" />
        } />
        <Route path="/bidder" element={
          user.role === 'bidder' ? <BidderDashboard /> : <Navigate to="/" />
        } />
        <Route path="/ops-lead" element={
          user.role === 'ops_lead' ? <Navigate to="/ops-lead/assignments" replace /> : <Navigate to="/" />
        } />
        <Route path="/ops-lead/assignments" element={
          user.role === 'ops_lead' ? <OpsLeadAssignments /> : <Navigate to="/" />
        } />
        <Route path="/ops-lead/profiles" element={
          user.role === 'ops_lead' ? <AdminClientsProfiles isOpsLead /> : <Navigate to="/" />
        } />
        <Route path="/ops-lead/payment-requests" element={
          user.role === 'ops_lead' ? <OpsLeadPaymentRequests /> : <Navigate to="/" />
        } />
        <Route path="/ops-lead/onboarding" element={
          user.role === 'ops_lead' ? <OpsLeadOnboarding /> : <Navigate to="/" />
        } />
        <Route path="/financial" element={
          user.role === 'financial_manager' ? <FinancialDashboard /> : <Navigate to="/" />
        } />
        <Route path="/profile" element={<ProfilePage onSaved={refreshUser} />} />
        <Route path="/client" element={
          user.role === 'client' ? <ClientProfiles /> : <Navigate to="/" />
        } />
        <Route path="/client/payout-approvals" element={
          user.role === 'client' ? <ClientPayoutApprovals /> : <Navigate to="/" />
        } />
        <Route path="/company-org" element={
          user.role === 'client' ? <Navigate to="/" /> : <CompanyOrg />
        } />
        <Route path="/payment-history" element={
          user.role === 'client' ? <Navigate to="/" /> : <PaymentHistoryPage />
        } />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </Layout>
  )
}

export default App
