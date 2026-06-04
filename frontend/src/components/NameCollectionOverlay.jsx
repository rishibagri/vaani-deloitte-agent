import { useState, useRef, useEffect } from 'react'

/**
 * Full-screen overlay shown when a new (unrecognized) visitor is detected.
 * Collects name and optional role, then calls onSubmit({ name, role }).
 * Calls onSkip() if the user dismisses without entering a name.
 *
 * Designed as a premium concierge moment: cinematic enter, refined glass panel,
 * a brand ring mark that echoes the boot sequence. Honors prefers-reduced-motion.
 */

const prefersReduced =
  typeof window !== 'undefined' &&
  window.matchMedia &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

export function NameCollectionOverlay({ onSubmit, onSkip }) {
  const [name, setName] = useState('')
  const [role, setRole] = useState('')
  const [mounted, setMounted] = useState(false)
  const [focused, setFocused] = useState(null) // 'name' | 'role' | null
  const nameRef = useRef(null)

  useEffect(() => {
    // Trigger enter transition on next frame for a clean cinematic reveal.
    const id = requestAnimationFrame(() => setMounted(true))
    const fid = setTimeout(() => nameRef.current?.focus(), prefersReduced ? 0 : 420)
    return () => { cancelAnimationFrame(id); clearTimeout(fid) }
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

  const canSubmit = !!name.trim()

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
        padding: 24,
        boxSizing: 'border-box',
        background:
          'radial-gradient(110% 80% at 50% 30%, rgba(11,16,22,0.86) 0%, rgba(3,6,10,0.92) 100%)',
        backdropFilter: 'blur(14px) saturate(120%)',
        WebkitBackdropFilter: 'blur(14px) saturate(120%)',
        opacity: mounted ? 1 : 0,
        transition: 'opacity 360ms cubic-bezier(0.16,1,0.3,1)',
      }}
    >
      {/* Outer shell — machined tray holding the glass core (double-bezel) */}
      <div
        style={{
          position: 'relative',
          padding: 6,
          borderRadius: 24,
          background:
            'linear-gradient(160deg, rgba(134,188,37,0.10), rgba(255,255,255,0.02) 40%)',
          border: '1px solid rgba(134,188,37,0.14)',
          boxShadow: '0 40px 120px rgba(0,0,0,0.6)',
          width: 'min(460px, 100%)',
          transform: mounted
            ? 'translateY(0) scale(1)'
            : prefersReduced ? 'none' : 'translateY(18px) scale(0.97)',
          opacity: mounted ? 1 : 0,
          filter: mounted ? 'blur(0)' : prefersReduced ? 'none' : 'blur(8px)',
          transition:
            'transform 560ms cubic-bezier(0.16,1,0.3,1), opacity 480ms ease-out, filter 560ms ease-out',
        }}
      >
        {/* Inner core */}
        <div
          style={{
            borderRadius: 18,
            padding: '38px 40px 34px',
            background:
              'linear-gradient(180deg, rgba(20,20,20,0.72), rgba(8,11,15,0.82))',
            border: '1px solid rgba(255,255,255,0.06)',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)',
            display: 'flex',
            flexDirection: 'column',
            gap: 26,
          }}
        >
          {/* Brand mark + eyebrow */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <svg width="34" height="34" viewBox="0 0 34 34" fill="none" aria-hidden="true">
                <circle cx="17" cy="17" r="16" stroke="rgba(134,188,37,0.2)" strokeWidth="1" />
                <circle cx="17" cy="17" r="3" fill="#86BC25" style={{ filter: 'drop-shadow(0 0 6px rgba(134,188,37,0.6))' }} />
              </svg>
              <span
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 9.5,
                  fontWeight: 500,
                  letterSpacing: '0.34em',
                  textTransform: 'uppercase',
                  color: 'rgba(168,192,112,0.85)',
                  paddingLeft: '0.34em',
                }}
              >
                Vaani&nbsp;&nbsp;Memory
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <h2
                style={{
                  margin: 0,
                  fontFamily: "'Syne', 'Plus Jakarta Sans', sans-serif",
                  fontSize: 27,
                  fontWeight: 700,
                  color: '#F0F0F0',
                  lineHeight: 1.18,
                  letterSpacing: '-0.01em',
                }}
              >
                Before we begin.
              </h2>
              <p
                id="name-overlay-desc"
                style={{
                  margin: 0,
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                  fontSize: 14.5,
                  color: 'rgba(240,240,240,0.6)',
                  lineHeight: 1.6,
                  maxWidth: '34ch',
                }}
              >
                Share your name and I&apos;ll remember our conversations the next time you visit.
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <Field
              label="Name"
              required
              inputRef={nameRef}
              value={name}
              onChange={setName}
              placeholder="e.g. Ananya Krishnan"
              focused={focused === 'name'}
              onFocus={() => setFocused('name')}
              onBlur={() => setFocused(null)}
            />

            <Field
              label="Role"
              optional
              value={role}
              onChange={setRole}
              placeholder="e.g. Senior Manager, Deloitte"
              focused={focused === 'role'}
              onFocus={() => setFocused('role')}
              onBlur={() => setFocused(null)}
            />

            <div style={{ display: 'flex', gap: 12, marginTop: 6, alignItems: 'center' }}>
              <button
                type="submit"
                disabled={!canSubmit}
                style={{
                  flex: 1,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 10,
                  padding: '13px 18px',
                  background: canSubmit ? '#86BC25' : 'rgba(134,188,37,0.18)',
                  color: canSubmit ? '#03060a' : 'rgba(240,240,240,0.4)',
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                  fontWeight: 600,
                  fontSize: 14.5,
                  border: 'none',
                  borderRadius: 9999,
                  cursor: canSubmit ? 'pointer' : 'not-allowed',
                  letterSpacing: '0.01em',
                  boxShadow: canSubmit ? '0 8px 28px rgba(134,188,37,0.32)' : 'none',
                  transition:
                    'background 220ms ease-out, color 220ms ease-out, transform 180ms cubic-bezier(0.16,1,0.3,1), box-shadow 220ms ease-out',
                }}
                onMouseDown={(e) => { if (canSubmit) e.currentTarget.style.transform = 'scale(0.98)' }}
                onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1)' }}
                onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)' }}
              >
                Continue
                <span
                  aria-hidden="true"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 22,
                    height: 22,
                    borderRadius: 9999,
                    background: canSubmit ? 'rgba(3,6,10,0.16)' : 'transparent',
                  }}
                >
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                    <path d="M2 6.5h9M7 2.5l4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
              </button>

              <button
                type="button"
                onClick={onSkip}
                style={{
                  padding: '13px 22px',
                  background: 'transparent',
                  color: 'rgba(240,240,240,0.55)',
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                  fontWeight: 500,
                  fontSize: 14,
                  border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: 9999,
                  cursor: 'pointer',
                  transition: 'color 180ms ease-out, border-color 180ms ease-out',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = 'rgba(240,240,240,0.85)'
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.24)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = 'rgba(240,240,240,0.55)'
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'
                }}
              >
                Skip
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

function Field({ label, required, optional, inputRef, value, onChange, placeholder, focused, onFocus, onBlur }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <span
        style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 9.5,
          fontWeight: 500,
          color: focused ? 'rgba(168,192,112,0.95)' : 'rgba(240,240,240,0.45)',
          letterSpacing: '0.22em',
          textTransform: 'uppercase',
          transition: 'color 180ms ease-out',
        }}
      >
        {label}
        {required && <span style={{ color: '#86BC25', marginLeft: 5 }}>*</span>}
        {optional && <span style={{ fontWeight: 400, opacity: 0.55, marginLeft: 6, letterSpacing: '0.16em' }}>optional</span>}
      </span>
      <style>{`.vaani-concierge-input::placeholder{color:rgba(240,240,240,0.32);}`}</style>
      <input
        ref={inputRef}
        className="vaani-concierge-input"
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={onFocus}
        onBlur={onBlur}
        placeholder={placeholder}
        required={required}
        style={{
          background: 'rgba(255,255,255,0.045)',
          border: `1px solid ${focused ? 'rgba(134,188,37,0.55)' : 'rgba(255,255,255,0.1)'}`,
          borderRadius: 12,
          padding: '12px 15px',
          fontFamily: "'Plus Jakarta Sans', sans-serif",
          fontSize: 15,
          color: '#F0F0F0',
          outline: 'none',
          width: '100%',
          boxSizing: 'border-box',
          boxShadow: focused ? '0 0 0 4px rgba(134,188,37,0.12)' : 'none',
          transition: 'border-color 200ms ease-out, box-shadow 200ms ease-out, background 200ms ease-out',
        }}
      />
    </label>
  )
}
