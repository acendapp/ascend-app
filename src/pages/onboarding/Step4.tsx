import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

const TRAINING_DAYS = [
  { value: '3', label: '3 days / week', sub: 'Building the habit' },
  { value: '4', label: '4 days / week', sub: 'Solid commitment' },
  { value: '5', label: '5 days / week', sub: 'Serious about it' },
  { value: '6', label: '6+ days / week', sub: 'Going all in' },
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

export default function Step4() {
  const navigate = useNavigate()
  const [trainingDays, setTrainingDays] = useState<string | null>(
    localStorage.getItem('onboarding_training_days')
  )
  const [height, setHeight] = useState(localStorage.getItem('onboarding_height') ?? '')
  const [weight, setWeight] = useState(localStorage.getItem('onboarding_weight') ?? '')
  const [saving, setSaving] = useState(false)

  async function finish(skip: boolean) {
    if (!skip) {
      if (trainingDays) localStorage.setItem('onboarding_training_days', trainingDays)
      if (height.trim()) localStorage.setItem('onboarding_height', height.trim())
      if (weight.trim()) localStorage.setItem('onboarding_weight', weight.trim())
    }

    setSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        // User already signed up — update their profile with all onboarding data
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
            <div key={i} style={{ flex: 1, height: 3, borderRadius: 99, background: i <= 4 ? '#4A9EFF' : '#1A2A42', transition: 'background 0.3s' }} />
          ))}
        </div>

        {/* Header */}
        <p style={{ color: '#4A9EFF', fontSize: 10, letterSpacing: '2px', textTransform: 'uppercase', margin: '0 0 10px' }}>
          STEP 4 OF 4 · OPTIONAL
        </p>
        <h1 style={{ color: '#FFFFFF', fontSize: 26, fontWeight: 700, margin: '0 0 8px', lineHeight: 1.2 }}>
          A little more about you
        </h1>
        <p style={{ color: '#5A7A9A', fontSize: 14, margin: '0 0 12px', lineHeight: 1.5 }}>
          Helps us fine-tune your plan even further.
        </p>

        {/* Privacy note */}
        <p style={{ color: '#3A5A3A', background: '#0A1F0A', border: '1px solid #1A3A1A', borderRadius: 8, fontSize: 11, padding: '6px 10px', margin: '0 0 24px', display: 'flex', alignItems: 'center', gap: 5 }}>
          <span>🔒</span>
          <span style={{ color: '#5A9A5A' }}>Optional and private — only you and your program can see this</span>
        </p>

        {/* Training frequency */}
        <p style={{ color: '#FFFFFF', fontSize: 13, fontWeight: 600, margin: '0 0 10px' }}>
          How many days per week do you want to train?
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
          {TRAINING_DAYS.map(opt => {
            const active = trainingDays === opt.value
            return (
              <button
                key={opt.value}
                onClick={() => setTrainingDays(active ? null : opt.value)}
                style={{
                  background: active ? '#0D1F3A' : '#0D1728',
                  border: `2px solid ${active ? '#4A9EFF' : '#1A2A42'}`,
                  borderRadius: 14,
                  padding: '14px 16px',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  cursor: 'pointer', textAlign: 'left', width: '100%',
                  transition: 'all 0.15s',
                }}
              >
                <span style={{ color: active ? '#FFFFFF' : '#BBCDE0', fontSize: 15, fontWeight: 600 }}>{opt.label}</span>
                <span style={{ color: '#5A7A9A', fontSize: 12 }}>{opt.sub}</span>
              </button>
            )
          })}
        </div>

        {/* Height */}
        <p style={{ color: '#FFFFFF', fontSize: 13, fontWeight: 600, margin: '0 0 6px' }}>
          Height <span style={{ color: '#5A7A9A', fontWeight: 400 }}>(optional)</span>
        </p>
        <div style={{ marginBottom: 16 }}>
          <input
            type="text"
            placeholder="e.g. 5'11 or 180cm"
            value={height}
            onChange={e => setHeight(e.target.value)}
            style={inputStyle}
          />
        </div>

        {/* Weight */}
        <p style={{ color: '#FFFFFF', fontSize: 13, fontWeight: 600, margin: '0 0 6px' }}>
          Weight <span style={{ color: '#5A7A9A', fontWeight: 400 }}>(optional)</span>
        </p>
        <div style={{ marginBottom: 32 }}>
          <input
            type="text"
            placeholder="e.g. 165 lbs or 75 kg"
            value={weight}
            onChange={e => setWeight(e.target.value)}
            style={inputStyle}
          />
        </div>

        {/* Actions */}
        <button
          onClick={() => finish(false)}
          disabled={saving}
          style={{
            width: '100%',
            background: '#4A9EFF',
            color: '#FFFFFF',
            fontSize: 16, fontWeight: 700, borderRadius: 14, padding: '16px',
            border: 'none', cursor: 'pointer', transition: 'background 0.2s', marginBottom: 8,
          }}
        >
          {saving ? 'One moment…' : 'Build My Program →'}
        </button>

        <button
          onClick={() => finish(true)}
          disabled={saving}
          style={{
            width: '100%', background: 'transparent', border: 'none',
            color: '#5A7A9A', fontSize: 14, padding: '14px', cursor: 'pointer',
          }}
        >
          Skip for now →
        </button>

      </div>
    </div>
  )
}
