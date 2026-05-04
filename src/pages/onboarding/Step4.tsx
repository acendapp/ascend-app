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
  background: '#FFFFFF',
  border: '1.5px solid #E5E7EB',
  borderRadius: 12,
  padding: '13px 16px',
  color: '#111827',
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
        <div style={{ display: 'flex', gap: 6, marginBottom: 32 }}>
          {[1, 2, 3, 4].map(i => (
            <div key={i} style={{ flex: 1, height: 4, borderRadius: 99, background: '#FF5C00', transition: 'background 0.3s' }} />
          ))}
        </div>

        <p style={{ color: '#FF5C00', fontSize: 11, letterSpacing: '1.5px', textTransform: 'uppercase', fontWeight: 700, margin: '0 0 10px' }}>
          STEP 4 OF 4 · OPTIONAL
        </p>
        <h1 style={{ color: '#111827', fontSize: 26, fontWeight: 800, margin: '0 0 8px', lineHeight: 1.2 }}>
          A little more about you
        </h1>
        <p style={{ color: '#6B7280', fontSize: 14, margin: '0 0 12px', lineHeight: 1.6 }}>
          Helps us fine-tune your plan even further.
        </p>

        <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 10, padding: '8px 12px', margin: '0 0 24px', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 12 }}>🔒</span>
          <span style={{ color: '#15803D', fontSize: 12, fontWeight: 500 }}>Optional and private — only used to personalize your program</span>
        </div>

        {/* Workout duration */}
        <p style={{ color: '#111827', fontSize: 14, fontWeight: 700, margin: '0 0 10px' }}>
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
                  background: active ? 'rgba(255,92,0,0.06)' : '#FFFFFF',
                  border: `2px solid ${active ? '#FF5C00' : '#E5E7EB'}`,
                  borderRadius: 14, padding: '14px 12px',
                  display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
                  cursor: 'pointer', textAlign: 'left', width: '100%', transition: 'all 0.15s',
                  boxShadow: active ? '0 2px 8px rgba(255,92,0,0.12)' : '0 1px 3px rgba(0,0,0,0.05)',
                }}
              >
                <span style={{ color: active ? '#FF5C00' : '#111827', fontSize: 16, fontWeight: 700 }}>{opt.label}</span>
                <span style={{ color: '#6B7280', fontSize: 11, marginTop: 2 }}>{opt.sub}</span>
              </button>
            )
          })}
        </div>

        {/* Injuries / limitations */}
        <p style={{ color: '#111827', fontSize: 14, fontWeight: 700, margin: '0 0 4px' }}>
          Any injuries or areas to work around?
        </p>
        <p style={{ color: '#9CA3AF', fontSize: 12, fontWeight: 500, margin: '0 0 10px' }}>Select all that apply</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 24 }}>
          {LIMITATIONS.map(opt => {
            const active = limitations.includes(opt.value)
            return (
              <button
                key={opt.value}
                onClick={() => toggleLimitation(opt.value)}
                style={{
                  background: active ? 'rgba(255,92,0,0.06)' : '#FFFFFF',
                  border: `1.5px solid ${active ? '#FF5C00' : '#E5E7EB'}`,
                  borderRadius: 20, padding: '8px 16px',
                  color: active ? '#FF5C00' : '#6B7280',
                  fontSize: 13, fontWeight: active ? 700 : 500,
                  cursor: 'pointer', transition: 'all 0.15s',
                  boxShadow: active ? '0 1px 4px rgba(255,92,0,0.15)' : 'none',
                }}
              >
                {opt.label}
              </button>
            )
          })}
        </div>

        {/* Height */}
        <p style={{ color: '#111827', fontSize: 14, fontWeight: 700, margin: '0 0 6px' }}>
          Height <span style={{ color: '#9CA3AF', fontWeight: 500 }}>(optional)</span>
        </p>
        <div style={{ marginBottom: 14 }}>
          <input type="text" placeholder="e.g. 5'11 or 180cm" value={height} onChange={e => setHeight(e.target.value)} style={inputStyle} />
        </div>

        {/* Weight */}
        <p style={{ color: '#111827', fontSize: 14, fontWeight: 700, margin: '0 0 6px' }}>
          Weight <span style={{ color: '#9CA3AF', fontWeight: 500 }}>(optional)</span>
        </p>
        <div style={{ marginBottom: 32 }}>
          <input type="text" placeholder="e.g. 165 lbs or 75 kg" value={weight} onChange={e => setWeight(e.target.value)} style={inputStyle} />
        </div>

        <button
          onClick={() => finish(false)}
          disabled={saving}
          style={{
            width: '100%', background: saving ? '#E5E7EB' : '#FF5C00', color: saving ? '#9CA3AF' : '#FFFFFF',
            fontSize: 16, fontWeight: 700, borderRadius: 14, padding: '17px',
            border: 'none', cursor: saving ? 'not-allowed' : 'pointer', marginBottom: 8,
            boxShadow: saving ? 'none' : '0 4px 14px rgba(255,92,0,0.3)',
            transition: 'all 0.2s',
          }}
        >
          {saving ? 'One moment…' : 'Build My Program →'}
        </button>
        <button
          onClick={() => finish(true)}
          disabled={saving}
          style={{ width: '100%', background: 'transparent', border: 'none', color: '#6B7280', fontSize: 14, fontWeight: 500, padding: '14px', cursor: 'pointer' }}
        >
          Skip for now →
        </button>

      </div>
    </div>
  )
}
