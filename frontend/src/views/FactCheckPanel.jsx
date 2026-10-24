import GroundingBadge, { toneFor } from '../components/GroundingBadge.jsx'
import EmptyState from '../components/EmptyState.jsx'
import Checklist from '../components/Checklist.jsx'
import {
  FACT_FILTERS,
  flattenForDisplay,
  matchesFilter,
  semanticStatus,
} from '../lib/evidence.js'

/**
 * Fact Check: every generated claim next to its quotation, grounding status,
 * warning reason and an honest statement of what verification established.
 */
export default function FactCheckPanel({
  results,
  filter,
  onFilterChange,
  onOpenSource,
  checklistState,
  onToggleChecklist,
}) {
  const rows = flattenForDisplay(results.materials, results.verification)
  const counts = FACT_FILTERS.reduce(
    (acc, item) => ({ ...acc, [item.key]: rows.filter((row) => matchesFilter(row.check || {}, item.key)).length }),
    {}
  )
  const visible = rows.filter((row) => matchesFilter(row.check || {}, filter))

  return (
    <>
      <section aria-labelledby="fact-heading">
        <div className="fact-head">
          <div>
            <p className="label">Evidence review</p>
            <h3 id="fact-heading">Fact check</h3>
          </div>
          <span className="chip">
            {visible.length} of {rows.length} claims shown
          </span>
        </div>

        <div className="filter-row" role="group" aria-label="Filter claims">
          {FACT_FILTERS.map((item) => (
            <button
              type="button"
              key={item.key}
              className="filter-btn"
              aria-pressed={filter === item.key}
              onClick={() => onFilterChange(item.key)}
            >
              {item.label} <span className="mono">{counts[item.key]}</span>
            </button>
          ))}
        </div>

        <div className="alert alert-info" role="note">
          <strong>How to read this list</strong>
          <p style={{ margin: 0 }}>
            “Evidence matched” means the quotation exists in your notes. It is not a claim that the
            quotation logically proves the statement — that judgement stays with you.
          </p>
        </div>

        {visible.length === 0 && (
          <EmptyState title="No claims in this filter">
            Choose another filter to see the rest of the study set.
          </EmptyState>
        )}

        <ul className="item-list">
          {visible.map((row) => {
            const check = row.check
            const status = check ? check.verified_grounding : row.reported
            const semantic = check ? semanticStatus(check) : null
            const firstEvidence = row.evidence[0] || null
            return (
              <li className={`item tone-${toneFor(status)}`} key={row.id}>
                <div className="item-head">
                  <span className="item-kind">
                    {row.kind} · {row.position}
                  </span>
                  <GroundingBadge status={status} reported={row.reported} />
                  {check && check.needs_review && <span className="chip chip-warn">review required</span>}
                </div>

                <p className="item-text">{row.content}</p>

                {row.warning && <p className="warning-note">⚠ {row.warning}</p>}

                {firstEvidence ? (
                  <>
                    <blockquote className="quote" style={{ marginTop: 10 }}>
                      “{firstEvidence.quote}”
                    </blockquote>
                    <div className="quote-meta">
                      <span className="ref">
                        {firstEvidence.location || 'no page/section in source'}
                      </span>
                      {check &&
                        check.evidence.map((ev, i) => (
                          <span
                            key={`${ev.quote.slice(0, 12)}-${i}`}
                            className={`chip ${ev.found ? 'chip-ok' : 'chip-bad'}`}
                          >
                            {ev.found ? 'quotation located' : 'quotation not found'}
                          </span>
                        ))}
                      <button
                        type="button"
                        className="btn btn-quiet btn-sm"
                        onClick={() =>
                          onOpenSource({
                            quote: firstEvidence.quote,
                            location: firstEvidence.location,
                          })
                        }
                      >
                        Open source evidence
                      </button>
                    </div>
                  </>
                ) : (
                  <p className="evidence-empty">
                    <span className="badge badge-unsupported">
                      <span aria-hidden="true">✕</span>No evidence
                    </span>
                    Nothing to check against the notes.
                  </p>
                )}

                {semantic && (
                  <p
                    className={`verify-note ${
                      semantic.tone === 'supported' ? 'ok' : semantic.tone === 'partial' ? 'warn' : 'bad'
                    }`}
                  >
                    <span className="bullet" aria-hidden="true" />
                    <span>{semantic.text}</span>
                  </p>
                )}

                {check && check.needs_review && (
                  <div className="review-block">
                    <strong>Why this needs review</strong>
                    <ul>
                      {check.reasons.map((reason) => (
                        <li key={reason}>{reason}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      </section>

      <section className="rule-section" aria-labelledby="checklist-heading">
        <div className="panel-head">
          <div>
            <p className="label">Before you submit or share</p>
            <h3 id="checklist-heading">Factual review checklist</h3>
          </div>
        </div>
        <Checklist
          state={checklistState}
          onToggle={onToggleChecklist}
          verification={results.verification}
          example={results.checklist_example}
        />
      </section>
    </>
  )
}
