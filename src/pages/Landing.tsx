import { useNavigate } from 'react-router-dom'
import AscendBolt from '../components/AscendBolt'
import { useTheme } from '../lib/theme'

const FEATURES = [
  {
    icon: '⚡',
    title: 'Smart workouts, every session',
    sub: 'Built around your recovery, history, and goals — not a generic template.',
  },
  {
    icon: '🤝',
    title: 'Grow with your Penn community',
    sub: 'Leaderboards, challenges, and real motivation from people you know.',
  },
  {
    icon: '📈',
    title: 'Track every PR and streak',
    sub: 'Your Ascend Score rises with consistency, strength, and community.',
  },
]

export default function Landing() {
  const navigate = useNavigate()
  const { colors: c } = useTheme()

  return (
    <div className="app-shell">
      <div
        className="app-content"
        style={{
          display: 'flex',
          flexDirection: 'column',
          minHeight: '100vh',
          padding: '0 24px',
          background: `linear-gradient(180deg, ${c.isDark ? '#060B15' : '#EFF4FF'} 0%, ${c.bg} 40%, ${c.isDark ? '#0A1425' : '#E8F0FF'} 100%)`,
        }}
      >
        {/* Hero */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', paddingTop: 72, paddingBottom: 32 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
            <AscendBolt size={36} />
            <span style={{ color: c.text, fontSize: 22, fontWeight: 800, letterSpacing: '-0.5px' }}>Ascend</span>
            <span style={{
              background: c.accentBg, border: `1px solid ${c.accentBorder}`,
              borderRadius: 6, padding: '2px 8px',
              color: c.accent, fontSize: 10, fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase',
            }}>
              Penn
            </span>
          </div>

          <h1 style={{
            color: c.text,
            fontSize: 38,
            fontWeight: 800,
            lineHeight: 1.1,
            margin: '0 0 16px',
            letterSpacing: '-1px',
          }}>
            Train smarter.<br />
            <span style={{ color: c.accent }}>Rise together</span><br />
            at Penn.
          </h1>

          <p style={{
            color: c.textSub,
            fontSize: 15,
            lineHeight: 1.6,
            margin: '0 0 40px',
            maxWidth: 300,
          }}>
            Personalized workouts, live leaderboards, and a community built to push you — all in one place.
          </p>

          {/* Feature list */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 48 }}>
            {FEATURES.map(f => (
              <div key={f.title} style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                <div style={{
                  width: 38, height: 38, borderRadius: 10,
                  background: c.surface, border: `1px solid ${c.border}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 18, flexShrink: 0,
                }}>
                  {f.icon}
                </div>
                <div>
                  <p style={{ color: c.text, fontSize: 13, fontWeight: 700, margin: '0 0 2px' }}>{f.title}</p>
                  <p style={{ color: c.textSub, fontSize: 12, margin: 0, lineHeight: 1.4 }}>{f.sub}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* CTAs */}
        <div style={{ paddingBottom: 48 }}>
          <button
            onClick={() => navigate('/onboarding/step0')}
            style={{
              width: '100%',
              background: c.accent,
              border: 'none',
              borderRadius: 14,
              padding: '17px',
              color: '#FFFFFF',
              fontSize: 16,
              fontWeight: 800,
              cursor: 'pointer',
              letterSpacing: '-0.3px',
              marginBottom: 16,
              boxShadow: `0 4px 24px ${c.accentBg}`,
            }}
          >
            Get started — it's free
          </button>

          <p style={{ textAlign: 'center', margin: 0 }}>
            <span style={{ color: c.textSub, fontSize: 14 }}>Already have an account? </span>
            <button
              onClick={() => navigate('/auth', { state: { mode: 'signin' } })}
              style={{
                background: 'none', border: 'none',
                color: c.accent, fontSize: 14, fontWeight: 700,
                cursor: 'pointer', padding: 0,
              }}
            >
              Sign in
            </button>
          </p>
        </div>
      </div>
    </div>
  )
}
