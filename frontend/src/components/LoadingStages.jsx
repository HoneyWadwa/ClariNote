/**
 * Staged loading list. Each stage advances only when the request that owns it
 * has actually returned — no fake progress, no percentages.
 *
 * stages: [{ key, label, sub?, status: 'pending' | 'active' | 'done' | 'failed' }]
 */
export default function LoadingStages({ stages }) {
  if (!stages || stages.length === 0) return null
  return (
    <ol className="stages" aria-live="polite">
      {stages.map((stage, index) => {
        const marker =
          stage.status === 'active' ? (
            <span className="spinner" aria-hidden="true" />
          ) : stage.status === 'done' ? (
            <span aria-hidden="true">✓</span>
          ) : stage.status === 'failed' ? (
            <span aria-hidden="true">!</span>
          ) : (
            <span aria-hidden="true">{index + 1}</span>
          )
        const srText =
          stage.status === 'active'
            ? 'in progress'
            : stage.status === 'done'
              ? 'completed'
              : stage.status === 'failed'
                ? 'failed'
                : 'waiting'
        return (
          <li key={stage.key} className={`stage ${stage.status}`}>
            <span className="marker">{marker}</span>
            <span>
              {stage.label} <span className="sr-only">— {srText}</span>
              {stage.sub && <span className="sub">{stage.sub}</span>}
            </span>
          </li>
        )
      })}
    </ol>
  )
}
