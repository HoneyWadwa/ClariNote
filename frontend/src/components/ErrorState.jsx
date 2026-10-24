/**
 * Error state with an optional retry action.
 * The user's input is preserved by the parent — this only reports the failure.
 */
export default function ErrorState({ title = 'Something went wrong', error, onRetry, retryLabel = 'Try again' }) {
  if (!error) return null
  return (
    <div className="alert alert-error" role="alert">
      <strong>{title}</strong>
      <p>{error.message}</p>
      {error.details && error.details.length > 0 && (
        <ul>
          {error.details.map((detail) => (
            <li key={detail}>{detail}</li>
          ))}
        </ul>
      )}
      {onRetry && (
        <p style={{ marginTop: 8 }}>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onRetry}>
            {retryLabel}
          </button>
        </p>
      )}
    </div>
  )
}
