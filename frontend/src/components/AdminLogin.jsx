import { useState, useRef, useEffect } from 'react'

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000'

function LockIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  )
}

export function AdminLogin({ onSuccess }) {
  const [password, setPassword] = useState('')
  const [error, setError]     = useState('')
  const [loading, setLoading] = useState(false)
  const [visible, setVisible] = useState(false)
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
        transition: 'opacity 300ms var(--ease-out-quart)',
      }}
    >
      {/* Subtle grid pattern */}
      <div aria-hidden="true" style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        backgroundImage: 'linear-gradient(rgba(1,52,122,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(1,52,122,0.08) 1px, transparent 1px)',
        backgroundSize: '48px 48px',
      }} />

      <div style={{
        position: 'relative',
        width: '100%',
        maxWidth: 380,
        padding: '0 24px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 0,
      }}>
        {/* Logo */}
        <div style={{ marginBottom: 36, textAlign: 'center' }}>
          <div style={{
            fontFamily: "'Syne', sans-serif",
            fontWeight: 800,
            fontSize: 28,
            letterSpacing: '-0.03em',
            lineHeight: 1,
            marginBottom: 8,
          }}>
            <span style={{ color: 'var(--green)' }}>V</span>
            <span style={{ color: 'var(--text-primary)' }}>AANI</span>
          </div>
          <div style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 10,
            letterSpacing: '0.22em',
            textTransform: 'uppercase',
            color: 'var(--text-muted)',
          }}>
            Admin Access
          </div>
        </div>

        {/* Card */}
        <form
          onSubmit={submit}
          style={{
            width: '100%',
            background: 'var(--bg-surface-1)',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-lg)',
            padding: '28px 24px',
            display: 'flex',
            flexDirection: 'column',
            gap: 20,
          }}
        >
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            color: 'var(--text-secondary)',
            fontSize: 13,
            fontFamily: "'Inter', sans-serif",
          }}>
            <LockIcon />
            <span>Enter admin password to configure Vaani</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <input
              ref={inputRef}
              type="password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError('') }}
              placeholder="Password"
              autoComplete="current-password"
              style={{
                width: '100%',
                padding: '11px 14px',
                background: 'rgba(1,10,26,0.6)',
                border: `1px solid ${error ? 'var(--error)' : 'var(--border-default)'}`,
                borderRadius: 'var(--radius-md)',
                color: 'var(--text-primary)',
                fontFamily: "'Inter', sans-serif",
                fontSize: 14,
                outline: 'none',
                boxSizing: 'border-box',
                transition: 'border-color 150ms',
              }}
              onFocus={(e) => {
                if (!error) e.target.style.borderColor = 'rgba(0,163,224,0.5)'
              }}
              onBlur={(e) => {
                if (!error) e.target.style.borderColor = 'var(--border-default)'
              }}
            />
            {error && (
              <span style={{
                fontFamily: "'Inter', sans-serif",
                fontSize: 12,
                color: 'var(--error)',
              }}>
                {error}
              </span>
            )}
          </div>

          <button
            type="submit"
            disabled={loading || !password.trim()}
            style={{
              width: '100%',
              padding: '11px 0',
              background: loading || !password.trim() ? 'rgba(134,188,37,0.25)' : 'var(--green)',
              border: 'none',
              borderRadius: 'var(--radius-md)',
              color: loading || !password.trim() ? 'rgba(134,188,37,0.5)' : '#010A1A',
              fontFamily: "'Inter', sans-serif",
              fontWeight: 600,
              fontSize: 14,
              cursor: loading || !password.trim() ? 'not-allowed' : 'pointer',
              transition: 'background 150ms, color 150ms',
              letterSpacing: '0.01em',
            }}
          >
            {loading ? 'Authenticating...' : 'Authenticate'}
          </button>
        </form>

        {/* Back link */}
        <button
          onClick={() => { window.location.hash = '' }}
          style={{
            marginTop: 20,
            background: 'none',
            border: 'none',
            color: 'var(--text-muted)',
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 10,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            cursor: 'pointer',
            padding: '4px 8px',
            transition: 'color 150ms',
          }}
          onMouseEnter={(e) => { e.target.style.color = 'var(--text-secondary)' }}
          onMouseLeave={(e) => { e.target.style.color = 'var(--text-muted)' }}
        >
          ← Back to Vaani
        </button>
      </div>
    </div>
  )
}
