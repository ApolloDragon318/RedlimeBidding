import { useState, useEffect, useCallback, useRef } from 'react'
import { api } from '../api'

const ROLE_LABELS = {
  admin: 'CEO',
  ops_lead: 'Ops Lead',
  financial_manager: 'Financial Mgr',
  bid_manager: 'Bid Manager',
  bidder: 'Bidder'
}

const ROLE_COLORS = {
  admin: 'org-role-admin',
  ops_lead: 'org-role-ops',
  financial_manager: 'org-role-fm',
  bid_manager: 'org-role-bm',
  bidder: 'org-role-bidder'
}

function OrgAvatar({ userId, name, hasPhoto }) {
  const [src, setSrc] = useState(null)
  const attempted = useRef(false)

  useEffect(() => {
    if (!hasPhoto || attempted.current) return
    attempted.current = true
    api.get(`/users/org/${userId}/photo`, { responseType: 'blob' })
      .then(res => setSrc(URL.createObjectURL(res.data)))
      .catch(() => {})
  }, [userId, hasPhoto])

  const initials = (name || '?')
    .split(' ')
    .map(w => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  return (
    <div className="org-avatar">
      {src
        ? <img className="org-avatar-img" src={src} alt={name} />
        : <span className="org-avatar-initials">{initials}</span>
      }
    </div>
  )
}

function OrgNode({ node, isSelf, isExpandable, onExpand, expanded, children: childContent }) {
  const roleLabel = ROLE_LABELS[node.role] || node.role?.replace(/_/g, ' ')
  const roleClass = ROLE_COLORS[node.role] || ''
  const levelLabel = node.level ? node.level.replace(/_/g, ' ') : ''

  return (
    <div className={`org-node${isSelf ? ' org-node-self' : ''}`}>
      <div
        className={`org-card${isExpandable ? ' org-card-expandable' : ''}`}
        onClick={isExpandable ? onExpand : undefined}
      >
        <OrgAvatar userId={node._id} name={node.name} hasPhoto={node.hasPhoto} />
        <div className="org-card-info">
          <span className="org-card-name">
            {node.name}
            {isSelf && <span className="org-card-you">You</span>}
          </span>
          <span className={`org-card-role ${roleClass}`}>{roleLabel}</span>
          {levelLabel && <span className="org-card-level">{levelLabel}</span>}
        </div>
        {isExpandable && (
          <span className={`org-card-toggle${expanded ? ' open' : ''}`}>▾</span>
        )}
      </div>
      {expanded && childContent && (
        <div className="org-branch">
          {childContent}
        </div>
      )}
    </div>
  )
}

function ExpandableNode({ node, isSelf, selfId, canExpand }) {
  const [expanded, setExpanded] = useState(isSelf)
  const [children, setChildren] = useState(null)
  const [loading, setLoading] = useState(false)

  const hasChildren = canExpand && ['admin', 'ops_lead', 'bid_manager'].includes(node.role)

  const handleExpand = useCallback(async () => {
    if (expanded) { setExpanded(false); return }
    setExpanded(true)
    if (children !== null) return
    setLoading(true)
    try {
      const res = await api.get(`/users/org/${node._id}/children`)
      setChildren(res.data || [])
    } catch {
      setChildren([])
    } finally {
      setLoading(false)
    }
  }, [expanded, children, node._id])

  const canChildrenExpand = (child) => {
    if (child.role === 'bidder') return false
    if (child.role === 'financial_manager') return false
    return true
  }

  return (
    <OrgNode
      node={node}
      isSelf={isSelf}
      isExpandable={hasChildren}
      onExpand={handleExpand}
      expanded={expanded}
    >
      {loading && <div className="org-loading"><div className="spinner" style={{ width: 18, height: 18 }} /></div>}
      {children && children.length === 0 && <p className="org-empty">No direct reports</p>}
      {children && children.length > 0 && (
        <div className="org-children">
          {children.map(c => (
            <ExpandableNode
              key={c._id}
              node={c}
              isSelf={c._id === selfId}
              selfId={selfId}
              canExpand={canChildrenExpand(c)}
            />
          ))}
        </div>
      )}
    </OrgNode>
  )
}

export default function CompanyOrg() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    api.get('/users/org/context')
      .then(res => setData(res.data))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="page-loading"><div className="spinner" /></div>
  if (!data) return <div className="page"><p>Failed to load org data.</p></div>

  const { self, parent, siblings, children } = data

  const allPeers = [self, ...siblings]
  const filteredPeers = search.trim()
    ? allPeers.filter(p => p.name.toLowerCase().includes(search.toLowerCase()))
    : allPeers

  const filteredChildren = search.trim()
    ? children.filter(c => c.name.toLowerCase().includes(search.toLowerCase()))
    : children

  const canExpandPeer = (p) => {
    if (p.role === 'bidder') return false
    if (p.role === 'financial_manager') return false
    return true
  }

  const canExpandChild = (c) => {
    if (c.role === 'bidder') return false
    if (c.role === 'financial_manager') return false
    return true
  }

  const selfRoleLabel = ROLE_LABELS[self.role] || self.role?.replace(/_/g, ' ')

  return (
    <div className="page">
      <div className="page-header">
        <h2>Company Org</h2>
        <p className="page-desc">
          Your position in the organization. Expand any node to see their direct reports.
        </p>
      </div>

      {/* Quick stats */}
      <div className="org-stats">
        <div className="org-stat">
          <span className="org-stat-num">{selfRoleLabel}</span>
          <span className="org-stat-label">Your role</span>
        </div>
        <div className="org-stat">
          <span className="org-stat-num">{siblings.length + 1}</span>
          <span className="org-stat-label">Your level</span>
        </div>
        {children.length > 0 && (
          <div className="org-stat">
            <span className="org-stat-num">{children.length}</span>
            <span className="org-stat-label">Direct reports</span>
          </div>
        )}
      </div>

      {/* Search */}
      {(siblings.length + children.length) > 6 && (
        <div className="org-search-wrap">
          <input
            type="text"
            className="org-search-input"
            placeholder="Filter by name…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      )}

      {/* Tree */}
      <div className="org-tree">
        {/* Parent level */}
        {parent && (
          <div className="org-level org-level-parent">
            <div className="org-level-label">Reports to</div>
            <div className="org-level-nodes">
              <ExpandableNode
                node={parent}
                isSelf={false}
                selfId={self._id}
                canExpand={canExpandPeer(parent)}
              />
            </div>
            <div className="org-connector" />
          </div>
        )}

        {/* Self level */}
        <div className="org-level org-level-self">
          <div className="org-level-label">
            {siblings.length > 0
              ? `Your level · ${filteredPeers.length} ${filteredPeers.length === 1 ? 'person' : 'people'}`
              : 'You'
            }
          </div>
          <div className="org-level-nodes">
            {filteredPeers.map(p => (
              <ExpandableNode
                key={p._id}
                node={p}
                isSelf={p._id === self._id}
                selfId={self._id}
                canExpand={canExpandPeer(p)}
              />
            ))}
          </div>
          {filteredChildren.length > 0 && <div className="org-connector" />}
        </div>

        {/* Children level */}
        {filteredChildren.length > 0 && (
          <div className="org-level org-level-children">
            <div className="org-level-label">
              Your direct reports · {filteredChildren.length}
            </div>
            <div className="org-level-nodes">
              {filteredChildren.map(c => (
                <ExpandableNode
                  key={c._id}
                  node={c}
                  isSelf={false}
                  selfId={self._id}
                  canExpand={canExpandChild(c)}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
