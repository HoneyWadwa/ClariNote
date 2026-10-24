import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as api from './api.js'
import Sidebar, { NAV_ITEMS } from './components/Sidebar.jsx'
import WorkspaceHeader from './components/WorkspaceHeader.jsx'
import ContextPanel from './components/ContextPanel.jsx'
import SourceViewer from './components/SourceViewer.jsx'
import Toasts from './components/Toasts.jsx'
import Overview from './views/Overview.jsx'
import NotesView from './views/NotesView.jsx'
import ResultsShell from './views/ResultsShell.jsx'
import SummaryPanel from './views/SummaryPanel.jsx'
import GlossaryPanel from './views/GlossaryPanel.jsx'
import PracticePanel from './views/PracticePanel.jsx'
import FactCheckPanel from './views/FactCheckPanel.jsx'
import SettingsView from './views/SettingsView.jsx'
import EmptyState from './components/EmptyState.jsx'
import { CHECKLIST_ITEMS } from './components/Checklist.jsx'
import {
  buildVerificationIndex,
  practiceStats,
} from './lib/evidence.js'
import { wordCount } from './lib/text.js'

const LEDE = 'Add approved notes, build a study set, then verify every claim against the source.'

const STAGES_TEMPLATE = [
  {
    key: 'extract',
    label: 'Extracting notes',
    sub: 'Reading your text and recording page or section markers',
  },
  {
    key: 'generate',
    label: 'Preparing study materials',
    sub: 'Summary, glossary and five questions, each with evidence',
  },
  {
    key: 'verify',
    label: 'Checking evidence',
    sub: 'Locating every quotation in the original notes',
  },
]

const freshChecklist = () => CHECKLIST_ITEMS.map((item) => ({ ...item, reviewed: false }))
const freshGlossaryState = () => ({ revised: {}, known: {}, again: {} })
const freshPractice = () => ({ index: 0, revealed: {}, flags: {} })

const TAB_TO_NAV = { summary: 'materials', glossary: 'materials', practice: 'practice', factcheck: 'factcheck' }
const COVERAGE_TO_FILTER = {
  supported: 'supported',
  awaiting: 'review',
  partial: 'partial',
  unsupported: 'unsupported',
}
const FILTER_TO_COVERAGE = {
  supported: 'supported',
  review: 'awaiting',
  partial: 'partial',
  unsupported: 'unsupported',
}

export default function App() {
  /* ---------------------------------------------------------------- session */
  const [page, setPage] = useState('overview')
  const [tab, setTab] = useState('summary')
  const [navOpen, setNavOpen] = useState(false)
  const [panelOpen, setPanelOpen] = useState(true)

  const [health, setHealth] = useState(null)
  const [healthError, setHealthError] = useState(null)

  const [notes, setNotes] = useState('')
  const [intakeMode, setIntakeMode] = useState('paste')
  const [fileMeta, setFileMeta] = useState(null)
  const [extractInfo, setExtractInfo] = useState(null)

  const [results, setResults] = useState(null)
  const [generatedFrom, setGeneratedFrom] = useState(null)
  const [busy, setBusy] = useState(null)
  const [stages, setStages] = useState(null)
  const [intakeError, setIntakeError] = useState(null)
  const [genError, setGenError] = useState(null)

  const [checklist, setChecklist] = useState(freshChecklist)
  const [glossaryState, setGlossaryState] = useState(freshGlossaryState)
  const [practice, setPractice] = useState(freshPractice)
  const [factFilter, setFactFilter] = useState('all')
  const [evidenceTarget, setEvidenceTarget] = useState(null)

  const [toasts, setToasts] = useState([])
  const toastId = useRef(0)

  /* ----------------------------------------------------------------- toasts */
  const dismissToast = useCallback((id) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  const pushToast = useCallback(
    (message, kind) => {
      toastId.current += 1
      const id = toastId.current
      setToasts((current) => [...current, { id, message, kind }])
      setTimeout(() => dismissToast(id), 6000)
    },
    [dismissToast]
  )

  /* ----------------------------------------------------------------- health */
  const loadHealth = useCallback(async () => {
    setHealthError(null)
    try {
      setHealth(await api.getHealth())
    } catch (cause) {
      setHealthError(cause.message)
    }
  }, [])

  useEffect(() => {
    loadHealth()
  }, [loadHealth])

  /* ---------------------------------------------------------- derived state */
  const limits = health && health.limits ? health.limits : null

  const verificationIndex = useMemo(
    () => (results ? buildVerificationIndex(results.materials, results.verification) : null),
    [results]
  )

  const stats = useMemo(
    () =>
      results
        ? practiceStats(results.materials, results.verification, practice.revealed)
        : { total: 0, flagged: 0, answered: 0, remaining: 0, perQuestion: [], firstOf: () => 0 },
    [results, practice.revealed]
  )

  const staleResults = Boolean(results && generatedFrom !== null && generatedFrom !== notes)

  const navActive = page === 'results' ? TAB_TO_NAV[tab] : page
  const areaLabel = (NAV_ITEMS.find((item) => item.key === navActive) || NAV_ITEMS[0]).label
  const showPanel = page !== 'settings'

  const statusText = results
    ? `${fileMeta ? fileMeta.name : extractInfo && extractInfo.filename ? extractInfo.filename : 'Pasted notes'} · ${
        results.mode === 'demo' ? 'demo output' : 'live output'
      }`
    : extractInfo
      ? `${fileMeta ? fileMeta.name : 'Pasted notes'} · extracted`
      : notes.trim()
        ? 'Draft notes'
        : 'No document yet'
  const statusKind = results ? (results.mode === 'demo' ? 'demo' : 'doc') : extractInfo || notes.trim() ? 'doc' : 'none'

  /* ------------------------------------------------------------ navigation */
  const navigate = useCallback((key) => {
    if (key === 'materials') {
      setPage('results')
      setTab('summary')
    } else if (key === 'practice') {
      setPage('results')
      setTab('practice')
    } else if (key === 'factcheck') {
      setPage('results')
      setTab('factcheck')
    } else {
      setPage(key)
    }
    setNavOpen(false)
    if (typeof window !== 'undefined') window.scrollTo({ top: 0 })
  }, [])

  const openSource = useCallback(
    ({ quote, location }) => {
      setEvidenceTarget({ quote, location: location || null })
      setPanelOpen(true)
      pushToast('Evidence opened in the source panel.', undefined)
      if (typeof window !== 'undefined' && window.innerWidth < 1180) {
        const node = document.querySelector('.context-col')
        const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
        if (node) node.scrollIntoView({ block: 'start', behavior: reduce ? 'auto' : 'smooth' })
      }
    },
    [pushToast]
  )

  /* -------------------------------------------------------------- ingestion */
  const loadSample = useCallback(async () => {
    setBusy('sample')
    setIntakeError(null)
    try {
      const sample = await api.getSample()
      setNotes(sample.text)
      setIntakeMode('paste')
      setFileMeta(null)
      setExtractInfo(null)
      pushToast('Sample lecture loaded — edit or use it as-is.', undefined)
    } catch (cause) {
      setIntakeError({ title: 'Could not load the sample', message: cause.message, details: cause.details })
    } finally {
      setBusy(null)
    }
  }, [pushToast])

  const clearNotes = useCallback(() => {
    setNotes('')
    setFileMeta(null)
    setExtractInfo(null)
    setResults(null)
    setGeneratedFrom(null)
    setIntakeError(null)
    pushToast('Notes cleared.', undefined)
  }, [pushToast])

  const handleFileChosen = useCallback(
    async (file) => {
      setIntakeError(null)
      setGenError(null)
      const allowed = (health && health.allowed_file_types) || ['txt', 'pdf', 'docx']
      const extension = file.name.includes('.') ? file.name.split('.').pop().toLowerCase() : ''
      if (!allowed.includes(extension)) {
        const error = {
          title: 'Unsupported file type',
          message: `“${file.name}” is not supported. Allowed types: ${allowed.join(', ').toUpperCase()}.`,
        }
        setIntakeError(error)
        pushToast(error.message, 'error')
        return
      }
      if (limits && file.size > limits.max_file_mb * 1024 * 1024) {
        const error = {
          title: 'File too large',
          message: `“${file.name}” is ${api.formatBytes(file.size)}; the limit is ${limits.max_file_mb} MB.`,
        }
        setIntakeError(error)
        pushToast(error.message, 'error')
        return
      }

      setFileMeta({ name: file.name, type: extension, size: file.size })
      setResults(null)
      setGeneratedFrom(null)
      setBusy('extract')
      try {
        const payload = await api.extractFile(file)
        setExtractInfo(payload)
        setNotes(payload.text)
        const locations = payload.locations ? payload.locations.length : 0
        pushToast(
          locations > 0
            ? `Extracted ${payload.char_count.toLocaleString()} characters · ${locations} location marker${locations === 1 ? '' : 's'}.`
            : `Extracted ${payload.char_count.toLocaleString()} characters.`,
          undefined
        )
      } catch (cause) {
        setExtractInfo(null)
        setIntakeError({ title: 'Extraction failed', message: cause.message, details: cause.details })
        pushToast('Extraction failed — the file was not read.', 'error')
      } finally {
        setBusy(null)
      }
    },
    [health, limits, pushToast]
  )

  const extractCurrentText = useCallback(async () => {
    setBusy('extract')
    setIntakeError(null)
    try {
      const payload = await api.extractText(notes)
      setExtractInfo(payload)
      setFileMeta(null)
      pushToast('Source re-extracted from the editor text.', undefined)
      return payload
    } catch (cause) {
      setIntakeError({ title: 'Extraction failed', message: cause.message, details: cause.details })
      throw cause
    } finally {
      setBusy(null)
    }
  }, [notes, pushToast])

  /* ------------------------------------------------------------ generation */
  const resetStudySetProgress = useCallback(() => {
    setChecklist(freshChecklist())
    setGlossaryState(freshGlossaryState())
    setPractice(freshPractice())
    setFactFilter('all')
    setEvidenceTarget(null)
  }, [])

  const createStudyMaterials = useCallback(async () => {
    if (busy) return
    setIntakeError(null)
    setGenError(null)

    const maxText = (limits && limits.max_text_length) || 60000
    if (!notes.trim()) {
      setGenError({ title: 'Nothing to process', message: 'Paste notes or upload a file first.' })
      return
    }
    if (notes.length > maxText) {
      setGenError({
        title: 'Notes too long',
        message: `${notes.length.toLocaleString()} characters exceeds the ${maxText.toLocaleString()} character limit.`,
      })
      return
    }

    setBusy('generate')
    setStages(STAGES_TEMPLATE.map((stage) => ({ ...stage, status: 'pending' })))
    const markStage = (key, status) =>
      setStages((current) =>
        (current || []).map((stage) => (stage.key === key ? { ...stage, status } : stage))
      )

    try {
      markStage('extract', 'active')
      let segments = null
      if (extractInfo && extractInfo.text.trim() === notes.trim()) {
        segments = extractInfo.segments
      } else {
        const payload = await api.extractText(notes)
        setExtractInfo(payload)
        setFileMeta(null)
        segments = payload.segments
      }
      markStage('extract', 'done')

      markStage('generate', 'active')
      const data = await api.generate(notes, segments)
      if (!data || !data.materials || !Array.isArray(data.materials.questions)) {
        throw Object.assign(new Error('The server returned a malformed result.'), {
          code: 'invalid_response',
          details: [],
        })
      }
      markStage('generate', 'done')

      markStage('verify', 'active')
      let verification = data.verification
      try {
        verification = await api.verify(notes, segments, data.materials)
      } catch (verifyError) {
        pushToast(
          `Evidence re-check failed (${verifyError.message}); showing the checks that came with generation.`,
          'warn'
        )
      }
      markStage('verify', 'done')

      setResults({ ...data, verification: verification || data.verification })
      setGeneratedFrom(notes)
      resetStudySetProgress()
      setPage('results')
      setTab('summary')
      setStages(null)
      pushToast(
        data.mode === 'demo'
          ? 'Demo output loaded — a fixed sample, not generated from your notes.'
          : 'Study materials created and checked against your notes.',
        data.mode === 'demo' ? 'warn' : undefined
      )
    } catch (cause) {
      setStages((current) =>
        (current || []).map((stage) => (stage.status === 'active' ? { ...stage, status: 'failed' } : stage))
      )
      setGenError({
        title: 'Could not create study materials',
        message: cause.message,
        details: cause.details || [],
      })
      pushToast('Generation failed — your notes are untouched.', 'error')
    } finally {
      setBusy(null)
    }
  }, [busy, limits, notes, extractInfo, pushToast, resetStudySetProgress])

  /* ------------------------------------------------------------- user state */
  const toggleChecklist = useCallback((id) => {
    setChecklist((current) =>
      current.map((item) => (item.id === id ? { ...item, reviewed: !item.reviewed } : item))
    )
  }, [])

  const toggleRevised = useCallback((term) => {
    setGlossaryState((current) => ({
      ...current,
      revised: { ...current.revised, [term]: !current.revised[term] },
    }))
  }, [])

  const markKnown = useCallback((term) => {
    setGlossaryState((current) => ({
      ...current,
      known: { ...current.known, [term]: true },
      again: { ...current.again, [term]: false },
    }))
  }, [])

  const markAgain = useCallback((term) => {
    setGlossaryState((current) => ({
      ...current,
      again: { ...current.again, [term]: true },
      known: { ...current.known, [term]: false },
    }))
  }, [])

  const revealAnswer = useCallback((index) => {
    setPractice((current) => ({ ...current, revealed: { ...current.revealed, [index]: true } }))
  }, [])

  const togglePracticeFlag = useCallback((index) => {
    setPractice((current) => ({ ...current, flags: { ...current.flags, [index]: !current.flags[index] } }))
  }, [])

  const restartPractice = useCallback(() => {
    setPractice((current) => ({ ...freshPractice(), flags: current.flags }))
    pushToast('Practice restarted — your flags were kept.', undefined)
  }, [pushToast])

  const selectCoverage = useCallback(
    (bucketKey) => {
      setFactFilter(COVERAGE_TO_FILTER[bucketKey] || 'all')
      navigate('factcheck')
    },
    [navigate]
  )

  const jumpPractice = useCallback(
    (kind) => {
      const target = stats.firstOf(kind)
      setPractice((current) => ({ ...current, index: target }))
      navigate('practice')
    },
    [navigate, stats]
  )

  const resetSession = useCallback(() => {
    setNotes('')
    setIntakeMode('paste')
    setFileMeta(null)
    setExtractInfo(null)
    setResults(null)
    setGeneratedFrom(null)
    setStages(null)
    setIntakeError(null)
    setGenError(null)
    resetStudySetProgress()
    setPage('overview')
    setTab('summary')
    pushToast('New study session started — everything from the last one was cleared.', undefined)
  }, [pushToast, resetStudySetProgress])

  /* ------------------------------------------------------------------ render */
  const segments = extractInfo ? extractInfo.segments : []
  const docName = fileMeta
    ? fileMeta.name
    : extractInfo && extractInfo.filename
      ? extractInfo.filename
      : notes.trim()
        ? 'Pasted notes'
        : 'No document'
  const docMeta = extractInfo
    ? `${String(extractInfo.file_type || 'text').toUpperCase()} · ${wordCount(notes)} words · ${
        extractInfo.locations ? extractInfo.locations.length : 0
      } locations`
    : notes.trim()
      ? `draft · ${wordCount(notes)} words`
      : 'add notes to begin'

  let mainContent = null
  if (page === 'overview') {
    mainContent = (
      <Overview
        intakeMode={intakeMode}
        onIntakeMode={setIntakeMode}
        notes={notes}
        onNotesChange={(value) => {
          setNotes(value)
          setIntakeError(null)
        }}
        onLoadSample={loadSample}
        onClear={clearNotes}
        onFileChosen={handleFileChosen}
        fileMeta={fileMeta}
        extractInfo={extractInfo}
        limits={limits}
        intakeError={intakeError}
        generationError={genError}
        stages={stages}
        busy={busy}
        onCreate={createStudyMaterials}
        onRetry={createStudyMaterials}
        onInspect={() => navigate('notes')}
        verification={results ? results.verification : null}
        onCoverageSelect={selectCoverage}
        activeCoverageFilter={FILTER_TO_COVERAGE[factFilter] || null}
        practiceStats={stats}
        onPracticeJump={jumpPractice}
      />
    )
    if (staleResults) {
      mainContent = (
        <>
          <div className="alert alert-warn" role="note">
            <strong>Your notes changed after this study set was created.</strong>
            <p style={{ margin: 0 }}>
              The results below were generated from the earlier text — create the study set again to
              refresh it.
            </p>
          </div>
          {mainContent}
        </>
      )
    }
  } else if (page === 'notes') {
    mainContent = (
      <NotesView
        notes={notes}
        onNotesChange={setNotes}
        fileMeta={fileMeta}
        extractInfo={extractInfo}
        onExtract={extractCurrentText}
        onClear={clearNotes}
        onLoadSample={loadSample}
        busy={busy}
        error={intakeError}
        evidenceTarget={evidenceTarget}
        onClearHighlight={() => setEvidenceTarget(null)}
        limits={limits}
      />
    )
  } else if (page === 'settings') {
    mainContent = (
      <SettingsView
        health={health}
        healthError={healthError}
        onReload={loadHealth}
        onReset={resetSession}
        busy={busy}
      />
    )
  } else if (!results) {
    mainContent = (
      <EmptyState
        title="No study set yet"
        action={
          <button type="button" className="btn btn-primary" onClick={() => navigate('overview')}>
            Add your notes
          </button>
        }
      >
        Create study materials from the Overview and this workspace will fill with your summary,
        glossary, practice questions and fact-check list.
      </EmptyState>
    )
  } else {
    const panels = {
      summary: (
        <SummaryPanel materials={results.materials} index={verificationIndex} onOpenSource={openSource} />
      ),
      glossary: (
        <GlossaryPanel
          materials={results.materials}
          index={verificationIndex}
          state={glossaryState}
          onToggleRevised={toggleRevised}
          onMarkKnown={markKnown}
          onMarkAgain={markAgain}
          onOpenSource={openSource}
        />
      ),
      practice: (
        <PracticePanel
          materials={results.materials}
          index={verificationIndex}
          stats={stats}
          current={practice.index}
          onCurrentChange={(index) => setPractice((current) => ({ ...current, index }))}
          revealed={practice.revealed}
          onReveal={revealAnswer}
          userFlags={practice.flags}
          onToggleFlag={togglePracticeFlag}
          onRestart={restartPractice}
          onOpenSource={openSource}
        />
      ),
      factcheck: (
        <FactCheckPanel
          results={results}
          filter={factFilter}
          onFilterChange={setFactFilter}
          onOpenSource={openSource}
          checklistState={checklist}
          onToggleChecklist={toggleChecklist}
        />
      ),
    }

    mainContent = (
      <ResultsShell
        results={results}
        docName={docName}
        docMeta={docMeta}
        tab={tab}
        onTabChange={setTab}
        onCoverageSelect={selectCoverage}
        activeCoverageFilter={FILTER_TO_COVERAGE[factFilter] || null}
        counts={{
          summary: (results.materials.summary || []).length,
          glossary: (results.materials.glossary || []).length,
          practice: (results.materials.questions || []).length,
          factcheck: results.verification.summary.total,
        }}
      >
        {panels[tab]}
      </ResultsShell>
    )
  }

  const checklistReviewed = checklist.filter((item) => item.reviewed).length

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>

      <Sidebar
        active={navActive}
        onNavigate={navigate}
        open={navOpen}
        onClose={() => setNavOpen(false)}
      />

      <div className="workspace">
        <WorkspaceHeader
          area={areaLabel}
          lede={LEDE}
          status={statusText}
          statusKind={statusKind}
          onNewSession={resetSession}
          onTogglePanel={() => setPanelOpen((value) => !value)}
          panelOpen={panelOpen}
          showPanelToggle={showPanel}
          onOpenNav={() => setNavOpen((value) => !value)}
          navOpen={navOpen}
        />

        <div className={`workspace-body${panelOpen && showPanel ? '' : ' no-panel'}`}>
          <main className="main-col" id="main-content" tabIndex={-1}>
            {mainContent}
          </main>

          {panelOpen && showPanel && (
            <ContextPanel onClose={() => setPanelOpen(false)}>
              <div className="context-block">
                <p className="label">Document</p>
                <ul className="stat-list" style={{ marginTop: 8 }}>
                  <li>
                    <span className="k">Name</span> <span className="v">{docName}</span>
                  </li>
                  <li>
                    <span className="k">Words</span>{' '}
                    <span className="v">{wordCount(notes).toLocaleString()}</span>
                  </li>
                  <li>
                    <span className="k">Characters</span>{' '}
                    <span className="v">{notes.length.toLocaleString()}</span>
                  </li>
                  <li>
                    <span className="k">Locations</span>{' '}
                    <span className="v">
                      {extractInfo && extractInfo.locations ? extractInfo.locations.length : 0}
                    </span>
                  </li>
                  <li>
                    <span className="k">Source status</span>{' '}
                    <span className="v">{extractInfo ? 'extracted' : notes.trim() ? 'draft' : 'empty'}</span>
                  </li>
                </ul>
              </div>

              <div className="context-block">
                <div className="context-head" style={{ paddingBottom: 6, borderBottom: 0, marginBottom: 6 }}>
                  <p className="label" style={{ margin: 0 }}>
                    Source evidence
                  </p>
                  {evidenceTarget && (
                    <button
                      type="button"
                      className="btn btn-quiet btn-sm"
                      onClick={() => setEvidenceTarget(null)}
                    >
                      Clear
                    </button>
                  )}
                </div>
                {evidenceTarget && (
                  <p className="ref" style={{ display: 'inline-block', marginBottom: 8 }}>
                    {evidenceTarget.location || 'no location given'}
                  </p>
                )}
                <SourceViewer segments={segments} quote={evidenceTarget ? evidenceTarget.quote : null} />
                <div className="quote-meta">
                  <button type="button" className="btn btn-quiet btn-sm" onClick={() => navigate('notes')}>
                    Open in My Notes
                  </button>
                </div>
              </div>

              <div className="context-block">
                <p className="label">Revision progress</p>
                <div style={{ marginTop: 8 }}>
                  <div className="revision-row">
                    <span>Flashcards known</span>
                    <span className="v">
                      {Object.values(glossaryState.known).filter(Boolean).length}/
                      {(results && results.materials.glossary.length) || 0}
                    </span>
                  </div>
                  <div className="revision-row">
                    <span>Terms revised</span>
                    <span className="v">
                      {Object.values(glossaryState.revised).filter(Boolean).length}
                    </span>
                  </div>
                  <div className="revision-row">
                    <span>Questions answered</span>
                    <span className="v">
                      {stats.answered}/{stats.total || 0}
                    </span>
                  </div>
                  <div className="revision-row">
                    <span>Questions flagged</span>
                    <span className="v">{stats.flagged}</span>
                  </div>
                  <div className="revision-row">
                    <span>Checklist reviewed</span>
                    <span className="v">
                      {checklistReviewed}/{checklist.length}
                    </span>
                  </div>
                  <div className="revision-row">
                    <span>Claims needing review</span>
                    <span className="v">
                      {results ? results.verification.summary.needs_review : 0}
                    </span>
                  </div>
                </div>
                {results && (
                  <div className="quote-meta">
                    <button type="button" className="btn btn-quiet btn-sm" onClick={() => navigate('factcheck')}>
                      Open fact check
                    </button>
                    <button type="button" className="btn btn-quiet btn-sm" onClick={() => navigate('practice')}>
                      Practice
                    </button>
                  </div>
                )}
              </div>
            </ContextPanel>
          )}
        </div>
      </div>

      <Toasts toasts={toasts} onDismiss={dismissToast} />
    </div>
  )
}
