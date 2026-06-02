import { useState, useEffect, useRef, useCallback } from 'react'

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000'

const VOICES = [
  { id: 'Puck',    label: 'Puck',    desc: 'Lively, expressive'    },
  { id: 'Charon',  label: 'Charon',  desc: 'Deep, authoritative'   },
  { id: 'Kore',    label: 'Kore',    desc: 'Crisp, professional'   },
  { id: 'Fenrir',  label: 'Fenrir',  desc: 'Bold, confident'       },
  { id: 'Aoede',   label: 'Aoede',   desc: 'Warm, approachable'    },
  { id: 'Leda',    label: 'Leda',    desc: 'Clear, precise'        },
  { id: 'Orus',    label: 'Orus',    desc: 'Measured, calm'        },
  { id: 'Perseus', label: 'Perseus', desc: 'Strong, direct'        },
]

const MODELS = [
  { id: 'gemini-3.1-flash-live-preview', label: 'Gemini 3.1 Flash Live', desc: 'Real-time streaming (recommended)' },
]

const LANGUAGES = [
  { code: 'en', label: 'English' },  { code: 'hi', label: 'Hindi' },
  { code: 'ta', label: 'Tamil' },    { code: 'te', label: 'Telugu' },
  { code: 'kn', label: 'Kannada' },  { code: 'ml', label: 'Malayalam' },
  { code: 'bn', label: 'Bengali' },  { code: 'ur', label: 'Urdu' },
  { code: 'gu', label: 'Gujarati' }, { code: 'mr', label: 'Marathi' },
  { code: 'pa', label: 'Punjabi' },
]

const SECTIONS = [
  { id: 'branding',  label: 'Company Brand' },
  { id: 'model',     label: 'AI Model'      },
  { id: 'avatar',    label: 'Avatar'        },
  { id: 'language',  label: 'Language'      },
]

// ── Reusable form primitives ──────────────────────────────────────────

function Label({ children, htmlFor }) {
  return (
    <label htmlFor={htmlFor} style={{
      display: 'block', fontFamily: "'Inter', sans-serif",
      fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)',
      marginBottom: 6, letterSpacing: '0.01em',
    }}>
      {children}
    </label>
  )
}

function Input({ id, value, onChange, placeholder, type = 'text', disabled }) {
  const [focus, setFocus] = useState(false)
  return (
    <input id={id} type={type} value={value ?? ''} onChange={e => onChange(e.target.value)}
      placeholder={placeholder} disabled={disabled}
      onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
      style={{
        width: '100%', padding: '9px 12px', boxSizing: 'border-box',
        background: 'rgba(1,10,26,0.65)',
        border: `1px solid ${focus ? 'rgba(0,163,224,0.5)' : 'var(--border-default)'}`,
        borderRadius: 'var(--radius-md)', color: 'var(--text-primary)',
        fontFamily: "'Inter', sans-serif", fontSize: 14, outline: 'none',
        transition: 'border-color 150ms', opacity: disabled ? 0.45 : 1,
      }}
    />
  )
}

function Textarea({ id, value, onChange, placeholder, rows = 4 }) {
  const [focus, setFocus] = useState(false)
  return (
    <textarea id={id} value={value ?? ''} onChange={e => onChange(e.target.value)}
      placeholder={placeholder} rows={rows}
      onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
      style={{
        width: '100%', padding: '9px 12px', boxSizing: 'border-box',
        background: 'rgba(1,10,26,0.65)',
        border: `1px solid ${focus ? 'rgba(0,163,224,0.5)' : 'var(--border-default)'}`,
        borderRadius: 'var(--radius-md)', color: 'var(--text-primary)',
        fontFamily: "'Inter', sans-serif", fontSize: 13, lineHeight: 1.6,
        outline: 'none', resize: 'vertical', transition: 'border-color 150ms',
      }}
    />
  )
}

function Select({ id, value, onChange, options }) {
  const [focus, setFocus] = useState(false)
  return (
    <div style={{ position: 'relative' }}>
      <select id={id} value={value ?? ''} onChange={e => onChange(e.target.value)}
        onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
        style={{
          width: '100%', padding: '9px 32px 9px 12px', boxSizing: 'border-box',
          background: 'rgba(1,10,26,0.65)',
          border: `1px solid ${focus ? 'rgba(0,163,224,0.5)' : 'var(--border-default)'}`,
          borderRadius: 'var(--radius-md)', color: 'var(--text-primary)',
          fontFamily: "'Inter', sans-serif", fontSize: 14,
          outline: 'none', appearance: 'none', cursor: 'pointer',
          transition: 'border-color 150ms',
        }}
      >
        {options.map(o => (
          <option key={o.id} value={o.id} style={{ background: '#010F28' }}>
            {o.label}{o.desc ? ` — ${o.desc}` : ''}
          </option>
        ))}
      </select>
      <svg width="10" height="6" viewBox="0 0 10 6" fill="none" aria-hidden="true"
        style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--text-muted)' }}>
        <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  )
}

function UploadZone({ label, accept, hint, value, onChange }) {
  const ref = useRef(null)
  const [drag, setDrag] = useState(false)
  const handle = f => {
    if (!f) return
    const r = new FileReader()
    r.onload = e => onChange(e.target.result)
    r.readAsDataURL(f)
  }
  return (
    <div onClick={() => ref.current?.click()}
      onDragOver={e => { e.preventDefault(); setDrag(true) }}
      onDragLeave={() => setDrag(false)}
      onDrop={e => { e.preventDefault(); setDrag(false); handle(e.dataTransfer.files[0]) }}
      style={{
        border: `1px dashed ${drag ? 'var(--blue)' : value ? 'rgba(134,188,37,0.4)' : 'var(--border-default)'}`,
        borderRadius: 'var(--radius-md)', padding: '18px 16px', textAlign: 'center',
        cursor: 'pointer',
        background: drag ? 'rgba(0,163,224,0.05)' : value ? 'rgba(134,188,37,0.04)' : 'rgba(1,10,26,0.4)',
        transition: 'border-color 150ms, background 150ms', userSelect: 'none',
      }}
    >
      <input ref={ref} type="file" accept={accept} style={{ display: 'none' }}
        onChange={e => handle(e.target.files[0])} />
      {value ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: 'var(--text-secondary)' }}>
            {label} uploaded
          </span>
          <button onClick={e => { e.stopPropagation(); onChange(null) }}
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: '0 2px' }}>
            ×
          </button>
        </div>
      ) : (
        <>
          <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: 'var(--text-secondary)', marginBottom: 3 }}>
            Drop {label.toLowerCase()} here or click to browse
          </div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.05em' }}>
            {hint}
          </div>
        </>
      )}
    </div>
  )
}

function FieldGroup({ children }) {
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{children}</div>
}

// ── Editor section content ────────────────────────────────────────────

function BrandingSection({ draft, onChange }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <FieldGroup>
        <Label htmlFor="co_name">Company Name</Label>
        <Input id="co_name" value={draft.company_name} onChange={v => onChange('company_name', v)} placeholder="Deloitte" />
      </FieldGroup>
      <FieldGroup>
        <Label htmlFor="co_tag">Tagline</Label>
        <Input id="co_tag" value={draft.company_tagline} onChange={v => onChange('company_tagline', v)} placeholder="DCIT · Avatar Systems" />
      </FieldGroup>
      <FieldGroup>
        <Label>Company Logo</Label>
        <UploadZone label="Logo" accept="image/*" hint="PNG, SVG or JPG — 200×60px recommended"
          value={draft.logo_url} onChange={v => onChange('logo_url', v)} />
        {draft.logo_url && (
          <div style={{ padding: 10, background: 'rgba(1,10,26,0.6)', borderRadius: 'var(--radius-md)', display: 'inline-flex', marginTop: 4 }}>
            <img src={draft.logo_url} alt="preview" style={{ maxHeight: 36, maxWidth: 140, objectFit: 'contain' }} />
          </div>
        )}
      </FieldGroup>
      <FieldGroup>
        <Label htmlFor="color">Brand Color</Label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <input id="color" type="color" value={draft.primary_color || '#86BC25'}
            onChange={e => onChange('primary_color', e.target.value)}
            style={{ width: 38, height: 34, padding: 2, border: '1px solid var(--border-default)', borderRadius: 'var(--radius-sm)', background: 'rgba(1,10,26,0.6)', cursor: 'pointer' }} />
          <Input value={draft.primary_color} onChange={v => { if (/^#[0-9A-Fa-f]{0,6}$/.test(v)) onChange('primary_color', v) }} placeholder="#86BC25" />
          <div style={{ width: 34, height: 34, borderRadius: 'var(--radius-sm)', background: draft.primary_color, flexShrink: 0, border: '1px solid var(--border-default)' }} />
        </div>
      </FieldGroup>
    </div>
  )
}

function ModelSection({ draft, onChange, token }) {
  const [isPlaying, setIsPlaying] = useState(false)
  const [previewText, setPreviewText] = useState("Hello! I am your interactive AI voice assistant. How does my voice sound?")
  const [loadingAudio, setLoadingAudio] = useState(false)
  
  const canvasRef = useRef(null)
  const audioContextRef = useRef(null)
  const sourceRef = useRef(null)
  const analyserRef = useRef(null)
  const animationFrameId = useRef(null)

  const stopAudio = () => {
    if (animationFrameId.current) {
      cancelAnimationFrame(animationFrameId.current)
      animationFrameId.current = null
    }
    if (sourceRef.current) {
      try { sourceRef.current.stop() } catch(e) {}
      sourceRef.current.disconnect()
      sourceRef.current = null
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close()
      audioContextRef.current = null
    }
    setIsPlaying(false)
  }

  useEffect(() => {
    return () => stopAudio()
  }, [])

  const playPreview = async () => {
    if (isPlaying) {
      stopAudio()
      return
    }
    setLoadingAudio(true)
    try {
      const url = `${BACKEND_URL}/admin/test-voice?voice_name=${draft.agent_voice}&text=${encodeURIComponent(previewText)}`
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (!res.ok) throw new Error("Failed to load test voice")
      const arrayBuffer = await res.arrayBuffer()

      const AudioCtx = window.AudioContext || window.webkitAudioContext
      const audioCtx = new AudioCtx()
      audioContextRef.current = audioCtx

      const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer)
      const source = audioCtx.createBufferSource()
      source.buffer = audioBuffer
      sourceRef.current = source

      const analyser = audioCtx.createAnalyser()
      analyser.fftSize = 128
      analyserRef.current = analyser

      source.connect(analyser)
      analyser.connect(audioCtx.destination)

      source.onended = () => {
        setIsPlaying(false)
        stopAudio()
      }

      source.start(0)
      setIsPlaying(true)
      setLoadingAudio(false)

      drawWaveform()
    } catch (e) {
      console.error(e)
      setLoadingAudio(false)
      alert("Error playing voice preview. Ensure GEMINI_API_KEY is configured.")
    }
  }

  const drawWaveform = () => {
    if (!canvasRef.current || !analyserRef.current) return
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const analyser = analyserRef.current
    const bufferLength = analyser.frequencyBinCount
    const dataArray = new Uint8Array(bufferLength)

    const draw = () => {
      if (!analyserRef.current) return
      animationFrameId.current = requestAnimationFrame(draw)
      analyser.getByteFrequencyData(dataArray)

      ctx.fillStyle = 'rgba(1, 10, 26, 0.3)'
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      const barWidth = (canvas.width / bufferLength) * 1.5
      let barHeight
      let x = 0

      for (let i = 0; i < bufferLength; i++) {
        barHeight = dataArray[i] / 1.5
        const percent = i / bufferLength
        ctx.fillStyle = `hsla(${78 + percent * 40}, 65%, 45%, 0.85)`
        ctx.fillRect(x, canvas.height/2 - barHeight/2, barWidth - 2, barHeight)
        x += barWidth
      }
    }

    draw()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <FieldGroup>
        <Label htmlFor="ag_name">Agent Name</Label>
        <Input id="ag_name" value={draft.agent_name} onChange={v => onChange('agent_name', v)} placeholder="Vaani" />
      </FieldGroup>
      <FieldGroup>
        <Label htmlFor="ag_role">Agent Role</Label>
        <Input id="ag_role" value={draft.agent_role} onChange={v => onChange('agent_role', v)} placeholder="Your AI Assistant" />
      </FieldGroup>
      <FieldGroup>
        <Label htmlFor="ag_welcome">Welcome Message</Label>
        <Input id="ag_welcome" value={draft.welcome_message} onChange={v => onChange('welcome_message', v)} placeholder={`Hello! I'm ${draft.agent_name || 'Vaani'}, how can I help you today?`} />
      </FieldGroup>
      <div style={{ height: 1, background: 'var(--border-subtle)' }} />
      <FieldGroup>
        <Label htmlFor="llm">Language Model</Label>
        <Select id="llm" value={draft.llm_model} onChange={v => onChange('llm_model', v)} options={MODELS} />
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.04em' }}>
          Model and voice changes apply to new sessions only
        </span>
      </FieldGroup>
      <FieldGroup>
        <Label htmlFor="voice">Voice</Label>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <div style={{ flex: 1 }}>
            <Select id="voice" value={draft.agent_voice} onChange={v => onChange('agent_voice', v)} options={VOICES} />
          </div>
          <button
            type="button"
            onClick={playPreview}
            disabled={loadingAudio}
            style={{
              padding: '9px 16px',
              background: isPlaying ? 'rgba(255, 68, 68, 0.15)' : 'rgba(134,188,37,0.12)',
              border: `1px solid ${isPlaying ? 'var(--error)' : 'rgba(134,188,37,0.3)'}`,
              borderRadius: 'var(--radius-md)',
              color: isPlaying ? 'var(--error)' : 'var(--green)',
              fontFamily: "'Inter', sans-serif",
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              height: 38,
              boxSizing: 'border-box'
            }}
          >
            {loadingAudio ? 'Loading...' : isPlaying ? 'Stop' : 'Listen Preview'}
          </button>
        </div>
      </FieldGroup>

      {/* Voice preview waveform box */}
      {(isPlaying || loadingAudio) && (
        <div style={{
          background: 'rgba(1, 10, 26, 0.4)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-md)',
          padding: 12,
          display: 'flex',
          flexDirection: 'column',
          gap: 10
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <Label htmlFor="preview_input">Test Phrase</Label>
            <input
              id="preview_input"
              type="text"
              value={previewText}
              onChange={e => setPreviewText(e.target.value)}
              placeholder="Type test phrase..."
              style={{
                width: '100%', padding: '6px 10px', boxSizing: 'border-box',
                background: 'rgba(1,10,26,0.65)', border: '1px solid var(--border-default)',
                borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)',
                fontFamily: "'Inter', sans-serif", fontSize: 12, outline: 'none'
              }}
            />
          </div>
          <canvas
            ref={canvasRef}
            width={400}
            height={60}
            style={{
              width: '100%',
              height: 60,
              background: 'rgba(1, 10, 26, 0.6)',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-default)'
            }}
          />
        </div>
      )}

      <div style={{ height: 1, background: 'var(--border-subtle)' }} />
      <FieldGroup>
        <Label htmlFor="sysprompt">Additional System Instructions</Label>
        <Textarea id="sysprompt" value={draft.system_prompt_extra} onChange={v => onChange('system_prompt_extra', v)}
          placeholder="Custom behavior, persona details, or constraints specific to this company..." rows={5} />
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.04em' }}>
          Appended to the base system prompt. Applied to new sessions.
        </span>
      </FieldGroup>
    </div>
  )
}

function AvatarSection({ draft, onChange }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <FieldGroup>
        <Label>Avatar Video</Label>
        <UploadZone label="Avatar video" accept="video/mp4,video/webm"
          hint="MP4 or WebM — 400×400px, 25fps, max 50MB"
          value={draft.avatar_video_url} onChange={v => onChange('avatar_video_url', v)} />
        {draft.avatar_video_url?.startsWith('data:video') && (
          <video src={draft.avatar_video_url} loop muted autoPlay playsInline
            style={{ width: 140, height: 140, objectFit: 'cover', borderRadius: '50%', border: '2px solid var(--border-default)', marginTop: 6 }} />
        )}
      </FieldGroup>
      <div style={{ padding: '12px 14px', background: 'rgba(0,163,224,0.05)', border: '1px solid rgba(0,163,224,0.15)', borderRadius: 'var(--radius-md)', fontFamily: "'Inter', sans-serif", fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
        This avatar video is used for the idle loop. When MuseTalk is enabled, the face is used for live lip-sync inference. Upload a forward-facing, well-lit recording.
      </div>
    </div>
  )
}

function LanguageSection({ draft, onChange }) {
  const supported = draft.supported_languages || []
  const toggle = code => {
    const next = supported.includes(code) ? supported.filter(c => c !== code) : [...supported, code]
    onChange('supported_languages', next)
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <FieldGroup>
        <Label htmlFor="deflang">Default Language</Label>
        <Select id="deflang" value={draft.default_language}
          onChange={v => onChange('default_language', v)}
          options={LANGUAGES.map(l => ({ id: l.code, label: l.label }))} />
      </FieldGroup>
      <FieldGroup>
        <Label>Supported Languages</Label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(155px, 1fr))', gap: 8 }}>
          {LANGUAGES.map(lang => {
            const on = supported.includes(lang.code)
            return (
              <button key={lang.code} onClick={() => toggle(lang.code)} style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '7px 11px',
                background: on ? 'rgba(134,188,37,0.08)' : 'rgba(1,10,26,0.4)',
                border: `1px solid ${on ? 'rgba(134,188,37,0.3)' : 'var(--border-subtle)'}`,
                borderRadius: 'var(--radius-md)', cursor: 'pointer', textAlign: 'left',
                transition: 'background 150ms, border-color 150ms',
              }}>
                <div style={{
                  width: 13, height: 13, borderRadius: 3, flexShrink: 0,
                  border: `1.5px solid ${on ? 'var(--green)' : 'var(--border-default)'}`,
                  background: on ? 'var(--green)' : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'all 150ms',
                }}>
                  {on && <svg width="7" height="5" viewBox="0 0 7 5" fill="none"><path d="M1 2.5l1.5 1.5L6 1" stroke="#010A1A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                </div>
                <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: on ? 'var(--text-primary)' : 'var(--text-secondary)', transition: 'color 150ms' }}>
                  {lang.label}
                </span>
              </button>
            )
          })}
        </div>
      </FieldGroup>
    </div>
  )
}

// ── New-bot modal ─────────────────────────────────────────────────────

function NewBotModal({ token, onCreated, onClose }) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const ref = useRef(null)
  useEffect(() => { ref.current?.focus() }, [])

  const create = async () => {
    if (!name.trim()) return
    setBusy(true)
    try {
      const res = await fetch(`${BACKEND_URL}/bots`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ company_name: name.trim() }),
      })
      if (!res.ok) throw new Error()
      const bot = await res.json()
      onCreated(bot)
    } catch {
      setBusy(false)
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: 'rgba(1,10,26,0.82)', backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--bg-surface-1)',
        border: '1px solid var(--border-default)',
        borderRadius: 'var(--radius-lg)', padding: '28px 24px',
        width: 360,
        boxShadow: '0 24px 64px rgba(0,0,0,0.7)',
      }}>
        <div style={{ fontFamily: "'Inter', sans-serif", fontWeight: 600, fontSize: 16, color: 'var(--text-primary)', marginBottom: 18 }}>
          New Bot Configuration
        </div>
        <div style={{ marginBottom: 16 }}>
          <Label htmlFor="new_co">Company Name</Label>
          <input ref={ref} id="new_co" type="text" value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') create(); if (e.key === 'Escape') onClose() }}
            placeholder="e.g. Accenture"
            style={{
              width: '100%', padding: '10px 12px', boxSizing: 'border-box',
              background: 'rgba(1,10,26,0.7)', border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-md)', color: 'var(--text-primary)',
              fontFamily: "'Inter', sans-serif", fontSize: 14, outline: 'none',
            }}
          />
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{
            padding: '9px 16px', background: 'none', border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)', color: 'var(--text-secondary)',
            fontFamily: "'Inter', sans-serif", fontSize: 13, cursor: 'pointer',
          }}>
            Cancel
          </button>
          <button onClick={create} disabled={!name.trim() || busy} style={{
            padding: '9px 20px',
            background: name.trim() && !busy ? 'var(--green)' : 'rgba(134,188,37,0.3)',
            border: 'none', borderRadius: 'var(--radius-md)',
            color: name.trim() && !busy ? '#010A1A' : 'rgba(134,188,37,0.5)',
            fontFamily: "'Inter', sans-serif", fontWeight: 600, fontSize: 13,
            cursor: name.trim() && !busy ? 'pointer' : 'default', transition: 'all 150ms',
          }}>
            {busy ? 'Creating...' : 'Create →'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Delete confirm ────────────────────────────────────────────────────

function DeleteConfirm({ bot, token, onDeleted, onClose }) {
  const [busy, setBusy] = useState(false)
  const del = async () => {
    setBusy(true)
    try {
      await fetch(`${BACKEND_URL}/bots/${bot.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      onDeleted(bot.id)
    } catch { setBusy(false) }
  }
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: 'rgba(1,10,26,0.82)', backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--bg-surface-1)', border: '1px solid rgba(255,68,68,0.25)',
        borderRadius: 'var(--radius-lg)', padding: '24px', width: 340,
        boxShadow: '0 24px 64px rgba(0,0,0,0.7)',
      }}>
        <div style={{ fontFamily: "'Inter', sans-serif", fontWeight: 600, fontSize: 15, color: 'var(--text-primary)', marginBottom: 10 }}>
          Delete {bot.company_name}?
        </div>
        <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20, lineHeight: 1.5 }}>
          This removes the bot configuration. Face recognition data for this company stays in the database.
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '8px 16px', background: 'none', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', color: 'var(--text-secondary)', fontFamily: "'Inter', sans-serif", fontSize: 13, cursor: 'pointer' }}>
            Cancel
          </button>
          <button onClick={del} disabled={busy} style={{ padding: '8px 16px', background: 'var(--error)', border: 'none', borderRadius: 'var(--radius-md)', color: '#fff', fontFamily: "'Inter', sans-serif", fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
            {busy ? 'Deleting...' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Bot Library ───────────────────────────────────────────────────────

function CompanyInitial({ name, logo, color }) {
  if (logo) return <img src={logo} alt={name} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
  const initial = (name || '?')[0].toUpperCase()
  return (
    <span style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 22, color: color || 'var(--green)' }}>
      {initial}
    </span>
  )
}

function BotCard({ bot, isActive, onLaunch, onEdit, onDelete }) {
  const voice = VOICES.find(v => v.id === bot.agent_voice)
  const modelEntry = MODELS.find(m => m.id === bot.llm_model)
  const model = modelEntry ? modelEntry.label : (bot.llm_model?.split('-').slice(1, 3).join(' ') || 'Gemini')

  return (
    <div style={{
      background: isActive ? 'rgba(134,188,37,0.05)' : 'var(--bg-surface-1)',
      border: `1px solid ${isActive ? 'rgba(134,188,37,0.35)' : 'var(--border-subtle)'}`,
      borderRadius: 'var(--radius-lg)', padding: '20px',
      display: 'flex', flexDirection: 'column', gap: 16,
      transition: 'border-color 150ms',
      position: 'relative',
    }}>
      {/* Active badge */}
      {isActive && (
        <div style={{
          position: 'absolute', top: 12, right: 12,
          display: 'flex', alignItems: 'center', gap: 5,
          padding: '3px 8px',
          background: 'rgba(134,188,37,0.12)',
          border: '1px solid rgba(134,188,37,0.25)',
          borderRadius: 'var(--radius-full)',
        }}>
          <div style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--green)', animation: 'dot-pulse 1200ms ease-in-out infinite' }} />
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, letterSpacing: '0.1em', color: 'var(--green)' }}>
            ACTIVE
          </span>
        </div>
      )}

      {/* Top: logo + info */}
      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', paddingRight: isActive ? 72 : 0 }}>
        <div style={{
          width: 44, height: 44, borderRadius: 'var(--radius-md)', flexShrink: 0,
          background: 'rgba(1,10,26,0.6)', border: '1px solid var(--border-subtle)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
          padding: bot.logo_url ? 6 : 0,
        }}>
          <CompanyInitial name={bot.company_name} logo={bot.logo_url} color={bot.primary_color} />
        </div>
        <div>
          <div style={{ fontFamily: "'Inter', sans-serif", fontWeight: 600, fontSize: 15, color: 'var(--text-primary)', marginBottom: 2 }}>
            {bot.company_name}
          </div>
          {bot.company_tagline && (
            <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: 'var(--text-muted)' }}>
              {bot.company_tagline}
            </div>
          )}
        </div>
      </div>

      {/* Agent details */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {[
          bot.agent_name,
          voice?.label,
          model,
        ].filter(Boolean).map(tag => (
          <span key={tag} style={{
            padding: '3px 8px', borderRadius: 'var(--radius-full)',
            background: 'rgba(1,52,122,0.4)', border: '1px solid var(--border-subtle)',
            fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
            letterSpacing: '0.05em', color: 'var(--text-secondary)',
          }}>
            {tag}
          </span>
        ))}
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 'auto' }}>
        {isActive ? (
          <button onClick={() => { window.location.hash = '' }} style={{
            flex: 1, padding: '8px 0', background: 'var(--green)', border: 'none',
            borderRadius: 'var(--radius-md)', color: '#010A1A',
            fontFamily: "'Inter', sans-serif", fontWeight: 600, fontSize: 13, cursor: 'pointer',
          }}>
            Open Interface
          </button>
        ) : (
          <button onClick={() => onLaunch(bot.id)} style={{
            flex: 1, padding: '8px 0',
            background: 'rgba(134,188,37,0.1)', border: '1px solid rgba(134,188,37,0.25)',
            borderRadius: 'var(--radius-md)', color: 'var(--green)',
            fontFamily: "'Inter', sans-serif", fontWeight: 600, fontSize: 13, cursor: 'pointer',
            transition: 'background 150ms',
          }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(134,188,37,0.18)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(134,188,37,0.1)' }}
          >
            Launch
          </button>
        )}
        <button onClick={() => onEdit(bot)} style={{
          padding: '8px 14px', background: 'none',
          border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)',
          color: 'var(--text-secondary)', fontFamily: "'Inter', sans-serif",
          fontSize: 13, cursor: 'pointer', transition: 'border-color 150ms, color 150ms',
        }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--border-default)'; e.currentTarget.style.color = 'var(--text-primary)' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-subtle)'; e.currentTarget.style.color = 'var(--text-secondary)' }}
        >
          Edit
        </button>
        {!isActive && bot.id !== 'default' && (
          <button onClick={() => onDelete(bot)} style={{
            padding: '8px 10px', background: 'none', border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)', color: 'var(--text-muted)',
            fontFamily: "'Inter', sans-serif", fontSize: 13, cursor: 'pointer',
            transition: 'border-color 150ms, color 150ms',
          }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(255,68,68,0.3)'; e.currentTarget.style.color = 'var(--error)' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-subtle)'; e.currentTarget.style.color = 'var(--text-muted)' }}
          >
            ×
          </button>
        )}
      </div>
    </div>
  )
}

function BotLibrary({ token, onEdit, onLogout }) {
  const [bots, setBots]         = useState([])
  const [activeSlug, setActive] = useState(null)
  const [loading, setLoading]   = useState(true)
  const [showNew, setShowNew]   = useState(false)
  const [toDelete, setToDelete] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`${BACKEND_URL}/bots`, { headers: { Authorization: `Bearer ${token}` } })
      if (res.status === 401) { onLogout(); return }
      const data = await res.json()
      setBots(data)
      const active = data.find(b => b.active)
      setActive(active?.id || null)
    } catch { /* show empty state */ }
    setLoading(false)
  }, [token, onLogout])

  useEffect(() => { load() }, [load])

  const handleLaunch = async (slug) => {
    await fetch(`${BACKEND_URL}/bots/${slug}/activate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    })
    setActive(slug)
    setBots(prev => prev.map(b => ({ ...b, active: b.id === slug })))
  }

  const handleCreated = (bot) => {
    setShowNew(false)
    setBots(prev => [...prev, { ...bot, active: false }])
    onEdit(bot)
  }

  const handleDeleted = (slug) => {
    setToDelete(null)
    setBots(prev => prev.filter(b => b.id !== slug))
    if (activeSlug === slug) setActive('default')
  }

  return (
    <>
      <div style={{ flex: 1, overflowY: 'auto', padding: '36px 40px' }}>
        {/* Header row */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 32 }}>
          <div>
            <h1 style={{ fontFamily: "'Inter', sans-serif", fontWeight: 600, fontSize: 20, color: 'var(--text-primary)', margin: '0 0 4px', letterSpacing: '-0.01em' }}>
              Bot Configurations
            </h1>
            <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>
              One bot per client company. Each has its own avatar, AI model, and face recognition database.
            </p>
          </div>
          <button onClick={() => setShowNew(true)} style={{
            display: 'flex', alignItems: 'center', gap: 7,
            padding: '9px 18px', background: 'var(--green)', border: 'none',
            borderRadius: 'var(--radius-md)', color: '#010A1A',
            fontFamily: "'Inter', sans-serif", fontWeight: 600, fontSize: 13, cursor: 'pointer',
            flexShrink: 0,
          }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            New Bot
          </button>
        </div>

        {loading ? (
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.08em' }}>
            Loading...
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))', gap: 16 }}>
            {bots.map(bot => (
              <BotCard
                key={bot.id}
                bot={bot}
                isActive={bot.id === activeSlug}
                onLaunch={handleLaunch}
                onEdit={onEdit}
                onDelete={setToDelete}
              />
            ))}
          </div>
        )}
      </div>

      {showNew && <NewBotModal token={token} onCreated={handleCreated} onClose={() => setShowNew(false)} />}
      {toDelete && <DeleteConfirm bot={toDelete} token={token} onDeleted={handleDeleted} onClose={() => setToDelete(null)} />}
    </>
  )
}

// ── Bot Editor ────────────────────────────────────────────────────────

function BotEditor({ bot: initialBot, token, onBack, onActivated }) {
  const [draft, setDraft]         = useState(initialBot)
  const [saveState, setSaveState] = useState('idle')
  const [activating, setActivating] = useState(false)
  const [section, setSection]     = useState('branding')

  const change = (key, val) => { setDraft(p => ({ ...p, [key]: val })); setSaveState('idle') }

  const save = async () => {
    setSaveState('saving')
    try {
      const res = await fetch(`${BACKEND_URL}/bots/${draft.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(draft),
      })
      if (!res.ok) throw new Error()
      const saved = await res.json()
      setDraft(saved)
      setSaveState('saved')
      setTimeout(() => setSaveState('idle'), 2500)
    } catch {
      setSaveState('error')
      setTimeout(() => setSaveState('idle'), 3000)
    }
  }

  const activate = async () => {
    setActivating(true)
    await fetch(`${BACKEND_URL}/bots/${draft.id}/activate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    })
    setActivating(false)
    onActivated(draft.id)
  }

  const saveBtnLabel  = { idle: 'Save', saving: 'Saving...', saved: 'Saved', error: 'Failed' }[saveState]
  const saveBtnColor  = { idle: 'var(--green)', saving: 'rgba(134,188,37,0.4)', saved: 'rgba(134,188,37,0.18)', error: 'rgba(255,68,68,0.2)' }[saveState]
  const saveBtnText   = { idle: '#010A1A', saving: 'rgba(134,188,37,0.5)', saved: 'var(--green)', error: 'var(--error)' }[saveState]

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Editor sub-topbar */}
      <div style={{
        height: 44, borderBottom: '1px solid var(--border-subtle)',
        display: 'flex', alignItems: 'center', padding: '0 24px', gap: 12, flexShrink: 0,
        background: 'rgba(1,10,26,0.4)',
      }}>
        <button onClick={onBack} style={{
          display: 'flex', alignItems: 'center', gap: 6,
          background: 'none', border: 'none', color: 'var(--text-muted)',
          fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: '0.08em',
          textTransform: 'uppercase', cursor: 'pointer', padding: '4px 6px',
          borderRadius: 'var(--radius-sm)', transition: 'color 150ms',
        }}
          onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-secondary)' }}
          onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)' }}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          All bots
        </button>
        <span style={{ color: 'var(--border-default)', userSelect: 'none' }}>/</span>
        <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 14, color: 'var(--text-primary)', fontWeight: 500 }}>
          {draft.company_name}
        </span>
        <div style={{ flex: 1 }} />
        <button onClick={activate} disabled={activating} style={{
          padding: '6px 14px', background: 'none',
          border: '1px solid rgba(134,188,37,0.3)', borderRadius: 'var(--radius-md)',
          color: 'var(--green)', fontFamily: "'Inter', sans-serif", fontSize: 12,
          fontWeight: 500, cursor: 'pointer', transition: 'background 150ms',
          opacity: activating ? 0.5 : 1,
        }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(134,188,37,0.08)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'none' }}
        >
          {activating ? 'Setting...' : 'Set as Active'}
        </button>
        <button onClick={save} disabled={saveState !== 'idle'} style={{
          padding: '6px 16px', background: saveBtnColor, border: 'none',
          borderRadius: 'var(--radius-md)', color: saveBtnText,
          fontFamily: "'Inter', sans-serif", fontWeight: 600, fontSize: 13,
          cursor: saveState === 'idle' ? 'pointer' : 'default',
          transition: 'all 200ms', display: 'flex', alignItems: 'center', gap: 6,
        }}>
          {saveState === 'saved' && (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          )}
          {saveBtnLabel}
        </button>
      </div>

      {/* Editor body: sidebar + content */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <nav style={{ width: 200, flexShrink: 0, borderRight: '1px solid var(--border-subtle)', padding: '20px 0', overflowY: 'auto' }}>
          {SECTIONS.map(sec => {
            const on = sec.id === section
            return (
              <button key={sec.id} onClick={() => setSection(sec.id)} style={{
                display: 'block', width: '100%', textAlign: 'left',
                padding: '8px 20px', background: on ? 'rgba(134,188,37,0.07)' : 'none',
                border: 'none', borderRight: `2px solid ${on ? 'var(--green)' : 'transparent'}`,
                color: on ? 'var(--text-primary)' : 'var(--text-secondary)',
                fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: on ? 500 : 400,
                cursor: 'pointer', transition: 'all 150ms',
              }}>
                {sec.label}
              </button>
            )
          })}
        </nav>
        <main style={{ flex: 1, overflowY: 'auto', padding: '28px 40px' }}>
          <div style={{ maxWidth: 520 }}>
            {section === 'branding'  && <BrandingSection  draft={draft} onChange={change} />}
            {section === 'model'     && <ModelSection     draft={draft} onChange={change} token={token} />}
            {section === 'avatar'    && <AvatarSection    draft={draft} onChange={change} />}
            {section === 'language'  && <LanguageSection  draft={draft} onChange={change} />}
          </div>
        </main>
      </div>
    </div>
  )
}

// ── Root dashboard component ──────────────────────────────────────────

// ── User Database & History Manager ──────────────────────────────────────

function UserMemoryLibrary({ token, onLogout }) {
  const [users, setUsers] = useState([])
  const [bots, setBots] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedUser, setSelectedUser] = useState(null)
  const [sessions, setSessions] = useState([])
  const [sessionsLoading, setSessionsLoading] = useState(false)
  const [showAddModal, setShowAddModal] = useState(false)
  const [newUserName, setNewUserName] = useState('')
  const [newUserRole, setNewUserRole] = useState('')
  const [newUserCompany, setNewUserCompany] = useState('default')
  const [addingUser, setAddingUser] = useState(false)

  // Webcam enroll states
  const [enrollMode, setEnrollMode] = useState('profile') // 'profile' | 'webcam'
  const [cameraActive, setCameraActive] = useState(false)
  const [photoData, setPhotoData] = useState(null)
  const [faceValidState, setFaceValidState] = useState('idle') // 'idle' | 'checking' | 'valid' | 'invalid'
  const [faceValidationMessage, setFaceValidationMessage] = useState('')

  // Transcript viewer states
  const [selectedSessionForTranscript, setSelectedSessionForTranscript] = useState(null)

  const videoElementRef = useRef(null)
  const streamRef = useRef(null)

  const videoRefCallback = useCallback(node => {
    videoElementRef.current = node
    if (node && streamRef.current) {
      node.srcObject = streamRef.current
      node.play().catch(err => console.error("Video play failed", err))
    }
  }, [])

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 400, height: 400, facingMode: 'user' } })
      streamRef.current = stream
      if (videoElementRef.current) {
        videoElementRef.current.srcObject = stream
        videoElementRef.current.play().catch(err => console.error("Video play failed", err))
      }
      setCameraActive(true)
      setFaceValidState('idle')
      setPhotoData(null)
    } catch (err) {
      console.error("Camera access failed", err)
      alert("Could not access camera. Please check camera permissions.")
    }
  }

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }
    setCameraActive(false)
  }

  useEffect(() => {
    if (!showAddModal) {
      stopCamera()
      setPhotoData(null)
      setFaceValidState('idle')
      setFaceValidationMessage('')
    }
    return () => stopCamera()
  }, [showAddModal])

  useEffect(() => {
    if (showAddModal && enrollMode === 'webcam') {
      startCamera()
    } else {
      stopCamera()
    }
  }, [enrollMode, showAddModal])

  const captureAndVerify = async () => {
    if (!videoElementRef.current) return
    setFaceValidState('checking')
    try {
      const canvas = document.createElement('canvas')
      canvas.width = 400
      canvas.height = 400
      const ctx = canvas.getContext('2d')
      ctx.drawImage(videoElementRef.current, 0, 0, 400, 400)
      const dataUrl = canvas.toDataURL('image/jpeg')
      setPhotoData(dataUrl)

      // Send to server to validate face presence
      const res = await fetch(`${BACKEND_URL}/admin/users/validate-face`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ image: dataUrl })
      })
      const data = await res.json()
      if (res.ok && data.valid) {
        setFaceValidState('valid')
        setFaceValidationMessage('Face verified successfully! Safe to enroll.')
      } else {
        setFaceValidState('invalid')
        setFaceValidationMessage(data.reason === 'no_face_detected' ? 'No face detected. Please position face clearly.' : 'Verification failed.')
      }
    } catch (err) {
      console.error(err)
      setFaceValidState('invalid')
      setFaceValidationMessage('Face validation error on backend.')
    }
  }

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const usersRes = await fetch(`${BACKEND_URL}/admin/users`, { headers: { Authorization: `Bearer ${token}` } })
      if (usersRes.status === 401) { onLogout(); return }
      const usersData = await usersRes.json()
      setUsers(usersData)

      const botsRes = await fetch(`${BACKEND_URL}/bots`, { headers: { Authorization: `Bearer ${token}` } })
      const botsData = await botsRes.json()
      setBots(botsData)
    } catch (e) {
      console.error(e)
    }
    setLoading(false)
  }, [token, onLogout])

  useEffect(() => { loadData() }, [loadData])

  const handleDeleteUser = async (userId) => {
    if (!window.confirm("Are you sure you want to delete this user? All their session histories will be deleted as well.")) return
    try {
      const res = await fetch(`${BACKEND_URL}/admin/users/${userId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      })
      if (res.ok) {
        setUsers(prev => prev.filter(u => u.id !== userId))
        if (selectedUser?.id === userId) setSelectedUser(null)
      }
    } catch (e) {
      console.error(e)
    }
  }

  const handleAddUser = async (e) => {
    e.preventDefault()
    if (!newUserName.trim()) return
    if (enrollMode === 'webcam' && faceValidState !== 'valid') {
      alert("Please capture and verify a valid face before registering.")
      return
    }
    setAddingUser(true)
    try {
      const res = await fetch(`${BACKEND_URL}/admin/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name: newUserName.trim(),
          role: newUserRole.trim() || null,
          company_id: newUserCompany,
          image: enrollMode === 'webcam' ? photoData : null
        })
      })
      if (res.ok) {
        const newUser = await res.json()
        setUsers(prev => [newUser, ...prev])
        setShowAddModal(false)
        setNewUserName('')
        setNewUserRole('')
        setNewUserCompany('default')
        setEnrollMode('profile')
      } else {
        const errData = await res.json()
        alert(errData.detail || "Failed to create user")
      }
    } catch (e) {
      console.error(e)
      alert("Error adding user.")
    }
    setAddingUser(false)
  }

  const viewHistory = async (user) => {
    setSelectedUser(user)
    setSessionsLoading(true)
    setSessions([])
    try {
      const res = await fetch(`${BACKEND_URL}/admin/users/${user.id}/sessions`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (res.ok) {
        const data = await res.json()
        setSessions(data)
      }
    } catch (e) {
      console.error(e)
    }
    setSessionsLoading(false)
  }

  const filteredUsers = users.filter(u => 
    u.name.toLowerCase().includes(search.toLowerCase()) || 
    (u.role && u.role.toLowerCase().includes(search.toLowerCase())) ||
    u.company_id.toLowerCase().includes(search.toLowerCase())
  )

  // Calculations for Stats
  const activeBotName = bots.find(b => b.active)?.company_name || 'None'
  const totalSessionsCount = users.reduce((sum, u) => sum + (u.visit_count || 0), 0)

  return (
    <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
      {/* Main List Area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '36px 40px', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, gap: 16 }}>
          <div>
            <h1 style={{ fontFamily: "'Inter', sans-serif", fontWeight: 600, fontSize: 20, color: 'var(--text-primary)', margin: '0 0 4px' }}>
              Enrolled Users & Memory
            </h1>
            <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>
              View visitor profiles, register new faces, or review previous conversation histories.
            </p>
          </div>
          <button onClick={() => setShowAddModal(true)} style={{
            display: 'flex', alignItems: 'center', gap: 7,
            padding: '9px 18px', background: 'var(--green)', border: 'none',
            borderRadius: 'var(--radius-md)', color: '#010A1A',
            fontFamily: "'Inter', sans-serif", fontWeight: 600, fontSize: 13, cursor: 'pointer',
          }}>
            Add User
          </button>
        </div>

        {/* Stats Grid Dashboard Widget */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 16,
          marginBottom: 28
        }}>
          <div style={{
            background: 'var(--bg-surface-1)', border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-lg)', padding: '16px 20px'
          }}>
            <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, fontWeight: 500, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>
              Total Users
            </div>
            <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 28, fontWeight: 700, color: 'var(--text-primary)' }}>
              {users.length}
            </div>
            <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
              Registered in local database
            </div>
          </div>
          <div style={{
            background: 'var(--bg-surface-1)', border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-lg)', padding: '16px 20px'
          }}>
            <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, fontWeight: 500, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>
              Active Bot Profile
            </div>
            <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 24, fontWeight: 700, color: 'var(--green)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {activeBotName}
            </div>
            <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
              Current selected avatar setup
            </div>
          </div>
          <div style={{
            background: 'var(--bg-surface-1)', border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-lg)', padding: '16px 20px'
          }}>
            <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, fontWeight: 500, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>
              Total Face Checkins
            </div>
            <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 28, fontWeight: 700, color: 'var(--text-primary)' }}>
              {totalSessionsCount}
            </div>
            <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
              Visits recognized by Wav2Lip pipeline
            </div>
          </div>
          <div style={{
            background: 'var(--bg-surface-1)', border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-lg)', padding: '16px 20px'
          }}>
            <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, fontWeight: 500, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>
              Memory DB Status
            </div>
            <div style={{
              fontFamily: "'Syne', sans-serif", fontSize: 22, fontWeight: 700, color: 'var(--text-primary)',
              display: 'flex', alignItems: 'center', gap: 6, marginTop: 4
            }}>
              <div style={{
                width: 8, height: 8, borderRadius: '50%',
                background: loading ? '#FFA500' : 'var(--green)',
                animation: 'dot-pulse 1.2s infinite'
              }} />
              {loading ? 'SYNCING...' : 'CONNECTED'}
            </div>
            <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
              PostgreSQL storage instance active
            </div>
          </div>
        </div>

        {/* Search Filter */}
        <div style={{ marginBottom: 20, maxWidth: 360 }}>
          <input
            type="text"
            placeholder="Search by name, role, or company..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              width: '100%', padding: '9px 12px', boxSizing: 'border-box',
              background: 'rgba(1,10,26,0.5)', border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-md)', color: 'var(--text-primary)',
              fontFamily: "'Inter', sans-serif", fontSize: 13, outline: 'none'
            }}
          />
        </div>

        {loading ? (
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: 'var(--text-muted)' }}>
            Loading database records...
          </div>
        ) : filteredUsers.length === 0 ? (
          <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-muted)', fontFamily: "'Inter', sans-serif", fontSize: 14 }}>
            No users found.
          </div>
        ) : (
          <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', background: 'rgba(1,10,26,0.3)', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontFamily: "'Inter', sans-serif", fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'rgba(1,10,26,0.6)', borderBottom: '1px solid var(--border-subtle)' }}>
                  <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-muted)' }}>Name / Role</th>
                  <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-muted)' }}>Company (Bot)</th>
                  <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-muted)' }}>Language</th>
                  <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-muted)' }}>Visits</th>
                  <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-muted)' }}>Last Seen</th>
                  <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-muted)', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map(user => (
                  <tr key={user.id} style={{ borderBottom: '1px solid var(--border-subtle)', transition: 'background 150ms' }} className="hover-row">
                    <td style={{ padding: '14px 16px' }}>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{user.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{user.role || 'Visitor'}</div>
                    </td>
                    <td style={{ padding: '14px 16px', fontFamily: "'JetBrains Mono', monospace", color: 'var(--text-secondary)' }}>
                      {user.company_id}
                    </td>
                    <td style={{ padding: '14px 16px', textTransform: 'uppercase', fontSize: 11 }}>
                      {user.preferred_language || 'en'}
                    </td>
                    <td style={{ padding: '14px 16px', color: 'var(--text-secondary)' }}>
                      {user.visit_count}
                    </td>
                    <td style={{ padding: '14px 16px', color: 'var(--text-muted)', fontSize: 12 }}>
                      {user.last_seen ? new Date(user.last_seen).toLocaleDateString() : 'Never'}
                    </td>
                    <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                      <button onClick={() => viewHistory(user)} style={{
                        padding: '5px 11px', background: 'none', border: '1px solid rgba(134,188,37,0.3)',
                        borderRadius: 'var(--radius-sm)', color: 'var(--green)', cursor: 'pointer', marginRight: 8, fontSize: 12
                      }}>
                        History
                      </button>
                      <button onClick={() => handleDeleteUser(user.id)} style={{
                        padding: '5px 11px', background: 'none', border: '1px solid rgba(255,68,68,0.3)',
                        borderRadius: 'var(--radius-sm)', color: 'var(--error)', cursor: 'pointer', fontSize: 12
                      }}>
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Details Side Drawer */}
      {selectedUser && (
        <div style={{
          width: 380, borderLeft: '1px solid var(--border-subtle)', background: 'var(--bg-surface-1)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden'
        }}>
          <div style={{ padding: '24px 20px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h2 style={{ fontFamily: "'Inter', sans-serif", fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 2px' }}>
                Conversation History
              </h2>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{selectedUser.name}</span>
            </div>
            <button onClick={() => setSelectedUser(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 18 }}>
              ×
            </button>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
            {sessionsLoading ? (
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: 'var(--text-muted)' }}>
                Loading summaries...
              </div>
            ) : sessions.length === 0 ? (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, paddingTop: 40 }}>
                No recorded conversations for this user yet.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {sessions.map(s => (
                  <div key={s.id} style={{
                    padding: 14, background: 'rgba(1,10,26,0.4)', border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-md)'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                      <span style={{ fontSize: 10, fontFamily: "'JetBrains Mono', monospace", color: 'var(--text-muted)' }}>
                        {new Date(s.created_at).toLocaleDateString()}
                      </span>
                      <span style={{ fontSize: 10, textTransform: 'uppercase', color: 'var(--green)' }}>
                        {s.language}
                      </span>
                    </div>
                    <p style={{ margin: '0 0 10px 0', fontSize: 12, lineHeight: 1.5, color: 'var(--text-secondary)' }}>
                      {s.summary}
                    </p>
                    <button
                      onClick={() => setSelectedSessionForTranscript(s)}
                      style={{
                        padding: '4px 8px', background: 'rgba(134, 188, 37, 0.08)',
                        border: '1px solid rgba(134, 188, 37, 0.25)', borderRadius: 'var(--radius-sm)',
                        color: 'var(--green)', fontFamily: "'Inter', sans-serif", fontSize: 10,
                        fontWeight: 600, cursor: 'pointer'
                      }}
                    >
                      View Full Transcript →
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Add User Modal with live facial capture scanner */}
      {showAddModal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 200,
          background: 'rgba(1,10,26,0.82)', backdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }} onClick={() => setShowAddModal(false)}>
          <form onSubmit={handleAddUser} onClick={e => e.stopPropagation()} style={{
            background: 'var(--bg-surface-1)', border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-lg)', padding: '28px 24px', width: 380,
            maxHeight: '90vh', overflowY: 'auto',
            boxShadow: '0 24px 64px rgba(0,0,0,0.7)', display: 'flex', flexDirection: 'column', gap: 16
          }}>
            <div style={{ fontFamily: "'Inter', sans-serif", fontWeight: 600, fontSize: 16, color: 'var(--text-primary)' }}>
              Add User Profile (Admin)
            </div>

            {/* Mode selection toggle */}
            <div style={{ display: 'flex', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
              <button
                type="button"
                onClick={() => setEnrollMode('profile')}
                style={{
                  flex: 1, padding: '7px 0', border: 'none', fontSize: 12, fontWeight: 600,
                  background: enrollMode === 'profile' ? 'var(--green)' : 'transparent',
                  color: enrollMode === 'profile' ? '#010A1A' : 'var(--text-secondary)',
                  cursor: 'pointer', transition: 'all 150ms'
                }}
              >
                Profile Info Only
              </button>
              <button
                type="button"
                onClick={() => setEnrollMode('webcam')}
                style={{
                  flex: 1, padding: '7px 0', border: 'none', fontSize: 12, fontWeight: 600,
                  background: enrollMode === 'webcam' ? 'var(--green)' : 'transparent',
                  color: enrollMode === 'webcam' ? '#010A1A' : 'var(--text-secondary)',
                  cursor: 'pointer', transition: 'all 150ms'
                }}
              >
                Webcam Face Scan
              </button>
            </div>
            
            <FieldGroup>
              <Label htmlFor="usr_name">Full Name</Label>
              <input
                id="usr_name"
                type="text"
                value={newUserName}
                onChange={e => setNewUserName(e.target.value)}
                placeholder="e.g. John Doe"
                required
                style={{
                  width: '100%', padding: '9px 12px', boxSizing: 'border-box',
                  background: 'rgba(1,10,26,0.65)', border: '1px solid var(--border-default)',
                  borderRadius: 'var(--radius-md)', color: 'var(--text-primary)',
                  fontFamily: "'Inter', sans-serif", fontSize: 14, outline: 'none'
                }}
              />
            </FieldGroup>

            <FieldGroup>
              <Label htmlFor="usr_role">Role / Title (Optional)</Label>
              <input
                id="usr_role"
                type="text"
                value={newUserRole}
                onChange={e => setNewUserRole(e.target.value)}
                placeholder="e.g. Director of Finance"
                style={{
                  width: '100%', padding: '9px 12px', boxSizing: 'border-box',
                  background: 'rgba(1,10,26,0.65)', border: '1px solid var(--border-default)',
                  borderRadius: 'var(--radius-md)', color: 'var(--text-primary)',
                  fontFamily: "'Inter', sans-serif", fontSize: 14, outline: 'none'
                }}
              />
            </FieldGroup>

            <FieldGroup>
              <Label htmlFor="usr_co">Client Company</Label>
              <select
                id="usr_co"
                value={newUserCompany}
                onChange={e => setNewUserCompany(e.target.value)}
                style={{
                  width: '100%', padding: '9px 12px', boxSizing: 'border-box',
                  background: 'rgba(1,10,26,0.65)', border: '1px solid var(--border-default)',
                  borderRadius: 'var(--radius-md)', color: 'var(--text-primary)',
                  fontFamily: "'Inter', sans-serif", fontSize: 14, outline: 'none'
                }}
              >
                <option value="default">Default</option>
                {bots.map(b => (
                  <option key={b.id} value={b.id}>{b.company_name}</option>
                ))}
              </select>
            </FieldGroup>

            {/* Webcam scanner ui */}
            {enrollMode === 'webcam' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}>
                <Label>Live Facial Validation Capture</Label>
                
                <div style={{
                  position: 'relative',
                  width: 200,
                  height: 200,
                  borderRadius: '50%',
                  overflow: 'hidden',
                  border: `3px solid ${faceValidState === 'valid' ? 'var(--green)' : faceValidState === 'invalid' ? 'var(--error)' : 'var(--border-default)'}`,
                  background: '#010A1A',
                  boxShadow: '0 0 20px rgba(0,0,0,0.6)'
                }}>
                  {photoData ? (
                    <img src={photoData} alt="Captured face" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <video
                      ref={videoRefCallback}
                      autoPlay
                      muted
                      playsInline
                      style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }}
                    />
                  )}

                  {/* Circular scanning overlay radar animation */}
                  {cameraActive && !photoData && (
                    <div style={{
                      position: 'absolute',
                      inset: 0,
                      border: '2px solid rgba(134, 188, 37, 0.4)',
                      borderRadius: '50%',
                      pointerEvents: 'none',
                      animation: 'radar-sweep 2.5s linear infinite'
                    }} />
                  )}
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    onClick={photoData ? () => setPhotoData(null) : captureAndVerify}
                    style={{
                      padding: '6px 12px', background: 'rgba(1,52,122,0.5)',
                      border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)',
                      color: 'var(--text-primary)', fontSize: 12, cursor: 'pointer'
                    }}
                  >
                    {photoData ? 'Retake Photo' : 'Capture & Verify'}
                  </button>
                </div>

                {faceValidState !== 'idle' && (
                  <div style={{
                    padding: '8px 12px',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: 11,
                    textAlign: 'center',
                    background: faceValidState === 'checking' ? 'rgba(0,163,224,0.1)' : faceValidState === 'valid' ? 'rgba(134,188,37,0.1)' : 'rgba(255,68,68,0.1)',
                    border: `1px solid ${faceValidState === 'checking' ? 'rgba(0,163,224,0.3)' : faceValidState === 'valid' ? 'rgba(134,188,37,0.3)' : 'rgba(255,68,68,0.3)'}`,
                    color: faceValidState === 'checking' ? 'var(--text-secondary)' : faceValidState === 'valid' ? 'var(--green)' : 'var(--error)'
                  }}>
                    {faceValidState === 'checking' && 'Processing face recognition encoding analysis...'}
                    {faceValidState !== 'checking' && faceValidationMessage}
                  </div>
                )}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
              <button type="button" onClick={() => setShowAddModal(false)} style={{
                padding: '8px 16px', background: 'none', border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-md)', color: 'var(--text-secondary)',
                fontFamily: "'Inter', sans-serif", fontSize: 13, cursor: 'pointer'
              }}>
                Cancel
              </button>
              <button
                type="submit"
                disabled={addingUser || !newUserName.trim() || (enrollMode === 'webcam' && faceValidState !== 'valid')}
                style={{
                  padding: '8px 20px',
                  background: (addingUser || !newUserName.trim() || (enrollMode === 'webcam' && faceValidState !== 'valid')) ? 'rgba(134,188,37,0.25)' : 'var(--green)',
                  border: 'none', borderRadius: 'var(--radius-md)',
                  color: '#010A1A', fontFamily: "'Inter', sans-serif", fontWeight: 600, fontSize: 13,
                  cursor: (addingUser || !newUserName.trim() || (enrollMode === 'webcam' && faceValidState !== 'valid')) ? 'default' : 'pointer',
                  opacity: (addingUser || !newUserName.trim() || (enrollMode === 'webcam' && faceValidState !== 'valid')) ? 0.6 : 1
                }}
              >
                {addingUser ? 'Saving...' : 'Add User'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Transcript Detail Dialog Modal */}
      {selectedSessionForTranscript && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 300,
          background: 'rgba(1,10,26,0.85)', backdropFilter: 'blur(10px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }} onClick={() => setSelectedSessionForTranscript(null)}>
          <div onClick={e => e.stopPropagation()} style={{
            background: 'var(--bg-surface-1)', border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-lg)', width: 620, maxHeight: '80vh',
            display: 'flex', flexDirection: 'column', boxShadow: '0 24px 64px rgba(0,0,0,0.8)'
          }}>
            {/* Header */}
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', fontFamily: "'Inter', sans-serif" }}>
                  Conversation Log Transcript
                </h3>
                <span style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: "'JetBrains Mono', monospace" }}>
                  Session ID: {selectedSessionForTranscript.session_id.substring(0, 16)}...
                </span>
              </div>
              <button onClick={() => setSelectedSessionForTranscript(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 22 }}>
                ×
              </button>
            </div>

            {/* Content body */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: 18 }}>
              {/* Summary Card */}
              <div style={{ padding: 14, background: 'rgba(134,188,37,0.06)', border: '1px solid rgba(134,188,37,0.2)', borderRadius: 'var(--radius-md)' }}>
                <div style={{ fontWeight: 600, fontSize: 11, color: 'var(--green)', marginBottom: 5, fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.05em' }}>
                  CONVERSATION SUMMARY
                </div>
                <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.6, color: 'var(--text-secondary)', fontFamily: "'Inter', sans-serif" }}>
                  {selectedSessionForTranscript.summary}
                </p>
              </div>

              {/* Dialogue Transcript Turns */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {selectedSessionForTranscript.transcript ? (
                  selectedSessionForTranscript.transcript.split('\n').filter(Boolean).map((line, idx) => {
                    const isAgent = line.startsWith('AGENT:');
                    const isUser = line.startsWith('USER:');
                    const speaker = isAgent ? 'AGENT' : isUser ? 'USER' : 'SYSTEM';
                    const text = line.replace(/^(AGENT|USER|SYSTEM):\s*/i, '');
                    
                    return (
                      <div key={idx} style={{
                        display: 'flex',
                        justifyContent: isAgent ? 'flex-start' : 'flex-end',
                        gap: 10,
                        alignItems: 'flex-start'
                      }}>
                        {isAgent && (
                          <div style={{
                            width: 28, height: 28, borderRadius: '50%', background: 'rgba(134,188,37,0.15)',
                            border: '1px solid var(--green)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 11, fontWeight: 'bold', color: 'var(--green)', flexShrink: 0
                          }}>
                            V
                          </div>
                        )}
                        <div style={{
                          maxWidth: '75%',
                          padding: '10px 14px',
                          borderRadius: 'var(--radius-md)',
                          background: isAgent ? 'rgba(1,52,122,0.35)' : 'rgba(134,188,37,0.08)',
                          border: `1px solid ${isAgent ? 'rgba(0,163,224,0.25)' : 'rgba(134,188,37,0.25)'}`,
                        }}>
                          <div style={{
                            fontSize: 10,
                            fontFamily: "'JetBrains Mono', monospace",
                            color: isAgent ? 'var(--blue)' : 'var(--green)',
                            marginBottom: 4,
                            fontWeight: 600
                          }}>
                            {speaker}
                          </div>
                          <div style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.5, fontFamily: "'Inter', sans-serif" }}>
                            {text}
                          </div>
                        </div>
                      </div>
                    )
                  })
                ) : (
                  <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, padding: '20px 0', fontFamily: "'Inter', sans-serif" }}>
                    No detailed message logs recorded for this session.
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button
                type="button"
                onClick={() => {
                  if (selectedSessionForTranscript.transcript) {
                    navigator.clipboard.writeText(selectedSessionForTranscript.transcript)
                    alert("Session transcript copied to clipboard!")
                  }
                }}
                disabled={!selectedSessionForTranscript.transcript}
                style={{
                  padding: '8px 14px', background: 'none', border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-md)', color: 'var(--text-secondary)',
                  fontFamily: "'Inter', sans-serif", fontSize: 12, cursor: 'pointer',
                  opacity: selectedSessionForTranscript.transcript ? 1 : 0.5
                }}
              >
                Copy Transcript Logs
              </button>
              <button onClick={() => setSelectedSessionForTranscript(null)} style={{
                padding: '8px 16px', background: 'var(--green)', border: 'none',
                borderRadius: 'var(--radius-md)', color: '#010A1A',
                fontFamily: "'Inter', sans-serif", fontWeight: 600, fontSize: 12, cursor: 'pointer'
              }}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      
      <style>{`
        .hover-row:hover {
          background: rgba(134,188,37,0.02) !important;
        }
        @keyframes radar-sweep {
          0% { transform: rotate(0deg) scale(0.95); opacity: 0.8; }
          50% { transform: scale(1.05); opacity: 0.3; }
          100% { transform: rotate(360deg) scale(0.95); opacity: 0.8; }
        }
      `}</style>
    </div>
  )
}

// ── Root dashboard component ──────────────────────────────────────────

export function AdminDashboard({ token, onLogout }) {
  const [view, setView]         = useState('library')   // 'library' | 'editor'
  const [tab, setTab]           = useState('bots')      // 'bots' | 'users'
  const [editBot, setEditBot]   = useState(null)
  const [activatedSlug, setActivatedSlug] = useState(null)
  const [visible, setVisible]   = useState(false)

  useEffect(() => { const t = setTimeout(() => setVisible(true), 40); return () => clearTimeout(t) }, [])

  const handleEdit = (bot) => { setEditBot(bot); setView('editor') }
  const handleBack = () => { setView('library'); setEditBot(null) }
  const handleActivated = (slug) => { setActivatedSlug(slug) }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 'var(--z-boot)',
      background: 'var(--bg-base)',
      display: 'flex', flexDirection: 'column',
      opacity: visible ? 1 : 0, transition: 'opacity 280ms var(--ease-out-quart)',
    }}>
      {/* Top bar */}
      <div style={{
        height: 52, borderBottom: '1px solid var(--border-subtle)',
        background: 'rgba(1,10,26,0.95)', backdropFilter: 'blur(16px)',
        display: 'flex', alignItems: 'center', padding: '0 24px', flexShrink: 0,
      }}>
        <button onClick={() => { window.location.hash = '' }} style={{
          display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none',
          color: 'var(--text-muted)', fontFamily: "'JetBrains Mono', monospace",
          fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase',
          cursor: 'pointer', padding: '6px 8px', borderRadius: 'var(--radius-sm)', transition: 'color 150ms',
        }}
          onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-secondary)' }}
          onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)' }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          Back to Vaani
        </button>

        {/* Tab switchers */}
        {view === 'library' && (
          <div style={{ display: 'flex', gap: 4, marginLeft: 32 }}>
            <button onClick={() => setTab('bots')} style={{
              background: 'none', border: 'none',
              borderBottom: `2px solid ${tab === 'bots' ? 'var(--green)' : 'transparent'}`,
              color: tab === 'bots' ? 'var(--green)' : 'var(--text-secondary)',
              fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: tab === 'bots' ? 600 : 400,
              padding: '6px 14px', cursor: 'pointer', transition: 'all 150ms'
            }}>
              Configurations
            </button>
            <button onClick={() => setTab('users')} style={{
              background: 'none', border: 'none',
              borderBottom: `2px solid ${tab === 'users' ? 'var(--green)' : 'transparent'}`,
              color: tab === 'users' ? 'var(--green)' : 'var(--text-secondary)',
              fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: tab === 'users' ? 600 : 400,
              padding: '6px 14px', cursor: 'pointer', transition: 'all 150ms'
            }}>
              Users & History
            </button>
          </div>
        )}

        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <span style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 15, letterSpacing: '-0.02em', color: 'var(--text-primary)' }}>
            <span style={{ color: 'var(--green)' }}>V</span>AANI
          </span>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.1em' }}>
            ADMIN
          </span>
        </div>

        <button onClick={() => { sessionStorage.removeItem('vaani_admin_token'); onLogout() }} style={{
          padding: '7px 14px', background: 'none', border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-md)', color: 'var(--text-muted)',
          fontFamily: "'Inter', sans-serif", fontSize: 13, cursor: 'pointer', transition: 'all 150ms',
        }}
          onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.borderColor = 'var(--border-default)' }}
          onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.borderColor = 'var(--border-subtle)' }}
        >
          Sign out
        </button>
      </div>

      {/* Body */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {view === 'library' && tab === 'bots' && (
          <BotLibrary token={token} onEdit={handleEdit} onLogout={onLogout} />
        )}
        {view === 'library' && tab === 'users' && (
          <UserMemoryLibrary token={token} onLogout={onLogout} />
        )}
        {view === 'editor' && editBot && (
          <BotEditor bot={editBot} token={token} onBack={handleBack} onActivated={handleActivated} />
        )}
      </div>
    </div>
  )
}

