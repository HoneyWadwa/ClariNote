/** Plain-text helpers used by the intake, preview and context panels. */

export function charCount(text) {
  return text ? text.length : 0
}

export function wordCount(text) {
  const trimmed = (text || '').trim()
  return trimmed ? trimmed.split(/\s+/).length : 0
}

export function sentenceCount(text) {
  const matches = (text || '').match(/[^.!?]+[.!?]+/g)
  return matches ? matches.length : 0
}

export function truncate(text, max = 90) {
  const value = (text || '').replace(/\s+/g, ' ').trim()
  if (value.length <= max) return value
  return `${value.slice(0, max - 1)}…`
}

export function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
