/** Navigation items + icons for the study workspace. */

export const NAV_ITEMS = [
  { key: 'overview', label: 'Overview' },
  { key: 'notes', label: 'My Notes' },
  { key: 'materials', label: 'Study Materials' },
  { key: 'practice', label: 'Practice' },
  { key: 'factcheck', label: 'Fact Check' },
  { key: 'settings', label: 'Settings' },
]

function Icon({ name }) {
  const paths = {
    overview: <path d="M3 8.5 8 4l5 4.5V13a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8.5Z" />,
    notes: (
      <>
        <path d="M4 2.5h5.5L12 5v8.5H4v-11Z" />
        <path d="M9.5 2.5V5H12" />
        <path d="M5.8 8h4.4M5.8 10.3h4.4" />
      </>
    ),
    materials: (
      <>
        <path d="M3 3.6c1.9-.9 3.6-.9 5 0v9.2c-1.4-.9-3.1-.9-5 0V3.6Z" />
        <path d="M13 3.6c-1.9-.9-3.6-.9-5 0v9.2c1.4-.9 3.1-.9 5 0V3.6Z" />
      </>
    ),
    practice: (
      <>
        <path d="M3 8.6 6.4 12 13 4.8" />
        <path d="M2.6 13.4h10.8" />
      </>
    ),
    factcheck: (
      <>
        <circle cx="7.2" cy="7.2" r="3.9" />
        <path d="m10.2 10.2 3 3" />
        <path d="M5.6 7.4 6.8 8.6 9 6.2" />
      </>
    ),
    settings: (
      <>
        <circle cx="8" cy="8" r="2.1" />
        <path d="M8 2.4v1.7M8 11.9v1.7M2.4 8h1.7M11.9 8h1.7M4.1 4.1l1.2 1.2M10.7 10.7l1.2 1.2M11.9 4.1l-1.2 1.2M5.3 10.7l-1.2 1.2" />
      </>
    ),
  }
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  )
}

function BrandMark() {
  return (
    <svg
      className="brand-mark"
      width="26"
      height="26"
      viewBox="0 0 26 26"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 5.4c3.2-1.5 6.3-1.5 9 0v15c-2.7-1.5-5.8-1.5-9 0v-15Z" />
      <path d="M22 5.4c-3.2-1.5-6.3-1.5-9 0v15c2.7-1.5 5.8-1.5 9 0v-15Z" />
      <path d="M13 5.4v15" />
    </svg>
  )
}

/**
 * Primary navigation. On mobile it renders as a drawer controlled by `open`.
 * Every destination renders a real view (or a real empty state) — no dead links.
 */
export default function Sidebar({ active, onNavigate, open, onClose }) {
  const handleKey = (event) => {
    if (event.key === 'Escape' && open) onClose()
  }

  return (
    <>
      {open && (
        <button
          type="button"
          className="nav-backdrop"
          aria-label="Close navigation"
          onClick={onClose}
        />
      )}
      <nav
        className={`sidebar${open ? ' open' : ''}`}
        id="app-sidebar"
        aria-label="Workspace"
        onKeyDown={handleKey}
      >
        <div className="brand">
          <BrandMark />
          <div className="brand-name">
            LectureLens
            <span>Study workspace</span>
          </div>
        </div>

        <p className="label nav-group-label">Workspace</p>
        <ul className="nav-list">
          {NAV_ITEMS.map((item) => (
            <li key={item.key}>
              <button
                type="button"
                className="nav-link"
                aria-current={active === item.key ? 'page' : undefined}
                onClick={() => {
                  onNavigate(item.key)
                  onClose()
                }}
              >
                <Icon name={item.key} />
                {item.label}
              </button>
            </li>
          ))}
        </ul>

        <p className="sidebar-note">
          <svg
            width="14"
            height="14"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            aria-hidden="true"
          >
            <rect x="3.2" y="7" width="9.6" height="6.4" rx="1.2" />
            <path d="M5.6 7V5.2a2.4 2.4 0 0 1 4.8 0V7" />
          </svg>
          Your notes stay in your current session — uploads are processed in memory and never stored.
        </p>
      </nav>
    </>
  )
}
