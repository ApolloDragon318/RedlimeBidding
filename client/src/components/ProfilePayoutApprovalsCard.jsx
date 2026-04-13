import { useState, useEffect, useCallback } from 'react'
import { api } from '../api'

export default function ProfilePayoutApprovalsCard({ onUpdated }) {
  const [approvals, setApprovals] = useState([])
  const [loading, setLoading] = useState(true)
  const [workingId, setWorkingId] = useState(null)

  const load = useCallback(async () => {
    try {
      const { data } = await api.get('/salary/profile-payout-approvals')
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
      await api.post(`/salary/profile-payout-approvals/${id}/admin-approve`)
      await load()
      onUpdated?.()
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to approve')
    } finally {
      setWorkingId(null)
    }
  }

  if (loading) {
    return <p className="text-muted" style={{ margin: 0 }}>Loading profile approvals…</p>
  }

  return (
    <div className="profile-approvals-list">
      {approvals.length === 0 ? (
        <p className="payout-requests-empty">No profiles awaiting payout approval.</p>
      ) : (
        approvals.map(a => {
          const name = a.profileId?.name || 'Profile'
          const ol = a.opsLeadId?.name || '—'
          const clientOk = !!a.clientApprovedAt
          const adminOk = !!a.adminApprovedAt
          const needsClient = a.profileId?.clientId != null
          const profileReady = needsClient ? clientOk || adminOk : adminOk
          const adminCanApprove = needsClient ? !(clientOk || adminOk) : !adminOk
          return (
            <div key={a._id} className="payout-request-card">
              <div className="payout-request-item">
                <div>
                  <strong>{name}</strong>
                  <span className="text-muted" style={{ marginLeft: '0.5rem' }}>Ops Lead: {ol}</span>
                </div>
                <div className="profile-approval-meta">
                  <span>Client total (no tax lines): <strong>${Number(a.clientVisibleTotal || 0).toFixed(2)}</strong></span>
                  <span className="profile-approval-tax">
                    Est. tax {((a.taxRate ?? 0.1) * 100).toFixed(0)}%: −${Number(a.taxAmount ?? 0).toFixed(2)} · Net ${Number(a.netAfterTax ?? 0).toFixed(2)}
                  </span>
                </div>
                <div className="profile-approval-badges">
                  {needsClient ? (
                    <span className={`badge ${profileReady ? 'badge-approved' : 'badge-pending'}`}>
                      {profileReady
                        ? (clientOk && adminOk
                          ? 'Approved (client + admin)'
                          : clientOk
                            ? 'Approved by client'
                            : 'Approved by admin / FM')
                        : 'Needs client or admin / FM approval'}
                    </span>
                  ) : (
                    <span className={`badge ${adminOk ? 'badge-approved' : 'badge-pending'}`}>
                      {adminOk ? 'Approved (admin / FM)' : 'Needs admin / FM approval'}
                    </span>
                  )}
                </div>
                {adminCanApprove && (
                  <div className="payout-request-actions">
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={() => approve(a._id)}
                      disabled={workingId === a._id}
                    >
                      {workingId === a._id ? '…' : 'Approve profile (admin)'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )
        })
      )}
    </div>
  )
}
