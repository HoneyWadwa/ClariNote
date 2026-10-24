/** Reusable empty state — always explains what to do next. */
export default function EmptyState({ title, children, action }) {
  return (
    <div className="empty-state">
      <h3>{title}</h3>
      <div className="help" style={{ marginTop: 0 }}>
        {children}
      </div>
      {action && <div style={{ marginTop: 12 }}>{action}</div>}
    </div>
  )
}
