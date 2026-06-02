import { useState, useRef, useEffect } from 'react'

/**
 * Full-screen overlay shown when a new (unrecognized) visitor is detected.
 * Collects name and optional role, then calls onSubmit({ name, role }).
 * Calls onSkip() if the user dismisses without entering a name.
 */
export function NameCollectionOverlay({ onSubmit, onSkip }) {
  const [name, setName] = useState('')
  const [role, setRole] = useState('')
  const nameRef = useRef(null)

  useEffect(() => {
    nameRef.current?.focus()
  }, [])

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onSkip() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onSkip])

  function handleSubmit(e) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    onSubmit({ name: trimmed, role: role.trim() || null })
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Welcome — tell us your name"
      aria-describedby="name-overlay-desc"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 'var(--z-modal)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(1, 13, 32, 0.85)',
        backdropFilter: 'blur(8px)',
      }}
    >
      <div
        style={{
          background: 'rgba(1, 33, 105, 0.9)',
          border: '1px solid rgba(134, 188, 37, 0.3)',
          borderRadius: 16,
          padding: '40px 48px',
          width: 'min(480px, 90vw)',
          boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
          display: 'flex',
          flexDirection: 'column',
          gap: 24,
        }}
      >
        {/* Deloitte green accent */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: '#86BC25',
            }}
          >
            Vaani · Memory
          </span>
          <h2
            style={{
              margin: 0,
              fontSize: 22,
              fontWeight: 600,
              color: '#FFFFFF',
              lineHeight: 1.3,
            }}
          >
            Welcome. I don&apos;t think we&apos;ve met.
          </h2>
          <p id="name-overlay-desc" style={{ margin: 0, fontSize: 14, color: 'rgba(255,255,255,0.6)', lineHeight: 1.6 }}>
            Tell me your name and I&apos;ll remember our conversations for next time.
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              Name *
            </span>
            <input
              ref={nameRef}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Rishi Bagri"
              required
              style={inputStyle}
            />
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              Role <span style={{ fontWeight: 400, opacity: 0.6 }}>(optional)</span>
            </span>
            <input
              type="text"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder="e.g. Senior Manager, Deloitte"
              style={inputStyle}
            />
          </label>

          <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
            <button type="submit" disabled={!name.trim()} style={primaryBtnStyle}>
              Continue
            </button>
            <button type="button" onClick={onSkip} style={ghostBtnStyle}>
              Skip
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

const inputStyle = {
  background: 'rgba(255,255,255,0.07)',
  border: '1px solid rgba(255,255,255,0.15)',
  borderRadius: 8,
  padding: '10px 14px',
  fontSize: 15,
  color: '#FFFFFF',
  outline: 'none',
  transition: 'border-color 0.15s',
  width: '100%',
  boxSizing: 'border-box',
}

const primaryBtnStyle = {
  flex: 1,
  padding: '11px 0',
  background: '#86BC25',
  color: '#012169',
  fontWeight: 700,
  fontSize: 14,
  border: 'none',
  borderRadius: 8,
  cursor: 'pointer',
  letterSpacing: '0.04em',
  transition: 'opacity 0.15s',
}

const ghostBtnStyle = {
  padding: '11px 20px',
  background: 'transparent',
  color: 'rgba(255,255,255,0.5)',
  fontWeight: 500,
  fontSize: 14,
  border: '1px solid rgba(255,255,255,0.15)',
  borderRadius: 8,
  cursor: 'pointer',
}
