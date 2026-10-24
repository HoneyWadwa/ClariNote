import { semanticStatus } from '../lib/evidence.js'

/**
 * Why an item still needs a human — the backend's own verification reasons.
 */
export function ReviewBlock({ check }) {
  if (!check || !check.needs_review) return null
  return (
    <div className="review-block">
      <strong>Needs human review</strong>
      <ul>
        {(check.reasons || []).map((reason) => (
          <li key={reason}>{reason}</li>
        ))}
      </ul>
    </div>
  )
}

/**
 * What the automated checks actually established. Wording is deliberately
 * conservative: a located quotation is never presented as verified semantics.
 */
export function VerifiedNote({ check }) {
  if (!check || check.needs_review) return null
  const status = semanticStatus(check)
  const tone = status.tone === 'supported' ? 'ok' : status.tone === 'partial' ? 'warn' : 'bad'
  return (
    <p className={`verify-note ${tone}`}>
      <span className="bullet" aria-hidden="true" />
      <span>{status.text}</span>
    </p>
  )
}

/** Single-line semantic status for items that were flagged as well. */
export function SemanticStatusLine({ check }) {
  if (!check) return null
  const status = semanticStatus(check)
  const tone = status.tone === 'supported' ? 'ok' : status.tone === 'partial' ? 'warn' : 'bad'
  return (
    <p className={`verify-note ${tone}`}>
      <span className="bullet" aria-hidden="true" />
      <span>{status.text}</span>
    </p>
  )
}
