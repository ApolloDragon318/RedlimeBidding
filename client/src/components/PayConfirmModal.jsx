function parseBonusInput(v) {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

export default function PayConfirmModal({ payConfirm, adminBonus, payTxId, setPayTxId, paying, onConfirm, onCancel, taxRate = 0.10 }) {
  if (!payConfirm) return null

  const base = Number(payConfirm.basePay) || 0
  const bonus = parseBonusInput(adminBonus)
  const total = base + bonus
  const tax = +(total * taxRate).toFixed(2)
  const net = +(total - tax).toFixed(2)

  return (
    <div className="modal-overlay" onClick={() => !paying && onCancel()}>
      <div className="modal modal-pay" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Confirm payment</h3>
          <button type="button" className="modal-close" disabled={paying} onClick={onCancel}>&times;</button>
        </div>
        <div className="modal-body">
          <div className="pay-summary-grid">
            <div className="pay-summary-item">
              <span className="pay-summary-label">Recipient</span>
              <span className="pay-summary-value">{payConfirm.name}</span>
              <span className="pay-summary-role">{payConfirm.role?.replace(/_/g, ' ')}</span>
            </div>
            <div className="pay-summary-item">
              <span className="pay-summary-label">Base pay</span>
              <span className="pay-summary-value">${base.toFixed(2)}</span>
            </div>
            <div className="pay-summary-item">
              <span className="pay-summary-label">Admin bonus (+/−)</span>
              <span className="pay-summary-value">${bonus.toFixed(2)}</span>
            </div>
            <div className="pay-summary-item">
              <span className="pay-summary-label">Gross total</span>
              <span className="pay-summary-value">${total.toFixed(2)}</span>
            </div>
            <div className="pay-summary-item pay-summary-tax">
              <span className="pay-summary-label">Tax ({(taxRate * 100).toFixed(0)}%)</span>
              <span className="pay-summary-value">−${tax.toFixed(2)}</span>
            </div>
            <div className="pay-summary-item pay-summary-total">
              <span className="pay-summary-label">Net to send</span>
              <span className="pay-summary-value">${net.toFixed(2)}</span>
            </div>
          </div>

          <div className="pay-wallet-box">
            <span className="pay-wallet-label">Send USDT (ERC20) to</span>
            <code className="pay-wallet-addr">{payConfirm.address}</code>
          </div>

          <div className="form-row" style={{ marginTop: '1rem' }}>
            <label htmlFor="pay-modal-txid">TxID (proof of payment)</label>
            <input
              id="pay-modal-txid"
              type="text"
              autoComplete="off"
              spellCheck={false}
              placeholder="0x... or transfer reference"
              value={payTxId}
              onChange={e => setPayTxId(e.target.value)}
              disabled={paying}
            />
          </div>

          <div className="modal-actions">
            <button
              type="button"
              className="btn btn-primary"
              disabled={paying || !payTxId.trim()}
              onClick={onConfirm}
            >
              {paying ? 'Recording...' : 'Complete payment'}
            </button>
            <button type="button" className="btn btn-ghost" disabled={paying} onClick={onCancel}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
