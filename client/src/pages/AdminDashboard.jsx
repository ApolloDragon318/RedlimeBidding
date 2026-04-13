import { useState, useEffect, useCallback, useRef } from 'react'
import { api } from '../api'
import PayoutTree from '../components/PayoutTree'
import PayConfirmModal from '../components/PayConfirmModal'
import SalaryRateGrid from '../components/SalaryRateGrid'
import ClientPayoutTable from '../components/ClientPayoutTable'
import ProfilePayoutApprovalsCard from '../components/ProfilePayoutApprovalsCard'
import AdminClientsProfiles from './AdminClientsProfiles'

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
  const [salaryGrid, setSalaryGrid] = useState({})
  const [salaryRoles, setSalaryRoles] = useState([])
  const [salaryLevels, setSalaryLevels] = useState([])
  const [pendingUsers, setPendingUsers] = useState([])
  const [opsLeads, setOpsLeads] = useState([])
  const [bidManagersList, setBidManagersList] = useState([])
  const [biddersList, setBiddersList] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('payouts')
  const [savingAssign, setSavingAssign] = useState(false)
  const [personPayouts, setPersonPayouts] = useState([])
  const [legacyBatchPayouts, setLegacyBatchPayouts] = useState([])
  const [payoutTree, setPayoutTree] = useState([])
  const [payoutTaxRate, setPayoutTaxRate] = useState(0.10)
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
  const [levelRequests, setLevelRequests] = useState([])
  const [lvlDeclineModal, setLvlDeclineModal] = useState(null)
  const [lvlDeclineReason, setLvlDeclineReason] = useState('')
  const [lvlProcessing, setLvlProcessing] = useState(null)
  const [clientPayoutData, setClientPayoutData] = useState(null)
  const [clientTableLoading, setClientTableLoading] = useState(false)
  const [walletChangeRequests, setWalletChangeRequests] = useState([])
  const [walletLookupQ, setWalletLookupQ] = useState('')
  const [walletLookupResults, setWalletLookupResults] = useState(null)
  const [walletLookupLoading, setWalletLookupLoading] = useState(false)
  const [walletProcessingId, setWalletProcessingId] = useState(null)
  const [walletDeclineModal, setWalletDeclineModal] = useState(null)
  const [walletDeclineReason, setWalletDeclineReason] = useState('')
  const [walletDeclining, setWalletDeclining] = useState(false)
  const [passwordResetRequests, setPasswordResetRequests] = useState([])
  const [pwResetProcessing, setPwResetProcessing] = useState(null)

  const [clientMgmtList, setClientMgmtList] = useState([])
  const [clientMgmtLoading, setClientMgmtLoading] = useState(false)
  const [clientForm, setClientForm] = useState({ firstName: '', lastName: '', email: '', password: '', clientType: 'external' })
  const [clientSaving, setClientSaving] = useState(false)
  const [clientEditId, setClientEditId] = useState(null)
  const [clientEditForm, setClientEditForm] = useState({})
  const [clientEditSaving, setClientEditSaving] = useState(false)

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
      const [qRes, wrRes] = await Promise.all([
        api.get('/salary/payout-queue'),
        api.get('/users/wallet-change-requests').catch(() => ({ data: { requests: [] } }))
      ])
      setPayoutTree(qRes.data.tree || [])
      setPayoutTaxRate(qRes.data.taxRate ?? 0.10)
      setWalletChangeRequests(wrRes.data?.requests || [])
    } catch (e) {
      console.error(e)
      setPayoutTree([])
      setWalletChangeRequests([])
    }
  }, [])

  useEffect(() => {
    if (activeTab === 'payouts') fetchPayoutQueue()
  }, [activeTab, fetchPayoutQueue])

  const fetchClientMgmt = useCallback(async () => {
    setClientMgmtLoading(true)
    try {
      const { data } = await api.get('/clients')
      setClientMgmtList(data)
    } catch { setClientMgmtList([]) }
    finally { setClientMgmtLoading(false) }
  }, [])

  useEffect(() => {
    if (activeTab === 'client-mgmt') fetchClientMgmt()
  }, [activeTab, fetchClientMgmt])

  const createClient = async (e) => {
    e.preventDefault()
    const { firstName, lastName, email, password, clientType } = clientForm
    if (!firstName.trim()) return alert('First name is required')
    if (clientType === 'external' && !lastName.trim()) return alert('Last name is required for external clients')
    if (!email.trim()) return alert('Email is required')
    if (!password || password.length < 6) return alert('Password must be at least 6 characters')
    setClientSaving(true)
    try {
      const { data } = await api.post('/clients', { firstName: firstName.trim(), lastName: lastName.trim(), email: email.trim(), password, clientType })
      setClientMgmtList(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)))
      setClientForm({ firstName: '', lastName: '', email: '', password: '', clientType: 'external' })
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to create client')
    } finally { setClientSaving(false) }
  }

  const startEditClient = (c) => {
    const nameParts = c.name.split(' ')
    setClientEditId(c._id)
    setClientEditForm({
      firstName: nameParts[0] || '',
      lastName: nameParts.slice(1).join(' ') || '',
      email: c.email || '',
      clientType: c.clientType || 'external'
    })
  }

  const saveEditClient = async () => {
    setClientEditSaving(true)
    try {
      const { data } = await api.patch(`/clients/${clientEditId}`, clientEditForm)
      setClientMgmtList(prev => prev.map(c => c._id === clientEditId ? data : c))
      setClientEditId(null)
      setClientEditForm({})
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to update client')
    } finally { setClientEditSaving(false) }
  }

  const toggleClientType = async (c) => {
    const newType = c.clientType === 'internal' ? 'external' : 'internal'
    try {
      const { data } = await api.patch(`/clients/${c._id}`, { clientType: newType })
      setClientMgmtList(prev => prev.map(x => x._id === c._id ? data : x))
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to toggle type')
    }
  }

  const deleteClient = async (c) => {
    if (!confirm(`Delete client "${c.name}"? This will also delete their user account.`)) return
    try {
      await api.delete(`/clients/${c._id}`)
      setClientMgmtList(prev => prev.filter(x => x._id !== c._id))
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to delete client')
    }
  }

  const searchWalletAddress = async () => {
    const q = walletLookupQ.trim()
    if (!q) { setWalletLookupResults(null); return }
    setWalletLookupLoading(true)
    setWalletLookupResults(null)
    try {
      const { data } = await api.get('/users/wallet-address-search', { params: { q } })
      setWalletLookupResults(data.users || [])
    } catch (err) {
      alert(err.response?.data?.error || 'Lookup failed')
    } finally {
      setWalletLookupLoading(false)
    }
  }

  const approveWalletRequest = async req => {
    if (!req?._id) return
    setWalletProcessingId(req._id)
    try {
      await api.patch(`/users/wallet-change-requests/${req._id}/approve`)
      await fetchPayoutQueue()
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to approve')
    } finally {
      setWalletProcessingId(null)
    }
  }

  const confirmWalletDecline = async () => {
    if (!walletDeclineModal?._id) return
    const r = walletDeclineReason.trim()
    if (!r) {
      alert('Please enter a reason.')
      return
    }
    setWalletDeclining(true)
    try {
      await api.patch(`/users/wallet-change-requests/${walletDeclineModal._id}/decline`, { reason: r })
      setWalletDeclineModal(null)
      setWalletDeclineReason('')
      await fetchPayoutQueue()
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to decline')
    } finally {
      setWalletDeclining(false)
    }
  }

  const loadData = async () => {
    setLoading(true)
    try {
      const [salaryRes, pendingRes, historyRes, opsRes, bmRes, biddersRes, lvlRes, pwRes] = await Promise.all([
        api.get('/salary').catch(() => ({ data: { grid: {}, roles: [], levels: [] } })),
        api.get('/users/pending').catch(() => ({ data: [] })),
        api.get('/salary/history').catch(() => ({ data: { personPayouts: [], legacyBatchPayouts: [] } })),
        api.get('/users/ops-leads').catch(() => ({ data: [] })),
        api.get('/users/bid-managers').catch(() => ({ data: [] })),
        api.get('/users/bidders').catch(() => ({ data: [] })),
        api.get('/users/level-requests').catch(() => ({ data: [] })),
        api.get('/auth/password-reset-requests').catch(() => ({ data: [] }))
      ])
      setSalaryGrid(salaryRes.data?.grid || {})
      setSalaryRoles(salaryRes.data?.roles || [])
      setSalaryLevels(salaryRes.data?.levels || [])
      setPendingUsers(pendingRes.data)
      setPersonPayouts(historyRes.data?.personPayouts || [])
      setLegacyBatchPayouts(historyRes.data?.legacyBatchPayouts || [])
      setOpsLeads(opsRes.data || [])
      setBidManagersList(bmRes.data || [])
      setBiddersList(biddersRes.data || [])
      setLevelRequests(lvlRes.data || [])
      setPasswordResetRequests(pwRes.data || [])
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

  const approvePwReset = async (id) => {
    setPwResetProcessing(id)
    try {
      await api.patch(`/auth/password-reset-requests/${id}/approve`)
      setPasswordResetRequests(prev => prev.filter(r => r._id !== id))
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to approve')
    } finally {
      setPwResetProcessing(null)
    }
  }

  const dismissPwReset = async (id) => {
    setPwResetProcessing(id)
    try {
      await api.patch(`/auth/password-reset-requests/${id}/dismiss`)
      setPasswordResetRequests(prev => prev.filter(r => r._id !== id))
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to dismiss')
    } finally {
      setPwResetProcessing(null)
    }
  }

  const handleSalaryUpdate = (data) => {
    setSalaryGrid(data?.grid || {})
    setSalaryRoles(data?.roles || [])
    setSalaryLevels(data?.levels || [])
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

  const confirmPersonPay = async () => {
    if (!payConfirm) return
    const tx = payTxId.trim()
    if (!tx) { alert('Enter the TxID (transaction reference) for this payment.'); return }
    setPaying(true)
    try {
      const rawB = Number(adminBonusByUser[String(payConfirm.userId)])
      const bonus = Number.isFinite(rawB) ? rawB : 0
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

  const formatLevel = (l) => l ? l.replace(/_/g, ' ') : '—'

  const approveLevelRequest = async (id) => {
    setLvlProcessing(id)
    try {
      await api.patch(`/users/level-requests/${id}/approve`)
      setLevelRequests(prev => prev.filter(r => r._id !== id))
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to approve')
    } finally {
      setLvlProcessing(null)
    }
  }

  const generateClientTable = async () => {
    setClientTableLoading(true)
    try {
      const bonusMap = {}
      for (const [uid, val] of Object.entries(adminBonusByUser)) {
        const n = Number(val)
        if (Number.isFinite(n) && n !== 0) bonusMap[uid] = n
      }
      const { data } = await api.post('/salary/client-payout-table', { adminBonuses: bonusMap })
      setClientPayoutData(data)
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to generate table')
    } finally {
      setClientTableLoading(false)
    }
  }

  const declineLevelRequest = async () => {
    if (!lvlDeclineModal) return
    setLvlProcessing(lvlDeclineModal._id)
    try {
      await api.patch(`/users/level-requests/${lvlDeclineModal._id}/decline`, { reason: lvlDeclineReason.trim() })
      setLevelRequests(prev => prev.filter(r => r._id !== lvlDeclineModal._id))
      setLvlDeclineModal(null)
      setLvlDeclineReason('')
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to decline')
    } finally {
      setLvlProcessing(null)
    }
  }

  if (loading) return <div className="page-loading"><div className="spinner" /></div>

  return (
    <div className="page">
      <div className="page-header">
        <h2>Admin Dashboard</h2>
        <p className="page-desc">
          Bidder pay = bids &times; rate + BM bonus. BM pay = profiles &times; rate + <strong>one</strong> Ops bonus total per BM. Ops pay = profiles &times; rate. When a client owns a profile, either the client or admin/FM must approve it before payout.
        </p>
      </div>

      <div className="tabs">
        <button type="button" className={activeTab === 'payouts' ? 'tab active' : 'tab'} onClick={() => setActiveTab('payouts')}>Payouts</button>
        <button type="button" className={activeTab === 'client-mgmt' ? 'tab active' : 'tab'} onClick={() => setActiveTab('client-mgmt')}>Client Management</button>
        <button type="button" className={activeTab === 'clients' ? 'tab active' : 'tab'} onClick={() => setActiveTab('clients')}>Profiles</button>
        <button type="button" className={activeTab === 'levels' ? 'tab active' : 'tab'} onClick={() => setActiveTab('levels')}>
          Level requests
          {levelRequests.length > 0 && <span className="tab-badge">{levelRequests.length}</span>}
        </button>
        <button type="button" className={activeTab === 'pending' ? 'tab active' : 'tab'} onClick={() => setActiveTab('pending')}>
          Pending Approvals {pendingUsers.length > 0 && `(${pendingUsers.length})`}
        </button>
        <button type="button" className={activeTab === 'pw-resets' ? 'tab active' : 'tab'} onClick={() => setActiveTab('pw-resets')}>
          Password resets
          {passwordResetRequests.length > 0 && <span className="tab-badge">{passwordResetRequests.length}</span>}
        </button>
        <button type="button" className={activeTab === 'assignments' ? 'tab active' : 'tab'} onClick={() => setActiveTab('assignments')}>Assignments</button>
        <button type="button" className={activeTab === 'salary' ? 'tab active' : 'tab'} onClick={() => setActiveTab('salary')}>Salary Config</button>
        <button type="button" className={activeTab === 'history' ? 'tab active' : 'tab'} onClick={() => setActiveTab('history')}>History</button>
      </div>

      {/* ── Payouts ── */}
      {activeTab === 'payouts' && (
        <>
          <div className="card" style={{ marginBottom: '1rem' }}>
            <div className="card-header">
              <h3>Wallet change requests</h3>
              <span className="card-subtitle">Approve USDT payouts address changes from users. Search the database for an address before approving.</span>
            </div>
            <div className="wallet-lookup-row">
              <input
                type="text"
                className="wallet-lookup-input"
                placeholder="0x… search who uses this address"
                value={walletLookupQ}
                onChange={e => setWalletLookupQ(e.target.value)}
                spellCheck={false}
                autoComplete="off"
              />
              <button type="button" className="btn btn-ghost btn-sm" onClick={searchWalletAddress} disabled={walletLookupLoading}>
                {walletLookupLoading ? 'Searching…' : 'Search'}
              </button>
            </div>
            {walletLookupResults !== null && (
              <div className="wallet-lookup-results">
                {walletLookupResults.length === 0 ? (
                  <p className="text-muted" style={{ margin: '0.5rem 0 0', fontSize: '0.85rem' }}>No user has this wallet on file.</p>
                ) : (
                  <ul className="wallet-lookup-list">
                    {walletLookupResults.map(u => (
                      <li key={u._id}>
                        <strong>{u.name}</strong> <span className="text-muted">{u.email}</span>
                        <span className="badge badge-role">{String(u.role || '').replace(/_/g, ' ')}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            {walletChangeRequests.length === 0 ? (
              <p className="payout-requests-empty">No pending wallet change requests.</p>
            ) : (
              <div className="wallet-req-list">
                {walletChangeRequests.map(wr => (
                  <div key={wr._id} className="payout-request-card">
                    <div className="payout-request-item">
                      <strong>{wr.userId?.name || 'User'}</strong>
                      <span className="badge badge-role">{String(wr.userId?.role || '').replace(/_/g, ' ')}</span>
                      <span className="text-muted">{wr.userId?.email}</span>
                      <div className="wallet-req-detail">
                        <span className="text-muted">From</span>{' '}
                        <code className="mono-text">{wr.previousWallet || '—'}</code>
                        <span className="text-muted"> → </span>
                        <code className="mono-text">{wr.requestedWallet}</code>
                      </div>
                      {wr.userNote && <p className="text-muted" style={{ margin: '0.25rem 0 0', fontSize: '0.85rem' }}>Note: {wr.userNote}</p>}
                      <div className="payout-request-actions">
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          onClick={() => approveWalletRequest(wr)}
                          disabled={walletProcessingId === wr._id}
                        >
                          {walletProcessingId === wr._id ? '…' : 'Approve'}
                        </button>
                        <button type="button" className="btn btn-ghost btn-sm btn-danger" onClick={() => { setWalletDeclineModal(wr); setWalletDeclineReason('') }}>
                          Decline
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="card" style={{ marginBottom: '1rem' }}>
            <div className="card-header">
              <h3>Profile payout approvals</h3>
              <span className="card-subtitle">
                When a profile belongs to a client, either the client or admin/financial can approve it; internal profiles need admin/FM only. Tax estimates are for internal use only.
              </span>
            </div>
            <ProfilePayoutApprovalsCard onUpdated={fetchPayoutQueue} />
          </div>
          <div className="card">
            <div className="card-header">
              <h3>Payouts</h3>
              <button type="button" className="btn btn-ghost btn-sm" onClick={fetchPayoutQueue}>Refresh</button>
              <span className="card-subtitle" style={{ flex: '1 1 100%' }}>Pay team members once per-profile approval is in place. Amounts only include approved profiles.</span>
            </div>
            <PayoutTree
              tree={payoutTree}
              bonusByUser={adminBonusByUser}
              setBonusByUser={setAdminBonusByUser}
              onPay={user => setPayConfirm(user)}
              onRefresh={fetchPayoutQueue}
              taxRate={payoutTaxRate}
            />
          </div>

          <div className="card" style={{ marginTop: '1rem' }}>
            <div className="card-header">
              <h3>Client cost table</h3>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={generateClientTable}
                disabled={clientTableLoading}
              >
                {clientTableLoading ? 'Generating…' : 'Generate table'}
              </button>
              <span className="card-subtitle" style={{ flex: '1 1 100%' }}>
                Internal clients only — per-profile costs and merged client totals for pending payouts.
              </span>
            </div>
            {clientPayoutData && <ClientPayoutTable data={clientPayoutData} />}
          </div>
        </>
      )}

      {/* ── Client Management ── */}
      {activeTab === 'client-mgmt' && (
        <>
          <div className="card" style={{ marginBottom: '1rem' }}>
            <div className="card-header">
              <h3>Create client</h3>
              <span className="card-subtitle">Create a client account with sign-in credentials. Toggle between Internal and External type.</span>
            </div>
            <form onSubmit={createClient} className="prof-inline-form" style={{ flexWrap: 'wrap', gap: '0.5rem' }}>
              <div className="prof-create-input-wrap">
                <label className="prof-field-label">Type</label>
                <select
                  value={clientForm.clientType}
                  onChange={e => setClientForm(f => ({ ...f, clientType: e.target.value }))}
                  className="prof-create-input"
                >
                  <option value="external">External</option>
                  <option value="internal">Internal</option>
                </select>
              </div>
              <div className="prof-create-input-wrap">
                <label className="prof-field-label">First name *</label>
                <input
                  value={clientForm.firstName}
                  onChange={e => setClientForm(f => ({ ...f, firstName: e.target.value }))}
                  placeholder="First name"
                  className="prof-create-input"
                  required
                />
              </div>
              <div className="prof-create-input-wrap">
                <label className="prof-field-label">Last name {clientForm.clientType === 'external' ? '*' : ''}</label>
                <input
                  value={clientForm.lastName}
                  onChange={e => setClientForm(f => ({ ...f, lastName: e.target.value }))}
                  placeholder="Last name"
                  className="prof-create-input"
                  required={clientForm.clientType === 'external'}
                />
              </div>
              <div className="prof-create-input-wrap">
                <label className="prof-field-label">Email *</label>
                <input
                  value={clientForm.email}
                  onChange={e => setClientForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="client@example.com"
                  className="prof-create-input"
                  type="email"
                  required
                />
              </div>
              <div className="prof-create-input-wrap">
                <label className="prof-field-label">Password *</label>
                <input
                  value={clientForm.password}
                  onChange={e => setClientForm(f => ({ ...f, password: e.target.value }))}
                  placeholder="Min 6 characters"
                  className="prof-create-input"
                  type="text"
                  minLength={6}
                  required
                />
              </div>
              <button type="submit" className="btn btn-primary" disabled={clientSaving} style={{ alignSelf: 'flex-end' }}>
                {clientSaving ? '...' : 'Add client'}
              </button>
            </form>
          </div>

          {clientMgmtLoading ? (
            <div className="page-loading"><div className="spinner" /></div>
          ) : clientMgmtList.length === 0 ? (
            <div className="card">
              <div className="empty-state-box">
                <span className="empty-state-icon">👥</span>
                <p>No clients yet</p>
              </div>
            </div>
          ) : (
            <div className="card">
              <div className="card-header">
                <h3>All clients ({clientMgmtList.length})</h3>
              </div>
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Type</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {clientMgmtList.map(c => (
                      <tr key={c._id}>
                        {clientEditId === c._id ? (
                          <>
                            <td>
                              <div style={{ display: 'flex', gap: '0.35rem' }}>
                                <input
                                  value={clientEditForm.firstName}
                                  onChange={e => setClientEditForm(f => ({ ...f, firstName: e.target.value }))}
                                  placeholder="First name"
                                  className="inline-edit-input"
                                  style={{ width: '45%' }}
                                />
                                <input
                                  value={clientEditForm.lastName}
                                  onChange={e => setClientEditForm(f => ({ ...f, lastName: e.target.value }))}
                                  placeholder="Last name"
                                  className="inline-edit-input"
                                  style={{ width: '45%' }}
                                />
                              </div>
                            </td>
                            <td>
                              <input
                                value={clientEditForm.email}
                                onChange={e => setClientEditForm(f => ({ ...f, email: e.target.value }))}
                                placeholder="Email"
                                className="inline-edit-input"
                                type="email"
                              />
                            </td>
                            <td>
                              <select
                                value={clientEditForm.clientType}
                                onChange={e => setClientEditForm(f => ({ ...f, clientType: e.target.value }))}
                                className="inline-edit-input"
                              >
                                <option value="external">External</option>
                                <option value="internal">Internal</option>
                              </select>
                            </td>
                            <td>
                              <div style={{ display: 'flex', gap: '0.35rem' }}>
                                <button type="button" className="btn btn-primary btn-sm" onClick={saveEditClient} disabled={clientEditSaving}>
                                  {clientEditSaving ? '...' : 'Save'}
                                </button>
                                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setClientEditId(null)}>Cancel</button>
                              </div>
                            </td>
                          </>
                        ) : (
                          <>
                            <td>{c.name}</td>
                            <td>{c.email || '—'}</td>
                            <td>
                              <button
                                type="button"
                                className={`badge badge-toggle ${c.clientType === 'internal' ? 'badge-info' : 'badge-default'}`}
                                onClick={() => toggleClientType(c)}
                                title="Click to toggle"
                              >
                                {c.clientType === 'internal' ? 'Internal' : 'External'}
                              </button>
                            </td>
                            <td>
                              <div style={{ display: 'flex', gap: '0.35rem' }}>
                                <button type="button" className="btn btn-ghost btn-sm" onClick={() => startEditClient(c)}>Edit</button>
                                <button type="button" className="btn btn-ghost btn-sm btn-danger" onClick={() => deleteClient(c)}>Delete</button>
                              </div>
                            </td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {activeTab === 'clients' && <AdminClientsProfiles />}

      {/* ── Password reset requests ── */}
      {activeTab === 'pw-resets' && (
        <>
          {passwordResetRequests.length === 0 ? (
            <div className="card">
              <div className="empty-state-box">
                <span className="empty-state-icon">🔑</span>
                <p>No pending password reset requests</p>
                <span className="text-muted">Users can request a reset from the sign-in page. Approving sets their password to <strong>12345678</strong>.</span>
              </div>
            </div>
          ) : (
            <div className="card">
              <div className="card-header">
                <h3>Password reset requests</h3>
                <span className="card-subtitle">Approving resets the user&apos;s password to <strong>12345678</strong>. They can then sign in and change it.</span>
              </div>
              <div className="payout-requests-list">
                {passwordResetRequests.map(r => (
                  <div key={r._id} className="payout-request-card">
                    <div className="payout-request-item">
                      <strong>{r.userId?.name || 'User'}</strong>
                      <span className="badge badge-role">{String(r.userId?.role || '').replace(/_/g, ' ')}</span>
                      <span className="text-muted">{r.userId?.email}</span>
                      <span className="text-muted" style={{ fontSize: '0.8rem' }}>{new Date(r.createdAt).toLocaleString()}</span>
                      <div className="payout-request-actions">
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          disabled={pwResetProcessing === r._id}
                          onClick={() => approvePwReset(r._id)}
                        >
                          {pwResetProcessing === r._id ? '…' : 'Approve reset'}
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm btn-danger"
                          disabled={pwResetProcessing === r._id}
                          onClick={() => dismissPwReset(r._id)}
                        >
                          Dismiss
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Level Requests ── */}
      {activeTab === 'levels' && (
        <>
          {levelRequests.length === 0 ? (
            <div className="card">
              <div className="empty-state-box">
                <span className="empty-state-icon">↑</span>
                <p>No pending level requests</p>
                <span className="text-muted">Ops Leads can request level changes for their team members.</span>
              </div>
            </div>
          ) : (
            <div className="lvl-admin-list">
              {levelRequests.map(r => (
                <div key={r._id} className="lvl-admin-card">
                  <div className="lvl-admin-card-header">
                    <div className="lvl-admin-person">
                      <span className="lvl-admin-name">{r.userId?.name || 'User'}</span>
                      <span className={`badge badge-role badge-${r.userId?.role}`}>
                        {(r.userId?.role || '').replace(/_/g, ' ')}
                      </span>
                      <span className="text-muted">{r.userId?.email}</span>
                    </div>
                    <span className="lvl-admin-date">{new Date(r.createdAt).toLocaleDateString()}</span>
                  </div>

                  <div className="lvl-admin-change">
                    <div className="lvl-admin-level-box lvl-admin-level-from">
                      <span className="lvl-admin-level-label">Current</span>
                      <span className="badge badge-level">{formatLevel(r.currentLevel)}</span>
                    </div>
                    <span className="lvl-arrow lvl-arrow-lg">&rarr;</span>
                    <div className="lvl-admin-level-box lvl-admin-level-to">
                      <span className="lvl-admin-level-label">Requested</span>
                      <span className="badge badge-level lvl-new">{formatLevel(r.newLevel)}</span>
                    </div>
                  </div>

                  <div className="lvl-admin-reason">
                    <span className="lvl-admin-reason-label">Reason from {r.requestedBy?.name || 'Ops Lead'}:</span>
                    <p className="lvl-admin-reason-text">{r.reason}</p>
                  </div>

                  <div className="lvl-admin-actions">
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      disabled={lvlProcessing === r._id}
                      onClick={() => approveLevelRequest(r._id)}
                    >
                      {lvlProcessing === r._id ? '...' : 'Approve'}
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm btn-danger"
                      disabled={lvlProcessing === r._id}
                      onClick={() => { setLvlDeclineModal(r); setLvlDeclineReason('') }}
                    >
                      Decline
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Decline modal */}
          {lvlDeclineModal && (
            <div className="modal-overlay" onClick={() => !lvlProcessing && setLvlDeclineModal(null)}>
              <div className="modal modal-pay" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                  <h3>Decline level request</h3>
                  <button type="button" className="modal-close" onClick={() => setLvlDeclineModal(null)} disabled={!!lvlProcessing}>&times;</button>
                </div>
                <div className="modal-body">
                  <p className="text-muted" style={{ marginBottom: '0.75rem' }}>
                    Declining <strong>{lvlDeclineModal.userId?.name}</strong>&apos;s promotion from{' '}
                    <strong>{formatLevel(lvlDeclineModal.currentLevel)}</strong> to{' '}
                    <strong>{formatLevel(lvlDeclineModal.newLevel)}</strong>.
                  </p>
                  <div className="form-row">
                    <label>Reason (optional)</label>
                    <textarea
                      rows={3}
                      placeholder="Explain why this request was declined..."
                      value={lvlDeclineReason}
                      onChange={e => setLvlDeclineReason(e.target.value)}
                      disabled={!!lvlProcessing}
                      className="lvl-modal-textarea"
                    />
                  </div>
                  <div className="modal-actions">
                    <button
                      type="button"
                      className="btn btn-danger"
                      disabled={!!lvlProcessing}
                      onClick={declineLevelRequest}
                    >
                      {lvlProcessing ? 'Declining...' : 'Confirm decline'}
                    </button>
                    <button type="button" className="btn btn-ghost" onClick={() => setLvlDeclineModal(null)} disabled={!!lvlProcessing}>
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
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
              <strong>Direct applicant:</strong> choose role &amp; level below.{' '}
              <strong>Client org:</strong> simple signup — approve to grant access (no ID/photo required).
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
                          {u.hasDuplicateWallet && (
                            <span className="pending-wallet-dup-badge" title="ERC-20 wallet matches another account">Duplicate wallet</span>
                          )}
                        </div>
                        {u.role !== 'client' && (
                          <div className="pending-item-docs">
                            <button type="button" className="btn btn-ghost btn-sm" onClick={e => { e.stopPropagation(); openPhoto(u._id) }}>Photo</button>
                            <button type="button" className="btn btn-ghost btn-sm" onClick={e => { e.stopPropagation(); openNationalId(u._id) }}>ID</button>
                          </div>
                        )}
                        <span className={`pending-item-chevron${isExpanded ? ' open' : ''}`}>▾</span>
                      </div>

                      {isExpanded && (
                        <div className="pending-item-detail">
                          {u.hasDuplicateWallet && (
                            <div className="pending-wallet-dup-alert" role="alert">
                              <strong>Duplicate ERC-20 wallet</strong>
                              This payout address is already on file for another user. Review before approving.
                              <ul>
                                {(u.walletDuplicateMatches || []).map(d => (
                                  <li key={d._id}>
                                    <strong>{d.name}</strong>
                                    <span className="text-muted"> · {d.email}</span>
                                    {' '}
                                    <span className="badge badge-role">{String(d.role || '').replace(/_/g, ' ')}</span>
                                    {d.status && (
                                      <span className="text-muted" style={{ fontSize: '0.75rem' }}> · {d.status}</span>
                                    )}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
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
                <h3>{rejectModal.role === 'client' ? 'Reject client account' : 'Reject applicant'}</h3>
                <p className="text-muted" style={{ marginBottom: '0.75rem' }}>
                  {rejectModal.role === 'client' ? (
                    <>
                      <strong>{rejectModal.name}</strong> ({rejectModal.email}) will not be able to use the platform. You can explain why below.
                    </>
                  ) : (
                    <>
                      <strong>{rejectModal.name}</strong> ({rejectModal.email}) will be sent back to onboarding and can resubmit after reviewing your feedback.
                    </>
                  )}
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
                  <tr><th>Date</th><th>Name</th><th>Role</th><th>Base</th><th>Bonus</th><th>Gross</th><th>Tax</th><th>Net</th><th>TxID</th></tr>
                </thead>
                <tbody>
                  {personPayouts.map(h => (
                    <tr key={h._id}>
                      <td>{new Date(h.createdAt).toLocaleDateString()}</td>
                      <td>{h.name}</td>
                      <td>{h.role?.replace(/_/g, ' ')}</td>
                      <td>${Number(h.basePay).toFixed(2)}</td>
                      <td>${Number(h.adminBonus).toFixed(2)}</td>
                      <td>${Number(h.totalPay).toFixed(2)}</td>
                      <td className="text-muted">−${Number(h.taxAmount ?? 0).toFixed(2)}</td>
                      <td><strong>${Number(h.netPay ?? h.totalPay).toFixed(2)}</strong></td>
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
        <SalaryRateGrid
          grid={salaryGrid}
          roles={salaryRoles}
          levels={salaryLevels}
          onUpdate={handleSalaryUpdate}
        />
      )}

      <PayConfirmModal
        payConfirm={payConfirm}
        adminBonus={adminBonusByUser[String(payConfirm?.userId)] || 0}
        payTxId={payTxId}
        setPayTxId={setPayTxId}
        paying={paying}
        onConfirm={confirmPersonPay}
        onCancel={() => { setPayConfirm(null); setPayTxId('') }}
        taxRate={payoutTaxRate}
      />

      {walletDeclineModal && (
        <div className="modal-overlay" onClick={() => !walletDeclining && setWalletDeclineModal(null)}>
          <div className="modal modal-pay" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Decline wallet change</h3>
              <button type="button" className="modal-close" onClick={() => setWalletDeclineModal(null)} disabled={walletDeclining}>&times;</button>
            </div>
            <div className="modal-body">
              <p className="text-muted" style={{ marginBottom: '0.75rem' }}>
                Declining <strong>{walletDeclineModal.userId?.name || 'User'}</strong>&apos;s request to use{' '}
                <code className="mono-text">{walletDeclineModal.requestedWallet}</code>.
              </p>
              <div className="form-row">
                <label>Reason (required)</label>
                <textarea
                  rows={3}
                  value={walletDeclineReason}
                  onChange={e => setWalletDeclineReason(e.target.value)}
                  disabled={walletDeclining}
                  className="lvl-modal-textarea"
                />
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-danger" disabled={walletDeclining} onClick={confirmWalletDecline}>
                  {walletDeclining ? 'Declining…' : 'Decline request'}
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => setWalletDeclineModal(null)} disabled={walletDeclining}>Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
