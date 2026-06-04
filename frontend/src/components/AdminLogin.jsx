import { useState, useRef, useEffect } from 'react'

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000'

function LockIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  )
}

function ShieldIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  )
}

export function AdminLogin({ onSuccess }) {
  const [password, setPassword] = useState('')
  const [error, setError]     = useState('')
  const [loading, setLoading] = useState(false)
  const [visible, setVisible] = useState(false)
  const [focused, setFocused] = useState(false)
  const inputRef = useRef(null)

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 60)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    if (visible) inputRef.current?.focus()
  }, [visible])

  const submit = async (e) => {
    e?.preventDefault()
    if (!password.trim()) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`${BACKEND_URL}/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      if (!res.ok) {
        setError('Incorrect password')
        setPassword('')
        inputRef.current?.focus()
        return
      }
      const { token } = await res.json()
      sessionStorage.setItem('vaani_admin_token', token)
      onSuccess(token)
    } catch {
      setError('Connection error — is the backend running?')
    } finally {
      setLoading(false)
    }
  }

  const disabled = loading || !password.trim()

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 'var(--z-boot)',
        background: 'var(--bg-base)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: visible ? 1 : 0,
        transition: 'opacity 360ms var(--ease-out-quart)',
        overflow: 'hidden',
      }}
    >
      {/* Ambient brand glow */}
      <div aria-hidden="true" style={{
        position: 'absolute', top: '-22%', left: '50%', transform: 'translateX(-50%)',
        width: 760, height: 760, pointerEvents: 'none',
        background: 'radial-gradient(circle at 50% 50%, rgba(134,188,37,0.10), rgba(134,188,37,0.02) 42%, transparent 68%)',
        filter: 'blur(8px)',
      }} />
      {/* Engineering grid */}
      <div aria-hidden="true" style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        backgroundImage: 'linear-gradient(rgba(134,188,37,0.045) 1px, transparent 1px), linear-gradient(90deg, rgba(134,188,37,0.045) 1px, transparent 1px)',
        backgroundSize: '54px 54px',
        maskImage: 'radial-gradient(ellipse 70% 55% at 50% 42%, #000 30%, transparent 78%)',
        WebkitMaskImage: 'radial-gradient(ellipse 70% 55% at 50% 42%, #000 30%, transparent 78%)',
      }} />

      <div style={{
        position: 'relative',
        width: '100%',
        maxWidth: 408,
        padding: '0 24px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        transform: visible ? 'translateY(0)' : 'translateY(8px)',
        transition: 'transform 520ms var(--ease-out-quart)',
      }}>
        {/* Brand lockup */}
        <div style={{ marginBottom: 30, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 52, height: 52, borderRadius: 14,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--green)',
            background: 'linear-gradient(160deg, rgba(134,188,37,0.16), rgba(134,188,37,0.04))',
            border: '1px solid rgba(134,188,37,0.28)',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.10), 0 8px 28px rgba(134,188,37,0.10)',
          }}>
            <ShieldIcon />
          </div>
          <div>
            <div style={{
              fontFamily: "'Syne', sans-serif",
              fontWeight: 800,
              fontSize: 30,
              letterSpacing: '-0.03em',
              lineHeight: 1,
              marginBottom: 9,
            }}>
              <span style={{ color: 'var(--green)' }}>V</span>
              <span style={{ color: 'var(--text-primary)' }}>AANI</span>
            </div>
            <div style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 10,
              letterSpacing: '0.28em',
              textTransform: 'uppercase',
              color: 'var(--text-muted)',
            }}>
              Admin Control Plane
            </div>
          </div>
        </div>

        {/* Card — double-bezel glass */}
        <div style={{
          width: '100%',
          background: 'rgba(134,188,37,0.025)',
          border: '1px solid rgba(134,188,37,0.10)',
          borderRadius: 18,
          padding: 6,
          boxShadow: '0 24px 70px rgba(0,0,0,0.55)',
        }}>
          <form
            onSubmit={submit}
            style={{
              width: '100%',
              boxSizing: 'border-box',
              background: 'linear-gradient(180deg, rgba(20,20,20,0.92), rgba(13,13,13,0.92))',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: 13,
              padding: '26px 24px',
              display: 'flex',
              flexDirection: 'column',
              gap: 18,
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)',
            }}
          >
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 9,
              color: 'var(--text-secondary)',
              fontSize: 13,
              fontFamily: "'Inter', sans-serif",
              lineHeight: 1.4,
            }}>
              <span style={{ color: 'var(--green)', flexShrink: 0 }}><LockIcon /></span>
              <span>Authenticate to manage avatars, models, and enrolled users.</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              <label htmlFor="admin_pw" style={{
                fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
                letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--text-muted)',
              }}>
                Admin Password
              </label>
              <input
                id="admin_pw"
                ref={inputRef}
                type="password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError('') }}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                placeholder="••••••••••••"
                autoComplete="current-password"
                style={{
                  width: '100%',
                  padding: '12px 14px',
                  background: 'rgba(0,0,0,0.45)',
                  border: `1px solid ${error ? 'var(--error)' : focused ? 'rgba(134,188,37,0.55)' : 'rgba(255,255,255,0.08)'}`,
                  borderRadius: 'var(--radius-md)',
                  color: 'var(--text-primary)',
                  fontFamily: "'Inter', sans-serif",
                  fontSize: 14,
                  letterSpacing: '0.02em',
                  outline: 'none',
                  boxSizing: 'border-box',
                  boxShadow: focused && !error ? '0 0 0 3px rgba(134,188,37,0.10)' : 'none',
                  transition: 'border-color 160ms var(--ease-out-quart), box-shadow 160ms var(--ease-out-quart)',
                }}
              />
              {error && (
                <span style={{
                  fontFamily: "'Inter', sans-serif",
                  fontSize: 12,
                  color: 'var(--error)',
                  display: 'flex', alignItems: 'center', gap: 6,
                }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                  {error}
                </span>
              )}
            </div>

            <button
              type="submit"
              disabled={disabled}
              style={{
                width: '100%',
                padding: '12px 0',
                background: disabled ? 'rgba(134,188,37,0.20)' : 'var(--green)',
                border: 'none',
                borderRadius: 'var(--radius-md)',
                color: disabled ? 'rgba(255,255,255,0.45)' : '#0A0F03',
                fontFamily: "'Inter', sans-serif",
                fontWeight: 600,
                fontSize: 14,
                cursor: disabled ? 'not-allowed' : 'pointer',
                transition: 'background 160ms var(--ease-out-quart), transform 120ms var(--ease-out-quart)',
                letterSpacing: '0.01em',
                boxShadow: disabled ? 'none' : '0 8px 22px rgba(134,188,37,0.18)',
              }}
              onMouseDown={(e) => { if (!disabled) e.currentTarget.style.transform = 'scale(0.985)' }}
              onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1)' }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)' }}
            >
              {loading ? 'Authenticating…' : 'Authenticate'}
            </button>
          </form>
        </div>

        {/* Status / back row */}
        <div style={{
          marginTop: 18, width: '100%',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span style={{
            display: 'flex', alignItems: 'center', gap: 7,
            fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
            letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)',
          }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green)', animation: 'dot-pulse 1600ms ease-in-out infinite' }} />
            Encrypted session
          </span>

          <button
            onClick={() => { window.location.hash = '' }}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 10,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              cursor: 'pointer',
              padding: '4px 6px',
              transition: 'color 150ms',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text-secondary)' }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)' }}
          >
            ← Back to Vaani
          </button>
        </div>
      </div>
    </div>
  )
}
