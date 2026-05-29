const LANG_LABELS = {
  en: 'English', hi: 'Hindi', ta: 'Tamil', te: 'Telugu', kn: 'Kannada',
  ml: 'Malayalam', bn: 'Bengali', gu: 'Gujarati', mr: 'Marathi',
  pa: 'Punjabi', or: 'Odia', ur: 'Urdu'
}
const LANG_NATIVE = {
  hi: 'हिन्दी', ta: 'தமிழ்', te: 'తెలుగు', kn: 'ಕನ್ನಡ',
  ml: 'മലയാളം', bn: 'বাংলা', gu: 'ગુજરાતી', mr: 'मराठी',
  pa: 'ਪੰਜਾਬੀ', or: 'ଓଡ଼ିଆ', ur: 'اردو'
}

export function LanguagePill({ detected }) {
  if (!detected) return null
  const { code } = detected
  const native = LANG_NATIVE[code]
  const label = `${native ? native + ' ' : ''}${LANG_LABELS[code] || code}`

  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      background: 'rgba(134,188,37,0.10)',
      border: '1px solid rgba(134,188,37,0.25)',
      borderRadius: 'var(--radius-full)',
      padding: '3px 10px',
      fontSize: 11, color: 'var(--text-brand)',
      fontFamily: "'JetBrains Mono', monospace",
      cursor: 'pointer',
      animation: 'message-enter 400ms var(--ease-enter) both'
    }}>
      <span>auto</span>
      <span style={{ color: 'var(--text-muted)' }}>|</span>
      <span>{label}</span>
    </div>
  )
}
