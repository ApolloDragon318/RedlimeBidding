import { useState, useEffect, useCallback } from 'react'
import { api } from '../api'
import PayoutTree from '../components/PayoutTree'
import PayConfirmModal from '../components/PayConfirmModal'
import SalaryRateGrid from '../components/SalaryRateGrid'

export default function FinancialDashboard() {
  const [tree, setTree] = useState([])
  const [history, setHistory] = useState({ personPayouts: [], legacyBatchPayouts: [] })
  const [tab, setTab] = useState('queue')
  const [loading, setLoading] = useState(true)
  const [adminBonusByUser, setAdminBonusByUser] = useState({})
  const [payConfirm, setPayConfirm] = useState(null)
  const [payTxId, setPayTxId] = useState('')
  const [paying, setPaying] = useState(false)
  const [payoutRequests, setPayoutRequests] = useState([])
  const [taxRate, setTaxRate] = useState(0.10)
  const [salaryGrid, setSalaryGrid] = useState({})
  const [salaryRoles, setSalaryRoles] = useState([])
  const [salaryLevels, setSalaryLevels] = useState([])

  const loadQueueAndHistory = useCallback(async () => {
    const [q, h, pr, sal] = await Promise.all([
      api.get('/salary/payout-queue').catch(() => ({ data: { rows: [], tree: [] } })),
      api.get('/salary/history').catch(() => ({ data: { personPayouts: [], legacyBatchPayouts: [] } })),
      api.get('/salary/payout-requests').catch(() => ({ data: { requests: [] } })),
      api.get('/salary').catch(() => ({ data: { grid: {}, roles: [], levels: [] } }))
    ])
    setTree(q.data?.tree || [])
    setTaxRate(q.data?.taxRate ?? 0.10)
    setPayoutRequests(pr.data?.requests || [])
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
          Payouts available after Ops Lead approves all. Record each payment with TxID.
        </p>
      </div>

      <div className="tabs" style={{ marginBottom: '1rem' }}>
        <button type="button" className={tab === 'queue' ? 'tab active' : 'tab'} onClick={() => setTab('queue')}>Payouts</button>
        <button type="button" className={tab === 'salary' ? 'tab active' : 'tab'} onClick={() => setTab('salary')}>Salary Config</button>
        <button type="button" className={tab === 'history' ? 'tab active' : 'tab'} onClick={() => setTab('history')}>History</button>
      </div>

      {tab === 'queue' && (
        <>
          {payoutRequests.length > 0 && (
            <div className="card" style={{ marginBottom: '1rem' }}>
              <div className="card-header">
                <h3>Payout requests</h3>
                <span className="card-subtitle">Users asked for payment — find them in the tree and pay with TxID.</span>
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
              <button type="button" className="btn btn-ghost btn-sm" onClick={loadQueueAndHistory}>Refresh</button>
              <span className="card-subtitle" style={{ flex: '1 1 100%' }}>Only confirmed reports appear here (after Ops Lead approves all).</span>
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
    </div>
  )
}
