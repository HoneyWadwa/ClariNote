import { useEffect, useMemo, useRef } from 'react'
import { locateQuote } from '../lib/evidence.js'

/**
 * Renders the extracted source segments (page/section marked) and, when a
 * quotation is supplied, highlights the matching passage with <mark>.
 * Locations come from the extractor — never invented.
 */
export default function SourceViewer({ segments, quote, label = 'Extracted source' }) {
  const containerRef = useRef(null)
  const list = Array.isArray(segments) ? segments : []
  const matches = useMemo(() => (quote ? locateQuote(list, quote) : []), [list, quote])
  const byIndex = useMemo(() => new Map(matches.map((m) => [m.segmentIndex, m])), [matches])

  useEffect(() => {
    if (!quote || !containerRef.current) return
    const target = containerRef.current.querySelector('mark')
    if (!target) return
    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    target.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' })
  }, [quote])

  if (list.length === 0) {
    return (
      <div className="source-view">
        <p className="help">No extracted source yet — add notes to see the original text here.</p>
      </div>
    )
  }

  return (
    <div className="source-view" ref={containerRef} aria-label={label}>
      {list.map((segment, index) => {
        const match = byIndex.get(index)
        return (
          <div className="source-segment" key={`${segment.location || 'text'}-${index}`}>
            <p className="source-location">{segment.location || 'Source text'}</p>
            {match ? (
              <p className="source-text" id={index === matches[0].segmentIndex ? 'evidence-target' : undefined}>
                {match.before}
                <mark>{match.hit}</mark>
                {match.after}
              </p>
            ) : (
              <p className="source-text">{segment.text}</p>
            )}
          </div>
        )
      })}
      {quote && matches.length === 0 && (
        <p className="help help-bad">
          That quotation was not located in the extracted source — treat its citation as unverified.
        </p>
      )}
    </div>
  )
}
