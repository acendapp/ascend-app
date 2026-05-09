import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTheme } from '../../lib/theme'

const OPTIONS = [
  { value: 'male', emoji: '♂️', label: 'Male' },
  { value: 'female', emoji: '♀️', label: 'Female' },
  { value: 'other', emoji: '⚧', label: 'Prefer not to say' },
]

export default function Step0() {
  const navigate = useNavigate()
  const { colors: c } = useTheme()
  const saved = localStorage.getItem('onboarding_sex')
  const [selected, setSelected] = useState<string | null>(saved)

  return (
    <div className="app-shell">
      <div className="app-content onboarding-scroll" style={{ background: c.bg }}>
        {/* Progress bar — 0/4 filled */}
        <div style={{ display: 'flex', gap: 5, margin: '-16px -20px 36px' }}>
          {[1,2,3,4].map(i => (
            <div key={i} style={{ flex: 1, height: 3, background: i === 0 ? c.accent : c.border }} />
          ))}
        </div>

        <p style={{ color: c.textFaint, fontSize: 11, fontWeight: 600, letterSpacing: '0.5px', margin: '0 0 16px', textTransform: 'uppercase' }}>
          Step 1 of 5
        </p>

        <h1 style={{ color: c.text, fontSize: 28, fontWeight: 800, margin: '0 0 10px', lineHeight: 1.15, letterSpacing: '-0.5px' }}>
          What's your biological sex?
        </h1>
        <p style={{ color: c.textSub, fontSize: 14, margin: '0 0 8px', lineHeight: 1.6 }}>
          Used only to personalize your workouts and strength benchmarks.
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 32 }}>
          <span style={{ fontSize: 11 }}>🔒</span>
          <span style={{ color: c.textMuted, fontSize: 11 }}>Private — never shared</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 40 }}>
          {OPTIONS.map(opt => {
            const active = selected === opt.value
            return (
              <button
                key={opt.value}
                onClick={() => setSelected(opt.value)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 14,
                  background: active ? c.accentBg : c.surface,
                  border: `1px solid ${active ? c.accent : c.border}`,
                  borderRadius: 14, padding: '16px 18px',
                  cursor: 'pointer', textAlign: 'left', width: '100%',
                }}
              >
                <span style={{ fontSize: 22 }}>{opt.emoji}</span>
                <span style={{ color: c.text, fontSize: 15, fontWeight: active ? 700 : 400 }}>{opt.label}</span>
                {active && <span style={{ marginLeft: 'auto', color: c.accent, fontSize: 16 }}>✓</span>}
              </button>
            )
          })}
        </div>

        <button
          onClick={() => {
            if (selected) localStorage.setItem('onboarding_sex', selected)
            navigate('/onboarding/step1')
          }}
          disabled={!selected}
          style={{
            width: '100%', background: selected ? c.accent : c.border,
            color: selected ? '#FFFFFF' : c.textMuted,
            fontSize: 16, fontWeight: 700, borderRadius: 14, padding: '17px',
            border: 'none', cursor: selected ? 'pointer' : 'default',
            marginBottom: 4, letterSpacing: '0.2px',
            boxShadow: selected ? `0 4px 20px ${c.accentBg}` : 'none',
          }}
        >
          Continue →
        </button>
        <button
          onClick={() => navigate('/onboarding/step1')}
          style={{ width: '100%', background: 'transparent', border: 'none', color: c.textMuted, fontSize: 14, padding: '14px', cursor: 'pointer' }}
        >
          Skip for now →
        </button>
      </div>
    </div>
  )
}
