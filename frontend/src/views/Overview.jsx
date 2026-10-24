import Intake from '../components/Intake.jsx'
import SourcePreview from '../components/SourcePreview.jsx'
import WorkflowSteps from '../components/WorkflowSteps.jsx'
import LoadingStages from '../components/LoadingStages.jsx'
import ErrorState from '../components/ErrorState.jsx'
import EvidenceCoverage from '../components/EvidenceCoverage.jsx'
import PracticeProgress from '../components/PracticeProgress.jsx'

/**
 * Home: heading, three-step workflow, document intake, source preview,
 * truthful loading stages and the real-data charts.
 */
export default function Overview({
  intakeMode,
  onIntakeMode,
  notes,
  onNotesChange,
  onLoadSample,
  onClear,
  onFileChosen,
  fileMeta,
  extractInfo,
  limits,
  intakeError,
  generationError,
  stages,
  busy,
  onCreate,
  onRetry,
  onInspect,
  verification,
  onCoverageSelect,
  activeCoverageFilter,
  practiceStats,
  onPracticeJump,
}) {
  const maxText = (limits && limits.max_text_length) || 60000
  const canCreate = notes.trim().length > 0 && notes.length <= maxText && !busy

  return (
    <>
      <section className="hero" aria-labelledby="hero-heading">
        <p className="label label-accent">Lecture notes → study set</p>
        <h2 id="hero-heading">Make your lecture notes work harder.</h2>
        <p>
          Turn approved course material into clear notes, useful questions, and evidence you can
          verify.
        </p>
        <WorkflowSteps />
      </section>

      <section aria-labelledby="intake-heading">
        <div className="panel-head">
          <div>
            <p className="label">Step 01 — source</p>
            <h2 id="intake-heading">Add your notes</h2>
          </div>
        </div>

        <Intake
          mode={intakeMode}
          onModeChange={onIntakeMode}
          notes={notes}
          onNotesChange={onNotesChange}
          onClear={onClear}
          onLoadSample={onLoadSample}
          onFileChosen={onFileChosen}
          limits={limits}
          error={intakeError}
          busy={busy}
        />

        <SourcePreview
          fileMeta={fileMeta}
          extractInfo={extractInfo}
          notes={notes}
          onInspect={onInspect}
        />

        {generationError && (
          <div style={{ marginTop: 14 }}>
            <ErrorState
              title="Could not create study materials"
              error={generationError}
              onRetry={onRetry}
              retryLabel="Try again"
            />
          </div>
        )}

        <div className="intake-actions">
          <button type="button" className="btn btn-primary" onClick={onCreate} disabled={!canCreate}>
            {busy ? 'Working…' : 'Create study materials'}
          </button>
          <p className="help" style={{ margin: 0 }}>
            {busy
              ? 'Your notes are being processed — this panel updates when each step actually finishes.'
              : 'Uses only your notes. Every generated item is checked against the source afterwards.'}
          </p>
        </div>

        <LoadingStages stages={stages} />
      </section>

      <section className="rule-section" aria-labelledby="charts-heading">
        <div className="panel-head">
          <div>
            <p className="label">This session</p>
            <h2 id="charts-heading">Grounding & progress</h2>
          </div>
        </div>
        <div className="chart-grid" style={{ marginTop: 0 }}>
          <EvidenceCoverage
            verification={verification}
            onSelect={onCoverageSelect}
            activeFilter={activeCoverageFilter}
          />
          <PracticeProgress stats={practiceStats} onSelect={onPracticeJump} />
        </div>
      </section>
    </>
  )
}
