/**
 * Renders POST /salary/client-payout-table — profile-level cost rows with merged client total column.
 * Only includes internal clients. Shows grand total and temporal summary string below the table.
 */
export default function ClientPayoutTable({ data }) {
  if (!data?.rows?.length) {
    return <p className="empty-state" style={{ padding: '1rem' }}>No confirmed payouts pending for internal clients.</p>
  }

  const sorted = [...data.rows].sort((a, b) =>
    a.clientName.localeCompare(b.clientName) || a.profileName.localeCompare(b.profileName)
  )

  const groups = []
  let cur = null
  for (const row of sorted) {
    if (!cur || cur.clientId !== row.clientId) {
      cur = { clientId: row.clientId, rows: [] }
      groups.push(cur)
    }
    cur.rows.push(row)
  }

  const summaryByClient = new Map((data.clientSummaries || []).map(s => [s.clientId, s]))

  const grandTotal = (data.clientSummaries || []).reduce((sum, s) => sum + s.total, 0)

  const temporalParts = [...summaryByClient.values()]
    .sort((a, b) => a.clientName.localeCompare(b.clientName))
    .map(s => {
      const firstName = s.clientName.split(' ')[0]
      return `${firstName}(${s.total.toFixed(2)})`
    })
  const temporalString = temporalParts.join('/')

  return (
    <div className="table-wrap client-payout-table-wrap">
      <table className="data-table client-payout-table">
        <thead>
          <tr>
            <th>Client name</th>
            <th>Profile name</th>
            <th>Bidder name</th>
            <th>Bid manager name</th>
            <th className="num">Bidder pay</th>
            <th className="num">Profile pay</th>
            <th className="num">Total</th>
            <th className="num">Client per money</th>
          </tr>
        </thead>
        <tbody>
          {groups.flatMap(g =>
            g.rows.map((row, i) => (
              <tr key={String(row.reportId)}>
                <td>{row.clientName}</td>
                <td>{row.profileName}</td>
                <td>{row.bidderName}</td>
                <td>{row.bidManagerName}</td>
                <td className="num">${Number(row.bidderPay).toFixed(2)}</td>
                <td className="num">${Number(row.profilePay).toFixed(2)}</td>
                <td className="num">${Number(row.total).toFixed(2)}</td>
                {i === 0 && (
                  <td className="num client-payout-merge" rowSpan={g.rows.length}>
                    ${Number(summaryByClient.get(g.clientId)?.total ?? 0).toFixed(2)}
                  </td>
                )}
              </tr>
            ))
          )}
        </tbody>
      </table>

      <div style={{ marginTop: '1rem', padding: '0 0.25rem' }}>
        <p style={{ fontWeight: 600, fontSize: '0.95rem', margin: '0 0 0.35rem' }}>
          Total: <span style={{ color: 'var(--accent)' }}>${grandTotal.toFixed(2)}</span>
        </p>
        {temporalString && (
          <p className="text-muted" style={{ fontSize: '0.82rem', margin: 0, wordBreak: 'break-all' }}>
            {temporalString}
          </p>
        )}
      </div>

      <p className="text-muted" style={{ fontSize: '0.78rem', marginTop: '0.75rem' }}>
        Internal clients only. Positive BM and Ops bonuses are divided evenly across their profile count. Negative bonuses are excluded from client cost.
      </p>
    </div>
  )
}
