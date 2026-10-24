/**
 * Render smoke test — catches runtime errors the production build cannot.
 *
 * It loads the real source through Vite's SSR pipeline and renders every view
 * with real data fetched from the running backend (demo mode), plus the empty
 * states when no results exist. No browser is required.
 *
 * Run: node scripts/smoke.mjs   (backend must be running on :5001)
 */
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import React from 'react'
import { renderToString } from 'react-dom/server'
import { createServer } from 'vite'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..')
const API = 'http://127.0.0.1:5001'

const failures = []
const passes = []

function check(name, html, mustContain = []) {
  if (typeof html !== 'string' || html.length === 0) {
    failures.push(`${name}: rendered nothing`)
    return
  }
  for (const needle of mustContain) {
    if (!html.includes(needle)) {
      failures.push(`${name}: missing “${needle}”`)
      return
    }
  }
  passes.push(`${name} (${html.length} chars)`)
}

async function fetchJson(pathname, options) {
  const response = await fetch(`${API}${pathname}`, options)
  if (!response.ok) throw new Error(`${pathname} -> ${response.status}`)
  return response.json()
}

const noop = () => {}

async function main() {
  const sample = await fetchJson('/api/sample')
  const demo = await fetchJson('/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: sample.text,
      segments: [{ location: 'Sample lecture notes', text: sample.text }],
    }),
  })
  const verification = await fetchJson('/api/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source_text: sample.text, materials: demo.materials }),
  })
  const results = { ...demo, verification }
  const extractInfo = await fetchJson('/api/extract', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: sample.text }),
  })

  const vite = await createServer({
    root: ROOT,
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'error',
  })

  try {
    const load = (file) => vite.ssrLoadModule(`/src/${file}`)

    /* ---------------------------------------------------------- whole app */
    const { default: App } = await load('App.jsx')
    check('App (empty session)', renderToString(React.createElement(App)), [
      'Your study desk',
      'Make your lecture notes work harder',
      'Create study materials',
      'Your notes stay in your current session',
    ])

    /* ------------------------------------------------------------- pieces */
    const { default: ResultsShell } = await load('views/ResultsShell.jsx')
    const { default: SummaryPanel } = await load('views/SummaryPanel.jsx')
    const { default: GlossaryPanel } = await load('views/GlossaryPanel.jsx')
    const { default: PracticePanel } = await load('views/PracticePanel.jsx')
    const { default: FactCheckPanel } = await load('views/FactCheckPanel.jsx')
    const { default: Overview } = await load('views/Overview.jsx')
    const { default: NotesView } = await load('views/NotesView.jsx')
    const { default: SettingsView } = await load('views/SettingsView.jsx')
    const { default: Checklist } = await load('components/Checklist.jsx')
    const { buildVerificationIndex, practiceStats } = await load('lib/evidence.js')

    const index = buildVerificationIndex(results.materials, results.verification)
    const stats = practiceStats(results.materials, results.verification, { 0: true })
    const glossaryState = { revised: {}, known: {}, again: {} }
    const checklistState = [
      { id: 'summary-evidence', text: 'Summary points have evidence', hint: 'h', reviewed: false },
      { id: 'human-reviewed', text: 'Human review has been completed', hint: 'h', reviewed: true },
    ]

    check(
      'SummaryPanel',
      renderToString(
        React.createElement(SummaryPanel, {
          materials: results.materials,
          index,
          onOpenSource: noop,
        })
      ),
      ['Supported', 'Round Robin gives the lowest average waiting time', 'Needs human review']
    )

    check(
      'GlossaryPanel (list)',
      renderToString(
        React.createElement(GlossaryPanel, {
          materials: results.materials,
          index,
          state: glossaryState,
          onToggleRevised: noop,
          onMarkKnown: noop,
          onMarkAgain: noop,
          onOpenSource: noop,
        })
      ),
      ['Process scheduling', 'Not supported by source', 'Flashcards', 'Mark as revised']
    )

    check(
      'PracticePanel (answer hidden)',
      renderToString(
        React.createElement(PracticePanel, {
          materials: results.materials,
          index,
          stats,
          current: 1,
          onCurrentChange: noop,
          revealed: {},
          onReveal: noop,
          userFlags: {},
          onToggleFlag: noop,
          onRestart: noop,
          onOpenSource: noop,
        })
      ),
      ['Reveal answer', 'Restart practice', 'Try answering from memory first']
    )

    check(
      'PracticePanel (answer revealed)',
      renderToString(
        React.createElement(PracticePanel, {
          materials: results.materials,
          index,
          stats,
          current: 0,
          onCurrentChange: noop,
          revealed: { 0: true },
          onReveal: noop,
          userFlags: { 0: true },
          onToggleFlag: noop,
          onRestart: noop,
          onOpenSource: noop,
        })
      ),
      ['Answer key', 'not auto-graded', 'Flagged for another look']
    )

    check(
      'FactCheckPanel',
      renderToString(
        React.createElement(FactCheckPanel, {
          results,
          filter: 'all',
          onFilterChange: noop,
          onOpenSource: noop,
          checklistState,
          onToggleChecklist: noop,
        })
      ),
      ['quotation located', 'semantic support not verified', 'Factual review checklist', 'manual check']
    )

    check(
      'ResultsShell + Summary',
      renderToString(
        React.createElement(
          ResultsShell,
          {
            results,
            docName: 'sample_input.txt',
            docMeta: 'TXT · 1 locations',
            tab: 'summary',
            onTabChange: noop,
            onCoverageSelect: noop,
            activeCoverageFilter: 'all',
            counts: {
              summary: results.materials.summary.length,
              glossary: results.materials.glossary.length,
              practice: results.materials.questions.length,
              factcheck: results.verification.summary.total,
            },
          },
          React.createElement(SummaryPanel, {
            materials: results.materials,
            index,
            onOpenSource: noop,
          })
        )
      ),
      ['Demo output', 'Grounding overview', 'Evidence coverage', 'claims']
    )

    check(
      'Overview (with data)',
      renderToString(
        React.createElement(Overview, {
          intakeMode: 'paste',
          onIntakeMode: noop,
          notes: sample.text,
          onNotesChange: noop,
          onLoadSample: noop,
          onClear: noop,
          onFileChosen: noop,
          fileMeta: null,
          extractInfo,
          limits: { max_text_length: 60000, max_file_mb: 5 },
          intakeError: null,
          generationError: null,
          stages: [
            { key: 'extract', label: 'Extracting notes', status: 'done' },
            { key: 'generate', label: 'Preparing study materials', status: 'active' },
            { key: 'verify', label: 'Checking evidence', status: 'pending' },
          ],
          busy: 'generate',
          onCreate: noop,
          onRetry: noop,
          onInspect: noop,
          verification: results.verification,
          onCoverageSelect: noop,
          activeCoverageFilter: 'all',
          practiceStats: stats,
          onPracticeJump: noop,
        })
      ),
      ['Make your lecture notes work harder', '01', 'Load sample lecture', 'Practice progress']
    )

    check(
      'Overview (upload mode, empty data → chart empty states)',
      renderToString(
        React.createElement(Overview, {
          intakeMode: 'upload',
          onIntakeMode: noop,
          notes: '',
          onNotesChange: noop,
          onLoadSample: noop,
          onClear: noop,
          onFileChosen: noop,
          fileMeta: null,
          extractInfo: null,
          limits: null,
          intakeError: { title: 'Unsupported file type', message: 'Only TXT, PDF, DOCX.' },
          generationError: null,
          stages: null,
          busy: null,
          onCreate: noop,
          onRetry: noop,
          onInspect: noop,
          verification: null,
          onCoverageSelect: noop,
          activeCoverageFilter: 'all',
          practiceStats: { total: 0, answered: 0, flagged: 0, remaining: 0 },
          onPracticeJump: noop,
        })
      ),
      ['Drop your lecture file here', 'No study set yet', 'No practice questions yet']
    )

    check(
      'NotesView (with highlight)',
      renderToString(
        React.createElement(NotesView, {
          notes: sample.text,
          onNotesChange: noop,
          fileMeta: null,
          extractInfo,
          onExtract: noop,
          onClear: noop,
          onLoadSample: noop,
          busy: null,
          error: null,
          evidenceTarget: { quote: sample.text.slice(0, 60), location: null },
          onClearHighlight: noop,
          limits: { max_text_length: 60000 },
        })
      ),
      ['My notes', 'Extracted source', 'Matching text is highlighted']
    )

    check(
      'SettingsView',
      renderToString(
        React.createElement(SettingsView, {
          health: {
            service: 'lecturelens-api',
            live_ai_configured: false,
            model: 'gpt-4o-mini',
            allowed_file_types: ['txt', 'pdf', 'docx'],
            limits: { max_file_mb: 5, max_text_length: 60000 },
          },
          healthError: null,
          onReload: noop,
          onReset: noop,
          busy: null,
        })
      ),
      ['demo mode', 'POST /api/generate', 'New study session']
    )

    check(
      'Checklist (signals)',
      renderToString(
        React.createElement(Checklist, {
          state: checklistState,
          onToggle: noop,
          verification: results.verification,
          example: results.checklist_example || [],
        })
      ),
      ['Human verification required', 'requires further verification', 'not reviewed']
    )
  } finally {
    await vite.close()
  }

  console.log('\nRender smoke test')
  passes.forEach((name) => console.log(`  ✓ ${name}`))
  failures.forEach((name) => console.log(`  ✗ ${name}`))
  console.log(`\n${passes.length} passed, ${failures.length} failed`)
  if (failures.length > 0) process.exit(1)
}

main().catch((error) => {
  console.error('Smoke test crashed:', error)
  process.exit(1)
})
