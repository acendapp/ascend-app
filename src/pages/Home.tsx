import { useEffect, useState, useCallback } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import StreakDots from '../components/StreakDots'
import { supabase } from '../lib/supabase'
import { calculateAscendScore, calculateConsistencyScore } from '../lib/scoring'
import type { UserProfile, UserScores, ActivityItem } from '../types'

type LeaderboardFilter = 'friends' | 'campus' | 'alltime'

interface LeaderboardRow {
  rank: number
  initials: string
  name: string
  group: string
  score: number
  userId?: string
}

const RANK_COLORS: Record<number, string> = { 1: '#F5A623', 2: '#B0B8C4', 3: '#CD7F32' }

function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning,'
  if (h < 17) return 'Good afternoon,'
  return 'Good evening,'
}

function timeAgo(dateStr: string) {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
}

function initials(name: string) {
  return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
}

export default function Home() {
  const navigate = useNavigate()
  const location = useLocation()
  const newPRs: string[] = (location.state as { prs?: string[] } | null)?.prs ?? []

  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [scores, setScores] = useState<UserScores | null>(null)
  const [loading, setLoading] = useState(true)

  const [weekDays, setWeekDays] = useState<boolean[]>(new Array(7).fill(false))
  const [workoutsThisWeek, setWorkoutsThisWeek] = useState(0)

  const [filter, setFilter] = useState<LeaderboardFilter>('campus')
  const [friendsLeaderboard, setFriendsLeaderboard] = useState<LeaderboardRow[]>([])
  const [hasFriends, setHasFriends] = useState(false)

  const [activityFeed, setActivityFeed] = useState<ActivityItem[]>([])
  const [isCheckedIn, setIsCheckedIn] = useState(false)
  const [checkinLoading, setCheckinLoading] = useState(false)
  const [workoutCompletedToday, setWorkoutCompletedToday] = useState(false)

  const [showPRBanner, setShowPRBanner] = useState(newPRs.length > 0)
  const [hasAnyWorkout, setHasAnyWorkout] = useState(false)
  const [campusLeaderboard, setCampusLeaderboard] = useState<LeaderboardRow[]>([])

  const loadData = useCallback(async () => {
    try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) { navigate('/auth'); return }
    const user = session.user

    const [profileRes, scoresRes] = await Promise.all([
      supabase.from('users').select('*').eq('id', user.id).maybeSingle(),
      supabase.from('user_scores').select('*').eq('user_id', user.id).maybeSingle(),
    ])

    let profileData = profileRes.data
    if (!profileData && user.email) {
      // Fallback: look up by email in case the row id doesn't match auth uid
      const { data: byEmail } = await supabase
        .from('users').select('*').eq('email', user.email).maybeSingle()
      profileData = byEmail
    }

    if (profileData) {
      setProfile(profileData)
      const ci = profileData.gym_checkin_at
      if (ci) setIsCheckedIn(new Date(ci).getTime() > Date.now() - 2 * 60 * 60 * 1000)
    }
    if (scoresRes.data) setScores(scoresRes.data)

    // One-per-day check
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const { data: todayWorkouts } = await supabase
      .from('workouts')
      .select('id')
      .eq('user_id', user.id)
      .eq('completed', true)
      .gte('workout_date', todayStart.toISOString())
      .limit(1)
    setWorkoutCompletedToday((todayWorkouts?.length ?? 0) > 0)

    // Streak: workouts in last 7 days
    const sevenAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const { data: recentWorkouts } = await supabase
      .from('workouts')
      .select('workout_date')
      .eq('user_id', user.id)
      .eq('completed', true)
      .gte('workout_date', sevenAgo)

    if (recentWorkouts) {
      const today = new Date()
      const filled = Array.from({ length: 7 }, (_, i) => {
        const day = new Date(today)
        day.setDate(day.getDate() - 6 + i)
        return recentWorkouts.some(w => isSameDay(new Date(w.workout_date), day))
      })
      setWeekDays(filled)

      // Count workouts since Monday for consistency score
      const monday = new Date()
      monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7))
      monday.setHours(0, 0, 0, 0)
      const count = recentWorkouts.filter(w => new Date(w.workout_date) >= monday).length
      setWorkoutsThisWeek(count)
    }

    // Friends
    const { data: friendships } = await supabase
      .from('friendships')
      .select('requester_id, recipient_id')
      .or(`requester_id.eq.${user.id},recipient_id.eq.${user.id}`)
      .eq('status', 'accepted')

    const friendIds = (friendships ?? []).map(f =>
      f.requester_id === user.id ? f.recipient_id : f.requester_id
    )
    setHasFriends(friendIds.length > 0)

    if (friendIds.length > 0) {
      // Friends leaderboard
      const allIds = [user.id, ...friendIds]
      const [scoresData, profilesData] = await Promise.all([
        supabase.from('user_scores').select('user_id, ascend_score').in('user_id', allIds),
        supabase.from('users').select('id, name, affiliation').in('id', allIds),
      ])
      if (scoresData.data && profilesData.data) {
        const profileMap = new Map(profilesData.data.map(p => [p.id, p]))
        const rows: LeaderboardRow[] = scoresData.data
          .sort((a, b) => b.ascend_score - a.ascend_score)
          .map((s, i) => {
            const p = profileMap.get(s.user_id)
            return {
              rank: i + 1,
              initials: initials(p?.name ?? '??'),
              name: p?.name ?? 'Unknown',
              group: p?.affiliation ?? 'Penn',
              score: s.ascend_score,
              userId: s.user_id,
            }
          })
        setFriendsLeaderboard(rows)
        setFilter('friends')
      }

      // Activity feed: recent friend workouts
      const { data: friendWorkouts } = await supabase
        .from('workouts')
        .select('id, user_id, workout_date, workout_type')
        .in('user_id', friendIds)
        .eq('completed', true)
        .order('workout_date', { ascending: false })
        .limit(6)

      if (friendWorkouts && friendWorkouts.length > 0) {
        const uniqueUserIds = [...new Set(friendWorkouts.map(w => w.user_id))]
        const { data: fps } = await supabase
          .from('users')
          .select('id, name')
          .in('id', uniqueUserIds)

        const fpMap = new Map((fps ?? []).map(p => [p.id, p]))

        // Kudos counts per workout
        const workoutIds = friendWorkouts.map(w => w.id)
        const { data: kudosRows } = await supabase
          .from('kudos')
          .select('workout_id, sender_id')
          .in('workout_id', workoutIds)

        const kudosMap = new Map<string, { count: number; userGave: boolean }>()
        for (const k of kudosRows ?? []) {
          const prev = kudosMap.get(k.workout_id) ?? { count: 0, userGave: false }
          kudosMap.set(k.workout_id, {
            count: prev.count + 1,
            userGave: prev.userGave || k.sender_id === user.id,
          })
        }

        const feed: ActivityItem[] = friendWorkouts.map(w => {
          const fp = fpMap.get(w.user_id)
          const fname = fp?.name ?? 'Someone'
          const ki = kudosMap.get(w.id) ?? { count: 0, userGave: false }
          return {
            id: w.id,
            userId: w.user_id,
            userName: fname,
            initials: initials(fname),
            description: `Completed a ${w.workout_type ?? 'workout'}`,
            time: timeAgo(w.workout_date),
            workoutId: w.id,
            kudosCount: ki.count,
            userGaveKudos: ki.userGave,
          }
        })
        setActivityFeed(feed)
      }
    }

    // Total workout count (for empty state detection)
    const { count: workoutCount } = await supabase
      .from('workouts')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('completed', true)
    setHasAnyWorkout((workoutCount ?? 0) > 0)

    // Campus / all-time leaderboard (real data)
    const { data: allScores } = await supabase
      .from('user_scores')
      .select('user_id, ascend_score')
      .order('ascend_score', { ascending: false })
      .limit(20)

    if (allScores && allScores.length > 0) {
      const allIds = allScores.map(s => s.user_id)
      const { data: allProfiles } = await supabase
        .from('users')
        .select('id, name, affiliation')
        .in('id', allIds)
      if (allProfiles) {
        const profileMap = new Map(allProfiles.map(p => [p.id, p]))
        const rows: LeaderboardRow[] = allScores.map((s, i) => {
          const p = profileMap.get(s.user_id)
          return {
            rank: i + 1,
            initials: initials(p?.name ?? '??'),
            name: p?.name ?? 'Unknown',
            group: p?.affiliation ?? 'Penn',
            score: s.ascend_score,
            userId: s.user_id,
          }
        })
        setCampusLeaderboard(rows)
      }
    }

    } catch (err) {
      console.error('[Home] loadData error:', err)
    } finally {
      setLoading(false)
    }
  }, [navigate])

  useEffect(() => { loadData() }, [loadData])

  // Reset the "completed today" flag at midnight
  useEffect(() => {
    if (!workoutCompletedToday) return
    const now = new Date()
    const midnight = new Date(now)
    midnight.setDate(midnight.getDate() + 1)
    midnight.setHours(0, 0, 0, 0)
    const id = setTimeout(() => setWorkoutCompletedToday(false), midnight.getTime() - now.getTime())
    return () => clearTimeout(id)
  }, [workoutCompletedToday])

  async function handleGymCheckin() {
    if (checkinLoading || !profile) return
    setCheckinLoading(true)
    const { error } = await supabase
      .from('users')
      .update({ gym_checkin_at: new Date().toISOString() })
      .eq('id', profile.id)
    if (!error) setIsCheckedIn(true)
    setCheckinLoading(false)
  }

  async function handleKudos(item: ActivityItem) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user || item.userGaveKudos) return
    const { error } = await supabase.from('kudos').insert({
      sender_id: user.id,
      recipient_id: item.userId,
      workout_id: item.workoutId,
    })
    if (!error) {
      setActivityFeed(prev => prev.map(a =>
        a.id === item.id ? { ...a, kudosCount: a.kudosCount + 1, userGaveKudos: true } : a
      ))
    }
  }

  const currentLeaderboard = filter === 'friends' ? friendsLeaderboard : campusLeaderboard

  if (loading) {
    return (
      <div className="app-shell">
        <div className="app-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
          <div style={{ color: '#5A7A9A', fontSize: 14 }}>Loading…</div>
        </div>
      </div>
    )
  }

  const firstName = profile ? profile.name.split(' ')[0] : 'Athlete'
  const strengthScore = scores?.strength_score ?? 0
  const consistencyScore = calculateConsistencyScore(workoutsThisWeek)
  const isPerfectWeek = workoutsThisWeek >= 4
  const socialScore = scores?.social_score ?? 0
  const ascendScore = calculateAscendScore(strengthScore, consistencyScore, socialScore)
  const streakDays = scores?.streak_days ?? 0

  return (
    <div className="app-shell">
      <div className="app-content page-scroll">
        <div style={{ padding: '48px 20px 0' }}>

          {/* PR Banner */}
          {showPRBanner && newPRs.length > 0 && (
            <div
              style={{
                background: 'linear-gradient(135deg, #0D2E5A, #0A1F3A)',
                border: '1px solid #4A9EFF',
                borderRadius: 14,
                padding: '14px 16px',
                marginBottom: 16,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <p style={{ color: '#4A9EFF', fontSize: 12, fontWeight: 700, margin: '0 0 2px' }}>
                  🏆 New Personal Record{newPRs.length > 1 ? 's' : ''}!
                </p>
                <p style={{ color: '#FFFFFF', fontSize: 13, margin: 0 }}>
                  {newPRs.slice(0, 2).join(', ')}{newPRs.length > 2 ? ` +${newPRs.length - 2} more` : ''}
                </p>
              </div>
              <button
                onClick={() => setShowPRBanner(false)}
                style={{ background: 'none', border: 'none', color: '#5A7A9A', fontSize: 18, cursor: 'pointer', padding: 0 }}
              >
                ×
              </button>
            </div>
          )}

          {/* Greeting */}
          <p style={{ color: '#5A7A9A', fontSize: 13, margin: '0 0 2px' }}>{getGreeting()}</p>
          <h1 style={{ color: '#FFFFFF', fontSize: 26, fontWeight: 700, margin: '0 0 4px' }}>{firstName}</h1>
          <p style={{ color: '#4A9EFF', fontSize: 13, margin: '0 0 16px' }}>
            Day {streakDays} of your program · Keep pushing.
          </p>

          {/* Streak dots */}
          <div style={{ background: '#0D1728', border: '1px solid #1A2A42', borderRadius: 14, padding: '14px 16px', marginBottom: 14 }}>
            <p style={{ color: '#5A7A9A', fontSize: 10, letterSpacing: '1.5px', textTransform: 'uppercase', margin: '0 0 12px' }}>Last 7 Days</p>
            <StreakDots days={weekDays} />
          </div>

          {/* Gym check-in */}
          {isCheckedIn ? (
            <div
              style={{
                background: '#0A1F3A',
                border: '1px solid #1E3D6E',
                borderRadius: 12,
                padding: '10px 16px',
                marginBottom: 14,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#4A9EFF' }} />
              <span style={{ color: '#7AAAD4', fontSize: 13 }}>
                {firstName} is at the gym right now 💪
              </span>
            </div>
          ) : (
            <button
              onClick={handleGymCheckin}
              disabled={checkinLoading}
              style={{
                width: '100%',
                background: '#0D1728',
                border: '1px solid #1A2A42',
                borderRadius: 12,
                padding: '12px 16px',
                color: '#4A9EFF',
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
                textAlign: 'left',
                marginBottom: 14,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <span>Heading to the gym →</span>
              <span style={{ color: '#5A7A9A', fontSize: 11 }}>Visible to friends for 2h</span>
            </button>
          )}

          {/* Score grid */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
            <div style={{ flex: 1, background: '#0D1728', border: '1px solid #1A2A42', borderRadius: 16, padding: 16 }}>
              <p style={{ color: '#5A7A9A', fontSize: 10, letterSpacing: '1.5px', textTransform: 'uppercase', margin: '0 0 8px' }}>Strength Score</p>
              <p style={{ color: '#FFFFFF', fontSize: 28, fontWeight: 700, margin: '0 0 4px' }}>{hasAnyWorkout ? strengthScore : '—'}</p>
              <p style={{ color: '#5A7A9A', fontSize: 11, margin: 0 }}>
                {hasAnyWorkout ? 'Top 35% at Penn' : 'Complete your first workout to unlock'}
              </p>
            </div>

            <div style={{ flex: 1, background: '#0D1728', border: '1px solid #1A2A42', borderRadius: 16, padding: 16 }}>
              <p style={{ color: '#5A7A9A', fontSize: 10, letterSpacing: '1.5px', textTransform: 'uppercase', margin: '0 0 8px' }}>Consistency</p>
              <p style={{ color: '#FFFFFF', fontSize: 28, fontWeight: 700, margin: '0 0 4px' }}>{hasAnyWorkout ? `${consistencyScore}%` : '—'}</p>
              <p style={{ color: isPerfectWeek ? '#4A9EFF' : '#5A7A9A', fontSize: 11, margin: 0, fontWeight: isPerfectWeek ? 700 : 400 }}>
                {hasAnyWorkout ? (isPerfectWeek ? 'Perfect week 🔥' : `${streakDays} day streak`) : 'Complete your first workout to unlock'}
              </p>
            </div>
          </div>

          {/* Ascend Score */}
          <div style={{ background: '#0A1F3A', border: '1px solid #1E3D6E', borderRadius: 16, padding: 16, marginBottom: 14 }}>
            <p style={{ color: '#5A7A9A', fontSize: 10, letterSpacing: '1.5px', textTransform: 'uppercase', margin: '0 0 8px' }}>Ascend Score</p>
            <p style={{ color: '#4A9EFF', fontSize: 36, fontWeight: 700, margin: '0 0 4px' }}>{hasAnyWorkout ? ascendScore : '—'}</p>
            {hasAnyWorkout ? (
              <>
                <p style={{ color: '#5A7A9A', fontSize: 12, margin: '0 0 10px' }}>
                  Ranked <span style={{ color: '#FFFFFF' }}>#12</span> on campus ·{' '}
                  <span style={{ color: '#4A9EFF' }}>↑ 3 spots</span> this week
                </p>
                <div style={{ display: 'inline-block', background: '#0D2E5A', color: '#4A9EFF', fontSize: 10, borderRadius: 6, padding: '2px 8px' }}>
                  Top 20 · Penn Campus
                </div>
              </>
            ) : (
              <p style={{ color: '#5A7A9A', fontSize: 11, margin: 0 }}>Complete your first workout to unlock</p>
            )}
          </div>

          {/* View history */}
          <button
            onClick={() => navigate('/profile')}
            style={{ background: 'none', border: 'none', color: '#4A9EFF', fontSize: 13, cursor: 'pointer', padding: '0 0 14px', display: 'block' }}
          >
            View history →
          </button>

          {/* CTA */}
          <button
            onClick={() => navigate('/workout', workoutCompletedToday ? { state: { preview: true } } : {})}
            style={{
              width: '100%',
              background: workoutCompletedToday ? '#1A2A42' : '#4A9EFF',
              color: workoutCompletedToday ? '#5A7A9A' : '#FFFFFF',
              fontSize: 16,
              fontWeight: 700,
              borderRadius: 16,
              padding: '18px',
              border: 'none',
              cursor: 'pointer',
              marginBottom: 28,
            }}
          >
            {workoutCompletedToday ? "Preview Tomorrow's Workout →" : "Generate Today's Workout →"}
          </button>

          {/* Leaderboard header + filter tabs */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{ color: '#FFFFFF', fontSize: 13, fontWeight: 700 }}>Leaderboard</span>
            <button style={{ background: 'none', border: 'none', color: '#4A9EFF', fontSize: 12, cursor: 'pointer', padding: 0 }}>See all →</button>
          </div>

          {/* Filter tabs */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 12, background: '#0D1728', borderRadius: 10, padding: 4 }}>
            {(['friends', 'campus', 'alltime'] as LeaderboardFilter[]).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                style={{
                  flex: 1,
                  background: filter === f ? '#4A9EFF' : 'transparent',
                  border: 'none',
                  borderRadius: 8,
                  padding: '6px 0',
                  color: filter === f ? '#FFFFFF' : '#5A7A9A',
                  fontSize: 11,
                  fontWeight: filter === f ? 700 : 400,
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                {f === 'friends' ? 'Friends' : f === 'campus' ? 'Campus' : 'All Time'}
              </button>
            ))}
          </div>

          {/* Leaderboard card */}
          {filter === 'friends' && !hasFriends ? (
            <div style={{ background: '#0D1728', border: '1px solid #1A2A42', borderRadius: 16, padding: 24, textAlign: 'center', marginBottom: 20 }}>
              <p style={{ color: '#5A7A9A', fontSize: 13, margin: 0 }}>Add friends to see how you rank against them.</p>
            </div>
          ) : filter !== 'friends' && currentLeaderboard.length < 3 ? (
            <div style={{ background: '#0D1728', border: '1px solid #1A2A42', borderRadius: 16, padding: 32, textAlign: 'center', marginBottom: 20 }}>
              <p style={{ color: '#5A7A9A', fontSize: 13, margin: 0 }}>Be the first on the leaderboard. Start training.</p>
            </div>
          ) : (
            <div style={{ background: '#0D1728', border: '1px solid #1A2A42', borderRadius: 16, padding: '4px 14px', marginBottom: 20 }}>
              {currentLeaderboard.map((entry, idx) => {
                const isUser = profile && entry.userId === profile.id
                return (
                  <div
                    key={idx}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '12px 0',
                      borderBottom: idx < currentLeaderboard.length - 1 ? '1px solid #1A2A42' : 'none',
                      background: isUser ? '#0D2E5A' : 'transparent',
                      borderRadius: isUser ? 10 : 0,
                      margin: isUser ? '4px -4px' : 0,
                      paddingLeft: isUser ? 8 : 0,
                      paddingRight: isUser ? 8 : 0,
                    }}
                  >
                    <span style={{ color: RANK_COLORS[entry.rank] ?? '#5A7A9A', fontSize: 13, fontWeight: 700, width: 18, textAlign: 'center' }}>
                      {entry.rank}
                    </span>
                    <div
                      style={{
                        width: 32, height: 32, borderRadius: '50%',
                        background: '#1A2A42',
                        border: isUser ? '1px solid #4A9EFF' : 'none',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: '#4A9EFF', fontSize: 11, fontWeight: 700, flexShrink: 0,
                      }}
                    >
                      {entry.initials}
                    </div>
                    <div style={{ flex: 1 }}>
                      <p style={{ color: isUser ? '#4A9EFF' : '#FFFFFF', fontSize: 13, fontWeight: 700, margin: 0 }}>{entry.name}</p>
                      <p style={{ color: '#5A7A9A', fontSize: 11, margin: 0 }}>{entry.group}</p>
                    </div>
                    <span style={{ color: '#4A9EFF', fontSize: 14, fontWeight: 700 }}>{entry.score}</span>
                  </div>
                )
              })}
            </div>
          )}

          {/* Activity Feed */}
          {activityFeed.length > 0 && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <span style={{ color: '#FFFFFF', fontSize: 13, fontWeight: 700 }}>Friend Activity</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
                {activityFeed.map(item => (
                  <div
                    key={item.id}
                    style={{
                      background: '#0D1728',
                      border: '1px solid #1A2A42',
                      borderRadius: 14,
                      padding: '12px 14px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                    }}
                  >
                    <div style={{
                      width: 36, height: 36, borderRadius: '50%',
                      background: '#1A2A42',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: '#4A9EFF', fontSize: 12, fontWeight: 700, flexShrink: 0,
                    }}>
                      {item.initials}
                    </div>
                    <div style={{ flex: 1 }}>
                      <p style={{ color: '#FFFFFF', fontSize: 13, fontWeight: 600, margin: '0 0 2px' }}>{item.userName}</p>
                      <p style={{ color: '#5A7A9A', fontSize: 12, margin: 0 }}>{item.description} · {item.time}</p>
                    </div>
                    <button
                      onClick={() => handleKudos(item)}
                      disabled={item.userGaveKudos}
                      style={{
                        background: item.userGaveKudos ? '#0D2E5A' : 'transparent',
                        border: `1px solid ${item.userGaveKudos ? '#4A9EFF' : '#1A2A42'}`,
                        borderRadius: 8,
                        padding: '4px 10px',
                        color: item.userGaveKudos ? '#4A9EFF' : '#5A7A9A',
                        fontSize: 12,
                        cursor: item.userGaveKudos ? 'default' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                        flexShrink: 0,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      👊 {item.kudosCount > 0 ? item.kudosCount : 'Kudos'}
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}

        </div>
      </div>
    </div>
  )
}
