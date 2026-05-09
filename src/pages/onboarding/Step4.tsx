import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useTheme } from '../../lib/theme'

const DURATIONS = [
  { value: '30', label: '30 min' },
  { value: '45', label: '45 min' },
  { value: '60', label: '60 min' },
  { value: '75', label: '75+ min' },
]

const LIMITATIONS = [
  { value: 'lower_back', label: 'Lower back' },
  { value: 'knees', label: 'Knees' },
  { value: 'shoulders', label: 'Shoulders' },
  { value: 'wrists', label: 'Wrists / elbows' },
  { value: 'hips', label: 'Hips' },
  { value: 'none', label: 'None' },
]

function savedLimitations(): string[] {
  try { return JSON.parse(localStorage.getItem('onboarding_limitations') ?? '[]') as string[] } catch { return [] }
}

export default function Step4() {
  const navigate = useNavigate()
  const { colors: c } = useTheme()
  const [duration, setDuration] = useState<string | null>(localStorage.getItem('onboarding_workout_duration'))
  const [limitations, setLimitations] = useState<string[]>(savedLimitations)
  const [height, setHeight] = useState(localStorage.getItem('onboarding_height') ?? '')
  const [weight, setWeight] = useState(localStorage.getItem('onboarding_weight') ?? '')
  const [saving, setSaving] = useState(false)

  function toggleLimitation(val: string) {
    if (val === 'none') {
      setLimitations(prev => prev.includes('none') ? [] : ['none'])
      return
    }
    setLimitations(prev => {
      const without = prev.filter(v => v !== 'none')
      return without.includes(val) ? without.filter(v => v !== val) : [...without, val]
    })
  }

  async function finish(skip: boolean) {
    if (!skip) {
      if (duration) localStorage.setItem('onboarding_workout_duration', duration)
      if (limitations.length) localStorage.setItem('onboarding_limitations', JSON.stringify(limitations))
      if (height.trim()) localStorage.setItem('onboarding_height', height.trim())
      if (weight.trim()) localStorage.setItem('onboarding_weight', weight.trim())
    }

    setSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const goal = localStorage.getItem('onboarding_goal')
        const experience_level = localStorage.getItem('onboarding_experience')
        const equipment = localStorage.getItem('onboarding_equipment')
        const sex = localStorage.getItem('onboarding_sex')
        await supabase.from('users').update({ goal, experience_level, equipment, ...(sex ? { sex } : {}) }).eq('id', user.id)
        navigate('/workout')
      } else {
        navigate('/auth')
      }
    } finally {
      setSaving(false)
    }
  }

  const sectionLabel: React.CSSProperties = {
    color: c.text,
    fontSize: 13,
    fontWeight: 700,
    margin: '0 0 12px',
  }

  const sectionSub: React.CSSProperties = {
    color: c.textSub,
    fontSize: 12,
    fontWeight: 400,
    marginLeft: 6,
  }

  return (
    <div className="app-shell">
      <div className="app-content onboarding-scroll" style={{ background: c.bg }}>

        {/* Progress — all 4 filled */}
        <div style={{ display: 'flex', gap: 5, margin: '-16px -20px 36px' }}>
          {[1, 2, 3, 4].map(i => (
            <div key={i} style={{ flex: 1, height: 3, background: c.accent }} />
          ))}
        </div>

        <p style={{ color: c.textFaint, fontSize: 11, fontWeight: 600, letterSpacing: '0.5px', margin: '0 0 16px', textTransform: 'uppercase' }}>
          4 / 4 · Optional
        </p>

        <h1 style={{ color: c.text, fontSize: 30, fontWeight: 800, margin: '0 0 12px', lineHeight: 1.15, letterSpacing: '-0.5px' }}>
          Fine-tune your program
        </h1>
        <p style={{ color: c.textSub, fontSize: 15, margin: '0 0 8px', lineHeight: 1.6 }}>
          Skip anything that doesn't apply. You can always update this in settings.
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 36 }}>
          <span style={{ fontSize: 11 }}>🔒</span>
          <span style={{ color: c.textMuted, fontSize: 11 }}>Private — only used to personalize your plan</span>
        </div>

        {/* Workout duration */}
        <p style={sectionLabel}>
          How long do you want your sessions? <span style={sectionSub}>Optional</span>
        </p>
        <div style={{ display: 'flex', gap: 8, marginBottom: 32 }}>
          {DURATIONS.map(opt => {
            const active = duration === opt.value
            return (
              <button
                key={opt.value}
                onClick={() => setDuration(active ? null : opt.value)}
                style={{
                  flex: 1,
                  background: active ? c.accentBg : 'transparent',
                  border: `1px solid ${active ? c.accent : c.border}`,
                  borderRadius: 10,
                  padding: '12px 4px',
                  color: active ? c.text : c.textSub,
                  fontSize: 13,
                  fontWeight: active ? 700 : 400,
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                {opt.label}
              </button>
            )
          })}
        </div>

        {/* Injuries */}
        <p style={sectionLabel}>
          Any injuries to work around? <span style={sectionSub}>Optional</span>
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 32 }}>
          {LIMITATIONS.map(opt => {
            const active = limitations.includes(opt.value)
            return (
              <button
                key={opt.value}
                onClick={() => toggleLimitation(opt.value)}
                style={{
                  background: active ? c.accentBg : 'transparent',
                  border: `1px solid ${active ? c.accent : c.border}`,
                  borderRadius: 20,
                  padding: '9px 16px',
                  color: active ? c.text : c.textSub,
                  fontSize: 13,
                  fontWeight: active ? 600 : 400,
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                {opt.label}
              </button>
            )
          })}
        </div>

        {/* Height & Weight */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 40 }}>
          <div style={{ flex: 1 }}>
            <p style={{ ...sectionLabel, marginBottom: 8 }}>Height <span style={sectionSub}>opt.</span></p>
            <input
              type="text"
              placeholder="5'11 or 180cm"
              value={height}
              onChange={e => setHeight(e.target.value)}
              style={{
                width: '100%',
                background: c.inputBg,
                border: `1px solid ${c.border}`,
                borderRadius: 10,
                padding: '12px 14px',
                color: c.text,
                fontSize: 14,
                outline: 'none',
                fontFamily: 'inherit',
                boxSizing: 'border-box',
              }}
            />
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ ...sectionLabel, marginBottom: 8 }}>Weight <span style={sectionSub}>opt.</span></p>
            <input
              type="text"
              placeholder="165 lbs or 75kg"
              value={weight}
              onChange={e => setWeight(e.target.value)}
              style={{
                width: '100%',
                background: c.inputBg,
                border: `1px solid ${c.border}`,
                borderRadius: 10,
                padding: '12px 14px',
                color: c.text,
                fontSize: 14,
                outline: 'none',
                fontFamily: 'inherit',
                boxSizing: 'border-box',
              }}
            />
          </div>
        </div>

        <button
          onClick={() => finish(false)}
          disabled={saving}
          style={{
            width: '100%',
            background: c.accent,
            color: '#FFFFFF',
            fontSize: 16,
            fontWeight: 700,
            borderRadius: 14,
            padding: '17px',
            border: 'none',
            cursor: saving ? 'not-allowed' : 'pointer',
            marginBottom: 4,
            letterSpacing: '0.2px',
          }}
        >
          {saving ? 'One moment…' : 'Build My Program →'}
        </button>
        <button
          onClick={() => finish(true)}
          disabled={saving}
          style={{
            width: '100%',
            background: 'transparent',
            border: 'none',
            color: c.textMuted,
            fontSize: 14,
            padding: '15px',
            cursor: 'pointer',
          }}
        >
          Skip for now →
        </button>

      </div>
    </div>
  )
}
