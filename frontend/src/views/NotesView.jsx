import SourceViewer from '../components/SourceViewer.jsx'
import SourcePreview from '../components/SourcePreview.jsx'
import ErrorState from '../components/ErrorState.jsx'
import { charCount, wordCount } from '../lib/text.js'

/**
 * My Notes: the source editor plus the extracted source with evidence
 * highlighting. Re-extraction always runs against the text currently shown.
 */
export default function NotesView({
  notes,
  onNotesChange,
  fileMeta,
  extractInfo,
  onExtract,
  onClear,
  onLoadSample,
  busy,
  error,
  evidenceTarget,
  onClearHighlight,
  limits,
}) {
  const maxText = (limits && limits.max_text_length) || 60000

  return (
    <>
      <section aria-labelledby="notes-heading">
        <div className="panel-head">
          <div>
            <p className="label">Source</p>
            <h2 id="notes-heading">My notes</h2>
          </div>
          <div className="quote-meta" style={{ marginTop: 0 }}>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={onExtract}
              disabled={Boolean(busy) || !notes.trim()}
            >
              {busy === 'extract' ? 'Extracting…' : 'Re-extract from this text'}
            </button>
            <button
              type="button"
              className="btn btn-warm btn-sm"
              onClick={onClear}
              disabled={Boolean(busy) || !notes.trim()}
            >
              Clear
            </button>
            <button type="button" className="btn btn-quiet btn-sm" onClick={onLoadSample}>
              Load sample
            </button>
          </div>
        </div>

        <div className="panel">
          <label className="sr-only" htmlFor="notes-full">
            Lecture notes editor
          </label>
          <textarea
            id="notes-full"
            value={notes}
            onChange={(event) => onNotesChange(event.target.value)}
            placeholder="Paste or edit your lecture notes here…"
            spellCheck={false}
            aria-describedby="notes-full-counters"
            style={{ minHeight: 260 }}
          />
          <p className="counters" id="notes-full-counters">
            <span>{charCount(notes).toLocaleString()} characters</span>
            <span>{wordCount(notes).toLocaleString()} words</span>
            <span className={notes.length > maxText ? 'help-bad' : undefined}>
              limit {maxText.toLocaleString()}
            </span>
          </p>

          <SourcePreview
            fileMeta={fileMeta}
            extractInfo={extractInfo}
            notes={notes}
            statusText="use re-extract to refresh"
          />

          {error && (
            <div style={{ marginTop: 12 }}>
              <ErrorState title="Extraction failed" error={error} onRetry={onExtract} />
            </div>
          )}
        </div>
      </section>

      <section className="rule-section" aria-labelledby="source-heading">
        <div className="panel-head">
          <div>
            <p className="label">Original text</p>
            <h2 id="source-heading">Extracted source</h2>
          </div>
          {evidenceTarget && (
            <button type="button" className="btn btn-quiet btn-sm" onClick={onClearHighlight}>
              Clear highlight
            </button>
          )}
        </div>

        {evidenceTarget && (
          <div className="alert alert-info" role="status">
            <strong>Showing evidence in context.</strong>
            <p>
              {evidenceTarget.location
                ? `Claimed location: ${evidenceTarget.location}.`
                : 'The generator gave no location for this quotation — check the wording itself.'}{' '}
              Matching text is highlighted below.
            </p>
          </div>
        )}

        <SourceViewer
          segments={extractInfo ? extractInfo.segments : []}
          quote={evidenceTarget ? evidenceTarget.quote : null}
        />
      </section>
    </>
  )
}
