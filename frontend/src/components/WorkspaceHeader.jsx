/**
 * Workspace header: breadcrumb, page title, workflow sentence,
 * understated session status and the new-session action.
 */
export default function WorkspaceHeader({
  area,
  lede,
  status,
  statusKind = 'none',
  onNewSession,
  onTogglePanel,
  panelOpen,
  showPanelToggle,
  onOpenNav,
  navOpen,
}) {
  return (
    <header className="workspace-header">
      <div className="header-row">
        <div>
          <p className="breadcrumb">
            <button
              type="button"
              className="btn btn-quiet btn-sm nav-toggle"
              aria-expanded={Boolean(navOpen)}
              aria-controls="app-sidebar"
              onClick={onOpenNav}
              style={{ marginLeft: -8 }}
            >
              ☰ <span className="sr-only">Open navigation</span>
            </button>
            <span>Study desk</span>
            <span aria-hidden="true">/</span>
            <span>{area}</span>
          </p>
          <h1>Your study desk</h1>
          <p className="header-lede">{lede}</p>
        </div>

        <div className="header-actions">
          <span className={`session-status ${statusKind === 'none' ? '' : 'has-doc'}${statusKind === 'demo' ? ' demo' : ''}`}>
            <span className="dot" aria-hidden="true" />
            {status}
          </span>

          {showPanelToggle && (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              aria-pressed={panelOpen}
              onClick={onTogglePanel}
            >
              {panelOpen ? 'Hide source panel' : 'Show source panel'}
            </button>
          )}

          <button type="button" className="btn btn-secondary btn-sm" onClick={onNewSession}>
            New study session
          </button>
        </div>
      </div>
    </header>
  )
}
