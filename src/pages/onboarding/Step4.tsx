import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

const DURATIONS = [
  { value: '30', label: '30 min', sub: 'Quick & focused' },
  { value: '45', label: '45 min', sub: 'Efficient' },
  { value: '60', label: '60 min', sub: 'Standard' },
  { value: '75', label: '75+ min', sub: 'Full sessions' },
]

const LIMITATIONS = [
  { value: 'lower_back', label: 'Lower back' },
  { value: 'knees', label: 'Knees' },
  { value: 'shoulders', label: 'Shoulders' },
  { value: 'wrists', label: 'Wrists / elbows' },
  { value: 'hips', label: 'Hips' },
  { value: 'none', label: 'None' },
]

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: '#0D1728',
  border: '1px solid #1A2A42',
  borderRadius: 12,
  padding: '13px 16px',
  color: '#FFFFFF',
  fontSize: 14,
  outline: 'none',
  fontFamily: 'inherit',
  boxSizing: 'border-box',
}

function savedLimitations(): string[] {
  try { return JSON.parse(localStorage.getItem('onboarding_limitations') ?? '[]') as string[] } catch { return [] }
}

export default function Step4() {
  const navigate = useNavigate()
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
        await supabase.from('users').update({ goal, experience_level, equipment }).eq('id', user.id)
        navigate('/workout')
      } else {
        navigate('/auth')
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="app-shell">
      <div className="app-content onboarding-scroll">

        {/* Progress pills */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 28 }}>
          {[1, 2, 3, 4].map(i => (
            <div key={i} style={{ flex: 1, height: 3, borderRadius: 99, background: '#4A9EFF', transition: 'background 0.3s' }} />
          ))}
        </div>

        <p style={{ color: '#4A9EFF', fontSize: 10, letterSpacing: '2px', textTransform: 'uppercase', margin: '0 0 10px' }}>
          STEP 4 OF 4 · OPTIONAL
        </p>
        <h1 style={{ color: '#FFFFFF', fontSize: 26, fontWeight: 700, margin: '0 0 8px', lineHeight: 1.2 }}>
          A little more about you
        </h1>
        <p style={{ color: '#5A7A9A', fontSize: 14, margin: '0 0 12px', lineHeight: 1.5 }}>
          Helps us fine-tune your plan even further.
        </p>

        <div style={{ background: '#0A1F0A', border: '1px solid #1A3A1A', borderRadius: 8, padding: '6px 10px', margin: '0 0 24px', display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ fontSize: 11 }}>🔒</span>
          <span style={{ color: '#5A9A5A', fontSize: 11 }}>Optional and private — only used to personalize your program</span>
        </div>

        {/* Workout duration */}
        <p style={{ color: '#FFFFFF', fontSize: 13, fontWeight: 600, margin: '0 0 10px' }}>
          How long do you want your workouts to be?
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 24 }}>
          {DURATIONS.map(opt => {
            const active = duration === opt.value
            return (
              <button
                key={opt.value}
                onClick={() => setDuration(active ? null : opt.value)}
                style={{
                  background: active ? '#0D1F3A' : '#0D1728',
                  border: `2px solid ${active ? '#4A9EFF' : '#1A2A42'}`,
                  borderRadius: 14, padding: '14px 12px',
                  display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
                  cursor: 'pointer', textAlign: 'left', width: '100%', transition: 'all 0.15s',
                }}
              >
                <span style={{ color: active ? '#FFFFFF' : '#BBCDE0', fontSize: 16, fontWeight: 700 }}>{opt.label}</span>
                <span style={{ color: '#5A7A9A', fontSize: 11, marginTop: 2 }}>{opt.sub}</span>
              </button>
            )
          })}
        </div>

        {/* Injuries / limitations */}
        <p style={{ color: '#FFFFFF', fontSize: 13, fontWeight: 600, margin: '0 0 4px' }}>
          Any injuries or areas to work around?
        </p>
        <p style={{ color: '#5A7A9A', fontSize: 11, margin: '0 0 10px' }}>Select all that apply</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 24 }}>
          {LIMITATIONS.map(opt => {
            const active = limitations.includes(opt.value)
            return (
              <button
                key={opt.value}
                onClick={() => toggleLimitation(opt.value)}
                style={{
                  background: active ? '#0D1F3A' : '#0D1728',
                  border: `1.5px solid ${active ? '#4A9EFF' : '#1A2A42'}`,
                  borderRadius: 20, padding: '8px 14px',
                  color: active ? '#FFFFFF' : '#BBCDE0',
                  fontSize: 13, fontWeight: active ? 600 : 400,
                  cursor: 'pointer', transition: 'all 0.15s',
                }}
              >
                {opt.label}
              </button>
            )
          })}
        </div>

        {/* Height */}
        <p style={{ color: '#FFFFFF', fontSize: 13, fontWeight: 600, margin: '0 0 6px' }}>
          Height <span style={{ color: '#5A7A9A', fontWeight: 400 }}>(optional)</span>
        </p>
        <div style={{ marginBottom: 14 }}>
          <input type="text" placeholder="e.g. 5'11 or 180cm" value={height} onChange={e => setHeight(e.target.value)} style={inputStyle} />
        </div>

        {/* Weight */}
        <p style={{ color: '#FFFFFF', fontSize: 13, fontWeight: 600, margin: '0 0 6px' }}>
          Weight <span style={{ color: '#5A7A9A', fontWeight: 400 }}>(optional)</span>
        </p>
        <div style={{ marginBottom: 32 }}>
          <input type="text" placeholder="e.g. 165 lbs or 75 kg" value={weight} onChange={e => setWeight(e.target.value)} style={inputStyle} />
        </div>

        <button
          onClick={() => finish(false)}
          disabled={saving}
          style={{ width: '100%', background: '#4A9EFF', color: '#FFFFFF', fontSize: 16, fontWeight: 700, borderRadius: 14, padding: '16px', border: 'none', cursor: 'pointer', marginBottom: 8 }}
        >
          {saving ? 'One moment…' : 'Build My Program →'}
        </button>
        <button
          onClick={() => finish(true)}
          disabled={saving}
          style={{ width: '100%', background: 'transparent', border: 'none', color: '#5A7A9A', fontSize: 14, padding: '14px', cursor: 'pointer' }}
        >
          Skip for now →
        </button>

      </div>
    </div>
  )
}
