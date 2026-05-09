import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useTheme } from '../lib/theme'

interface RecentTemplate {
  id: string
  name: string
  last_used_at: string | null
  exercise_count: number
}

const LAST_TYPE_KEY = 'ascend_last_workout_type'

const WORKOUT_TYPES = [
  {
    id: 'ascend',
    title: 'Ascend Method',
    subtitle: 'Personalized for you and your goals',
    emoji: '⚡',
    accent: '#4A9EFF',
    path: '/workout/ascend',
  },
  {
    id: 'custom',
    title: 'Custom Workout',
    subtitle: 'Build your own or repeat a saved session',
    emoji: '✏️',
    accent: '#3BF0A0',
    path: '/workout/custom',
  },
  {
    id: 'class',
    title: 'Class Workout',
    subtitle: 'Pilates, yoga, spin, HIIT, and more',
    emoji: '🏃',
    accent: '#F5A623',
    path: '/workout/class',
  },
]

export default function WorkoutTypeSelector() {
  const navigate = useNavigate()
  const location = useLocation()
  const isPreview = !!(location.state as { preview?: boolean } | null)?.preview
  const [lastType, setLastType] = useState<string | null>(null)
  const [recentTemplates, setRecentTemplates] = useState<RecentTemplate[]>([])
  const [ready, setReady] = useState(false)

  useEffect(() => {
    setLastType(localStorage.getItem(LAST_TYPE_KEY))
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { navigate('/auth'); return }

      const { data: tmplData } = await supabase
        .from('workout_templates')
        .select('id, name, last_used_at')
        .eq('user_id', user.id)
        .order('last_used_at', { ascending: false, nullsFirst: false })
        .limit(3)

      if (tmplData && tmplData.length > 0) {
        const tmplIds = tmplData.map(t => t.id as string)
        const { data: exCounts } = await supabase
          .from('template_exercises')
          .select('template_id')
          .in('template_id', tmplIds)

        const countMap = new Map<string, number>()
        for (const ex of exCounts ?? []) countMap.set(ex.template_id as string, (countMap.get(ex.template_id as string) ?? 0) + 1)

        setRecentTemplates(tmplData.map(t => ({
          id: t.id as string,
          name: t.name as string,
          last_used_at: t.last_used_at as string | null,
          exercise_count: countMap.get(t.id as string) ?? 0,
        })))
      }
      setReady(true)
    }
    load()
  }, [navigate])

  function selectType(typeId: string, path: string) {
    if (!isPreview) localStorage.setItem(LAST_TYPE_KEY, typeId)
    navigate(path, isPreview ? { state: { preview: true } } : {})
  }

  function quickStart(templateId: string) {
    localStorage.setItem(LAST_TYPE_KEY, 'custom')
    navigate('/workout/custom', { state: { templateId } })
  }

  const { colors: c } = useTheme()

  return (
    <div className="app-shell">
      <div className="app-content" style={{ background: c.bg, display: 'flex', flexDirection: 'column', height: '100vh' }}>
        <div style={{ flex: 1, overflow: 'auto', padding: '56px 24px 32px' }}>

          {isPreview && (
            <div style={{ background: c.accentBg, border: `1px solid ${c.accentBorder}`, borderRadius: 10, padding: '10px 14px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 14 }}>👁️</span>
              <p style={{ color: c.accent, fontSize: 12, fontWeight: 600, margin: 0 }}>Preview mode — plan tomorrow's workout</p>
            </div>
          )}
          <p style={{ color: c.accent, fontSize: 11, letterSpacing: '2px', textTransform: 'uppercase', margin: '0 0 8px' }}>
            {isPreview ? "Tomorrow's session" : 'Ready to train?'}
          </p>
          <h1 style={{ color: c.text, fontSize: 26, fontWeight: 700, margin: '0 0 28px', lineHeight: 1.2 }}>
            {isPreview ? 'Plan your workout type' : 'What kind of workout?'}
          </h1>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {WORKOUT_TYPES.map(opt => {
              const isLast = lastType === opt.id
              return (
                <button
                  key={opt.id}
                  onClick={() => selectType(opt.id, opt.path)}
                  style={{
                    background: c.surface,
                    border: `1.5px solid ${isLast ? opt.accent : c.border}`,
                    borderRadius: 18,
                    padding: '18px 20px',
                    display: 'flex', alignItems: 'center', gap: 16,
                    cursor: 'pointer', textAlign: 'left', width: '100%',
                    position: 'relative',
                  }}
                >
                  <span style={{ fontSize: 32, lineHeight: 1, flexShrink: 0 }}>{opt.emoji}</span>
                  <div style={{ flex: 1 }}>
                    <p style={{ color: c.text, fontSize: 16, fontWeight: 700, margin: '0 0 3px' }}>{opt.title}</p>
                    <p style={{ color: c.textSub, fontSize: 12, margin: 0 }}>{opt.subtitle}</p>
                  </div>
                  {isLast && (
                    <span style={{
                      position: 'absolute', top: 10, right: 14,
                      background: opt.accent + '22', color: opt.accent,
                      fontSize: 9, fontWeight: 700, borderRadius: 4,
                      padding: '2px 6px', letterSpacing: 1,
                    }}>
                      LAST USED
                    </span>
                  )}
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, opacity: 0.4 }}>
                    <path d="M9 18l6-6-6-6" stroke={c.text} strokeWidth="2.5" strokeLinecap="round" />
                  </svg>
                </button>
              )
            })}
          </div>

          {/* Quick-repeat section for saved custom templates — hidden in preview */}
          {ready && recentTemplates.length > 0 && !isPreview && (
            <div style={{ marginTop: 28 }}>
              <p style={{ color: c.textSub, fontSize: 10, letterSpacing: '1.5px', textTransform: 'uppercase', margin: '0 0 12px' }}>
                Quick Repeat
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {recentTemplates.map(t => (
                  <button
                    key={t.id}
                    onClick={() => quickStart(t.id)}
                    style={{
                      background: c.surface, border: `1px solid ${c.border}`,
                      borderRadius: 14, padding: '13px 16px',
                      display: 'flex', alignItems: 'center', gap: 12,
                      cursor: 'pointer', width: '100%', textAlign: 'left',
                    }}
                  >
                    <span style={{ fontSize: 20, flexShrink: 0 }}>✏️</span>
                    <div style={{ flex: 1 }}>
                      <p style={{ color: c.text, fontSize: 14, fontWeight: 700, margin: '0 0 2px' }}>{t.name}</p>
                      <p style={{ color: c.textSub, fontSize: 11, margin: 0 }}>
                        {t.exercise_count} exercise{t.exercise_count !== 1 ? 's' : ''}
                        {t.last_used_at
                          ? ` · ${new Date(t.last_used_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
                          : ''}
                      </p>
                    </div>
                    <span style={{ color: '#3BF0A0', fontSize: 13, fontWeight: 700, flexShrink: 0 }}>Start →</span>
                  </button>
                ))}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
