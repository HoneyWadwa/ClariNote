import { coverageBuckets } from '../lib/evidence.js'
import EmptyState from './EmptyState.jsx'

/** One place for chart colours — mirrors the design tokens in styles.css. */
export const CHART_COLORS = {
  supported: '#315c46',
  awaiting: '#d6b65d',
  partial: '#c66b4e',
  unsupported: '#9c4a30',
  answered: '#315c46',
  flagged: '#c66b4e',
  remaining: '#d6d1c4',
}

const RADIUS = 54
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

/**
 * Visualization A — Evidence coverage.
 * Counting unit: one generated claim (one verification item).
 * The four buckets are mutually exclusive; the total is the item count.
 * Clicking a category emits onSelect(bucketKey) so the caller can filter Fact Check.
 */
export default function EvidenceCoverage({ verification, onSelect, activeFilter }) {
  const buckets = coverageBuckets(verification)
  const total = buckets.reduce((sum, bucket) => sum + bucket.count, 0)

  if (!verification || total === 0) {
    return (
      <EmptyState title="No study set yet">
        Evidence coverage appears here once you create study materials. It counts each generated
        claim — summary points, glossary entries, questions and answers — exactly once.
      </EmptyState>
    )
  }

  let cursor = 0
  const segments = buckets.map((bucket) => {
    const length = (bucket.count / total) * CIRCUMFERENCE
    const segment = { key: bucket.key, length, offset: -cursor }
    cursor += length
    return segment
  })

  const summary = buckets.map((b) => `${b.count} ${b.label.toLowerCase()}`).join(', ')

  return (
    <div className="chart-card">
      <p className="label">Evidence coverage</p>
      <h3>{total} generated claims</h3>
      <p className="help">
        Each claim is counted once, by its verified grounding status. “Awaiting review” is separate
        from confirmed unsupported.
      </p>

      <div className="donut-row">
        <svg
          className="donut"
          width="132"
          height="132"
          viewBox="0 0 132 132"
          role="img"
          aria-label={`Evidence coverage donut chart. ${summary}.`}
        >
          <circle cx="66" cy="66" r={RADIUS} fill="none" stroke="#ece8dd" strokeWidth="17" />
          {segments
            .filter((segment) => segment.length > 0)
            .map((segment) => (
              <circle
                key={segment.key}
                cx="66"
                cy="66"
                r={RADIUS}
                fill="none"
                stroke={CHART_COLORS[segment.key]}
                strokeWidth="17"
                strokeDasharray={`${segment.length} ${CIRCUMFERENCE - segment.length}`}
                strokeDashoffset={segment.offset}
                transform="rotate(-90 66 66)"
              />
            ))}
          <text x="66" y="64" textAnchor="middle" className="donut-center-total">
            {total}
          </text>
          <text x="66" y="79" textAnchor="middle" className="donut-center-label">
            claims
          </text>
        </svg>

        <ul className="legend">
          {buckets.map((bucket) => (
            <li key={bucket.key}>
              <button
                type="button"
                onClick={() => onSelect(bucket.key)}
                aria-pressed={activeFilter === bucket.key}
                title={bucket.definition}
              >
                <span
                  className="swatch"
                  style={{ background: CHART_COLORS[bucket.key] }}
                  aria-hidden="true"
                />
                <span className="name">{bucket.label}</span>
                <span className="value">{bucket.count}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
      <p className="sr-only">{summary}</p>
    </div>
  )
}
