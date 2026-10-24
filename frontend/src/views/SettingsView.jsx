import { API_BASE } from '../api.js'

/**
 * Settings: a read-only view of the real backend configuration reported by
 * /api/health, plus the two session actions that actually do something.
 * No keys, no fake toggles, no account controls.
 */
export default function SettingsView({ health, healthError, onReload, onReset, busy }) {
  const rows = health
    ? [
        ['API base', API_BASE || 'same origin (Vite proxy → :5001)'],
        ['Service', health.service],
        ['AI generation', health.live_ai_configured ? `configured · ${health.model}` : 'not configured — demo mode'],
        ['Model', health.model],
        ['Allowed file types', (health.allowed_file_types || []).join(', ').toUpperCase()],
        ['Max file size', `${health.limits.max_file_mb} MB`],
        ['Max text length', `${health.limits.max_text_length.toLocaleString()} characters`],
      ]
    : []

  return (
    <>
      <section aria-labelledby="settings-heading">
        <div className="panel-head">
          <div>
            <p className="label">Configuration</p>
            <h2 id="settings-heading">Settings</h2>
          </div>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onReload} disabled={Boolean(busy)}>
            {busy === 'health' ? 'Checking…' : 'Reload backend status'}
          </button>
        </div>

        {healthError && (
          <div className="alert alert-error" role="alert">
            <strong>Backend unreachable.</strong>
            <p>{healthError}</p>
            <p style={{ marginTop: 8 }}>
              <button type="button" className="btn btn-secondary btn-sm" onClick={onReload}>
                Try again
              </button>
            </p>
          </div>
        )}

        <div className="panel">
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
            <caption className="sr-only">Backend configuration reported by the health endpoint</caption>
            <tbody>
              {rows.map(([key, value]) => (
                <tr key={key}>
                  <th
                    scope="row"
                    style={{
                      textAlign: 'left',
                      fontWeight: 600,
                      color: '#73766e',
                      padding: '7px 10px 7px 0',
                      borderBottom: '1px solid #e5e1d7',
                      width: '38%',
                    }}
                  >
                    {key}
                  </th>
                  <td
                    className="mono"
                    style={{ padding: '7px 0', borderBottom: '1px solid #e5e1d7', color: '#252922' }}
                  >
                    {value}
                  </td>
                </tr>
              ))}
              {!health && !healthError && (
                <tr>
                  <td colSpan={2} style={{ padding: '7px 0', color: '#73766e' }}>
                    Checking backend status…
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          <p className="help">
            The OpenAI key lives only in the backend environment (<span className="mono">OPENAI_API_KEY</span>
            ). The browser never receives it, and nothing you upload is stored.
          </p>
        </div>

        <div className="panel">
          <p className="label">Session</p>
          <h3 style={{ marginBottom: 6 }}>Start over</h3>
          <p className="help" style={{ marginTop: 0 }}>
            Clears your notes, extracted source, generated material, flashcard and practice progress
            and this checklist. It cannot be undone.
          </p>
          <button type="button" className="btn btn-secondary" onClick={onReset}>
            New study session
          </button>
        </div>

        <div className="panel">
          <p className="label">Endpoints</p>
          <ul className="stat-list" style={{ marginTop: 8 }}>
            <li>
              <span className="k">Health</span> <span className="v">GET /api/health</span>
            </li>
            <li>
              <span className="k">Sample notes</span> <span className="v">GET /api/sample</span>
            </li>
            <li>
              <span className="k">Extraction</span> <span className="v">POST /api/extract</span>
            </li>
            <li>
              <span className="k">Generation</span> <span className="v">POST /api/generate</span>
            </li>
            <li>
              <span className="k">Verification</span> <span className="v">POST /api/verify</span>
            </li>
          </ul>
        </div>
      </section>
    </>
  )
}
