/**
 * Evidence and grounding helpers.
 *
 * All functions here read real application data only:
 *  - `materials`   : the generated study set returned by POST /api/generate
 *  - `verification`: the report returned by POST /api/verify (or embedded in generate)
 *  - `segments`    : extracted source segments ({ location, text }) from /api/extract
 *
 * Nothing in this module invents counts, locations or relationships.
 */

import { escapeRegExp } from './text.js'

/**
 * The backend flattens materials in a fixed order:
 * summary points, glossary entries, then a [question, answer] pair per question.
 * This mirrors that order so a UI element can find "its" verification item.
 */
export function buildVerificationIndex(materials, verification) {
  const items = (verification && verification.items) || []
  const index = { summary: [], glossary: [], questions: [] }
  let cursor = 0
  ;(materials.summary || []).forEach(() => index.summary.push(items[cursor++] || null))
  ;(materials.glossary || []).forEach(() => index.glossary.push(items[cursor++] || null))
  ;(materials.questions || []).forEach(() => {
    const question = items[cursor++] || null
    const answer = items[cursor++] || null
    index.questions.push({ question, answer })
  })
  return index
}

/**
 * Evidence coverage — counting unit: ONE generated claim (one verification item).
 * The four buckets are mutually exclusive so nothing is double-counted:
 *   unsupported  -> verified status UNSUPPORTED (confirmed not supported by the source)
 *   partial      -> verified status PARTIALLY_SUPPORTED
 *   awaiting     -> reported SUPPORTED but flagged by verification (quotation/location/wording)
 *   supported    -> verified SUPPORTED and not flagged
 * "Awaiting review" is deliberately kept separate from confirmed unsupported.
 */
export function coverageBuckets(verification) {
  const items = (verification && verification.items) || []
  const counts = { supported: 0, awaiting: 0, partial: 0, unsupported: 0 }

  items.forEach((item) => {
    const grounding = item.verified_grounding || item.reported_grounding
    if (grounding === 'UNSUPPORTED') counts.unsupported += 1
    else if (grounding === 'PARTIALLY_SUPPORTED') counts.partial += 1
    else if (item.needs_review) counts.awaiting += 1
    else counts.supported += 1
  })

  return [
    {
      key: 'supported',
      label: 'Supported',
      count: counts.supported,
      definition: 'Grounding status SUPPORTED and not flagged by the verifier.',
    },
    {
      key: 'awaiting',
      label: 'Awaiting review',
      count: counts.awaiting,
      definition:
        'Quotation located, but flagged for a human: wording, location or a generator warning.',
    },
    {
      key: 'partial',
      label: 'Partially supported',
      count: counts.partial,
      definition: 'The source supports only part of the claim.',
    },
    {
      key: 'unsupported',
      label: 'Unsupported',
      count: counts.unsupported,
      definition: 'The source does not support the claim — confirmed, not merely pending.',
    },
  ]
}

export const FACT_FILTERS = [
  { key: 'all', label: 'All items' },
  { key: 'supported', label: 'Supported' },
  { key: 'review', label: 'Needs review' },
  { key: 'partial', label: 'Partially supported' },
  { key: 'unsupported', label: 'Unsupported' },
]

export function matchesFilter(item, filterKey) {
  const grounding = item.verified_grounding || item.reported_grounding
  switch (filterKey) {
    case 'supported':
      return grounding === 'SUPPORTED' && !item.needs_review
    case 'review':
      return Boolean(item.needs_review)
    case 'partial':
      return grounding === 'PARTIALLY_SUPPORTED'
    case 'unsupported':
      return grounding === 'UNSUPPORTED'
    default:
      return true
  }
}

/**
 * How far the automated checks actually got — deliberately conservative wording.
 * The backend never claims semantic entailment, so neither does the UI.
 */
export function semanticStatus(item) {
  const evidence = item.evidence || []
  if (evidence.length === 0) {
    return {
      code: 'no_evidence',
      text: 'No supporting quotation — cannot be checked against the source.',
      tone: 'unsupported',
    }
  }
  if (evidence.some((ev) => !ev.found)) {
    return {
      code: 'not_found',
      text: 'Quotation not found in source — the citation needs correction.',
      tone: 'unsupported',
    }
  }
  const status = (item.claim_check && item.claim_check.status) || ''
  if (status === 'strong') {
    return {
      code: 'matched',
      text: 'Evidence matched — semantic support not verified.',
      tone: 'supported',
    }
  }
  if (status === 'values_not_in_evidence') {
    return {
      code: 'values',
      text: 'Evidence matched, but a value in the claim is missing from it — human review required.',
      tone: 'partial',
    }
  }
  return {
    code: 'uncertain',
    text: 'Evidence matched — claim wording differs from the quotation; human review required.',
    tone: 'partial',
  }
}

/**
 * Locate a quotation inside the extracted source for highlighting.
 * Whitespace in the quote is treated flexibly (PDF extraction inserts line breaks),
 * but wording is never altered. Returns one entry per matching segment.
 */
export function locateQuote(segments, quote) {
  const list = Array.isArray(segments) ? segments : []
  const words = (quote || '').trim().split(/\s+/).filter(Boolean)
  if (!words.length) return []

  let pattern
  try {
    pattern = words.map(escapeRegExp).join('\\s+')
  } catch {
    return []
  }

  const exact = new RegExp(pattern)
  const insensitive = new RegExp(pattern, 'i')
  const matches = []

  list.forEach((segment, index) => {
    const text = segment.text || ''
    const match = exact.exec(text) || insensitive.exec(text)
    if (match && typeof match.index === 'number') {
      matches.push({
        segmentIndex: index,
        location: segment.location || null,
        before: text.slice(0, match.index),
        hit: match[0],
        after: text.slice(match.index + match[0].length),
      })
    }
  })

  return matches
}

/** Checklist item -> verification group it can be checked against automatically. */
const CHECKLIST_GROUPS = {
  'summary-evidence': ['summary'],
  'glossary-supported': ['glossary'],
  'questions-answerable': ['question'],
  'answers-supported': ['answer'],
  'unsupported-flagged': ['summary', 'glossary', 'question', 'answer'],
  'terminology-accurate': null, // manual comparison with the source
  'meaning-preserved': null, // manual reading
  'human-reviewed': null, // a person must do this
}

/**
 * Derived signal for one checklist row. Never marks anything as correct:
 * it only reports how many items in the related group still need verification.
 *   { kind: 'manual' }                              -> no automated signal exists
 *   { kind: 'auto', pending, total }                -> pending items still need review
 */
export function checklistSignal(itemId, verification) {
  if (!(itemId in CHECKLIST_GROUPS)) return { kind: 'manual' }
  const types = CHECKLIST_GROUPS[itemId]
  if (!types) return { kind: 'manual' }

  const items = ((verification && verification.items) || []).filter((item) =>
    types.includes(item.item_type)
  )
  if (items.length === 0) return { kind: 'manual' }
  return {
    kind: 'auto',
    pending: items.filter((item) => item.needs_review).length,
    total: items.length,
  }
}

/**
 * Practice progress — counting unit: ONE of the five generated questions.
 * Mutually exclusive buckets (a flagged question counts only as flagged):
 *   flagged   -> verifier flagged the question or its answer for review
 *   answered  -> answer revealed, not flagged
 *   remaining -> not revealed, not flagged
 */
export function practiceStats(materials, verification, revealedByIndex) {
  const questions = (materials && materials.questions) || []
  const index = buildVerificationIndex(materials, verification)

  const perQuestion = questions.map((question, i) => {
    const pair = index.questions[i] || {}
    const flagged = Boolean(
      (pair.question && pair.question.needs_review) || (pair.answer && pair.answer.needs_review)
    )
    const revealed = Boolean(revealedByIndex && revealedByIndex[i])
    return {
      index: i,
      number: question.number || i + 1,
      flagged,
      revealed,
      type: question.question_type,
    }
  })

  return {
    total: perQuestion.length,
    flagged: perQuestion.filter((q) => q.flagged).length,
    answered: perQuestion.filter((q) => q.revealed && !q.flagged).length,
    remaining: perQuestion.filter((q) => !q.revealed && !q.flagged).length,
    perQuestion,
    firstOf(kind) {
      const match = perQuestion.find((q) =>
        kind === 'flagged' ? q.flagged : kind === 'answered' ? q.revealed && !q.flagged : !q.revealed && !q.flagged
      )
      return match ? match.index : 0
    },
  }
}

/** Compact grounding counts used in headers and the context panel. */
export function groundingTotals(materials) {
  const summary = (materials && materials.summary) || []
  const glossary = (materials && materials.glossary) || []
  const questions = (materials && materials.questions) || []
  return {
    summary: summary.length,
    glossary: glossary.length,
    questions: questions.length,
    totalClaims: summary.length + glossary.length + questions.length * 2,
  }
}

/**
 * Flat, display-ready list of every generated claim for the Fact Check view.
 * Mirrors the backend's flatten order so verification entries line up.
 */
export function flattenForDisplay(materials, verification) {
  const index = buildVerificationIndex(materials, verification)
  const rows = []

  ;(materials.summary || []).forEach((point, i) => {
    rows.push({
      id: `summary-${i}`,
      kind: 'Summary',
      position: `${i + 1} of ${(materials.summary || []).length}`,
      content: point.point,
      reported: point.grounding,
      warning: point.warning,
      evidence: point.evidence || [],
      check: index.summary[i],
    })
  })

  ;(materials.glossary || []).forEach((entry, i) => {
    rows.push({
      id: `glossary-${i}`,
      kind: 'Glossary',
      position: entry.term,
      content: entry.definition
        ? `${entry.term}: ${entry.definition}`
        : `${entry.term}: Not supported by source`,
      reported: entry.grounding,
      warning: entry.warning,
      evidence: entry.evidence || [],
      check: index.glossary[i],
    })
  })

  ;(materials.questions || []).forEach((question, i) => {
    const pair = index.questions[i] || {}
    rows.push({
      id: `question-${i}`,
      kind: 'Question',
      position: `Question ${question.number || i + 1}`,
      content: question.question,
      reported: question.grounding,
      warning: question.warning || null,
      evidence: question.evidence || [],
      check: pair.question,
    })
    rows.push({
      id: `answer-${i}`,
      kind: 'Answer key',
      position: `Answer ${question.number || i + 1}`,
      content: question.answer || 'No supported answer could be given from the notes.',
      reported: question.answer_grounding,
      warning: question.warning || null,
      evidence: question.answer_evidence || [],
      check: pair.answer,
    })
  })

  return rows
}
