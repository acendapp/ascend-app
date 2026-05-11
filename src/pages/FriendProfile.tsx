import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { getLevelName } from '../lib/scoring'
import { useTheme } from '../lib/theme'

interface FriendData {
  name: string
  username: string
  avatar_url: string | null
  school_year: string | null
  affiliation: string | null
}

interface FriendScores {
  ascend_score: number
  strength_score: number
  streak_days: number
  level: number
}

interface RecentWorkout {
  id: string
  workout_date: string
  workout_type: string | null
  workout_source: string | null
}

interface PR {
  exercise_name: string
  weight: number
}

function initials(name: string) {
  return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

const SOURCE_META: Record<string, { emoji: string; label: string }> = {
  ascend_method: { emoji: '⚡', label: 'Ascend Method' },
  custom: { emoji: '✏️', label: 'Custom' },
  class: { emoji: '🏃', label: 'Class' },
}

function goBack(navigate: ReturnType<typeof useNavigate>) {
  if ((window.history.state?.idx ?? 0) > 0) navigate(-1)
  else navigate('/home')
}

export default function FriendProfile() {
  const navigate = useNavigate()
  const { userId } = useParams<{ userId: string }>()
  const { colors: c } = useTheme()

  const [friendData, setFriendData] = useState<FriendData | null>(null)
  const [scores, setScores] = useState<FriendScores | null>(null)
  const [recentWorkouts, setRecentWorkouts] = useState<RecentWorkout[]>([])
  const [prs, setPrs] = useState<PR[]>([])
  const [campusRank, setCampusRank] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!userId) { setLoading(false); return }
    async function load() {
      const [profileRes, scoresRes, workoutsRes, prsRes] = await Promise.all([
        supabase.from('users').select('name, username, avatar_url, school_year, affiliation').eq('id', userId!).maybeSingle(),
        supabase.from('user_scores').select('ascend_score, strength_score, streak_days, level').eq('user_id', userId!).maybeSingle(),
        supabase.from('workouts').select('id, workout_date, workout_type, workout_source').eq('user_id', userId!).eq('completed', true).order('workout_date', { ascending: false }).limit(5),
        supabase.from('personal_records').select('exercise_name, weight').eq('user_id', userId!).order('weight', { ascending: false }),
      ])

      if (profileRes.data) setFriendData(profileRes.data as FriendData)
      if (scoresRes.data) {
        setScores(scoresRes.data as FriendScores)
        const { count } = await supabase
          .from('user_scores')
          .select('user_id', { count: 'exact', head: true })
          .gt('ascend_score', scoresRes.data.ascend_score ?? 0)
        setCampusRank((count ?? 0) + 1)
      }
      if (workoutsRes.data) setRecentWorkouts(workoutsRes.data as RecentWorkout[])

      const prMap = new Map<string, number>()
      for (const pr of prsRes.data ?? []) {
        const cur = prMap.get(pr.exercise_name as string) ?? 0
        if ((pr.weight as number) > cur) prMap.set(pr.exercise_name as string, pr.weight as number)
      }
      setPrs(
        Array.from(prMap.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([exercise_name, weight]) => ({ exercise_name, weight }))
      )

      setLoading(false)
    }
    load()
  }, [userId])

  if (loading) {
    return (
      <div className="app-shell">
        <div className="app-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: c.bg }}>
          <div style={{ color: c.textSub, fontSize: 14 }}>Loading…</div>
        </div>
      </div>
    )
  }

  if (!friendData) {
    return (
      <div className="app-shell">
        <div className="app-content" style={{ padding: '52px 20px 0', background: c.bg }}>
          <button onClick={() => goBack(navigate)} style={{ background: 'none', border: 'none', color: c.accent, fontSize: 14, fontWeight: 600, cursor: 'pointer', padding: '0 0 16px' }}>← Back</button>
          <p style={{ color: c.textSub, fontSize: 14 }}>Couldn't load this profile.</p>
        </div>
      </div>
    )
  }

  const avatarIni = initials(friendData.name)

  return (
    <div className="app-shell">
      <div className="app-content page-scroll" style={{ background: c.bg }}>
        <div style={{ padding: '52px 20px 24px' }}>

          <button
            onClick={() => goBack(navigate)}
            style={{ background: 'none', border: 'none', color: c.accent, fontSize: 14, fontWeight: 600, cursor: 'pointer', padding: '0 0 20px', display: 'flex', alignItems: 'center', gap: 4 }}
          >
            ← Back
          </button>

          {/* Avatar + identity */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 24 }}>
            <div style={{ width: 80, height: 80, borderRadius: '50%', background: c.border, border: `3px solid ${c.accentBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', marginBottom: 12 }}>
              {friendData.avatar_url
                ? <img src={friendData.avatar_url} alt={friendData.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : <span style={{ color: c.accent, fontSize: 26, fontWeight: 700 }}>{avatarIni}</span>}
            </div>
            <h1 style={{ color: c.text, fontSize: 22, fontWeight: 700, margin: '0 0 3px', textAlign: 'center' }}>{friendData.name}</h1>
            <p style={{ color: c.textSub, fontSize: 13, margin: '0 0 3px' }}>@{friendData.username}</p>
            {(friendData.school_year || friendData.affiliation) && (
              <p style={{ color: c.textSub, fontSize: 12, margin: 0 }}>
                {[friendData.school_year, friendData.affiliation].filter(Boolean).join(' · ')}
              </p>
            )}
          </div>

          {/* Score row */}
          {scores && (
            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              {[
                { label: 'Ascend Score', value: scores.ascend_score, accent: true, unit: '' },
                { label: 'Strength', value: scores.strength_score, accent: false, unit: '' },
                { label: 'Streak', value: scores.streak_days, accent: false, unit: 'd' },
              ].map(s => (
                <div key={s.label} style={{ flex: 1, background: s.accent ? c.accentBg : c.surface, border: `1px solid ${s.accent ? c.accentBorder : c.border}`, borderRadius: 14, padding: '12px 10px', textAlign: 'center' }}>
                  <p style={{ color: c.textSub, fontSize: 9, letterSpacing: '1.2px', textTransform: 'uppercase', margin: '0 0 6px' }}>{s.label}</p>
                  <p style={{ color: s.accent ? c.accent : c.text, fontSize: 22, fontWeight: 700, margin: 0, lineHeight: 1 }}>{s.value}{s.unit}</p>
                </div>
              ))}
            </div>
          )}

          {/* Level + rank */}
          {scores && (
            <div style={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 14, padding: '12px 16px', marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <p style={{ color: c.textSub, fontSize: 10, letterSpacing: '1.5px', textTransform: 'uppercase', margin: '0 0 3px' }}>Level</p>
                <p style={{ color: c.text, fontSize: 15, fontWeight: 700, margin: 0 }}>
                  Level {scores.level} · {getLevelName(scores.level)}
                </p>
              </div>
              {campusRank > 0 && (
                <div style={{ textAlign: 'right' }}>
                  <p style={{ color: c.textSub, fontSize: 10, letterSpacing: '1.5px', textTransform: 'uppercase', margin: '0 0 3px' }}>Campus Rank</p>
                  <p style={{ color: c.accent, fontSize: 15, fontWeight: 700, margin: 0 }}>#{campusRank}</p>
                </div>
              )}
            </div>
          )}

          {/* Personal Records */}
          {prs.length > 0 && (
            <>
              <p style={{ color: c.textSub, fontSize: 10, letterSpacing: '1.5px', textTransform: 'uppercase', margin: '0 0 10px' }}>Personal Records</p>
              <div style={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 14, padding: '4px 16px', marginBottom: 14 }}>
                {prs.map((pr, i) => (
                  <div key={pr.exercise_name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 0', borderBottom: i < prs.length - 1 ? `1px solid ${c.border}` : 'none' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 14 }}>{i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉'}</span>
                      <span style={{ color: c.text, fontSize: 13, fontWeight: 600 }}>{pr.exercise_name}</span>
                    </div>
                    <span style={{ color: c.accent, fontSize: 14, fontWeight: 700 }}>{pr.weight} lb</span>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Recent Workouts */}
          {recentWorkouts.length > 0 && (
            <>
              <p style={{ color: c.textSub, fontSize: 10, letterSpacing: '1.5px', textTransform: 'uppercase', margin: '0 0 10px' }}>Recent Workouts</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {recentWorkouts.map(w => {
                  const source = w.workout_source ?? 'ascend_method'
                  const meta = SOURCE_META[source] ?? SOURCE_META.ascend_method
                  return (
                    <div key={w.id} style={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 14, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 18, flexShrink: 0 }}>{meta.emoji}</span>
                      <div style={{ flex: 1 }}>
                        <p style={{ color: c.text, fontSize: 13, fontWeight: 600, margin: '0 0 2px' }}>{w.workout_type ?? meta.label}</p>
                        <p style={{ color: c.textSub, fontSize: 11, margin: 0 }}>{formatDate(w.workout_date)}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          )}

        </div>
      </div>
    </div>
  )
}
