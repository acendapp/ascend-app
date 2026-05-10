import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useTheme, ACCENT_COLORS } from '../lib/theme'

interface RecentTemplate {
  id: string
  name: string
  last_used_at: string | null
  exercise_count: number
}

const LAST_TYPE_KEY = 'ascend_last_workout_type'

const WORKOUT_TYPE_DEFS = [
  {
    id: 'ascend',
    title: 'Ascend Method',
    subtitle: 'Personalized for you and your goals',
    emoji: '⚡',
    accentDynamic: true,
    staticAccent: '',
    path: '/workout/ascend',
  },
  {
    id: 'custom',
    title: 'Custom Workout',
    subtitle: 'Build your own or repeat a saved session',
    emoji: '✏️',
    accentDynamic: false,
    staticAccent: '#3BF0A0',
    path: '/workout/custom',
  },
  {
    id: 'class',
    title: 'Class Workout',
    subtitle: 'Pilates, yoga, spin, HIIT, and more',
    emoji: '🏃',
    accentDynamic: false,
    staticAccent: '#F5A623',
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

  const { colors: c, accentKey, setAccentColor } = useTheme()
  const [showAccentPicker, setShowAccentPicker] = useState(() => !localStorage.getItem('ascend_accent_chosen'))

  if (showAccentPicker) {
    return (
      <div className="app-shell">
        <div className="app-content" style={{ background: c.bg, display: 'flex', flexDirection: 'column', height: '100vh' }}>
          <div style={{ flex: 1, overflow: 'auto', padding: '64px 24px 40px', display: 'flex', flexDirection: 'column' }}>
            {/* Suppress the 0.4s global transition on accent-colored elements so the live preview is instant */}
            <p style={{ color: c.accent, fontSize: 11, letterSpacing: '2px', textTransform: 'uppercase', margin: '0 0 10px', transition: 'color 0.1s' }}>One last thing</p>
            <h1 style={{ color: c.text, fontSize: 28, fontWeight: 800, margin: '0 0 10px', lineHeight: 1.15, letterSpacing: '-0.5px' }}>Make it yours</h1>
            <p style={{ color: c.textSub, fontSize: 14, margin: '0 0 36px', lineHeight: 1.55 }}>
              Pick your accent color. It applies everywhere in the app — you can always change it in Profile.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 'auto' }}>
              {Object.entries(ACCENT_COLORS).map(([key, def]) => {
                const selected = accentKey === key
                // Use the mode-appropriate shade so the swatch matches exactly what will appear in the app
                const swatchColor = c.isDark ? def.dark : def.light
                return (
                  <button
                    key={key}
                    onClick={() => setAccentColor(key)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '4px 0' }}
                  >
                    <div style={{
                      width: 56, height: 56, borderRadius: '50%',
                      background: swatchColor,
                      border: selected ? `3px solid ${c.text}` : '3px solid transparent',
                      boxShadow: selected ? `0 0 0 2px ${swatchColor}` : 'none',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      transition: 'border 0.1s, box-shadow 0.1s',
                    }}>
                      {selected && (
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                          <path d="M5 13l4 4L19 7" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </div>
                    <span style={{ color: selected ? c.text : c.textSub, fontSize: 11, fontWeight: selected ? 700 : 400 }}>{def.label}</span>
                  </button>
                )
              })}
            </div>

            <button
              onClick={() => { localStorage.setItem('ascend_accent_chosen', '1'); setShowAccentPicker(false) }}
              style={{ width: '100%', background: c.accent, color: '#FFFFFF', fontSize: 16, fontWeight: 800, borderRadius: 16, padding: '17px', border: 'none', cursor: 'pointer', marginTop: 36, letterSpacing: '-0.3px', transition: 'background-color 0.1s' }}
            >
              Start training →
            </button>
          </div>
        </div>
      </div>
    )
  }

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
            {WORKOUT_TYPE_DEFS.map(opt => {
              const isLast = lastType === opt.id
              const typeAccent = opt.accentDynamic ? c.accent : opt.staticAccent
              return (
                <button
                  key={opt.id}
                  onClick={() => selectType(opt.id, opt.path)}
                  style={{
                    background: c.surface,
                    border: `1.5px solid ${isLast ? typeAccent : c.border}`,
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
                      background: typeAccent + '22', color: typeAccent,
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
                    <span style={{ color: c.accent, fontSize: 13, fontWeight: 700, flexShrink: 0 }}>Start →</span>
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
