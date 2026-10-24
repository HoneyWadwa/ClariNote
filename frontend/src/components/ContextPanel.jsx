/**
 * Right-hand context panel. The parent supplies the blocks, this owns the
 * chrome (heading + collapse affordance). Collapses in the header on large
 * screens; on smaller screens it moves below the main content via CSS.
 */
export default function ContextPanel({ title = 'Context', children, onClose, closeLabel = 'Hide panel' }) {
  return (
    <aside className="context-col" aria-label={title}>
      <div className="context-head">
        <h2>{title}</h2>
        {onClose && (
          <button type="button" className="btn btn-quiet btn-sm" onClick={onClose}>
            {closeLabel}
          </button>
        )}
      </div>
      {children}
    </aside>
  )
}
