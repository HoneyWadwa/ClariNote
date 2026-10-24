import { useRef } from 'react'
import EvidenceCoverage from '../components/EvidenceCoverage.jsx'
import GroundingBadge from '../components/GroundingBadge.jsx'

const TABS = [
  { key: 'summary', label: 'Summary' },
  { key: 'glossary', label: 'Glossary' },
  { key: 'practice', label: 'Practice questions' },
  { key: 'factcheck', label: 'Fact check' },
]

/**
 * Results workspace chrome: source strip, grounding overview (real coverage
 * chart) and the keyboard-accessible tab list. Content is passed in as children.
 */
export default function ResultsShell({
  results,
  docName,
  docMeta,
  tab,
  onTabChange,
  onCoverageSelect,
  activeCoverageFilter,
  counts,
  children,
}) {
  const materials = results.materials
  const verification = results.verification
  const summary = verification.summary
  const tabsRef = useRef(null)

  const handleKeyDown = (event) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return
    event.preventDefault()
    const current = TABS.findIndex((item) => item.key === tab)
    const delta = event.key === 'ArrowRight' ? 1 : -1
    const next = (current + delta + TABS.length) % TABS.length
    onTabChange(TABS[next].key)
    const button = tabsRef.current && tabsRef.current.querySelector(`#tab-${TABS[next].key}`)
    if (button) button.focus()
  }

  return (
    <>
      <div className="doc-strip">
        <span className="title">{docName}</span>
        <span className="ref">{docMeta}</span>
        <span className={`badge ${results.mode === 'demo' ? 'badge-demo' : 'badge-supported'}`}>
          <span aria-hidden="true">{results.mode === 'demo' ? '◆' : '●'}</span>
          {results.mode === 'demo' ? 'Demo output' : `Live output · ${results.model}`}
        </span>
        <span className="chip">
          quotes located <strong>{summary.quotes_located}</strong>/{summary.quotes_total}
        </span>
        <span className="chip">
          claims <strong>{summary.total}</strong>
        </span>
        <span className={`chip ${summary.needs_review > 0 ? 'chip-warn' : 'chip-ok'}`}>
          needs review <strong>{summary.needs_review}</strong>
        </span>
      </div>

      {results.mode === 'demo' && (
        <div className="alert alert-warn" role="note">
          <strong>Demo output — not generated live.</strong>
          <p>{results.demo_notice}</p>
        </div>
      )}

      {results.warnings && results.warnings.length > 0 && (
        <div className="alert alert-warn" role="note">
          <strong>Before you use this material</strong>
          <ul>
            {results.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="grounding-overview">
        <div>
          <p className="label">Grounding overview</p>
          <h3>How well the source supports this set</h3>
          <p className="help">
            Each generated claim is counted once by its verified grounding status. Select a category
            to filter the Fact Check list.
          </p>
          <div className="quote-meta" style={{ marginTop: 10 }}>
            <GroundingBadge status="SUPPORTED" />
            <GroundingBadge status="PARTIALLY_SUPPORTED" />
            <GroundingBadge status="UNSUPPORTED" />
          </div>
        </div>
        <EvidenceCoverage
          verification={verification}
          onSelect={onCoverageSelect}
          activeFilter={activeCoverageFilter}
        />
      </div>

      <div className="tabs" role="tablist" aria-label="Study materials" onKeyDown={handleKeyDown} ref={tabsRef}>
        {TABS.map((item) => (
          <button
            type="button"
            key={item.key}
            id={`tab-${item.key}`}
            role="tab"
            className="tab"
            aria-selected={tab === item.key}
            aria-controls={`panel-${item.key}`}
            tabIndex={tab === item.key ? 0 : -1}
            onClick={() => onTabChange(item.key)}
          >
            {item.label}
            <span className="count">{counts[item.key]}</span>
          </button>
        ))}
      </div>

      <div
        className="tabpanel"
        id={`panel-${tab}`}
        role="tabpanel"
        aria-labelledby={`tab-${tab}`}
        tabIndex={0}
      >
        {children}
      </div>

      <p className="help" style={{ marginTop: 16 }}>
        {verification.disclaimer}
        {materials.questions && materials.questions.length !== 5 && (
          <span className="help-bad">
            {' '}
            Warning: this result contains {materials.questions.length} questions; exactly five are
            expected.
          </span>
        )}
      </p>
    </>
  )
}
