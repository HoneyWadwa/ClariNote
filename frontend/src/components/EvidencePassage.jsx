import { semanticStatus } from '../lib/evidence.js'

function VerificationLine({ check }) {
  if (!check) return null
  const status = semanticStatus(check)
  const cls = status.tone === 'supported' ? 'ok' : status.tone === 'partial' ? 'warn' : 'bad'
  return (
    <p className={`verify-note ${cls}`}>
      <span className="bullet" aria-hidden="true" />
      <span>{status.text}</span>
    </p>
  )
}

/**
 * Expandable evidence for one generated item: exact quotation, page/section
 * reference (only when the extractor provided one), whether the quotation was
 * located in the source, and an action to open it in the source panel.
 *
 * `verification` is this item's verification entry (aligned with `evidence`).
 */
export default function EvidencePassage({
  evidence,
  verification,
  label = 'Source evidence',
  onOpenSource,
}) {
  const checks = (verification && verification.evidence) || []

  if (!evidence || evidence.length === 0) {
    return (
      <p className="evidence-empty">
        <span className="badge badge-unsupported">
          <span aria-hidden="true">✕</span>No evidence
        </span>
        This item carries no supporting quotation — it cannot be checked against the notes.
      </p>
    )
  }

  return (
    <details className="evidence">
      <summary>
        {label} · {evidence.length}
      </summary>
      <div className="evidence-block">
        <ol className="item-list" style={{ gap: '10px' }}>
          {evidence.map((item, index) => {
            const check = checks[index] || null
            return (
              <li key={`${item.quote.slice(0, 20)}-${index}`}>
                <blockquote className="quote">“{item.quote}”</blockquote>
                <div className="quote-meta">
                  <span className="ref">
                    {item.location ? item.location : 'no page/section in source'}
                  </span>
                  {check && (
                    <span className={`chip ${check.found ? 'chip-ok' : 'chip-bad'}`}>
                      {check.found ? 'quotation located' : 'quotation not found'}
                    </span>
                  )}
                  {check && check.found && check.actual_location && check.claimed_location && (
                    <span className="chip">found at {check.actual_location}</span>
                  )}
                  {onOpenSource && (
                    <button
                      type="button"
                      className="btn btn-quiet btn-sm"
                      onClick={() => onOpenSource({ quote: item.quote, location: item.location })}
                    >
                      View in source
                    </button>
                  )}
                </div>
                <VerificationLine check={check} />
              </li>
            )
          })}
        </ol>
      </div>
    </details>
  )
}
