export default function ClientPendingApproval({ user, onLogout, onRecheck }) {
  return (
    <div className="login-page">
      <div className="login-card" style={{ maxWidth: '28rem' }}>
        <h1>Account pending</h1>
        <p className="login-subtitle">
          Thanks for signing up. An administrator will approve your organization shortly — no extra onboarding steps are required.
        </p>
        <p className="page-desc" style={{ fontSize: '0.95rem', marginBottom: '1rem' }}>
          Signed in as <strong>{user?.email}</strong>. Once approved, refresh this page or sign in again to access your profiles and payout approvals.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {onRecheck && (
            <button type="button" className="btn btn-primary btn-block" onClick={onRecheck}>
              Check approval status
            </button>
          )}
          <button type="button" className="btn btn-ghost btn-block" onClick={onLogout}>
            Sign out
          </button>
        </div>
      </div>
    </div>
  )
}
