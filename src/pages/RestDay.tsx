import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useTheme } from '../lib/theme'
import { logActivity, isStreakMilestone, recordScoreChange } from '../lib/activity'
import { calculateAscendScoreGain } from '../lib/scoring'

const REST_REASONS = [
  { id: 'recovery',  emoji: '🛌', label: 'Active recovery' },
  { id: 'sore',      emoji: '🩹', label: 'Sore / fatigued' },
  { id: 'busy',      emoji: '📅', label: 'Busy day' },
  { id: 'travel',    emoji: '✈️', label: 'Travel' },
  { id: 'sick',      emoji: '🤒', label: 'Not feeling well' },
  { id: 'other',     emoji: '🌙', label: 'Just resting' },
]

export default function RestDay() {
  const navigate = useNavigate()
  const { colors: c } = useTheme()

  const [reason, setReason] = useState<string>('recovery')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [newStreak, setNewStreak] = useState(0)

  async function handleLogRest() {
    if (saving) return
    setSaving(true)
    setSaveError(null)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { navigate('/auth'); return }

      const reasonLabel = REST_REASONS.find(r => r.id === reason)?.label ?? 'Just resting'

      // Guard against double-logging: only allow one rest entry per calendar day
      const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
      const { data: existingRest } = await supabase
        .from('workouts').select('id')
        .eq('user_id', user.id).eq('workout_source', 'rest')
        .gte('workout_date', todayStart.toISOString())
        .limit(1)
      if (existingRest && existingRest.length > 0) {
        setSaveError('You already logged a rest day today.')
        return
      }

      const { data: restRecord, error: insertErr } = await supabase.from('workouts').insert({
        user_id: user.id,
        workout_date: new Date().toISOString(),
        workout_type: 'Rest Day',
        duration: 0,
        completed: true,
        workout_source: 'rest',
      }).select().single()

      if (insertErr || !restRecord) {
        console.error('Rest day save error:', insertErr)
        setSaveError('Could not log your rest day. Check your connection and try again.')
        return
      }

      // Streak preservation — same lookup pattern as the workout flows, but counts
      // any prior completed entry (workout OR rest) as continuing the streak.
      const { data: curScores } = await supabase
        .from('user_scores').select('streak_days, ascend_score').eq('user_id', user.id).maybeSingle()

      const todayStr        = new Date().toISOString().split('T')[0]
      const yesterdayStr    = new Date(Date.now() - 86400000).toISOString().split('T')[0]
      const twoDaysAgoStr   = new Date(Date.now() - 2 * 86400000).toISOString().split('T')[0]
      const { data: prevEntry } = await supabase
        .from('workouts').select('workout_date')
        .eq('user_id', user.id).eq('completed', true)
        .neq('id', restRecord.id)
        .order('workout_date', { ascending: false }).limit(1).maybeSingle()
      const prevDate = prevEntry ? (prevEntry.workout_date as string).split('T')[0] : null
      const continued = prevDate === todayStr || prevDate === yesterdayStr || prevDate === twoDaysAgoStr
      const updatedStreak = continued ? (curScores?.streak_days ?? 0) + 1 : 1

      // Rest days earn a small fixed Ascend Score bump (honors honesty without
      // making rest more valuable than training). One-per-day guard above
      // prevents farming this.
      const scoreGain = calculateAscendScoreGain({
        source: 'rest',
        workoutsThisWeek: 0,
        streakDays: updatedStreak,
        socialScore: 0,
      })
      const prevAscend = (curScores?.ascend_score as number | null) ?? 0
      const newAscendScore = prevAscend + scoreGain.total

      await supabase.from('user_scores')
        .update({ streak_days: updatedStreak, ascend_score: newAscendScore })
        .eq('user_id', user.id)

      await recordScoreChange(restRecord.id as string, scoreGain.total)

      setNewStreak(updatedStreak)

      await logActivity({
        userId: user.id,
        eventType: 'rest',
        title: 'took a rest day',
        subtitle: reasonLabel,
        metadata: { reason },
      })
      if (isStreakMilestone(updatedStreak)) {
        await logActivity({
          userId: user.id,
          eventType: 'streak',
          title: 'kept their streak',
          subtitle: `${updatedStreak} day streak`,
          metadata: { days: updatedStreak },
        })
      }

      setDone(true)
    } catch (err) {
      console.error('Log rest day error:', err)
      setSaveError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  // ── Confirmation screen ────────────────────────────────────────────────────

  if (done) {
    return (
      <div className="app-shell">
        <div className="app-content" style={{ background: c.bg, display: 'flex', flexDirection: 'column', height: '100vh', alignItems: 'center', justifyContent: 'center', padding: '0 24px' }}>
          <div style={{ textAlign: 'center', width: '100%', maxWidth: 360 }}>
            <p style={{ fontSize: 64, margin: '0 0 16px', lineHeight: 1 }}>💤</p>
            <p style={{ color: c.accent, fontSize: 11, letterSpacing: '2px', textTransform: 'uppercase', margin: '0 0 8px' }}>
              Rest Day Logged
            </p>
            <h1 style={{ color: c.text, fontSize: 24, fontWeight: 700, margin: '0 0 10px' }}>
              Rest is part of training.
            </h1>
            <p style={{ color: c.textSub, fontSize: 14, margin: '0 0 28px', lineHeight: 1.55 }}>
              Recovery is when you actually get stronger. Come back fresh.
            </p>
            <div style={{ background: c.accentBg, border: `1px solid ${c.accentBorder}`, borderRadius: 14, padding: '16px 20px', marginBottom: 24 }}>
              <p style={{ color: c.textSub, fontSize: 12, margin: '0 0 4px' }}>Streak preserved</p>
              <p style={{ color: c.accent, fontSize: 28, fontWeight: 700, margin: 0 }}>{newStreak} day{newStreak === 1 ? '' : 's'} 🔥</p>
            </div>
            <button
              onClick={() => navigate('/home')}
              style={{ width: '100%', background: c.accent, border: 'none', borderRadius: 14, padding: '16px', color: '#FFFFFF', fontSize: 16, fontWeight: 700, cursor: 'pointer' }}
            >
              Done
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Log screen ─────────────────────────────────────────────────────────────

  return (
    <div className="app-shell">
      <div className="app-content" style={{ background: c.bg, display: 'flex', flexDirection: 'column', height: '100vh' }}>
        <div style={{ flex: 1, overflow: 'auto', padding: '56px 24px 16px' }}>

          <button
            onClick={() => navigate('/workout')}
            style={{ background: 'none', border: 'none', color: c.textSub, fontSize: 14, cursor: 'pointer', padding: '0 0 20px', display: 'block' }}
          >
            ← Back
          </button>

          <p style={{ color: c.accent, fontSize: 11, letterSpacing: '2px', textTransform: 'uppercase', margin: '0 0 6px' }}>
            Rest Day
          </p>
          <h1 style={{ color: c.text, fontSize: 24, fontWeight: 700, margin: '0 0 10px' }}>
            Taking it easy today?
          </h1>
          <p style={{ color: c.textSub, fontSize: 13, margin: '0 0 24px', lineHeight: 1.55 }}>
            Recovery is when your body adapts and gets stronger. Logging a rest day keeps your streak alive — no need to fake a workout.
          </p>

          <p style={{ color: c.textSub, fontSize: 10, letterSpacing: '1.5px', textTransform: 'uppercase', margin: '0 0 10px' }}>
            Why are you resting?
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 28 }}>
            {REST_REASONS.map(r => {
              const active = reason === r.id
              return (
                <button
                  key={r.id}
                  onClick={() => setReason(r.id)}
                  style={{
                    background: active ? c.accentBg : c.surface,
                    border: `1.5px solid ${active ? c.accent : c.border}`,
                    borderRadius: 12, padding: '12px 6px',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                    cursor: 'pointer',
                  }}
                >
                  <span style={{ fontSize: 22, lineHeight: 1 }}>{r.emoji}</span>
                  <span style={{ color: active ? c.accent : c.text, fontSize: 11, fontWeight: active ? 700 : 500, textAlign: 'center', lineHeight: 1.25 }}>
                    {r.label}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        <div style={{ padding: '12px 24px calc(env(safe-area-inset-bottom, 0px) + 88px)' }}>
          {saveError && (
            <p style={{ color: '#EF4444', fontSize: 12, margin: '0 0 10px', textAlign: 'center' }}>{saveError}</p>
          )}
          <button
            onClick={handleLogRest}
            disabled={saving}
            style={{
              width: '100%',
              background: c.accent,
              color: '#FFFFFF',
              fontSize: 16, fontWeight: 700, borderRadius: 14, padding: '16px',
              border: 'none', cursor: saving ? 'wait' : 'pointer',
              opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? 'Logging…' : 'Log Rest Day 💤'}
          </button>
        </div>
      </div>
    </div>
  )
}
