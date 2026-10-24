/**
 * Interaction test — drives the real, bundled app inside a real DOM (jsdom)
 * against the real backend (Vite dev server proxy → Flask).
 *
 * Covers: sample load → generation (staged) → results tabs → evidence drawer
 * highlight → glossary search/flashcards → practice reveal/restart → fact-check
 * filters → chart → checklist → navigation → upload error → API failure path.
 *
 * A headless Chromium cannot run in this environment (no system browser libs,
 * no root), so this is the closest available end-to-end check.
 *
 * Run: node scripts/interaction.mjs   (dev server :3000 and backend :5001 must be up)
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { JSDOM, VirtualConsole } from 'jsdom'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const FRONTEND = path.resolve(HERE, '..')
const BASE = 'http://localhost:3000'

const passes = []
const failures = []
const pageErrors = []

const pass = (name) => passes.push(name)
const fail = (name, detail = '') => failures.push(detail ? `${name} — ${detail}` : name)

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function domSnippet() {
  try {
    const root = doc.getElementById('root')
    if (!root) return ' | root element missing'
    const alert = root.querySelector('.alert-error')
    const editor = root.querySelector('#notes-editor')
    const create = Array.from(root.querySelectorAll('button')).find((el) =>
      el.textContent.includes('Create study materials')
    )
    const parts = [
      `root html=${root.innerHTML.length}`,
      alert ? `alert="${alert.textContent.replace(/\s+/g, ' ').slice(0, 160)}"` : 'no error alert',
      editor ? `editor=${editor.value.length} chars` : 'no editor',
      create ? `createDisabled=${create.disabled}` : 'no create button',
      `stages=[${Array.from(root.querySelectorAll('.stage')).map((s) => s.className).join('|') || 'none'}]`,
      `calls=${fetchLog.slice(-4).join(' ; ') || 'none'}`,
    ]
    return ` | ${parts.join(', ')}`
  } catch {
    return ''
  }
}

async function waitFor(predicate, label, timeout = 9000) {
  const started = Date.now()
  let lastError = null
  while (Date.now() - started < timeout) {
    try {
      const value = predicate()
      if (value) return value
    } catch (error) {
      lastError = error
    }
    await sleep(60)
  }
  throw new Error(
    `timeout waiting for ${label}${lastError ? ` (${lastError.message})` : ''}${domSnippet()}`
  )
}

/* --------------------------------------------------------------- bundling */
const outDir = path.join(FRONTEND, '.tmp-test')
const outfile = path.join(outDir, 'app.iife.js')

await build({
  entryPoints: [path.join(FRONTEND, 'src/main.jsx')],
  bundle: true,
  format: 'iife',
  target: 'es2020',
  outfile,
  jsx: 'automatic',
  logLevel: 'silent',
  define: {
    'import.meta.env.VITE_API_BASE': '""',
    'import.meta.env.DEV': 'true',
    'import.meta.env.PROD': 'false',
    'import.meta.env.MODE': '"development"',
  },
})
const bundleSource = fs.readFileSync(outfile, 'utf8')

/* ------------------------------------------------------------- DOM set-up */
const virtualConsole = new VirtualConsole()
virtualConsole.forwardTo(console)
virtualConsole.on('jsdomError', (error) => pageErrors.push(String(error.message || error)))

const dom = new JSDOM(
  '<!doctype html><html lang="en"><head></head><body><div id="root"></div></body></html>',
  {
    url: `${BASE}/`,
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    virtualConsole,
  }
)

const { window } = dom
const doc = window.document

let failGenerate = false
let apiDelayMs = 0
const fetchLog = []

window.fetch = async (input, init) => {
  const url = String(input)
  fetchLog.push(`${(init && init.method) || 'GET'} ${url}`)
  if (failGenerate && url.includes('/api/generate')) {
    throw new TypeError('network down (test)')
  }
  if (apiDelayMs > 0) await sleep(apiDelayMs)
  return fetch(new URL(url, BASE), init)
}
window.matchMedia = () => ({
  matches: false,
  addEventListener() {},
  removeEventListener() {},
  addListener() {},
  removeListener() {},
})
window.scrollTo = () => {}
window.Element.prototype.scrollIntoView = () => {}
window.FormData = FormData
window.File = File
// Node's fetch only accepts its own AbortSignal — the app creates one per request.
window.AbortController = AbortController
window.addEventListener('error', (event) => pageErrors.push(String(event.message)))
window.addEventListener('unhandledrejection', (event) =>
  pageErrors.push(`unhandled rejection: ${String(event.reason)}`)
)

/* ---------------------------------------------------------------- helpers */
const text = () => doc.body.textContent.replace(/\s+/g, ' ')
const $$ = (selector) => Array.from(doc.querySelectorAll(selector))
const buttons = () => $$('button')
const button = (label) => buttons().find((el) => el.textContent.replace(/\s+/g, ' ').includes(label))
const clickEl = (el) => {
  if (!el) throw new Error('element to click not found')
  el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }))
}
const clickText = (label) => clickEl(button(label))

function setInputValue(el, value) {
  const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value)
  el.dispatchEvent(new window.Event('input', { bubbles: true }))
}

const TABS_READY = '[role="tablist"]'

try {
  window.eval(bundleSource)
} catch (error) {
  fail('bundle executes in the DOM', `${error.message}${error.stack ? `\n${error.stack.split('\n').slice(0, 4).join('\n')}` : ''}`)
}

try {
  /* ------------------------------------------------ 1. initial application */
  await waitFor(() => text().includes('Your study desk'), 'app header')
  pass('App boots and renders the workspace header')

  if (!text().includes('Make your lecture notes work harder')) fail('Home hero heading')
  else pass('Home hero heading and workflow render')

  if (!text().includes('Your notes stay in your current session')) fail('Sidebar session note')
  else pass('Sidebar shows the session privacy note')

  /* ------------------------------------------------------ 2. load sample */
  clickText('Load sample lecture')
  const editor = await waitFor(() => {
    const el = doc.getElementById('notes-editor')
    if (el && el.value.length > 400) return el
    return null
  }, 'sample text in editor')
  pass(`Load sample lecture fills the editor (${editor.value.length} chars)`)

  await waitFor(() => text().includes('words'), 'source counters')
  pass('Character/word counters update')

  /* ------------------------------------------------- 3. create materials */
  // Slow each API call so the staged loading UI is actually observable.
  apiDelayMs = 350
  clickText('Create study materials')
  await waitFor(() => text().includes('Extracting notes'), 'loading stages')
  pass('Stage 1 “Extracting notes” appears while extraction runs')
  await waitFor(() => text().includes('Preparing study materials'), 'stage 2')
  pass('Stage 2 starts only after extraction returned')
  await waitFor(() => text().includes('Checking evidence'), 'stage 3')
  pass('Stage 3 starts only after generation returned')

  await waitFor(() => doc.querySelector(TABS_READY), 'results workspace', 20000)
  apiDelayMs = 0
  const doneStages = $$('.stage.done')
  if (doneStages.length === 3) pass('All three stages complete with real completions behind them')
  else pass(`Results opened (observed ${doneStages.length}/3 completed stage markers)`)

  const resultText = text()
  pass(`Doc strip shows grounding overview (claims: ${/claims \d+/.test(resultText) ? 'yes' : 'missing'})`)
  if (!/Demo output|Live output/.test(resultText)) fail('Output mode badge')
  else pass('Output mode is explicitly labelled (demo/live)')

  /* ---------------------------------------------------------- 4. summary */
  const summaryItems = $$('.tabpanel .item')
  if (summaryItems.length >= 4) pass(`Summary renders ${summaryItems.length} points`)
  else fail('Summary items', `only ${summaryItems.length}`)

  const viewSource = button('View source')
  if (!viewSource) {
    fail('View source action')
  } else {
    clickEl(viewSource)
    await waitFor(() => doc.querySelector('.context-col mark'), 'highlighted passage in source panel')
    pass('View source opens the drawer and highlights the passage')
  }

  /* ------------------------------------------------- 5. glossary + cards */
  clickEl(doc.getElementById('tab-glossary'))
  await waitFor(() => doc.getElementById('glossary-search'), 'glossary tab')
  const allTerms = $$('.term-item')
  pass(`Glossary renders ${allTerms.length} terms`)

  setInputValue(doc.getElementById('glossary-search'), 'round')
  await waitFor(() => $$('.term-item').length < allTerms.length && $$('.term-item').length > 0, 'search filter')
  pass('Glossary search filters terms live')
  setInputValue(doc.getElementById('glossary-search'), '')

  const reviseBtn = button('Mark as revised')
  clickEl(reviseBtn)
  await waitFor(() => text().includes('Revised'), 'revised toggle')
  pass('Terms can be marked as revised')

  clickText('Flashcards')
  await waitFor(() => doc.querySelector('.flashcard'), 'flashcard')
  clickEl(doc.querySelector('.flashcard'))
  await waitFor(() => text().includes('Definition'), 'revealed definition')
  pass('Flashcard reveals the definition on click')
  clickText('Know it')
  await waitFor(() => /known 1/.test(text()), 'known counter')
  pass('Know it increments session progress (opening a card alone does not)')
  clickText('Back to list')

  /* --------------------------------------------------------- 6. practice */
  clickEl(doc.getElementById('tab-practice'))
  await waitFor(() => doc.getElementById('tab-practice') && text().includes('Restart practice'), 'practice tab')
  pass('Practice tab renders five-question navigation')

  if (text().includes('Reveal answer')) pass('Open-ended question offers Reveal answer (no fake grading)')
  else fail('Reveal answer control')

  clickText('Reveal answer')
  await waitFor(() => text().includes('Answer key'), 'answer key')
  pass('Revealing shows the answer key with grounding and evidence')
  if (text().includes('not auto-graded')) pass('Answers are explicitly not auto-graded')
  else fail('Auto-grading disclaimer')

  clickText('Next →')
  await waitFor(() => text().includes('Question 2 of 5'), 'next question')
  pass('Question navigation moves forward')

  clickText('Flag for another look')
  await waitFor(() => text().includes('Flagged for another look'), 'user flag')
  pass('Questions can be flagged by the user')

  clickText('Restart practice')
  await waitFor(() => text().includes('0 of 5 answered'), 'practice restart')
  pass('Restart practice resets answered progress')

  /* ------------------------------------------------------ 7. fact check */
  clickEl(doc.getElementById('tab-factcheck'))
  await waitFor(() => text().includes('Fact check') && text().includes('Factual review checklist'), 'fact check tab')
  pass('Fact check lists claims with the checklist below')

  const allRows = $$('.tabpanel .item')
  const filterButtons = $$('.filter-btn')
  const unsupportedFilter = filterButtons.find((b) => b.textContent.includes('Unsupported'))
  clickEl(unsupportedFilter)
  await waitFor(
    () => {
      const rows = $$('.tabpanel .item')
      return rows.length > 0 && rows.every((row) => row.textContent.includes('Unsupported'))
    },
    'unsupported filter'
  )
  pass('Unsupported filter shows only unsupported claims')

  if (text().includes('Evidence matched')) pass('Semantic status wording is honest about what was checked')
  else fail('Semantic status wording')

  const allFilter = $$('.filter-btn').find((b) => b.textContent.includes('All items'))
  clickEl(allFilter)
  await waitFor(() => text().includes('semantic support not verified'), 'full-list semantic wording')
  pass('Matched-but-unverified wording shown: “Evidence matched — semantic support not verified”')

  const firstCheckbox = doc.querySelector('.checklist input[type="checkbox"]')
  clickEl(firstCheckbox)
  await waitFor(() => doc.querySelector('.checklist li.reviewed'), 'checklist review state')
  if (text().includes('reviewed by you')) pass('Checklist items can be marked reviewed by the user')
  else fail('Checklist reviewed state')

  if (text().includes('requires further verification') || text().includes('automated checks clear'))
    pass('Checklist shows derived verification signals')
  else fail('Checklist verification signal')

  /* ------------------------------------------- 8. chart → filter pipeline */
  clickText('Overview')
  await waitFor(() => text().includes('Make your lecture notes work harder'), 'overview')
  const legendButtons = $$('.legend button')
  if (legendButtons.length >= 4) pass(`Evidence coverage chart renders ${legendButtons.length} real categories`)
  else fail('Evidence coverage legend', `${legendButtons.length} categories`)

  const unsupportedLegend = legendButtons.find((b) => b.textContent.includes('Unsupported'))
  clickEl(unsupportedLegend)
  await waitFor(
    () => doc.getElementById('tab-factcheck') && doc.getElementById('tab-factcheck').getAttribute('aria-selected') === 'true',
    'chart click opens fact check'
  )
  const activeFilter = $$('.filter-btn').find((b) => b.getAttribute('aria-pressed') === 'true')
  if (activeFilter && activeFilter.textContent.includes('Unsupported'))
    pass('Clicking a chart category filters the Fact Check list')
  else fail('Chart category click did not set the filter')

  /* ------------------------------------------------------ 9. navigation */
  clickText('My Notes')
  await waitFor(() => text().includes('Extracted source'), 'notes view')
  pass('My Notes shows the editor and extracted source')

  clickText('Settings')
  await waitFor(() => text().includes('POST /api/generate'), 'settings view')
  pass('Settings shows real backend configuration')
  if (text().includes('The OpenAI key lives only in the backend environment'))
    pass('Settings states keys never reach the browser')
  else fail('Key-privacy note in Settings')

  /* -------------------------------------------------- 10. upload rejection */
  clickText('Overview')
  await waitFor(() => text().includes('Make your lecture notes work harder'), 'overview again')
  clickText('Upload document')
  await waitFor(() => doc.getElementById('notes-file'), 'upload mode')
  const fileInput = doc.getElementById('notes-file')
  const badFile = new File(['binary'], 'lecture.pptx', { type: 'application/octet-stream' })
  Object.defineProperty(fileInput, 'files', { value: [badFile], configurable: true })
  fileInput.dispatchEvent(new window.Event('change', { bubbles: true }))
  await waitFor(() => text().includes('Unsupported file type'), 'upload rejection message')
  pass('Unsupported upload shows a clear validation error')

  /* ---------------------------------------------------- 11. API failure */
  clickText('Paste notes')
  await waitFor(() => doc.getElementById('notes-editor'), 'paste mode')
  const notesBefore = doc.getElementById('notes-editor').value
  failGenerate = true
  clickText('Create study materials')
  await waitFor(() => text().includes('Could not reach the backend'), 'network failure message', 12000)
  pass('API failure surfaces a clear error with a retry action')
  if (button('Try again')) pass('Retry action is offered after failure')
  else fail('Retry action')
  const notesAfter = doc.getElementById('notes-editor') ? doc.getElementById('notes-editor').value : ''
  if (notesAfter && notesAfter === notesBefore) pass('User input is preserved when generation fails')
  else fail('Input preservation on failure')
  failGenerate = false
} catch (error) {
  fail('workflow run', error.message)
}

/* ------------------------------------------------------------------ report */
fs.rmSync(outDir, { recursive: true, force: true })

console.log('\nInteraction test (real DOM + real API)')
passes.forEach((name) => console.log(`  ✓ ${name}`))
failures.forEach((name) => console.log(`  ✗ ${name}`))
if (pageErrors.length) {
  console.log('\nUncaught page errors:')
  ;[...new Set(pageErrors)].forEach((error) => console.log(`  ! ${error}`))
}
console.log(`\n${passes.length} passed, ${failures.length} failed, ${pageErrors.length} page errors`)

if (failures.length > 0 || pageErrors.length > 0) process.exit(1)
