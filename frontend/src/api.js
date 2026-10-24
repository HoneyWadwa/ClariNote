/**
 * Small API service module for the LectureLens Flask backend.
 *
 * - Base URL comes from VITE_API_BASE (empty by default: same-origin Vite proxy).
 * - Every request has a timeout so a hung backend surfaces as a clear error.
 * - Errors are normalised into `Error` objects with `code`, `status`, `details`.
 * - No API keys ever reach this module; the browser only talks to our own backend.
 */

export const API_BASE = (import.meta.env.VITE_API_BASE || '').replace(/\/$/, '')

const DEFAULT_TIMEOUT_MS = 120000

async function request(path, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  let response
  try {
    response = await fetch(`${API_BASE}${path}`, { ...options, signal: controller.signal })
  } catch (cause) {
    if (cause && cause.name === 'AbortError') {
      const timeoutError = new Error(
        `The request timed out after ${Math.round(timeoutMs / 1000)}s. Your notes are still here — try again.`
      )
      timeoutError.code = 'timeout'
      timeoutError.status = 0
      throw timeoutError
    }
    const error = new Error(
      'Could not reach the backend. Make sure the Flask API is running on port 5001.'
    )
    error.code = 'network_error'
    error.status = 0
    throw error
  } finally {
    clearTimeout(timer)
  }

  let payload = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }

  if (!response.ok) {
    const errorPayload = payload && payload.error ? payload.error : {}
    const error = new Error(
      errorPayload.message || `Request failed with status ${response.status}.`
    )
    error.code = errorPayload.code || 'request_failed'
    error.details = errorPayload.details || []
    error.status = response.status
    throw error
  }
  return payload
}

export function getHealth() {
  return request('/api/health', {}, 8000)
}

/** Bundled sample lecture notes (input fixture, never presented as generated output). */
export function getSample() {
  return request('/api/sample', {}, 8000)
}

export function extractText(text) {
  return request('/api/extract', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  })
}

export function extractFile(file) {
  const form = new FormData()
  form.append('file', file)
  return request('/api/extract', { method: 'POST', body: form })
}

export function generate(text, segments) {
  return request('/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, segments: segments || null }),
  })
}

export function verify(sourceText, segments, materials) {
  return request('/api/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      source_text: sourceText,
      segments: segments || null,
      materials,
    }),
  })
}

export function formatBytes(bytes) {
  if (typeof bytes !== 'number') return 'unknown size'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}
