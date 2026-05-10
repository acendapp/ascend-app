import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { calculateXPGain, getLevelFromXP, calculateConsistencyScore, calculateAscendScore } from '../lib/scoring'

const CLASS_TYPES = [
  { label: 'Pilates',   emoji: '🧘' },
  { label: 'Yoga',      emoji: '🕉️' },
  { label: 'Spin',      emoji: '🚴' },
  { label: 'HIIT',      emoji: '💥' },
  { label: 'Barre',     emoji: '🩰' },
  { label: 'Boxing',    emoji: '🥊' },
  { label: 'Running',   emoji: '🏃' },
  { label: 'CrossFit',  emoji: '🏋️' },
  { label: 'Swimming',  emoji: '🏊' },
  { label: 'Other',     emoji: '⭐' },
]

const DURATIONS = [30, 45, 60, 75, 90]

const INTENSITY_OPTIONS = [
  { id: 'easy',     label: 'Light',    emoji: '😌' },
  { id: 'moderate', label: 'Moderate', emoji: '💪' },
  { id: 'intense',  label: 'Hard',     emoji: '🔥' },
]

type Phase = 'log' | 'summary'

export default function ClassWorkout() {
  const navigate = useNavigate()
  const location = useLocation()
  const isPreview = !!(location.state as { preview?: boolean } | null)?.preview

  const [phase, setPhase] = useState<Phase>('log')
  const [selectedClass, setSelectedClass] = useState('')
  const [customClass, setCustomClass] = useState('')
  const [duration, setDuration] = useState(60)
  const [intensity, setIntensity] = useState('')
  const [studio, setStudio] = useState('')
  const [saving, setSaving] = useState(false)
  const [xpGain, setXpGain] = useState(0)

  const classLabel = selectedClass === 'Other' ? customClass.trim() : selectedClass
  const canLog = classLabel.length > 0 && intensity !== ''

  async function handleLog() {
    if (!canLog || saving) return
    setSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { navigate('/auth'); return }

      await supabase.from('workouts').insert({
        user_id: user.id,
        workout_date: new Date().toISOString(),
        workout_type: classLabel,
        duration,
        completed: true,
        workout_source: 'class',
        class_type: classLabel,
        intensity,
        studio_name: studio.trim() || null,
      })

      const { data: curScores } = await supabase
        .from('user_scores').select('xp, level, streak_days, strength_score, social_score').eq('user_id', user.id).maybeSingle()

      const xp = calculateXPGain(1, 0, false)
      const newXP = (curScores?.xp ?? 0) + xp
      const newLevel = getLevelFromXP(newXP)

      const todayStr = new Date().toISOString().split('T')[0]
      const yesterdayStr = new Date(Date.now() - 86400000).toISOString().split('T')[0]
      const twoDaysAgoStr = new Date(Date.now() - 2 * 86400000).toISOString().split('T')[0]
      const { data: prevWorkout } = await supabase
        .from('workouts').select('workout_date').eq('user_id', user.id).eq('completed', true)
        .order('workout_date', { ascending: false }).limit(2).maybeSingle()
      const prevDate = prevWorkout ? (prevWorkout.workout_date as string).split('T')[0] : null
      const newStreak = (prevDate === todayStr || prevDate === yesterdayStr || prevDate === twoDaysAgoStr)
        ? (curScores?.streak_days ?? 0) + 1
        : 1

      const monday = new Date()
      monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7))
      monday.setHours(0, 0, 0, 0)
      const { count: weekCount } = await supabase
        .from('workouts').select('id', { count: 'exact', head: true })
        .eq('user_id', user.id).eq('completed', true).gte('workout_date', monday.toISOString())
      const consistencyScore = calculateConsistencyScore(weekCount ?? 0)

      // Strength score unchanged — class workouts don't involve progressive overload
      const strengthScore = curScores?.strength_score ?? 0
      const ascendScore = calculateAscendScore(strengthScore, consistencyScore, curScores?.social_score ?? 0, newStreak)

      await supabase.from('user_scores').update({
        xp: newXP, level: newLevel, streak_days: newStreak,
        consistency_score: consistencyScore, ascend_score: ascendScore,
      }).eq('user_id', user.id)

      localStorage.setItem('ascend_home_badge', '1')
      localStorage.setItem('ascend_has_workout', '1')
      window.dispatchEvent(new CustomEvent('ascend-badge-update'))

      setXpGain(xp)
      setPhase('summary')
    } finally {
      setSaving(false)
    }
  }

  const classEmoji = CLASS_TYPES.find(c => c.label === selectedClass)?.emoji ?? '⭐'

  // ── Summary ────────────────────────────────────────────────────────────────

  if (phase === 'summary') {
    return (
      <div className="app-shell">
        <div className="app-content" style={{ display: 'flex', flexDirection: 'column', height: '100vh', alignItems: 'center', justifyContent: 'center', padding: '0 24px' }}>
          <div style={{ textAlign: 'center', width: '100%' }}>
            <p style={{ fontSize: 64, margin: '0 0 16px', lineHeight: 1 }}>{classEmoji}</p>
            <p style={{ color: '#F5A623', fontSize: 11, letterSpacing: '2px', textTransform: 'uppercase', margin: '0 0 8px' }}>
              Class Logged
            </p>
            <h1 style={{ color: '#FFFFFF', fontSize: 24, fontWeight: 700, margin: '0 0 6px' }}>{classLabel}</h1>
            <p style={{ color: '#5A7A9A', fontSize: 14, margin: '0 0 32px' }}>
              {duration} min · {intensity}
              {studio.trim() ? ` · ${studio.trim()}` : ''}
            </p>
            <div style={{ background: '#0D1728', border: '1px solid #1A2A42', borderRadius: 14, padding: '16px 20px', marginBottom: 24 }}>
              <p style={{ color: '#5A7A9A', fontSize: 12, margin: '0 0 4px' }}>XP Earned</p>
              <p style={{ color: '#4A9EFF', fontSize: 28, fontWeight: 700, margin: 0 }}>+{xpGain} XP</p>
            </div>
            <button
              onClick={() => navigate('/home')}
              style={{ width: '100%', background: '#F5A623', border: 'none', borderRadius: 14, padding: '16px', color: '#000', fontSize: 16, fontWeight: 700, cursor: 'pointer' }}
            >
              Done 💪
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Log screen ─────────────────────────────────────────────────────────────

  return (
    <div className="app-shell">
      <div className="app-content" style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
        <div style={{ flex: 1, overflow: 'auto', padding: '56px 24px 16px' }}>

          <button
            onClick={() => navigate('/workout')}
            style={{ background: 'none', border: 'none', color: '#5A7A9A', fontSize: 14, cursor: 'pointer', padding: '0 0 20px', display: 'block' }}
          >
            ← Back
          </button>

          {isPreview && (
            <div style={{ background: '#0D2E5A', border: '1px solid #1E3D6E', borderRadius: 10, padding: '10px 14px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 14 }}>👁️</span>
              <p style={{ color: '#4A9EFF', fontSize: 12, fontWeight: 600, margin: 0 }}>Preview mode — come back tomorrow to log</p>
            </div>
          )}
          <p style={{ color: '#F5A623', fontSize: 11, letterSpacing: '2px', textTransform: 'uppercase', margin: '0 0 6px' }}>
            Class Workout
          </p>
          <h1 style={{ color: '#FFFFFF', fontSize: 24, fontWeight: 700, margin: '0 0 24px' }}>
            {isPreview ? 'Plan your class for tomorrow' : 'What class did you take?'}
          </h1>

          {/* Class type grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8, marginBottom: 24 }}>
            {CLASS_TYPES.map(c => {
              const active = selectedClass === c.label
              return (
                <button
                  key={c.label}
                  onClick={() => { setSelectedClass(c.label); if (c.label !== 'Other') setCustomClass('') }}
                  style={{
                    background: active ? '#2D1F00' : '#0D1728',
                    border: `1.5px solid ${active ? '#F5A623' : '#1A2A42'}`,
                    borderRadius: 12, padding: '10px 4px',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                    cursor: 'pointer',
                  }}
                >
                  <span style={{ fontSize: 22, lineHeight: 1 }}>{c.emoji}</span>
                  <span style={{ color: active ? '#F5A623' : '#BBCDE0', fontSize: 10, fontWeight: active ? 700 : 400 }}>
                    {c.label}
                  </span>
                </button>
              )
            })}
          </div>

          {selectedClass === 'Other' && (
            <input
              type="text"
              value={customClass}
              onChange={e => setCustomClass(e.target.value)}
              placeholder="Enter class name…"
              autoFocus
              style={{
                width: '100%', background: '#0D1728', border: '1px solid #F5A623',
                borderRadius: 12, padding: '12px 16px', color: '#FFFFFF', fontSize: 15,
                outline: 'none', boxSizing: 'border-box', marginBottom: 20,
              }}
            />
          )}

          {/* Duration */}
          <p style={{ color: '#5A7A9A', fontSize: 10, letterSpacing: '1.5px', textTransform: 'uppercase', margin: '0 0 10px' }}>
            Duration
          </p>
          <div style={{ display: 'flex', gap: 8, marginBottom: 22 }}>
            {DURATIONS.map(d => (
              <button
                key={d}
                onClick={() => setDuration(d)}
                style={{
                  flex: 1, background: duration === d ? '#2D1F00' : '#0D1728',
                  border: `1.5px solid ${duration === d ? '#F5A623' : '#1A2A42'}`,
                  borderRadius: 10, padding: '10px 4px',
                  color: duration === d ? '#F5A623' : '#BBCDE0',
                  fontSize: 12, fontWeight: duration === d ? 700 : 400, cursor: 'pointer',
                }}
              >
                {d}m
              </button>
            ))}
          </div>

          {/* Intensity */}
          <p style={{ color: '#5A7A9A', fontSize: 10, letterSpacing: '1.5px', textTransform: 'uppercase', margin: '0 0 10px' }}>
            How hard was it?
          </p>
          <div style={{ display: 'flex', gap: 10, marginBottom: 22 }}>
            {INTENSITY_OPTIONS.map(opt => {
              const active = intensity === opt.id
              return (
                <button
                  key={opt.id}
                  onClick={() => setIntensity(opt.id)}
                  style={{
                    flex: 1, background: active ? '#2D1F00' : '#0D1728',
                    border: `1.5px solid ${active ? '#F5A623' : '#1A2A42'}`,
                    borderRadius: 12, padding: '14px 4px',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                    cursor: 'pointer',
                  }}
                >
                  <span style={{ fontSize: 22, lineHeight: 1 }}>{opt.emoji}</span>
                  <span style={{ color: active ? '#F5A623' : '#BBCDE0', fontSize: 12, fontWeight: active ? 700 : 400 }}>
                    {opt.label}
                  </span>
                </button>
              )
            })}
          </div>

          {/* Studio (optional) */}
          <input
            type="text"
            value={studio}
            onChange={e => setStudio(e.target.value)}
            placeholder="Studio or instructor (optional)"
            style={{
              width: '100%', background: '#0D1728', border: '1px solid #1A2A42',
              borderRadius: 12, padding: '12px 16px', color: '#FFFFFF', fontSize: 14,
              outline: 'none', boxSizing: 'border-box',
            }}
          />

        </div>

        <div style={{ padding: '12px 24px 88px' }}>
          {isPreview ? (
            <button
              onClick={() => navigate('/home')}
              style={{ width: '100%', background: '#1A2A42', color: '#5A7A9A', fontSize: 15, fontWeight: 700, borderRadius: 14, padding: '16px', border: '1px solid #1E3D6E', cursor: 'pointer' }}
            >
              See you tomorrow 💪
            </button>
          ) : (
            <button
              onClick={handleLog}
              disabled={!canLog || saving}
              style={{
                width: '100%',
                background: canLog ? '#F5A623' : '#1A2A42',
                color: canLog ? '#000000' : '#5A7A9A',
                fontSize: 16, fontWeight: 700, borderRadius: 14, padding: '16px',
                border: 'none', cursor: canLog ? 'pointer' : 'not-allowed',
                transition: 'background 0.2s',
              }}
            >
              {saving ? 'Logging…' : 'Log Class ✓'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
