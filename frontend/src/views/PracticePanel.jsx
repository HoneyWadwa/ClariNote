import GroundingBadge, { toneFor } from '../components/GroundingBadge.jsx'
import EvidencePassage from '../components/EvidencePassage.jsx'
import EmptyState from '../components/EmptyState.jsx'
import { ReviewBlock, VerifiedNote } from '../components/VerificationNotes.jsx'

/**
 * Practice: one question at a time with navigation, answer reveal, per-question
 * review flags and a restart action.
 *
 * The backend returns open-ended questions (no option lists), so nothing is
 * auto-scored — the note below the answer says so plainly.
 */
export default function PracticePanel({
  materials,
  index,
  stats,
  current,
  onCurrentChange,
  revealed,
  onReveal,
  userFlags,
  onToggleFlag,
  onRestart,
  onOpenSource,
}) {
  const questions = materials.questions || []

  if (questions.length === 0) {
    return <EmptyState title="No practice questions">The generator returned no questions.</EmptyState>
  }

  const safeIndex = Math.min(current, questions.length - 1)
  const question = questions[safeIndex]
  const pair = index.questions[safeIndex] || {}
  const questionStatus = (pair.question && pair.question.verified_grounding) || question.grounding
  const answerStatus = (pair.answer && pair.answer.verified_grounding) || question.answer_grounding
  const isRevealed = Boolean(revealed[safeIndex])
  const userFlagged = Boolean(userFlags[safeIndex])

  return (
    <section aria-labelledby="practice-heading">
      <div className="panel-head">
        <div>
          <p className="label">Practice</p>
          <h3 id="practice-heading">
            {stats.answered} of {stats.total} answered
          </h3>
        </div>
        <div className="quote-meta" style={{ marginTop: 0 }}>
          <span className="chip">
            flagged by verifier <strong>{stats.flagged}</strong>
          </span>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onRestart}>
            ↻ Restart practice
          </button>
        </div>
      </div>

      <div className="question-nav" role="group" aria-label="Jump to question">
        {stats.perQuestion.map((item) => (
          <button
            type="button"
            key={item.number}
            className={`q-dot${item.flagged ? ' flagged' : ''}${item.revealed ? ' revealed' : ''}`}
            aria-current={item.index === safeIndex ? 'true' : undefined}
            aria-label={`Question ${item.number}${item.flagged ? ', flagged for review' : ''}${
              item.revealed ? ', answer revealed' : ''
            }`}
            onClick={() => onCurrentChange(item.index)}
          >
            {item.number}
          </button>
        ))}
      </div>

      <article className={`item tone-${toneFor(questionStatus)}`}>
        <div className="practice-meta">
          <span className="ref">Question {question.number || safeIndex + 1} of {questions.length}</span>
          <span className="chip">{question.question_type}</span>
          <GroundingBadge status={questionStatus} reported={question.grounding} />
          {userFlagged && <span className="chip chip-bad">your flag</span>}
        </div>

        <p className="item-text question">{question.question}</p>

        <EvidencePassage
          evidence={question.evidence}
          verification={pair.question}
          label="Question evidence"
          onOpenSource={onOpenSource}
        />
        <VerifiedNote check={pair.question} />
        <ReviewBlock check={pair.question} />

        {isRevealed ? (
          <div className="reveal-panel">
            <p className="label" style={{ marginBottom: 2 }}>
              Answer key
            </p>
            <p className="answer-text">
              {question.answer || <span className="not-supported">Not supported by source</span>}
            </p>
            <div className="quote-meta" style={{ marginTop: 0 }}>
              <GroundingBadge status={answerStatus} reported={question.answer_grounding} />
              <span className="chip">open-ended · not auto-graded</span>
            </div>
            {question.warning && <p className="warning-note">⚠ {question.warning}</p>}
            <EvidencePassage
              evidence={question.answer_evidence}
              verification={pair.answer}
              label="Answer evidence"
              onOpenSource={onOpenSource}
            />
            <VerifiedNote check={pair.answer} />
            <ReviewBlock check={pair.answer} />
            <p className="help">
              Compare your own answer with the key and the quotation — this question is open-ended,
              so the app does not grade it.
            </p>
          </div>
        ) : (
          <div className="practice-actions">
            <button type="button" className="btn btn-primary" onClick={() => onReveal(safeIndex)}>
              Reveal answer
            </button>
            <p className="help" style={{ margin: 0 }}>
              Try answering from memory first — your answer stays private to this browser session.
            </p>
          </div>
        )}

        <div className="practice-actions">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => onCurrentChange(Math.max(0, safeIndex - 1))}
            disabled={safeIndex === 0}
          >
            ← Previous
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => onCurrentChange(Math.min(questions.length - 1, safeIndex + 1))}
            disabled={safeIndex === questions.length - 1}
          >
            Next →
          </button>
          <button
            type="button"
            className={`btn btn-sm ${userFlagged ? 'btn-secondary' : 'btn-quiet'}`}
            aria-pressed={userFlagged}
            onClick={() => onToggleFlag(safeIndex)}
          >
            {userFlagged ? 'Flagged for another look' : 'Flag for another look'}
          </button>
        </div>
      </article>

      <p className="help">
        Answered {stats.answered} · flagged by the verifier {stats.flagged} · remaining{' '}
        {stats.remaining} (each question counted once).
      </p>
    </section>
  )
}
