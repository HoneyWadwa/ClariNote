const TONES = {
  SUPPORTED: { cls: 'badge-supported', glyph: '✓', label: 'Supported' },
  PARTIALLY_SUPPORTED: { cls: 'badge-partial', glyph: '◐', label: 'Partially supported' },
  UNSUPPORTED: { cls: 'badge-unsupported', glyph: '✕', label: 'Unsupported' },
}

export function toneFor(status) {
  if (status === 'SUPPORTED') return 'supported'
  if (status === 'PARTIALLY_SUPPORTED') return 'partial'
  return 'unsupported'
}

/**
 * Status is communicated by glyph + text, never by colour alone.
 * `status` is the verified grounding when available, otherwise the reported one.
 */
export default function GroundingBadge({ status, reported, title }) {
  const tone = TONES[status] || TONES.UNSUPPORTED
  const shownReported = reported && reported !== status ? `Generator reported: ${reported.replace(/_/g, ' ').toLowerCase()}.` : null
  return (
    <span className={`badge ${tone.cls}`} title={title || shownReported || undefined}>
      <span aria-hidden="true">{tone.glyph}</span>
      {tone.label}
    </span>
  )
}
