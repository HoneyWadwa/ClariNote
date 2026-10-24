/** Transient feedback toasts. Rendered inside an aria-live region. */
export default function Toasts({ toasts, onDismiss }) {
  return (
    <div className="toasts" role="status" aria-live="polite" aria-atomic="false">
      {toasts.map((toast) => (
        <div className={`toast ${toast.kind ? `toast-${toast.kind}` : ''}`} key={toast.id}>
          <p>{toast.message}</p>
          <button type="button" onClick={() => onDismiss(toast.id)} aria-label="Dismiss notification">
            ✕
          </button>
        </div>
      ))}
    </div>
  )
}
