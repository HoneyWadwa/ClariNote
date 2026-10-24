import { formatBytes } from '../api.js'

/**
 * Compact source preview: document name, counts and extraction status.
 * Every value shown comes from real state (extractor response or editor text).
 */
export default function SourcePreview({ fileMeta, extractInfo, notes, statusText, onInspect }) {
  const name = fileMeta
    ? fileMeta.name
    : extractInfo && extractInfo.filename
      ? extractInfo.filename
      : notes.trim()
        ? 'Pasted notes'
        : null

  if (!name) return null

  const words = notes.trim() ? notes.trim().split(/\s+/).length : 0
  const locations = extractInfo && extractInfo.locations ? extractInfo.locations.length : 0
  const size = fileMeta ? formatBytes(fileMeta.size) : null
  const type = (extractInfo && extractInfo.file_type) || (fileMeta && fileMeta.type) || 'text'

  return (
    <div className="source-strip">
      <div className="who">
        <span className="name">{name}</span>
        <span className="meta">
          {words.toLocaleString()} words · {notes.length.toLocaleString()} chars
          {size ? ` · ${size}` : ''} · {String(type).toUpperCase()}
        </span>
      </div>
      <div className="quote-meta" style={{ marginTop: 0 }}>
        <span className={`chip ${extractInfo ? 'chip-ok' : ''}`}>
          {extractInfo
            ? locations > 0
              ? `extracted · ${locations} location marker${locations === 1 ? '' : 's'}`
              : 'extracted · no page markers'
            : statusText || 'not extracted yet'}
        </span>
        {onInspect && (
          <button type="button" className="btn btn-quiet btn-sm" onClick={onInspect}>
            Inspect text
          </button>
        )}
      </div>
    </div>
  )
}
