import { useState, useCallback, useEffect } from 'react'

let _addToast = null
export function toast(message, type = 'info', duration = 4000) {
  if (_addToast) _addToast(message, type, duration)
}

export function ToastContainer() {
  const [toasts, setToasts] = useState([])

  const add = useCallback((message, type, duration) => {
    const id = Date.now()
    setToasts(prev => [...prev.slice(-1), { id, message, type }])
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, duration)
  }, [])

  useEffect(() => {
    _addToast = add
    return () => { _addToast = null }
  }, [add])

  return (
    <div style={{
      position: 'fixed',
      bottom: 56,
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 'var(--z-toast)',
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
      alignItems: 'center',
      pointerEvents: 'none',
    }}>
      {toasts.map(t => (
        <div key={t.id} style={{
          background: t.type === 'error' ? 'rgba(217,59,59,0.12)' : 'rgba(1,52,122,0.92)',
          border: `1px solid ${t.type === 'error' ? 'rgba(217,59,59,0.32)' : 'var(--border-default)'}`,
          borderRadius: 'var(--radius-lg)',
          padding: '10px 20px',
          color: t.type === 'error' ? '#F09090' : 'var(--text-secondary)',
          fontSize: 13,
          fontFamily: "'Inter', sans-serif",
          fontWeight: 400,
          boxShadow: '0 8px 32px rgba(0,0,0,0.55)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          animation: 'toast-in 200ms var(--ease-out-quart)',
          maxWidth: 340,
          textAlign: 'center',
          whiteSpace: 'pre-wrap',
        }}>
          {t.message}
        </div>
      ))}
    </div>
  )
}
