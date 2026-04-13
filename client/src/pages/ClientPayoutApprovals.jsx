import { useState, useEffect, useCallback } from 'react'
import { api } from '../api'

export default function ClientPayoutApprovals() {
  const [approvals, setApprovals] = useState([])
  const [loading, setLoading] = useState(true)
  const [workingId, setWorkingId] = useState(null)

  const load = useCallback(async () => {
    try {
      const { data } = await api.get('/salary/profile-payout-approvals/me')
      setApprovals(data.approvals || [])
    } catch {
      setApprovals([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const approve = async id => {
    setWorkingId(id)
    try {
      await api.post(`/salary/profile-payout-approvals/${id}/client-approve`)
      await load()
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to approve')
    } finally {
      setWorkingId(null)
    }
  }

  if (loading) {
    return (
      <div className="page-loading">
        <div className="spinner" />
      </div>
    )
  }

  return (
    <div className="page">
      <div className="page-header">
        <h2>Profile payout approvals</h2>
        <p className="page-desc">
          Approve pending work for your profiles by total amount. Tax and net pay are handled by our team — you only confirm the total for your organization.
        </p>
      </div>

      <div className="card">
        <div className="card-header">
          <h3>Pending</h3>
        </div>
        {approvals.length === 0 ? (
          <p className="payout-requests-empty">Nothing needs your approval right now.</p>
        ) : (
          <div className="profile-approvals-list">
            {approvals.map(a => {
              const clientOk = !!a.clientApprovedAt
              const adminOk = !!a.adminApprovedAt
              const profileReady = clientOk || adminOk
              return (
                <div key={a._id} className="payout-request-card">
                  <div className="payout-request-item">
                    <div>
                      <strong>{a.profileName || 'Profile'}</strong>
                      <span className="text-muted" style={{ marginLeft: '0.5rem' }}>Ops Lead: {a.opsLeadName || '—'}</span>
                    </div>
                    <p style={{ margin: '0.35rem 0' }}>
                      Total: <strong>${Number(a.totalAmount || 0).toFixed(2)}</strong>
                      {a.reportCount ? (
                        <span className="text-muted" style={{ marginLeft: '0.5rem' }}>({a.reportCount} report(s))</span>
                      ) : null}
                    </p>
                    <div className="profile-approval-badges">
                      <span className={`badge ${profileReady ? 'badge-approved' : 'badge-pending'}`}>
                        {profileReady
                          ? (clientOk && adminOk
                            ? 'Approved (you + company)'
                            : clientOk
                              ? 'Approved by you'
                              : 'Approved by company')
                          : 'Needs your approval or company approval'}
                      </span>
                    </div>
                    {a.canApprove && (
                      <div className="payout-request-actions" style={{ marginTop: '0.5rem' }}>
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          onClick={() => approve(a._id)}
                          disabled={workingId === a._id}
                        >
                          {workingId === a._id ? '…' : 'Approve this profile'}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
