import { useEffect, useMemo, useState } from 'react'
import GroundingBadge, { toneFor } from '../components/GroundingBadge.jsx'
import EvidencePassage from '../components/EvidencePassage.jsx'
import EmptyState from '../components/EmptyState.jsx'
import { ReviewBlock, VerifiedNote } from '../components/VerificationNotes.jsx'

const STATUS_ORDER = { SUPPORTED: 0, PARTIALLY_SUPPORTED: 1, UNSUPPORTED: 2 }

function statusOf(entry, check) {
  return (check && check.verified_grounding) || entry.grounding
}

/**
 * Glossary: searchable, sortable, expandable definitions with evidence, a
 * "mark as revised" action, and a flashcard drill (Know it / Review again).
 * Progress lives in session state only and only user actions count.
 */
export default function GlossaryPanel({
  materials,
  index,
  state,
  onToggleRevised,
  onMarkKnown,
  onMarkAgain,
  onOpenSource,
}) {
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState('term')
  const [flashMode, setFlashMode] = useState(false)
  const [cardIndex, setCardIndex] = useState(0)
  const [cardRevealed, setCardRevealed] = useState(false)

  const entries = useMemo(() => {
    const list = (materials.glossary || []).map((entry, i) => ({
      entry,
      i,
      check: index.glossary[i],
    }))
    const needle = query.trim().toLowerCase()
    const filtered = needle
      ? list.filter(
          ({ entry }) =>
            entry.term.toLowerCase().includes(needle) ||
            (entry.definition || '').toLowerCase().includes(needle)
        )
      : list
    return [...filtered].sort((a, b) => {
      if (sort === 'status') {
        const diff = STATUS_ORDER[statusOf(a.entry, a.check)] - STATUS_ORDER[statusOf(b.entry, b.check)]
        if (diff !== 0) return diff
      }
      return a.entry.term.localeCompare(b.entry.term)
    })
  }, [materials, index, query, sort])

  useEffect(() => {
    setCardIndex(0)
    setCardRevealed(false)
  }, [query, sort, flashMode])

  const total = (materials.glossary || []).length
  const knownCount = Object.values(state.known).filter(Boolean).length
  const againCount = Object.values(state.again).filter(Boolean).length
  const revisedCount = Object.values(state.revised).filter(Boolean).length

  if (total === 0) {
    return <EmptyState title="No glossary entries">The generator returned an empty glossary.</EmptyState>
  }

  if (flashMode) {
    if (entries.length === 0) {
      return (
        <EmptyState title="Nothing matches this search" action={
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setQuery('')}>
            Clear search
          </button>
        }>
          Try a different term, or clear the search to drill every card.
        </EmptyState>
      )
    }
    const safeIndex = Math.min(cardIndex, entries.length - 1)
    const current = entries[safeIndex]
    const definition = current.entry.definition

    return (
      <section className="flashcard-wrap" aria-labelledby="flash-heading">
        <div className="panel-head">
          <div>
            <p className="label">Session drill</p>
            <h3 id="flash-heading">Flashcards</h3>
          </div>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setFlashMode(false)}>
            Back to list
          </button>
        </div>

        <p className="help" style={{ marginTop: 0 }}>
          Card {safeIndex + 1} of {entries.length} · known {knownCount} · review again {againCount} ·
          revised {revisedCount} — session progress only, nothing is saved.
        </p>

        <button
          type="button"
          className="flashcard"
          onClick={() => setCardRevealed((value) => !value)}
          aria-pressed={cardRevealed}
        >
          <span className="side-label">{cardRevealed ? 'Definition' : 'Term — click to reveal'}</span>
          {cardRevealed ? (
            <>
              <span className="face-definition">
                {definition || (
                  <span className="not-supported">Not supported by source</span>
                )}
              </span>
              <span className="face-definition" style={{ fontSize: '0.88rem', color: '#73766e' }}>
                {(current.entry.evidence || []).length > 0
                  ? `“${current.entry.evidence[0].quote}”`
                  : 'No supporting quotation in the notes.'}
              </span>
            </>
          ) : (
            <span className="face-term">{current.entry.term}</span>
          )}
        </button>

        <div className="flashcard-actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              onMarkKnown(current.entry.term)
              setCardRevealed(false)
              setCardIndex((i) => (i + 1) % entries.length)
            }}
          >
            ✓ Know it
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              onMarkAgain(current.entry.term)
              setCardRevealed(false)
              setCardIndex((i) => (i + 1) % entries.length)
            }}
          >
            ↻ Review again
          </button>
          <button
            type="button"
            className="btn btn-quiet"
            onClick={() => {
              setCardRevealed(false)
              setCardIndex((i) => (i - 1 + entries.length) % entries.length)
            }}
          >
            ← Previous
          </button>
          <button
            type="button"
            className="btn btn-quiet"
            onClick={() => {
              setCardRevealed(false)
              setCardIndex((i) => (i + 1) % entries.length)
            }}
          >
            Next →
          </button>
        </div>

        <div className="progress-track" style={{ marginTop: 14 }} aria-hidden="true">
          <div className="progress-fill" style={{ width: `${(knownCount / total) * 100}%` }} />
        </div>
        <p className="help">
          Known {knownCount} of {total}. Terms are only counted when you mark them — opening a card
          does not mean you know it.
        </p>
      </section>
    )
  }

  return (
    <section aria-labelledby="glossary-heading">
      <div className="glossary-tools">
        <div className="search-field">
          <label className="sr-only" htmlFor="glossary-search">
            Search glossary
          </label>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
            <circle cx="7" cy="7" r="4.2" />
            <path d="m10.2 10.2 3 3" />
          </svg>
          <input
            id="glossary-search"
            type="search"
            placeholder="Search terms or definitions…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>

        <div className="segmented" role="group" aria-label="Sort glossary">
          <button type="button" aria-pressed={sort === 'term'} onClick={() => setSort('term')}>
            A–Z
          </button>
          <button type="button" aria-pressed={sort === 'status'} onClick={() => setSort('status')}>
            By status
          </button>
        </div>

        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setFlashMode(true)}>
          ▭ Flashcards
        </button>
      </div>

      <p className="help" style={{ marginTop: 0 }}>
        {entries.length} of {total} terms shown · {revisedCount} marked as revised · known{' '}
        {knownCount}
      </p>

      {entries.length === 0 && (
        <EmptyState title="No terms match that search">
          Try a shorter word, or clear the search field.
        </EmptyState>
      )}

      <ul className="item-list">
        {entries.map(({ entry, i, check }) => {
          const status = statusOf(entry, check)
          const revised = Boolean(state.revised[entry.term])
          return (
            <li className={`item tone-${toneFor(status)}`} key={entry.term + i}>
              <details className="term-item">
                <summary>
                  <span className="left">
                    <span className="term">{entry.term}</span>
                    <GroundingBadge status={status} reported={entry.grounding} />
                    {revised && <span className="chip chip-ok">revised</span>}
                    {state.known[entry.term] && <span className="chip chip-ok">know it</span>}
                    {state.again[entry.term] && <span className="chip chip-warn">again</span>}
                  </span>
                  <span className="ref" aria-hidden="true">
                    {(entry.evidence || []).length} quote
                  </span>
                </summary>

                <div className="term-detail">
                  <p className="item-text">
                    {entry.definition || <span className="not-supported">Not supported by source</span>}
                  </p>
                  {entry.warning && <p className="warning-note">⚠ {entry.warning}</p>}
                  <EvidencePassage
                    evidence={entry.evidence}
                    verification={check}
                    label="Supporting passage"
                    onOpenSource={onOpenSource}
                  />
                  <VerifiedNote check={check} />
                  <ReviewBlock check={check} />
                  <div className="term-actions">
                    <button
                      type="button"
                      className={`btn btn-sm ${revised ? 'btn-secondary' : 'btn-quiet'}`}
                      aria-pressed={revised}
                      onClick={() => onToggleRevised(entry.term)}
                    >
                      {revised ? '✓ Revised' : 'Mark as revised'}
                    </button>
                    {entry.evidence && entry.evidence.length > 0 && (
                      <button
                        type="button"
                        className="btn btn-quiet btn-sm"
                        onClick={() =>
                          onOpenSource({
                            quote: entry.evidence[0].quote,
                            location: entry.evidence[0].location,
                          })
                        }
                      >
                        View in source
                      </button>
                    )}
                  </div>
                </div>
              </details>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
