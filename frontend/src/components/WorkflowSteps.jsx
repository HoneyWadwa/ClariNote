const STEPS = [
  { num: '01', title: 'Add your notes', detail: 'Paste approved text or drop in a TXT, PDF or DOCX file.' },
  { num: '02', title: 'Build your study set', detail: 'Summary, glossary and five questions, each with evidence.' },
  { num: '03', title: 'Review the evidence', detail: 'Check every claim against the source before you revise.' },
]

/** The three-step workflow, shown under the home heading. */
export default function WorkflowSteps() {
  return (
    <ol className="workflow" aria-label="How it works">
      {STEPS.map((step) => (
        <li className="workflow-step" key={step.num}>
          <span className="num" aria-hidden="true">
            {step.num}
          </span>
          <span className="txt">
            {step.title}
            <small>{step.detail}</small>
          </span>
        </li>
      ))}
    </ol>
  )
}
