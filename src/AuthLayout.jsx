import './AuthLayout.css'

const BRICKS = [
  { w: 60,  c: 'var(--size-small)' },
  { w: 90,  c: 'var(--green)' },
  { w: 50,  c: 'var(--size-medium)' },
  { w: 120, c: 'var(--size-large)' },
  { w: 70,  c: 'var(--size-giant)' },
  { w: 100, c: 'var(--green)' },
  { w: 55,  c: 'var(--size-small)' },
  { w: 85,  c: 'var(--size-medium)' },
  { w: 65,  c: 'var(--size-large)' },
  { w: 110, c: 'var(--green)' },
  { w: 75,  c: 'var(--size-giant)' },
  { w: 95,  c: 'var(--size-small)' },
  { w: 60,  c: 'var(--size-medium)' },
  { w: 130, c: 'var(--green)' },
]

function AuthLayout({ children }) {
  return (
    <div className="auth-shell">
      <div className="blueprint-panel">
        <div className="brand-mark">
          <span className="wordmark">Blocks</span>
          <span className="motto">Preserving Your Future</span>
        </div>

        <div className="brick-wall" aria-hidden="true">
          {BRICKS.map((b, i) => (
            <div
              key={i}
              className="brick block-3d"
              style={{
                width: `${b.w}px`,
                '--block-color': b.c,
                '--shine-delay': `${i * 0.25}s`,
              }}
            />
          ))}
        </div>
      </div>

      <div className="form-panel">
        <div className="form-card">{children}</div>
      </div>
    </div>
  )
}

export default AuthLayout