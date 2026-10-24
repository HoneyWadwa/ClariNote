import { checklistSignal } from '../lib/evidence.js'

export const CHECKLIST_ITEMS = [
  {
    id: 'summary-evidence',
    text: 'Summary points have evidence',
    hint: 'Open each bullet and check its quotation really supports the wording.',
  },
  {
    id: 'glossary-supported',
    text: 'Glossary definitions are supported',
    hint: 'Entries marked “Not supported by source” must stay flagged.',
  },
  {
    id: 'questions-answerable',
    text: 'Practice questions are answerable from the source',
    hint: 'Try answering each one using only the quoted passages.',
  },
  {
    id: 'answers-supported',
    text: 'Answer key entries have evidence',
    hint: 'Answer n must match question n and its quotation.',
  },
  {
    id: 'unsupported-flagged',
    text: 'Unsupported statements are flagged',
    hint: 'Nothing may look verified unless its status says so.',
  },
  {
    id: 'terminology-accurate',
    text: 'Numbers, names, formulas, and terminology are preserved',
    hint: 'Compare technical wording with the source, character by character.',
  },
  {
    id: 'meaning-preserved',
    text: 'Original meaning is preserved',
    hint: 'Look for added certainty, dropped qualifications or changed relationships.',
  },
  {
    id: 'human-reviewed',
    text: 'Human review has been completed',
    hint: 'Required before any academic use of this material.',
  },
]

function SignalChip({ signal }) {
  if (signal.kind === 'manual') {
    return <span className="chip">manual check</span>
  }
  if (signal.pending > 0) {
    return (
      <span className="chip chip-warn">
        requires further verification · {signal.pending} of {signal.total}
      </span>
    )
  }
  return (
    <span className="chip chip-ok">
      automated checks clear · {signal.total} claims — still confirm by eye
    </span>
  )
}

/**
 * Factual review checklist.
 *  - The checkbox is the user's own review; nothing is ever auto-checked.
 *  - The chip reports the verifier's state for the related group of claims
 *    (or “manual check” where no automated signal exists).
 */
export default function Checklist({ state, onToggle, verification, example }) {
  const reviewedCount = state.filter((item) => item.reviewed).length
  const complete = reviewedCount === state.length

  return (
    <div className="checklist-wrap">
      <div className="alert alert-warn" role="note">
        <strong>Human verification required.</strong>
        <p style={{ margin: 0 }}>
          AI-generated material must be checked by a person before any academic use. Automated
          checks reduce risk but never guarantee factual accuracy — and ticking a box records your
          review, it does not make a claim true.
        </p>
      </div>

      <div className="panel-head">
        <span className="mono">
          {reviewedCount} of {state.length} marked as reviewed by you
        </span>
        <span className={`chip ${complete ? 'chip-ok' : 'chip-warn'}`}>
          {complete ? 'all items reviewed' : `${state.length - reviewedCount} not reviewed`}
        </span>
      </div>
      <div className="progress-track" aria-hidden="true">
        <div
          className={`progress-fill${complete ? '' : ' warm'}`}
          style={{ width: `${(reviewedCount / state.length) * 100}%` }}
        />
      </div>

      <ul className="checklist" style={{ marginTop: 14 }}>
        {state.map((item) => {
          const signal = checklistSignal(item.id, verification)
          return (
            <li key={item.id} className={item.reviewed ? 'reviewed' : ''}>
              <label>
                <input
                  type="checkbox"
                  checked={item.reviewed}
                  onChange={() => onToggle(item.id)}
                />
                <span>{item.text}</span>
              </label>
              <div className="row-meta">
                <SignalChip signal={signal} />
                <span className={`chip ${item.reviewed ? 'chip-ok' : ''}`}>
                  {item.reviewed ? 'reviewed by you' : 'not reviewed'}
                </span>
              </div>
              <p className="hint">{item.hint}</p>
            </li>
          )
        })}
      </ul>

      {!complete && (
        <p className="help">
          The checklist is incomplete — do not use this material until every item, including human
          review, has been checked.
        </p>
      )}

      {example && example.length > 0 && (
        <details className="evidence" style={{ marginTop: 14 }}>
          <summary>Completed example checklist · bundled sample output</summary>
          <ul className="checklist" style={{ marginTop: 10 }}>
            {example.map((entry) => (
              <li key={entry.item} className={entry.reviewed ? 'reviewed' : ''}>
                <p style={{ margin: 0, display: 'flex', gap: 10, alignItems: 'flex-start', fontWeight: 600 }}>
                  <span className="mono" aria-hidden="true">
                    {entry.reviewed ? '[x]' : '[ ]'}
                  </span>
                  <span>{entry.item}</span>
                </p>
                <div className="row-meta" style={{ paddingLeft: 0 }}>
                  <span className={`chip ${entry.reviewed ? 'chip-ok' : 'chip-warn'}`}>
                    {entry.reviewed ? 'reviewed in sample' : 'pending in sample'}
                  </span>
                </div>
                <p className="hint" style={{ paddingLeft: 0 }}>
                  {entry.note}
                </p>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}
