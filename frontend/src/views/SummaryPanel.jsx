import GroundingBadge, { toneFor } from '../components/GroundingBadge.jsx'
import EvidencePassage from '../components/EvidencePassage.jsx'
import EmptyState from '../components/EmptyState.jsx'
import { ReviewBlock, VerifiedNote } from '../components/VerificationNotes.jsx'

/** Summary tab: each point as a readable block with grounding and evidence. */
export default function SummaryPanel({ materials, index, onOpenSource }) {
  const points = materials.summary || []

  if (points.length === 0) {
    return <EmptyState title="No summary points">The generator returned an empty summary.</EmptyState>
  }

  return (
    <ul className="item-list">
      {points.map((point, i) => {
        const check = index.summary[i]
        const status = (check && check.verified_grounding) || point.grounding
        return (
          <li className={`item tone-${toneFor(status)}`} key={point.point + i}>
            <div className="item-head">
              <span className="item-kind">Summary point {i + 1}</span>
              <GroundingBadge status={status} reported={point.grounding} />
              {(point.evidence || []).length > 0 && (
                <button
                  type="button"
                  className="btn btn-quiet btn-sm"
                  onClick={() =>
                    onOpenSource({
                      quote: point.evidence[0].quote,
                      location: point.evidence[0].location,
                    })
                  }
                >
                  View source
                </button>
              )}
            </div>

            <p className="item-text">{point.point}</p>

            {point.warning && <p className="warning-note">⚠ {point.warning}</p>}

            <EvidencePassage
              evidence={point.evidence}
              verification={check}
              label="Evidence"
              onOpenSource={onOpenSource}
            />
            <VerifiedNote check={check} />
            <ReviewBlock check={check} />
          </li>
        )
      })}
    </ul>
  )
}
