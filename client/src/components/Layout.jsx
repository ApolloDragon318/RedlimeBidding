import { Link, useLocation } from 'react-router-dom'

export default function Layout({ user, onLogout, children }) {
  const loc = useLocation()

  const nav = [
    user.role === 'bid_manager' && { path: '/bid-manager', label: 'My Reports' },
    user.role === 'investigation_manager' && { path: '/investigation', label: 'Review Reports' },
    user.role === 'admin' && { path: '/admin', label: 'Admin Dashboard' }
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
            <span className="user-role">{user.role.replace('_', ' ')}</span>
            <button onClick={onLogout} className="btn btn-ghost btn-sm">Logout</button>
          </div>
        </div>
      </header>
      <main className="main">{children}</main>
    </div>
  )
}
