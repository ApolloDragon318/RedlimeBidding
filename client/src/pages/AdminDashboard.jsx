import { useState, useEffect, useCallback, useRef } from 'react'
import { api } from '../api'
import PayoutTree from '../components/PayoutTree'
import PayConfirmModal from '../components/PayConfirmModal'

const ADMIN_DIRECT_ROLES = [
  { value: 'ops_lead', label: 'Ops Lead' },
  { value: 'financial_manager', label: 'Financial manager' }
]

const LEVEL_OPTIONS = [
  { value: 'junior', label: 'Junior' },
  { value: 'mid_level', label: 'Mid-level' },
  { value: 'senior', label: 'Senior' },
  { value: 'staff', label: 'Staff' }
]

export default function AdminDashboard() {
  const [salaryConfigs, setSalaryConfigs] = useState([])
  const [pendingUsers, setPendingUsers] = useState([])
  const [opsLeads, setOpsLeads] = useState([])
  const [bidManagersList, setBidManagersList] = useState([])
  const [biddersList, setBiddersList] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('payouts')
  const [savingSalary, setSavingSalary] = useState(false)
  const [savingAssign, setSavingAssign] = useState(false)
  const [personPayouts, setPersonPayouts] = useState([])
  const [legacyBatchPayouts, setLegacyBatchPayouts] = useState([])
  const [payoutTree, setPayoutTree] = useState([])
  const [payoutRequests, setPayoutRequests] = useState([])
  const [adminBonusByUser, setAdminBonusByUser] = useState({})
  const [payConfirm, setPayConfirm] = useState(null)
  const [payTxId, setPayTxId] = useState('')
  const [paying, setPaying] = useState(false)
  const [adminAssign, setAdminAssign] = useState({})
  const [nameSearch, setNameSearch] = useState('')
  const [nameResults, setNameResults] = useState([])
  const [nameSearching, setNameSearching] = useState(false)
  const searchTimer = useRef(null)
  const [rejectModal, setRejectModal] = useState(null)
  const [rejectReason, setRejectReason] = useState('')
  const [rejecting, setRejecting] = useState(false)
  const [expandedApplicant, setExpandedApplicant] = useState(null)
  const [expandedSearchHit, setExpandedSearchHit] = useState(null)

  useEffect(() => { loadData() }, [])

  useEffect(() => {
    setAdminAssign(prev => {
      const next = { ...prev }
      pendingUsers.forEach(u => {
        if (u.role === 'applicant' && !next[u._id]) {
          next[u._id] = { role: 'financial_manager', level: 'mid_level' }
        }
      })
      return next
    })
  }, [pendingUsers])

  const fetchPayoutQueue = useCallback(async () => {
    try {
      const [qRes, prRes] = await Promise.all([
        api.get('/salary/payout-queue'),
        api.get('/salary/payout-requests').catch(() => ({ data: { requests: [] } }))
      ])
      setPayoutTree(qRes.data.tree || [])
      setPayoutRequests(prRes.data?.requests || [])
    } catch (e) {
      console.error(e)
      setPayoutTree([])
      setPayoutRequests([])
    }
  }, [])

  useEffect(() => {
    if (activeTab === 'payouts') fetchPayoutQueue()
  }, [activeTab, fetchPayoutQueue])

  const loadData = async () => {
    setLoading(true)
    try {
      const [configRes, pendingRes, historyRes, opsRes, bmRes, biddersRes] = await Promise.all([
        api.get('/salary').catch(() => ({ data: [] })),
        api.get('/users/pending').catch(() => ({ data: [] })),
        api.get('/salary/history').catch(() => ({ data: { personPayouts: [], legacyBatchPayouts: [] } })),
        api.get('/users/ops-leads').catch(() => ({ data: [] })),
        api.get('/users/bid-managers').catch(() => ({ data: [] })),
        api.get('/users/bidders').catch(() => ({ data: [] }))
      ])
      setSalaryConfigs(configRes.data || [])
      setPendingUsers(pendingRes.data)
      setPersonPayouts(historyRes.data?.personPayouts || [])
      setLegacyBatchPayouts(historyRes.data?.legacyBatchPayouts || [])
      setOpsLeads(opsRes.data || [])
      setBidManagersList(bmRes.data || [])
      setBiddersList(biddersRes.data || [])
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  const handleApprove = async (userId) => {
    try {
      const u = pendingUsers.find(x => x._id === userId)
      const body = {}
      if (u?.role === 'applicant') {
        const pick = adminAssign[userId] || { role: 'financial_manager', level: 'mid_level' }
        body.role = pick.role
        body.level = pick.level
      }
      await api.patch(`/users/${userId}/approve`, body)
      setPendingUsers(prev => prev.filter(x => x._id !== userId))
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to approve')
    }
  }

  const openRejectModal = (user) => {
    setRejectModal(user)
    setRejectReason('')
  }

  const confirmReject = async () => {
    if (!rejectModal) return
    if (!rejectReason.trim()) { alert('Please provide a reason for rejection.'); return }
    setRejecting(true)
    try {
      await api.patch(`/users/${rejectModal._id}/reject`, { reason: rejectReason.trim() })
      setPendingUsers(prev => prev.filter(u => u._id !== rejectModal._id))
      setRejectModal(null)
      setRejectReason('')
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to reject')
    } finally {
      setRejecting(false)
    }
  }

  const searchByName = (q) => {
    setNameSearch(q)
    setExpandedSearchHit(null)
    clearTimeout(searchTimer.current)
    if (q.trim().length < 2) { setNameResults([]); return }
    setNameSearching(true)
    searchTimer.current = setTimeout(async () => {
      try {
        const res = await api.get('/users/search', { params: { q: q.trim() } })
        setNameResults(res.data || [])
      } catch { setNameResults([]) }
      finally { setNameSearching(false) }
    }, 350)
  }

  const openNationalId = async (userId) => {
    try {
      const res = await api.get(`/users/${userId}/national-id`, { responseType: 'blob' })
      const url = URL.createObjectURL(res.data)
      window.open(url, '_blank', 'noopener,noreferrer')
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch {
      alert('Could not open national ID file')
    }
  }

  const openPhoto = async (userId) => {
    try {
      const res = await api.get(`/users/${userId}/photo`, { responseType: 'blob' })
      const url = URL.createObjectURL(res.data)
      window.open(url, '_blank', 'noopener,noreferrer')
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch {
      alert('Could not open profile photo')
    }
  }

  const formatLevel = (l) => l ? l.replace(/_/g, ' ') : '—'

  const handleSaveConfig = async (bidManagerId, cfg) => {
    setSavingSalary(true)
    try {
      await api.put(`/salary/${bidManagerId}`, { bidManagerSalaryPerProfile: Number(cfg.bidManagerSalaryPerProfile) })
      await loadData()
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to save')
    } finally {
      setSavingSalary(false)
    }
  }

  const updateConfigLocal = (bidManagerId, field, value) => {
    const id = String(bidManagerId)
    setSalaryConfigs(prev => prev.map(c =>
      String(c.bidManagerId) === id ? { ...c, [field]: value } : c
    ))
  }

  const assignOpsLead = async (bidManagerId, opsLeadId) => {
    setSavingAssign(true)
    try {
      await api.patch(`/users/${bidManagerId}/assign-ops-lead`, { opsLeadId: opsLeadId || null })
      await loadData()
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to assign Ops Lead')
    } finally {
      setSavingAssign(false)
    }
  }

  const assignBidManager = async (bidderId, bidManagerId) => {
    setSavingAssign(true)
    try {
      await api.patch(`/users/${bidderId}/assign-bid-manager`, { bidManagerId: bidManagerId || null })
      await loadData()
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to assign bid manager')
    } finally {
      setSavingAssign(false)
    }
  }

  const saveBidderSalary = async (bidderId, salaryPerBid) => {
    setSavingSalary(true)
    try {
      await api.patch(`/users/${bidderId}/salary-per-bid`, { salaryPerBid: Number(salaryPerBid) })
      await loadData()
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to save salary')
    } finally {
      setSavingSalary(false)
    }
  }

  const updateBidderLocal = (bidderId, salaryPerBid) => {
    setBiddersList(prev => prev.map(b =>
      b._id === bidderId ? { ...b, salaryPerBid } : b
    ))
  }

  const saveOpsTeamRate = async (userId, rate) => {
    setSavingSalary(true)
    try {
      await api.patch(`/users/${userId}/ops-team-rate`, { opsTeamRate: Number(rate) })
      await loadData()
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to save team rate')
    } finally {
      setSavingSalary(false)
    }
  }

  const confirmPersonPay = async () => {
    if (!payConfirm) return
    const tx = payTxId.trim()
    if (!tx) { alert('Enter the TxID (transaction reference) for this payment.'); return }
    setPaying(true)
    try {
      const bonus = Number(adminBonusByUser[String(payConfirm.userId)]) || 0
      await api.post(`/salary/pay/${payConfirm.userId}`, { adminBonus: bonus, txId: tx })
      setPayConfirm(null)
      setPayTxId('')
      await fetchPayoutQueue()
      const historyRes = await api.get('/salary/history')
      setPersonPayouts(historyRes.data?.personPayouts || [])
      setLegacyBatchPayouts(historyRes.data?.legacyBatchPayouts || [])
    } catch (err) {
      alert(err.response?.data?.error || 'Payment failed')
    } finally {
      setPaying(false)
    }
  }

  if (loading) return <div className="page-loading"><div className="spinner" /></div>

  return (
    <div className="page">
      <div className="page-header">
        <h2>Admin Dashboard</h2>
        <p className="page-desc">
          Bidder pay = bids &times; rate + BM bonus. BM pay = profiles &times; rate + Ops bonus. Ops pay = people &times; rate.
        </p>
      </div>

      <div className="tabs">
        <button type="button" className={activeTab === 'payouts' ? 'tab active' : 'tab'} onClick={() => setActiveTab('payouts')}>Payouts</button>
        <button type="button" className={activeTab === 'pending' ? 'tab active' : 'tab'} onClick={() => setActiveTab('pending')}>
          Pending Approvals {pendingUsers.length > 0 && `(${pendingUsers.length})`}
        </button>
        <button type="button" className={activeTab === 'assignments' ? 'tab active' : 'tab'} onClick={() => setActiveTab('assignments')}>Assignments</button>
        <button type="button" className={activeTab === 'salary' ? 'tab active' : 'tab'} onClick={() => setActiveTab('salary')}>Salary Config</button>
        <button type="button" className={activeTab === 'history' ? 'tab active' : 'tab'} onClick={() => setActiveTab('history')}>History</button>
      </div>

      {/* ── Payouts ── */}
      {activeTab === 'payouts' && (
        <>
          {payoutRequests.length > 0 && (
            <div className="card" style={{ marginBottom: '1rem' }}>
              <div className="card-header">
                <h3>Payout requests</h3>
                <span className="card-subtitle">Users asked for payment — find them below and pay with TxID.</span>
              </div>
              <div className="payout-requests-list">
                {payoutRequests.map(req => (
                  <div key={req._id} className="payout-request-item">
                    <strong>{req.userId?.name || 'User'}</strong>
                    <span className="badge badge-role badge-pending">{String(req.role || '').replace(/_/g, ' ')}</span>
                    <span className="text-muted">{req.userId?.email}</span>
                    <span className="payout-request-time">{new Date(req.createdAt).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="card">
            <div className="card-header">
              <h3>Payouts</h3>
              <button type="button" className="btn btn-ghost btn-sm" onClick={fetchPayoutQueue}>Refresh</button>
              <span className="card-subtitle" style={{ flex: '1 1 100%' }}>Only confirmed reports appear here (after Ops Lead approves all).</span>
            </div>
            <PayoutTree
              tree={payoutTree}
              bonusByUser={adminBonusByUser}
              setBonusByUser={setAdminBonusByUser}
              onPay={user => setPayConfirm(user)}
              onRefresh={fetchPayoutQueue}
            />
          </div>
        </>
      )}

      {/* ── Pending Approvals ── */}
      {activeTab === 'pending' && (
        <>
          {/* Duplicate-check search */}
          <div className="card">
            <div className="card-header">
              <h3>Check existing person</h3>
              <span className="card-subtitle">Search by first or last name to see if they already exist.</span>
            </div>
            <div className="pending-search-wrap">
              <input
                type="text"
                className="pending-search-input"
                placeholder="Type a name to search…"
                value={nameSearch}
                onChange={e => searchByName(e.target.value)}
              />
              {nameSearching && <span className="text-muted" style={{ fontSize: '0.8rem' }}>Searching…</span>}
            </div>
            {nameResults.length > 0 && (
              <div className="pending-search-results">
                {nameResults.map(r => {
                  const isOpen = expandedSearchHit === r._id
                  return (
                    <div key={r._id}>
                      <div
                        className={`pending-search-hit${isOpen ? ' pending-search-hit-active' : ''}`}
                        onClick={() => setExpandedSearchHit(isOpen ? null : r._id)}
                      >
                        <strong>{r.name}</strong>
                        <span className="badge badge-role">{r.role?.replace(/_/g, ' ')}</span>
                        <span className="text-muted">{r.email}</span>
                        {r.level && <span className="badge badge-level">{formatLevel(r.level)}</span>}
                        <span className={`pending-item-chevron${isOpen ? ' open' : ''}`}>▾</span>
                      </div>
                      {isOpen && (
                        <div className="search-detail-panel">
                          <div className="search-detail-grid">
                            <div className="search-detail-cell">
                              <span className="search-detail-label">Legal name</span>
                              <span>{[r.legalFirstName, r.legalMiddleName, r.legalLastName].filter(Boolean).join(' ') || '—'}</span>
                            </div>
                            <div className="search-detail-cell">
                              <span className="search-detail-label">Phone</span>
                              <span>{r.phone || '—'}</span>
                            </div>
                            <div className="search-detail-cell">
                              <span className="search-detail-label">Location</span>
                              <span>{[r.address, r.state, r.country].filter(Boolean).join(', ') || '—'}</span>
                            </div>
                            <div className="search-detail-cell">
                              <span className="search-detail-label">Nationality</span>
                              <span>{r.nationality || '—'}</span>
                            </div>
                            <div className="search-detail-cell">
                              <span className="search-detail-label">Email</span>
                              <span>{r.email}</span>
                            </div>
                            <div className="search-detail-cell">
                              <span className="search-detail-label">Role / Level</span>
                              <span>{r.role?.replace(/_/g, ' ')} · {formatLevel(r.level)}</span>
                            </div>
                            <div className="search-detail-cell search-detail-cell-full">
                              <span className="search-detail-label">ERC-20 wallet</span>
                              <span className="mono-text">{r.usdtErc20Wallet || '—'}</span>
                            </div>
                            {(r.linkedinUrl || r.facebookUrl) && (
                              <div className="search-detail-cell search-detail-cell-full">
                                <span className="search-detail-label">Social</span>
                                <span>
                                  {r.linkedinUrl && <a href={r.linkedinUrl} target="_blank" rel="noopener noreferrer" style={{ marginRight: '1rem' }}>LinkedIn</a>}
                                  {r.facebookUrl && <a href={r.facebookUrl} target="_blank" rel="noopener noreferrer">Facebook</a>}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
            {nameSearch.trim().length >= 2 && !nameSearching && nameResults.length === 0 && (
              <p className="text-muted" style={{ padding: '0.5rem 0', fontSize: '0.85rem' }}>No matching users found.</p>
            )}
          </div>

          {/* Applicant list */}
          <div className="card">
            <div className="card-header">
              <h3>Final admin approvals</h3>
              <span className="badge badge-pending">{pendingUsers.length}</span>
            </div>
            <p className="card-subtitle" style={{ marginBottom: '0.75rem' }}>
              <strong>Bidder / Bid manager:</strong> Ops Lead already assigned role &amp; level.{' '}
              <strong>Direct applicant:</strong> choose role &amp; level below.
            </p>

            {pendingUsers.length === 0 ? (
              <div className="empty-state-box">
                <span className="empty-state-icon">✓</span>
                <p>No applications awaiting approval.</p>
              </div>
            ) : (
              <div className="pending-list">
                {pendingUsers.map(u => {
                  const isExpanded = expandedApplicant === u._id
                  return (
                    <div key={u._id} className={`pending-item${isExpanded ? ' pending-item-expanded' : ''}`}>
                      <div className="pending-item-row" onClick={() => setExpandedApplicant(isExpanded ? null : u._id)}>
                        <div className="pending-item-person">
                          <span className="pending-item-name">{u.name}</span>
                          <span className="pending-item-email">{u.email}</span>
                        </div>
                        <div className="pending-item-tags">
                          {u.role === 'applicant' ? (
                            <span className="badge badge-role">direct applicant</span>
                          ) : (
                            <span className="badge badge-pending">{u.role?.replace(/_/g, ' ')}</span>
                          )}
                          {u.level && <span className="badge badge-level">{formatLevel(u.level)}</span>}
                        </div>
                        <div className="pending-item-docs">
                          <button type="button" className="btn btn-ghost btn-sm" onClick={e => { e.stopPropagation(); openPhoto(u._id) }}>Photo</button>
                          <button type="button" className="btn btn-ghost btn-sm" onClick={e => { e.stopPropagation(); openNationalId(u._id) }}>ID</button>
                        </div>
                        <span className={`pending-item-chevron${isExpanded ? ' open' : ''}`}>▾</span>
                      </div>

                      {isExpanded && (
                        <div className="pending-item-detail">
                          <div className="pending-detail-grid">
                            <div className="pending-detail-cell">
                              <span className="pending-detail-label">Legal name</span>
                              <span>{[u.legalFirstName, u.legalMiddleName, u.legalLastName].filter(Boolean).join(' ') || '—'}</span>
                            </div>
                            <div className="pending-detail-cell">
                              <span className="pending-detail-label">Phone</span>
                              <span>{u.phone || '—'}</span>
                            </div>
                            <div className="pending-detail-cell">
                              <span className="pending-detail-label">Location</span>
                              <span>{[u.address, u.state, u.country].filter(Boolean).join(', ') || '—'}</span>
                            </div>
                            <div className="pending-detail-cell">
                              <span className="pending-detail-label">Nationality</span>
                              <span>{u.nationality || '—'}</span>
                            </div>
                            <div className="pending-detail-cell pending-detail-cell-full">
                              <span className="pending-detail-label">ERC-20 wallet</span>
                              <span className="mono-text">{u.usdtErc20Wallet || '—'}</span>
                            </div>

                            {u.role === 'applicant' && (
                              <>
                                <div className="pending-detail-cell">
                                  <span className="pending-detail-label">Assign role</span>
                                  <select
                                    value={adminAssign[u._id]?.role ?? 'financial_manager'}
                                    onChange={e => setAdminAssign(a => ({
                                      ...a,
                                      [u._id]: { role: e.target.value, level: a[u._id]?.level ?? 'mid_level' }
                                    }))}
                                  >
                                    {ADMIN_DIRECT_ROLES.map(r => (
                                      <option key={r.value} value={r.value}>{r.label}</option>
                                    ))}
                                  </select>
                                </div>
                                <div className="pending-detail-cell">
                                  <span className="pending-detail-label">Assign level</span>
                                  <select
                                    value={adminAssign[u._id]?.level ?? 'mid_level'}
                                    onChange={e => setAdminAssign(a => ({
                                      ...a,
                                      [u._id]: { role: a[u._id]?.role ?? 'financial_manager', level: e.target.value }
                                    }))}
                                  >
                                    {LEVEL_OPTIONS.map(l => (
                                      <option key={l.value} value={l.value}>{l.label}</option>
                                    ))}
                                  </select>
                                </div>
                              </>
                            )}
                          </div>

                          <div className="pending-item-actions">
                            <button type="button" onClick={() => handleApprove(u._id)} className="btn btn-primary btn-sm">Approve</button>
                            <button type="button" onClick={() => openRejectModal(u)} className="btn btn-ghost btn-sm btn-danger">Reject</button>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Reject modal */}
          {rejectModal && (
            <div className="modal-backdrop" onClick={() => !rejecting && setRejectModal(null)}>
              <div className="modal-pay" onClick={e => e.stopPropagation()}>
                <h3>Reject applicant</h3>
                <p className="text-muted" style={{ marginBottom: '0.75rem' }}>
                  <strong>{rejectModal.name}</strong> ({rejectModal.email}) will be sent back to onboarding and can resubmit after reviewing your feedback.
                </p>
                <label className="pending-reject-label">Reason for rejection *</label>
                <textarea
                  className="pending-reject-textarea"
                  rows={3}
                  placeholder="Explain what needs to be corrected…"
                  value={rejectReason}
                  onChange={e => setRejectReason(e.target.value)}
                />
                <div className="modal-pay-actions">
                  <button type="button" className="btn btn-ghost" onClick={() => setRejectModal(null)} disabled={rejecting}>Cancel</button>
                  <button type="button" className="btn btn-danger" onClick={confirmReject} disabled={rejecting || !rejectReason.trim()}>
                    {rejecting ? 'Rejecting…' : 'Confirm rejection'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Assignments ── */}
      {activeTab === 'assignments' && (
        <>
          <div className="card">
            <div className="card-header">
              <h3>Bid managers &rarr; Ops Lead</h3>
              <span className="card-subtitle">Auto-saves on change</span>
            </div>
            {bidManagersList.length === 0 ? (
              <p className="empty-state">No bid managers yet.</p>
            ) : (
              <div className="assignment-list">
                {bidManagersList.map(bm => (
                  <div key={bm._id} className="assignment-item">
                    <div className="assignment-info">
                      <span className="assignment-name">{bm.name}</span>
                      <span className="assignment-email">{bm.email}</span>
                    </div>
                    <div className="assignment-arrow">&rarr;</div>
                    <select
                      key={`${bm._id}-ol-${bm.opsLeadId?._id || bm.opsLeadId || ''}`}
                      defaultValue={bm.opsLeadId?._id || bm.opsLeadId || ''}
                      onChange={e => assignOpsLead(bm._id, e.target.value)}
                      disabled={savingAssign}
                      className="assignment-select"
                    >
                      <option value="">— None —</option>
                      {opsLeads.map(ol => (
                        <option key={ol._id} value={ol._id}>{ol.name}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card">
            <div className="card-header">
              <h3>Bidders &rarr; Bid manager</h3>
              <span className="card-subtitle">Auto-saves on change</span>
            </div>
            {biddersList.length === 0 ? (
              <p className="empty-state">No bidders yet.</p>
            ) : (
              <div className="assignment-list">
                {biddersList.map(b => (
                  <div key={b._id} className="assignment-item">
                    <div className="assignment-info">
                      <span className="assignment-name">{b.name}</span>
                      <span className="assignment-email">{b.email}</span>
                    </div>
                    {b.usdtErc20Wallet && (
                      <span className="assignment-wallet">{b.usdtErc20Wallet}</span>
                    )}
                    <div className="assignment-arrow">&rarr;</div>
                    <select
                      key={`${b._id}-bm-${b.bidManagerId?._id || b.bidManagerId || ''}`}
                      defaultValue={b.bidManagerId?._id || b.bidManagerId || ''}
                      onChange={e => assignBidManager(b._id, e.target.value)}
                      disabled={savingAssign}
                      className="assignment-select"
                    >
                      <option value="">— Unassigned —</option>
                      {bidManagersList.map(bm => (
                        <option key={bm._id} value={bm._id}>{bm.name}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* ── History ── */}
      {activeTab === 'history' && (
        <div className="card">
          <div className="card-header">
            <h3>Payment history</h3>
            <span className="card-subtitle">Individual payouts after you confirm Pay</span>
          </div>
          {personPayouts.length === 0 ? (
            <p className="empty-state">No person payouts yet.</p>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr><th>Date</th><th>Name</th><th>Role</th><th>Base</th><th>Admin bonus</th><th>Total</th><th>Address</th><th>TxID</th></tr>
                </thead>
                <tbody>
                  {personPayouts.map(h => (
                    <tr key={h._id}>
                      <td>{new Date(h.createdAt).toLocaleDateString()}</td>
                      <td>{h.name}</td>
                      <td>{h.role?.replace(/_/g, ' ')}</td>
                      <td>${Number(h.basePay).toFixed(2)}</td>
                      <td>${Number(h.adminBonus).toFixed(2)}</td>
                      <td><strong>${Number(h.totalPay).toFixed(2)}</strong></td>
                      <td style={{ fontFamily: 'monospace', fontSize: '0.75rem', maxWidth: '200px', wordBreak: 'break-all' }}>{h.walletAddress}</td>
                      <td style={{ fontFamily: 'monospace', fontSize: '0.75rem', maxWidth: '180px', wordBreak: 'break-all' }}>{h.txId || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {legacyBatchPayouts.length > 0 && (
            <div style={{ marginTop: '2rem' }}>
              <div className="card-header">
                <h3>Legacy batch payouts</h3>
              </div>
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr><th>Date</th><th>Grand Total</th><th>Deducted</th><th>Reports</th></tr>
                  </thead>
                  <tbody>
                    {legacyBatchPayouts.map(h => (
                      <tr key={h._id}>
                        <td>{new Date(h.createdAt).toLocaleDateString()}</td>
                        <td>${h.grandTotal?.toFixed(2)}</td>
                        <td>${h.totalDeducted?.toFixed(2)}</td>
                        <td>{h.reportCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Salary Config ── */}
      {activeTab === 'salary' && (
        <>
          <div className="card">
            <div className="card-header">
              <h3>Ops Lead</h3>
              <span className="badge badge-role badge-ops_lead">per-person rate</span>
            </div>
            <p className="card-subtitle" style={{ marginBottom: '1rem' }}>
              Ops pay = distinct bidders (people) &times; this rate. Admin bonus added at payout.
            </p>
            {opsLeads.length === 0 ? (
              <p className="empty-state">No Ops Leads yet.</p>
            ) : (
              <div className="salary-card-list">
                {opsLeads.map(ol => (
                  <div key={ol._id} className="salary-card">
                    <div className="salary-card-info">
                      <span className="salary-card-name">{ol.name}</span>
                      <span className="salary-card-detail">{ol.email}</span>
                      {ol.usdtErc20Wallet && (
                        <span className="salary-card-wallet">{ol.usdtErc20Wallet}</span>
                      )}
                    </div>
                    <div className="salary-card-input">
                      <label>$ / person</label>
                      <input
                        type="number" step="0.01" min="0"
                        defaultValue={ol.opsTeamRate ?? 0}
                        id={`salary-ops-rate-${ol._id}`}
                        disabled={savingSalary}
                      />
                    </div>
                    <button
                      type="button" className="btn btn-primary btn-sm" disabled={savingSalary}
                      onClick={() => {
                        const el = document.getElementById(`salary-ops-rate-${ol._id}`)
                        saveOpsTeamRate(ol._id, el?.value ?? 0)
                      }}
                    >Save</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card">
            <div className="card-header">
              <h3>Bid managers</h3>
              <span className="badge badge-role badge-bid_manager">per-profile rate</span>
            </div>
            <p className="card-subtitle" style={{ marginBottom: '1rem' }}>
              BM pay = confirmed profiles &times; this rate. Ops bonus added by Ops Lead at approval.
            </p>
            {salaryConfigs.length === 0 ? (
              <p className="empty-state">No bid managers yet.</p>
            ) : (
              <div className="salary-card-list">
                {salaryConfigs.map(cfg => (
                  <div key={String(cfg.bidManagerId)} className="salary-card">
                    <div className="salary-card-info">
                      <span className="salary-card-name">{cfg.bidManager?.name || 'Bid Manager'}</span>
                    </div>
                    <div className="salary-card-input">
                      <label>$ / profile / week</label>
                      <input
                        type="number" step="0.01" min="0"
                        value={cfg.bidManagerSalaryPerProfile}
                        onChange={e => updateConfigLocal(String(cfg.bidManagerId), 'bidManagerSalaryPerProfile', e.target.value)}
                        disabled={savingSalary}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => handleSaveConfig(String(cfg.bidManagerId), cfg)}
                      disabled={savingSalary}
                      className="btn btn-primary btn-sm"
                    >{savingSalary ? 'Saving...' : 'Save'}</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card">
            <div className="card-header">
              <h3>Bidders</h3>
              <span className="badge badge-role badge-bidder">per-bid rate</span>
            </div>
            <p className="card-subtitle" style={{ marginBottom: '1rem' }}>
              Bidder pay = bid count &times; this rate. BM bonus added by Bid Manager at approval.
            </p>
            {biddersList.length === 0 ? (
              <p className="empty-state">No bidders yet.</p>
            ) : (
              <div className="salary-card-list">
                {biddersList.map(b => (
                  <div key={b._id} className="salary-card">
                    <div className="salary-card-info">
                      <span className="salary-card-name">{b.name}</span>
                      <span className="salary-card-detail">{b.email}</span>
                      <span className="salary-card-detail">
                        BM: {b.bidManagerId?.name || '—'}
                      </span>
                    </div>
                    <div className="salary-card-input">
                      <label>$ / bid</label>
                      <input
                        key={`salary-tab-spb-${b._id}-${b.salaryPerBid}`}
                        type="number" step="0.001" min="0"
                        defaultValue={b.salaryPerBid ?? 0.08}
                        id={`salary-bidder-${b._id}`}
                        disabled={savingSalary}
                      />
                    </div>
                    <button
                      type="button" className="btn btn-primary btn-sm" disabled={savingSalary}
                      onClick={() => {
                        const el = document.getElementById(`salary-bidder-${b._id}`)
                        saveBidderSalary(b._id, el?.value)
                      }}
                    >Save</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      <PayConfirmModal
        payConfirm={payConfirm}
        adminBonus={adminBonusByUser[String(payConfirm?.userId)] || 0}
        payTxId={payTxId}
        setPayTxId={setPayTxId}
        paying={paying}
        onConfirm={confirmPersonPay}
        onCancel={() => { setPayConfirm(null); setPayTxId('') }}
      />
    </div>
  )
}
