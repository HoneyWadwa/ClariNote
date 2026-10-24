import EmptyState from './EmptyState.jsx'
import { CHART_COLORS } from './EvidenceCoverage.jsx'

/**
 * Visualization B — Practice progress.
 * Counting unit: one of the five generated questions, in mutually exclusive
 * buckets (flagged > answered > remaining). Clicking a segment jumps the
 * practice view to the first question in that bucket.
 */
export default function PracticeProgress({ stats, onSelect }) {
  if (!stats || stats.total === 0) {
    return (
      <EmptyState title="No practice questions yet">
        Practice progress appears once a study set exists: answered, remaining and questions whose
        answers still need review — all counted from the five generated questions.
      </EmptyState>
    )
  }

  const segments = [
    { key: 'answered', label: 'Answered', count: stats.answered },
    { key: 'flagged', label: 'Flagged for review', count: stats.flagged },
    { key: 'remaining', label: 'Remaining', count: stats.remaining },
  ].filter((segment) => segment.count > 0)

  const summary = segments.map((s) => `${s.count} ${s.label.toLowerCase()}`).join(', ')

  return (
    <div className="chart-card">
      <p className="label">Practice progress</p>
      <h3>
        {stats.answered} of {stats.total} answered
      </h3>
      <p className="help">
        A question counts as answered when you reveal its answer. Flagged questions are the ones the
        verifier marked for review.
      </p>

      <div className="stacked-bar" role="img" aria-label={`Practice progress bar. ${summary}.`}>
        {segments.map((segment) => (
          <button
            key={segment.key}
            type="button"
            style={{
              flex: `${segment.count} 0 0`,
              background: CHART_COLORS[segment.key],
            }}
            onClick={() => onSelect(segment.key)}
            aria-label={`${segment.label}: ${segment.count}. Open these questions.`}
            title={`${segment.label}: ${segment.count}`}
          />
        ))}
      </div>

      <div className="stacked-legend">
        {segments.map((segment) => (
          <span key={segment.key}>
            <span
              className="swatch"
              style={{ background: CHART_COLORS[segment.key] }}
              aria-hidden="true"
            />
            {segment.label} <strong className="mono">{segment.count}</strong>
          </span>
        ))}
        <span className="muted">
          total <strong className="mono">{stats.total}</strong>
        </span>
      </div>
    </div>
  )
}
