import { useState } from 'react'

function PayRow({ user, bonusByUser, setBonusByUser, onPay, taxRate = 0.10, indent = 0 }) {
  const key = String(user.userId)
  const raw = bonusByUser[key]
  const bonus = raw === undefined || raw === '' ? 0 : Number(raw)
  const total = (Number(user.basePay) || 0) + (Number.isNaN(bonus) ? 0 : bonus)
  const tax = +(total * taxRate).toFixed(2)
  const net = +(total - tax).toFixed(2)

  const isOpsLead = user.role === 'ops_lead'
  const opsPayHidden = isOpsLead && !user.allTeamPaid

  return (
    <div className={`payout-node payout-depth-${indent}`}>
      <div className="payout-node-header">
        <span className="payout-name">{user.name}</span>
        {user.role && <span className={`badge badge-role badge-${user.role}`}>{user.role.replace(/_/g, ' ')}</span>}
        {user.breakdown && <span className="payout-breakdown">{user.breakdown}</span>}
        {user.totalBidCount !== undefined && (
          <span className="payout-perf-chips">
            <span className="payout-perf-chip"><strong>{user.totalBidCount}</strong> bids</span>
            <span className="payout-perf-chip">BM bonus <strong>${user.bmBonusTotal?.toFixed(2) ?? '0.00'}</strong></span>
          </span>
        )}
      </div>
      {user.basePay > 0 && (
        <div className="payout-pay-row">
          <div className="payout-amounts">
            <span className="payout-label">Base</span>
            <span className="payout-value">${Number(user.basePay).toFixed(2)}</span>
          </div>
          <div className="payout-bonus-field">
            <label title="Adjustment — can be negative">Bonus (+/−)</label>
            <input
              type="number"
              step="0.01"
              placeholder="0"
              value={bonusByUser[key] ?? ''}
              onChange={e => setBonusByUser(prev => ({ ...prev, [key]: e.target.value }))}
            />
          </div>
          <div className="payout-amounts">
            <span className="payout-label">Total</span>
            <span className="payout-value">${total.toFixed(2)}</span>
          </div>
          <div className="payout-amounts payout-tax">
            <span className="payout-label">Tax {(taxRate * 100).toFixed(0)}%</span>
            <span className="payout-value">−${tax.toFixed(2)}</span>
          </div>
          <div className="payout-amounts">
            <span className="payout-label">Net</span>
            <span className="payout-value payout-total">${net.toFixed(2)}</span>
          </div>
          {opsPayHidden ? (
            <span className="payout-waiting-team">Pay all team members first</span>
          ) : (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={!user.address}
              title={!user.address ? 'User has no wallet on file' : undefined}
              onClick={() => onPay(user)}
            >
              Pay
            </button>
          )}
          {user.address && (
            <span className="payout-wallet">{user.address}</span>
          )}
          {!user.address && (
            <span className="payout-no-wallet">No wallet</span>
          )}
        </div>
      )}
    </div>
  )
}

export default function PayoutTree({
  tree,
  bonusByUser,
  setBonusByUser,
  onPay,
  onRefresh,
  taxRate = 0.10
}) {
  const [collapsed, setCollapsed] = useState({})
  const toggle = key => setCollapsed(prev => ({ ...prev, [key]: !prev[key] }))

  if (!tree.length) {
    return (
      <div className="payout-empty">
        <div className="payout-empty-icon">$</div>
        <p>No payouts ready</p>
        <span>Teams appear when there is confirmed, unpaid work. When a profile has a client, either the client or admin/financial can approve it; otherwise admin/FM approval is required.</span>
      </div>
    )
  }

  return (
    <div className="payout-tree">
      {tree.map(ops => {
        const opsKey = String(ops.userId)
        const opsOpen = !collapsed[opsKey]
        return (
          <div key={opsKey} className="payout-group payout-ops">
            <button type="button" className="payout-toggle" onClick={() => toggle(opsKey)}>
              <span className={`payout-chevron ${opsOpen ? 'open' : ''}`}>&#9662;</span>
            </button>
            <div className="payout-group-content">
              <PayRow
                user={ops}
                bonusByUser={bonusByUser}
                setBonusByUser={setBonusByUser}
                onPay={onPay}
                taxRate={taxRate}
                indent={0}
              />
              {opsOpen && (ops.bidManagers || []).map(bm => {
                const bmKey = String(bm.userId)
                const bmOpen = !collapsed[bmKey]
                return (
                  <div key={bmKey} className="payout-group payout-bm">
                    <button type="button" className="payout-toggle" onClick={() => toggle(bmKey)}>
                      <span className={`payout-chevron ${bmOpen ? 'open' : ''}`}>&#9662;</span>
                    </button>
                    <div className="payout-group-content">
                      <PayRow
                        user={bm}
                        bonusByUser={bonusByUser}
                        setBonusByUser={setBonusByUser}
                        onPay={onPay}
                        taxRate={taxRate}
                        indent={1}
                      />
                      {bmOpen && (bm.bidders || []).map(bidder => (
                        <div key={String(bidder.userId)} className="payout-group payout-bidder">
                          <PayRow
                            user={bidder}
                            bonusByUser={bonusByUser}
                            setBonusByUser={setBonusByUser}
                            onPay={onPay}
                            taxRate={taxRate}
                            indent={2}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
