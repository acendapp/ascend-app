import { useNavigate } from 'react-router-dom'
import AscendBolt from '../components/AscendBolt'

const FEATURES = [
  {
    icon: '⚡',
    title: 'AI-built workouts, every session',
    sub: 'Adapts to your recovery, history, and goals — not a generic template.',
  },
  {
    icon: '🏆',
    title: 'Compete with your Penn network',
    sub: 'Leaderboards, challenges, and real rivalries with people you know.',
  },
  {
    icon: '📈',
    title: 'Track every PR and streak',
    sub: 'Your Ascend Score rises with consistency, strength, and social pull.',
  },
]

export default function Landing() {
  const navigate = useNavigate()

  return (
    <div className="app-shell">
      <div
        className="app-content"
        style={{
          display: 'flex',
          flexDirection: 'column',
          minHeight: '100vh',
          padding: '0 24px',
          background: 'linear-gradient(180deg, #060B15 0%, #080E1C 40%, #0A1425 100%)',
        }}
      >
        {/* Hero */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', paddingTop: 72, paddingBottom: 32 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
            <AscendBolt size={36} />
            <span style={{ color: '#FFFFFF', fontSize: 22, fontWeight: 800, letterSpacing: '-0.5px' }}>Ascend</span>
            <span style={{
              background: '#0A1F3A', border: '1px solid #1E3D6E',
              borderRadius: 6, padding: '2px 8px',
              color: '#4A9EFF', fontSize: 10, fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase',
            }}>
              Penn
            </span>
          </div>

          <h1 style={{
            color: '#FFFFFF',
            fontSize: 38,
            fontWeight: 800,
            lineHeight: 1.1,
            margin: '0 0 16px',
            letterSpacing: '-1px',
          }}>
            Train smarter.<br />
            <span style={{ color: '#4A9EFF' }}>Outcompete</span> your<br />
            Penn network.
          </h1>

          <p style={{
            color: '#6B8CAE',
            fontSize: 15,
            lineHeight: 1.6,
            margin: '0 0 40px',
            maxWidth: 300,
          }}>
            AI-personalized workouts, live leaderboards, and a community built to push you — all in one place.
          </p>

          {/* Feature list */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 48 }}>
            {FEATURES.map(f => (
              <div key={f.title} style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                <div style={{
                  width: 38, height: 38, borderRadius: 10,
                  background: '#0D1728', border: '1px solid #1A2A42',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 18, flexShrink: 0,
                }}>
                  {f.icon}
                </div>
                <div>
                  <p style={{ color: '#FFFFFF', fontSize: 13, fontWeight: 700, margin: '0 0 2px' }}>{f.title}</p>
                  <p style={{ color: '#5A7A9A', fontSize: 12, margin: 0, lineHeight: 1.4 }}>{f.sub}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* CTAs */}
        <div style={{ paddingBottom: 48 }}>
          <button
            onClick={() => navigate('/onboarding/step1')}
            style={{
              width: '100%',
              background: '#4A9EFF',
              border: 'none',
              borderRadius: 14,
              padding: '17px',
              color: '#FFFFFF',
              fontSize: 16,
              fontWeight: 800,
              cursor: 'pointer',
              letterSpacing: '-0.3px',
              marginBottom: 16,
              boxShadow: '0 4px 24px rgba(74, 158, 255, 0.3)',
            }}
          >
            Get started — it's free
          </button>

          <p style={{ textAlign: 'center', margin: 0 }}>
            <span style={{ color: '#5A7A9A', fontSize: 14 }}>Already have an account? </span>
            <button
              onClick={() => navigate('/auth', { state: { mode: 'signin' } })}
              style={{
                background: 'none', border: 'none',
                color: '#4A9EFF', fontSize: 14, fontWeight: 700,
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
