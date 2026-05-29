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
      position: 'fixed', bottom: 52, left: '50%', transform: 'translateX(-50%)',
      zIndex: 200, display: 'flex', flexDirection: 'column', gap: 8,
      alignItems: 'center'
    }}>
      {toasts.map(t => (
        <div key={t.id} style={{
          background: t.type === 'error' ? 'rgba(217,59,59,0.10)' : 'var(--bg-surface-2)',
          border: `1px solid ${t.type === 'error' ? 'rgba(217,59,59,0.30)' : 'var(--border-default)'}`,
          borderRadius: 'var(--radius-lg)',
          padding: '10px 18px',
          color: t.type === 'error' ? '#F09090' : 'var(--text-secondary)',
          fontSize: 13,
          boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
          animation: 'toast-enter 200ms var(--ease-enter)',
          maxWidth: 340, textAlign: 'center', whiteSpace: 'pre-wrap'
        }}>
          {t.message}
        </div>
      ))}
    </div>
  )
}
