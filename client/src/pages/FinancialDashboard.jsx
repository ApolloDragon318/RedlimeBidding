import { useState, useEffect, useCallback } from 'react'
import { api } from '../api'
import PayoutTree from '../components/PayoutTree'
import PayConfirmModal from '../components/PayConfirmModal'
import SalaryRateGrid from '../components/SalaryRateGrid'
import ClientPayoutTable from '../components/ClientPayoutTable'
import ProfilePayoutApprovalsCard from '../components/ProfilePayoutApprovalsCard'

export default function FinancialDashboard() {
  const [tree, setTree] = useState([])
  const [history, setHistory] = useState({ personPayouts: [], legacyBatchPayouts: [] })
  const [tab, setTab] = useState('queue')
  const [loading, setLoading] = useState(true)
  const [adminBonusByUser, setAdminBonusByUser] = useState({})
  const [payConfirm, setPayConfirm] = useState(null)
  const [payTxId, setPayTxId] = useState('')
  const [paying, setPaying] = useState(false)
  const [taxRate, setTaxRate] = useState(0.10)
  const [salaryGrid, setSalaryGrid] = useState({})
  const [salaryRoles, setSalaryRoles] = useState([])
  const [salaryLevels, setSalaryLevels] = useState([])
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

  const loadQueueAndHistory = useCallback(async () => {
    const [q, h, sal, wr] = await Promise.all([
      api.get('/salary/payout-queue').catch(() => ({ data: { rows: [], tree: [] } })),
      api.get('/salary/history').catch(() => ({ data: { personPayouts: [], legacyBatchPayouts: [] } })),
      api.get('/salary').catch(() => ({ data: { grid: {}, roles: [], levels: [] } })),
      api.get('/users/wallet-change-requests').catch(() => ({ data: { requests: [] } }))
    ])
    setTree(q.data?.tree || [])
    setTaxRate(q.data?.taxRate ?? 0.10)
    setWalletChangeRequests(wr.data?.requests || [])
    setSalaryGrid(sal.data?.grid || {})
    setSalaryRoles(sal.data?.roles || [])
    setSalaryLevels(sal.data?.levels || [])
    setHistory({
      personPayouts: h.data?.personPayouts || [],
      legacyBatchPayouts: h.data?.legacyBatchPayouts || []
    })
  }, [])

  useEffect(() => {
    loadQueueAndHistory().finally(() => setLoading(false))
  }, [loadQueueAndHistory])

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
      await loadQueueAndHistory()
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
      await loadQueueAndHistory()
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to decline')
    } finally {
      setWalletDeclining(false)
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
      await loadQueueAndHistory()
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
        <h2>Financial overview</h2>
        <p className="page-desc">
          After Ops Lead confirms reports, each profile needs approval from the client or from admin/financial (when the profile has a client); internal profiles need admin/FM only. Record each payment with TxID.
        </p>
      </div>

      <div className="tabs" style={{ marginBottom: '1rem' }}>
        <button type="button" className={tab === 'queue' ? 'tab active' : 'tab'} onClick={() => setTab('queue')}>Payouts</button>
        <button type="button" className={tab === 'salary' ? 'tab active' : 'tab'} onClick={() => setTab('salary')}>Salary Config</button>
        <button type="button" className={tab === 'history' ? 'tab active' : 'tab'} onClick={() => setTab('history')}>History</button>
      </div>

      {tab === 'queue' && (
        <>
          <div className="card" style={{ marginBottom: '1rem' }}>
            <div className="card-header">
              <h3>Wallet change requests</h3>
              <span className="card-subtitle">Approve USDT address changes. Search who already uses an address before approving.</span>
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
                When a profile has a client, either the client or admin/financial can approve; otherwise admin/FM only. Tax estimates are internal.
              </span>
            </div>
            <ProfilePayoutApprovalsCard onUpdated={loadQueueAndHistory} />
          </div>
          <div className="card">
            <div className="card-header">
              <h3>Payouts</h3>
              <button type="button" className="btn btn-ghost btn-sm" onClick={loadQueueAndHistory}>Refresh</button>
              <span className="card-subtitle" style={{ flex: '1 1 100%' }}>Pay when each profile is approved (client or admin/FM when applicable). Amounts exclude profiles still pending approval.</span>
            </div>
            <PayoutTree
              tree={tree}
              bonusByUser={adminBonusByUser}
              setBonusByUser={setAdminBonusByUser}
              onPay={user => setPayConfirm(user)}
              onRefresh={loadQueueAndHistory}
              taxRate={taxRate}
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

      {tab === 'salary' && (
        <SalaryRateGrid
          grid={salaryGrid}
          roles={salaryRoles}
          levels={salaryLevels}
          onUpdate={(data) => {
            setSalaryGrid(data?.grid || {})
            setSalaryRoles(data?.roles || [])
            setSalaryLevels(data?.levels || [])
          }}
        />
      )}

      {tab === 'history' && (
        <div className="card">
          <div className="card-header">
            <h3>Payment history</h3>
          </div>
          {history.personPayouts.length === 0 ? (
            <p className="empty-state">No person payouts yet.</p>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr><th>Date</th><th>Name</th><th>Role</th><th>Gross</th><th>Tax</th><th>Net</th><th>TxID</th></tr>
                </thead>
                <tbody>
                  {history.personPayouts.map(h => (
                    <tr key={h._id}>
                      <td>{new Date(h.createdAt).toLocaleDateString()}</td>
                      <td>{h.name}</td>
                      <td>{h.role?.replace(/_/g, ' ')}</td>
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
        </div>
      )}

      <PayConfirmModal
        payConfirm={payConfirm}
        adminBonus={adminBonusByUser[String(payConfirm?.userId)] || 0}
        payTxId={payTxId}
        setPayTxId={setPayTxId}
        paying={paying}
        onConfirm={confirmPersonPay}
        onCancel={() => { setPayConfirm(null); setPayTxId('') }}
        taxRate={taxRate}
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
