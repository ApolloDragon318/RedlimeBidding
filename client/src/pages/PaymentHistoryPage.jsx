import { useState, useEffect } from 'react'
import { api } from '../api'

export default function PaymentHistoryPage() {
  const [payments, setPayments] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get('/salary/my-payments')
      .then(({ data }) => setPayments(data.payments || []))
      .catch(err => setError(err.response?.data?.error || 'Failed to load'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="page-loading"><div className="spinner" /></div>

  return (
    <div className="page">
      <div className="page-header">
        <h2>Payment history</h2>
        <p className="page-desc">
          All USDT payouts recorded for your account (Admin or Financial manager confirms each with a TxID).
        </p>
      </div>

      {error && <p className="error-msg">{error}</p>}

      <div className="card">
        {payments.length === 0 ? (
          <p className="empty-state">No payouts recorded yet.</p>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Base</th>
                  <th>Bonus</th>
                  <th>Gross</th>
                  <th>Tax</th>
                  <th>Net</th>
                  <th>TxID</th>
                </tr>
              </thead>
              <tbody>
                {payments.map(p => (
                  <tr key={p._id}>
                    <td>{new Date(p.createdAt).toLocaleString()}</td>
                    <td>${Number(p.basePay).toFixed(2)}</td>
                    <td>${Number(p.adminBonus).toFixed(2)}</td>
                    <td>${Number(p.totalPay).toFixed(2)}</td>
                    <td className="text-muted">−${Number(p.taxAmount ?? 0).toFixed(2)}</td>
                    <td><strong>${Number(p.netPay ?? p.totalPay).toFixed(2)}</strong></td>
                    <td style={{ fontFamily: 'monospace', fontSize: '0.75rem', maxWidth: '200px', wordBreak: 'break-all' }}>{p.txId || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
