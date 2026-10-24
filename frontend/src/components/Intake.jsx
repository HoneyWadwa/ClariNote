import { useRef, useState } from 'react'
import { charCount, wordCount } from '../lib/text.js'

const ACCEPT = '.txt,.pdf,.docx,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document'

/**
 * Document intake: paste mode + upload mode (drag-and-drop and browse),
 * with client-side validation against the limits reported by /api/health.
 */
export default function Intake({
  mode,
  onModeChange,
  notes,
  onNotesChange,
  onClear,
  onLoadSample,
  onFileChosen,
  limits,
  error,
  busy,
}) {
  const [dragging, setDragging] = useState(false)
  const fileRef = useRef(null)
  const maxText = (limits && limits.max_text_length) || 60000
  const maxMb = (limits && limits.max_file_mb) || 5
  const overLimit = charCount(notes) > maxText

  const handleDrop = (event) => {
    event.preventDefault()
    setDragging(false)
    const file = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0]
    if (file) onFileChosen(file)
  }

  return (
    <div className="intake">
      <div className="intake-modes" role="group" aria-label="Input mode">
        <button
          type="button"
          className="intake-mode"
          aria-pressed={mode === 'paste'}
          onClick={() => onModeChange('paste')}
        >
          <span aria-hidden="true">✎</span> Paste notes
        </button>
        <button
          type="button"
          className="intake-mode"
          aria-pressed={mode === 'upload'}
          onClick={() => onModeChange('upload')}
        >
          <span aria-hidden="true">↑</span> Upload document
        </button>
      </div>

      <div className="intake-body">
        {mode === 'paste' ? (
          <>
            <div className="intake-tools">
              <span className="label" id="notes-label">
                Lecture notes
              </span>
              <span>
                <button type="button" className="btn btn-quiet btn-sm" onClick={onLoadSample}>
                  Load sample lecture
                </button>
                <button
                  type="button"
                  className="btn btn-warm btn-sm"
                  onClick={onClear}
                  disabled={!notes.trim() || Boolean(busy)}
                >
                  Clear
                </button>
              </span>
            </div>

            <label className="sr-only" htmlFor="notes-editor">
              Paste your lecture notes
            </label>
            <textarea
              id="notes-editor"
              value={notes}
              onChange={(event) => onNotesChange(event.target.value)}
              placeholder="Paste instructor-approved lecture notes here…"
              spellCheck={false}
              aria-describedby="notes-counters"
            />
            <p className="counters" id="notes-counters">
              <span>{charCount(notes).toLocaleString()} characters</span>
              <span>{wordCount(notes).toLocaleString()} words</span>
              <span className={overLimit ? 'help-bad' : undefined}>
                limit {maxText.toLocaleString()}
              </span>
            </p>
          </>
        ) : (
          <>
            <div
              className={`dropzone${dragging ? ' dragging' : ''}`}
              onDragOver={(event) => {
                event.preventDefault()
                setDragging(true)
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
            >
              <h3>Drop your lecture file here</h3>
              <p className="help" style={{ marginTop: 0 }}>
                Or browse from your computer. Files are read in memory for extraction and never
                stored.
              </p>
              <div className="browse-row">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => fileRef.current && fileRef.current.click()}
                  disabled={Boolean(busy)}
                >
                  Browse files
                </button>
              </div>
              <input
                ref={fileRef}
                id="notes-file"
                className="file-input-hidden"
                type="file"
                accept={ACCEPT}
                onChange={(event) => {
                  const file = event.target.files && event.target.files[0]
                  if (file) onFileChosen(file)
                  event.target.value = ''
                }}
              />
              <p className="formats">TXT · PDF · DOCX — up to {maxMb} MB</p>
            </div>
          </>
        )}

        {error && (
          <div className="alert alert-error" role="alert" style={{ marginTop: 14 }}>
            <strong>{error.title || 'Check your input'}</strong>
            <p>{error.message}</p>
            {error.details && error.details.length > 0 && (
              <ul>
                {error.details.map((detail) => (
                  <li key={detail}>{detail}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
