import { Link, useLocation } from 'react-router-dom'

export default function Layout({ user, onLogout, children }) {
  const loc = useLocation()

  const nav = [
    { path: '/profile', label: 'Profile' },
    user.role !== 'client' && { path: '/company-org', label: 'Company Org' },
    user.role !== 'client' && { path: '/payment-history', label: 'Payment history' },
    user.role === 'client' && { path: '/client', label: 'My profiles' },
    user.role === 'client' && { path: '/client/payout-approvals', label: 'Payout approvals' },
    user.role === 'bid_manager' && { path: '/bid-manager', label: 'My Reports' },
    user.role === 'bidder' && { path: '/bidder', label: 'My Work' },
    user.role === 'ops_lead' && { path: '/ops-lead/assignments', label: 'Assignments' },
    user.role === 'ops_lead' && { path: '/ops-lead/onboarding', label: 'Onboarding' },
    user.role === 'ops_lead' && { path: '/ops-lead/profiles', label: 'Profile assignment' },
    user.role === 'ops_lead' && { path: '/ops-lead/payment-requests', label: 'Payment requests' },
    user.role === 'admin' && { path: '/admin', label: 'Admin Dashboard' },
    user.role === 'financial_manager' && { path: '/financial', label: 'Financial overview' }
  ].filter(Boolean)

  return (
    <div className="layout">
      <header className="header">
        <div className="header-inner">
          <h1 className="logo">Redlime Bidding</h1>
          <nav className="nav">
            {nav.map(({ path, label }) => (
              <Link
                key={path}
                to={path}
                className={loc.pathname === path ? 'nav-link active' : 'nav-link'}
              >
                {label}
              </Link>
            ))}
          </nav>
          <div className="user-menu">
            <span className="user-name">{user.name}</span>
            <span className="user-role">
              {user.role.replace(/_/g, ' ')}
              {user.level ? ` · ${String(user.level).replace(/_/g, ' ')}` : ''}
            </span>
            <button onClick={onLogout} className="btn btn-ghost btn-sm">Logout</button>
          </div>
        </div>
      </header>
      <main className="main">{children}</main>
    </div>
  )
}
