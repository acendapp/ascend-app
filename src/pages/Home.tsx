import { useEffect, useState, useCallback } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import StreakDots from '../components/StreakDots'
import { supabase } from '../lib/supabase'
import { calculateConsistencyScore, getLevelName, getXPProgress } from '../lib/scoring'
import type { UserProfile, UserScores, ActivityItem } from '../types'


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

interface GymUser { id: string; name: string; isFriend: boolean }

const RANK_SNAP_KEY = 'ascend_rank_snap'
const SCORE_SNAP_KEY = 'ascend_score_snap'
function getRankDelta(userId: string, currentRank: number): number | null {
  try {
    const snap = JSON.parse(localStorage.getItem(RANK_SNAP_KEY) ?? '{}') as Record<string, number>
    const prev = snap[userId]
    if (prev === undefined || prev === currentRank) return null
    return prev - currentRank
  } catch { return null }
}
function storeRankSnapshot(userId: string, rank: number) {
  try {
    const snap = JSON.parse(localStorage.getItem(RANK_SNAP_KEY) ?? '{}') as Record<string, number>
    snap[userId] = rank
    localStorage.setItem(RANK_SNAP_KEY, JSON.stringify(snap))
  } catch {}
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
  const [workoutsLast30Days, setWorkoutsLast30Days] = useState(0)

  const [activityFeed, setActivityFeed] = useState<ActivityItem[]>([])
  const [isCheckedIn, setIsCheckedIn] = useState(false)
  const [checkinLoading, setCheckinLoading] = useState(false)
  const [workoutCompletedToday, setWorkoutCompletedToday] = useState(false)

  const [showPRBanner, setShowPRBanner] = useState(newPRs.length > 0)
  const [hasAnyWorkout, setHasAnyWorkout] = useState(false)
  const [campusRank, setCampusRank] = useState(0)
  const [bestChallenge, setBestChallenge] = useState<string | null>(null)
  const [liveAtGym, setLiveAtGym] = useState<GymUser[]>([])
  const [campusActivity, setCampusActivity] = useState<ActivityItem[]>([])
  const [rankDelta, setRankDelta] = useState<number | null>(null)
  const [myFriendIds, setMyFriendIds] = useState<string[]>([])
  const [ascendScoreDelta, setAscendScoreDelta] = useState<number | null>(null)
  const [totalUsers, setTotalUsers] = useState(0)
  const [displayedScore, setDisplayedScore] = useState(0)

  const loadData = useCallback(async () => {
    try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { navigate('/auth'); return }

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

    // Workouts in last 30 days (consistency) and last 7 days (streak dots)
    const thirtyAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    const { data: recentWorkouts } = await supabase
      .from('workouts')
      .select('workout_date')
      .eq('user_id', user.id)
      .eq('completed', true)
      .gte('workout_date', thirtyAgo)

    if (recentWorkouts) {
      const today = new Date()
      const filled = Array.from({ length: 7 }, (_, i) => {
        const day = new Date(today)
        day.setDate(day.getDate() - 6 + i)
        return recentWorkouts.some(w => isSameDay(new Date(w.workout_date), day))
      })
      setWeekDays(filled)
      setWorkoutsLast30Days(recentWorkouts.length)

      // Count workouts since Monday for "perfect week" display
      const monday = new Date()
      monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7))
      monday.setHours(0, 0, 0, 0)
      setWorkoutsThisWeek(recentWorkouts.filter(w => new Date(w.workout_date) >= monday).length)
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
    setMyFriendIds(friendIds)
    if (friendIds.length > 0) {
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

    // Campus activity fallback: shown when user has no friends yet
    if (friendIds.length === 0) {
      const { data: campusWorkouts } = await supabase
        .from('workouts')
        .select('id, user_id, workout_date, workout_type')
        .eq('completed', true)
        .order('workout_date', { ascending: false })
        .limit(6)
      if (campusWorkouts && campusWorkouts.length > 0) {
        const campusUids = [...new Set(campusWorkouts.map(w => w.user_id as string))]
        const { data: campusProfiles } = await supabase
          .from('users').select('id, name').in('id', campusUids)
        const cpMap = new Map((campusProfiles ?? []).map(p => [p.id as string, p.name as string]))
        setCampusActivity(campusWorkouts.map(w => ({
          id: w.id as string,
          userId: w.user_id as string,
          userName: cpMap.get(w.user_id as string) ?? 'Penn Athlete',
          initials: initials(cpMap.get(w.user_id as string) ?? 'Penn Athlete'),
          description: `Completed a ${(w.workout_type as string) ?? 'workout'}`,
          time: timeAgo(w.workout_date as string),
          workoutId: w.id as string,
          kudosCount: 0,
          userGaveKudos: false,
        })))
      }
    }

    // Total workout count (for empty state detection)
    const { count: workoutCount } = await supabase
      .from('workouts')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('completed', true)
    setHasAnyWorkout((workoutCount ?? 0) > 0)

    // Campus rank + total users (parallel)
    const [higherRes, totalRes] = await Promise.all([
      supabase.from('user_scores').select('user_id', { count: 'exact', head: true }).gt('ascend_score', scoresRes.data?.ascend_score ?? 0),
      supabase.from('user_scores').select('user_id', { count: 'exact', head: true }).gt('ascend_score', 0),
    ])
    const currentRank = (higherRes.count ?? 0) + 1
    setCampusRank(currentRank)
    setRankDelta(getRankDelta(user.id, currentRank))
    storeRankSnapshot(user.id, currentRank)
    setTotalUsers(totalRes.count ?? 0)

    // Score delta since last visit
    const currentScore = scoresRes.data?.ascend_score ?? 0
    try {
      const prevStr = localStorage.getItem(`${SCORE_SNAP_KEY}_${user.id}`)
      if (prevStr !== null) {
        const prev = parseInt(prevStr)
        if (!isNaN(prev) && currentScore > prev) setAscendScoreDelta(currentScore - prev)
      }
      localStorage.setItem(`${SCORE_SNAP_KEY}_${user.id}`, String(currentScore))
    } catch {}

    // Live gym presence (people checked in within the last 2h)
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
    const { data: gymUsersData } = await supabase
      .from('users')
      .select('id, name')
      .gte('gym_checkin_at', twoHoursAgo)
      .neq('id', user.id)
      .limit(8)
    setLiveAtGym((gymUsersData ?? []).map(u => ({
      id: u.id as string,
      name: u.name as string,
      isFriend: friendIds.includes(u.id as string),
    })))

    // Best active challenge for teaser (graceful fail if tables not yet migrated)
    try {
      const now = new Date().toISOString()
      const { data: myParticipations } = await supabase
        .from('challenge_participants')
        .select('challenge_id')
        .eq('user_id', user.id)
      if (myParticipations && myParticipations.length > 0) {
        const { data: active } = await supabase
          .from('challenges')
          .select('title')
          .in('id', myParticipations.map(p => p.challenge_id as string))
          .lte('start_date', now)
          .gte('end_date', now)
          .limit(1)
        if (active && active.length > 0) setBestChallenge(`Active in ${active[0].title}`)
      }
    } catch { /* challenge tables not yet migrated */ }

    } catch (err) {
      console.error('[Home] loadData error:', err)
    } finally {
      setLoading(false)
    }
  }, [navigate])

  useEffect(() => { loadData() }, [loadData, location.key])

  // Count-up animation for Ascend Score
  useEffect(() => {
    const target = scores?.ascend_score ?? 0
    if (!target) { setDisplayedScore(0); return }
    let frame: number
    const start = Date.now()
    const duration = 800
    function tick() {
      const p = Math.min((Date.now() - start) / duration, 1)
      const eased = 1 - Math.pow(1 - p, 3)
      setDisplayedScore(Math.round(target * eased))
      if (p < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [scores?.ascend_score])

  // Clear home badge when visiting
  useEffect(() => {
    localStorage.removeItem('ascend_home_badge')
    window.dispatchEvent(new CustomEvent('ascend-badge-update'))
  }, [location.key])

  // Realtime: notify when a friend checks in to the gym
  useEffect(() => {
    if (myFriendIds.length === 0) return
    const channel = supabase
      .channel('friend-gym-checkins')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'users' }, (payload) => {
        const updated = payload.new as { id: string; name: string; gym_checkin_at: string | null }
        if (!myFriendIds.includes(updated.id)) return
        const ci = updated.gym_checkin_at ? new Date(updated.gym_checkin_at).getTime() : 0
        if (Date.now() - ci > 2 * 60 * 60 * 1000) return
        setLiveAtGym(prev => {
          if (prev.some(u => u.id === updated.id)) return prev
          return [{ id: updated.id, name: updated.name, isFriend: true }, ...prev]
        })
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          new Notification('Ascend', { body: `${updated.name.split(' ')[0]} just checked into the gym!`, icon: '/vite.svg' })
        }
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [myFriendIds])

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
    if (!error) {
      setIsCheckedIn(true)
      const { data: scoreRow } = await supabase
        .from('user_scores').select('social_score').eq('user_id', profile.id).maybeSingle()
      const newSocial = Math.min((scoreRow?.social_score ?? 0) + 3, 100)
      await supabase.from('user_scores').update({ social_score: newSocial }).eq('user_id', profile.id)
      setScores(prev => prev ? { ...prev, social_score: newSocial } : prev)
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
      const { data: gymUsersData } = await supabase
        .from('users').select('id, name').gte('gym_checkin_at', twoHoursAgo).neq('id', profile.id).limit(8)
      setLiveAtGym((gymUsersData ?? []).map(u => ({
        id: u.id as string,
        name: u.name as string,
        isFriend: myFriendIds.includes(u.id as string),
      })))
    }
    setCheckinLoading(false)
  }

  async function handleGymCheckout() {
    if (checkinLoading || !profile) return
    setCheckinLoading(true)
    const { error } = await supabase
      .from('users')
      .update({ gym_checkin_at: null })
      .eq('id', profile.id)
    if (!error) {
      setIsCheckedIn(false)
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
      const { data: gymUsersData } = await supabase
        .from('users').select('id, name').gte('gym_checkin_at', twoHoursAgo).neq('id', profile.id).limit(8)
      setLiveAtGym((gymUsersData ?? []).map(u => ({
        id: u.id as string,
        name: u.name as string,
        isFriend: myFriendIds.includes(u.id as string),
      })))
    }
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
      // +5 social points for the recipient, capped at 100
      const { data: scoreRow } = await supabase
        .from('user_scores').select('social_score').eq('user_id', item.userId).maybeSingle()
      const newSocial = Math.min((scoreRow?.social_score ?? 0) + 5, 100)
      await supabase.from('user_scores').update({ social_score: newSocial }).eq('user_id', item.userId)
    }
  }

  if (loading) {
    return (
      <div className="app-shell">
        <div className="app-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
          <div style={{ color: '#5A7A9A', fontSize: 14 }}>Loading…</div>
        </div>
      </div>
    )
  }

  // New user activation screen — shown until first workout is completed
  if (!hasAnyWorkout) {
    return (
      <div className="app-shell">
        <div className="app-content" style={{ display: 'flex', flexDirection: 'column', height: '100vh', padding: '0 24px' }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <p style={{ color: '#4A9EFF', fontSize: 11, letterSpacing: '2px', textTransform: 'uppercase', margin: '0 0 14px' }}>
              Welcome to Ascend
            </p>
            <h1 style={{ color: '#FFFFFF', fontSize: 30, fontWeight: 700, margin: '0 0 14px', lineHeight: 1.15 }}>
              Your first workout<br />unlocks everything.
            </h1>
            <p style={{ color: '#5A7A9A', fontSize: 14, margin: '0 0 40px', lineHeight: 1.65 }}>
              Your Ascend Score, your campus rank, your history — none of it exists until you train. Every person on the leaderboard started right here.
            </p>
            <button
              onClick={() => navigate('/workout')}
              style={{
                width: '100%', background: '#4A9EFF', color: '#FFFFFF',
                fontSize: 18, fontWeight: 700, borderRadius: 16, padding: '20px',
                border: 'none', cursor: 'pointer', marginBottom: 14,
              }}
            >
              Start My First Workout →
            </button>
            {campusActivity.length > 0 && (
              <p style={{ color: '#5A7A9A', fontSize: 12, textAlign: 'center', margin: 0 }}>
                {campusActivity.length} Penn students trained recently. You're next.
              </p>
            )}
          </div>
        </div>
      </div>
    )
  }

  const firstName = profile ? profile.name.split(' ')[0] : 'Athlete'
  const strengthScore = scores?.strength_score ?? 0
  const consistencyScore = calculateConsistencyScore(workoutsLast30Days)
  const isPerfectWeek = workoutsThisWeek >= 4
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
          <p style={{ color: '#4A9EFF', fontSize: 13, margin: '0 0 10px', fontWeight: 600 }}>
            Level {scores?.level ?? 1} · {getLevelName(scores?.level ?? 1)}
            {streakDays > 0 && <span style={{ color: '#5A7A9A', fontWeight: 400 }}> · {streakDays}d streak</span>}
          </p>
          {(() => {
            const xp = scores?.xp ?? 0
            const level = scores?.level ?? 1
            const { current, needed, fraction } = getXPProgress(xp, level)
            return (
              <div style={{ marginBottom: 16 }}>
                <div style={{ background: '#1A2A42', borderRadius: 4, height: 4, overflow: 'hidden' }}>
                  <div style={{ background: '#4A9EFF', height: '100%', width: `${fraction * 100}%`, borderRadius: 4, transition: 'width 0.6s ease' }} />
                </div>
                <p style={{ color: '#5A7A9A', fontSize: 10, margin: '4px 0 0', textAlign: 'right' }}>
                  {current} / {needed} XP · Level {level + 1} next
                </p>
              </div>
            )
          })()}

          {/* Streak dots */}
          <div style={{ background: '#0D1728', border: '1px solid #1A2A42', borderRadius: 14, padding: '14px 16px', marginBottom: 14 }}>
            <p style={{ color: '#5A7A9A', fontSize: 10, letterSpacing: '1.5px', textTransform: 'uppercase', margin: '0 0 12px' }}>Last 7 Days</p>
            <StreakDots days={weekDays} />
          </div>

          {/* Gym presence widget */}
          <div style={{ background: '#0D1728', border: '1px solid #1A2A42', borderRadius: 12, padding: '12px 16px', marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: liveAtGym.length > 0 ? 10 : 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: liveAtGym.length > 0 ? '#3BF0A0' : '#5A7A9A', flexShrink: 0 }} />
                <span style={{ color: '#FFFFFF', fontSize: 13, fontWeight: 600 }}>
                  {(() => {
                    if (liveAtGym.length === 0) return 'Gym is quiet right now'
                    const friends = liveAtGym.filter(u => u.isFriend)
                    if (friends.length > 0) {
                      const first = friends[0].name.split(' ')[0]
                      const others = liveAtGym.length - 1
                      return others === 0
                        ? `${first} is at the gym now 👊`
                        : `${first} and ${others} other${others > 1 ? 's' : ''} are at the gym`
                    }
                    return `${liveAtGym.length} ${liveAtGym.length === 1 ? 'person' : 'people'} at the gym now`
                  })()}
                </span>
              </div>
              {isCheckedIn ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ color: '#4A9EFF', fontSize: 11, fontWeight: 600 }}>You're here 💪</span>
                  <button
                    onClick={handleGymCheckout}
                    disabled={checkinLoading}
                    style={{ background: 'none', border: '1px solid #1A2A42', borderRadius: 6, color: '#5A7A9A', fontSize: 11, fontWeight: 600, cursor: 'pointer', padding: '2px 8px' }}
                  >
                    {checkinLoading ? '…' : 'Leave'}
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleGymCheckin}
                  disabled={checkinLoading}
                  style={{ background: 'none', border: 'none', color: '#4A9EFF', fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: 0 }}
                >
                  {checkinLoading ? '…' : 'Check in →'}
                </button>
              )}
            </div>
            {liveAtGym.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {liveAtGym.slice(0, 5).map(u => (
                  <span key={u.id} style={{
                    background: u.isFriend ? '#0D2E5A' : '#1A2A42',
                    border: u.isFriend ? '1px solid #4A9EFF' : 'none',
                    color: u.isFriend ? '#4A9EFF' : '#7A8A9A',
                    fontSize: 11,
                    borderRadius: 20,
                    padding: '3px 10px',
                  }}>
                    {u.name.split(' ')[0]}
                  </span>
                ))}
                {liveAtGym.length > 5 && (
                  <span style={{ color: '#5A7A9A', fontSize: 11, alignSelf: 'center' }}>+{liveAtGym.length - 5} more</span>
                )}
              </div>
            )}
          </div>

          {/* Score grid */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
            <div style={{ flex: 1, background: '#0D1728', border: '1px solid #1A2A42', borderRadius: 16, padding: 16 }}>
              <p style={{ color: '#5A7A9A', fontSize: 10, letterSpacing: '1.5px', textTransform: 'uppercase', margin: '0 0 8px' }}>Strength Score</p>
              <p style={{ color: '#FFFFFF', fontSize: 28, fontWeight: 700, margin: '0 0 4px' }}>{hasAnyWorkout ? strengthScore : '—'}</p>
              <p style={{ color: '#5A7A9A', fontSize: 11, margin: 0 }}>
                {hasAnyWorkout ? 'Based on your training weights' : 'Complete your first workout to unlock'}
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
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 4 }}>
              <p style={{ color: '#4A9EFF', fontSize: 36, fontWeight: 700, margin: 0 }}>{hasAnyWorkout ? displayedScore : '—'}</p>
              {hasAnyWorkout && ascendScoreDelta !== null && ascendScoreDelta > 0 && (
                <span style={{ color: '#3BF0A0', fontSize: 13, fontWeight: 600 }}>+{ascendScoreDelta} since last session</span>
              )}
            </div>
            {hasAnyWorkout ? (
              <>
                <p style={{ color: '#5A7A9A', fontSize: 12, margin: '0 0 10px' }}>
                  Ranked <span style={{ color: '#FFFFFF' }}>#{campusRank > 0 ? campusRank : '—'}</span> on campus
                  {rankDelta !== null && rankDelta !== 0 && (
                    <> · <span style={{ color: rankDelta > 0 ? '#4A9EFF' : '#FF6B6B' }}>
                      {rankDelta > 0 ? `↑ ${rankDelta}` : `↓ ${Math.abs(rankDelta)}`} spots
                    </span></>
                  )}
                </p>
                <div style={{ display: 'inline-block', background: '#0D2E5A', color: '#4A9EFF', fontSize: 10, borderRadius: 6, padding: '2px 8px' }}>
                  {(() => {
                    if (!totalUsers || campusRank <= 0) return 'Penn Campus'
                    const pct = Math.ceil((campusRank / totalUsers) * 100)
                    if (pct <= 5) return 'Top 5% · Penn Campus'
                    if (pct <= 10) return 'Top 10% · Penn Campus'
                    if (pct <= 15) return 'Top 15% · Penn Campus'
                    if (pct <= 25) return 'Top 25% · Penn Campus'
                    return 'Penn Campus'
                  })()}
                </div>
              </>
            ) : (
              <p style={{ color: '#5A7A9A', fontSize: 11, margin: 0 }}>Complete your first workout to unlock</p>
            )}
          </div>

          {/* View history */}
          <button
            onClick={() => navigate('/history')}
            style={{ background: 'none', border: 'none', color: '#4A9EFF', fontSize: 13, cursor: 'pointer', padding: '0 0 14px', display: 'block' }}
          >
            View history →
          </button>

          {/* CTA */}
          <button
            onClick={() => navigate(workoutCompletedToday ? '/workout/ascend' : '/workout', workoutCompletedToday ? { state: { preview: true } } : {})}
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

          {/* Compete teaser */}
          <div
            style={{
              background: '#0A1F3A',
              border: '1px solid #1E3D6E',
              borderRadius: 14,
              padding: 16,
              marginBottom: 20,
            }}
          >
            <p style={{ color: '#4A9EFF', fontSize: 16, fontWeight: 700, margin: '0 0 4px' }}>
              Campus Rank #{campusRank > 0 ? campusRank : '—'}
            </p>
            {bestChallenge && (
              <p style={{ color: '#5A7A9A', fontSize: 13, margin: '0 0 12px' }}>{bestChallenge}</p>
            )}
            <button
              onClick={() => navigate('/compete')}
              style={{ background: 'none', border: 'none', color: '#4A9EFF', fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: 0 }}
            >
              View leaderboards →
            </button>
          </div>

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
                    onClick={() => navigate(`/profile/${item.userId}`)}
                    style={{
                      background: '#0D1728',
                      border: '1px solid #1A2A42',
                      borderRadius: 14,
                      padding: '12px 14px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      cursor: 'pointer',
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
                      onClick={e => { e.stopPropagation(); handleKudos(item) }}
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

          {/* Campus activity fallback for users without friends */}
          {activityFeed.length === 0 && campusActivity.length > 0 && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
                <span style={{ color: '#FFFFFF', fontSize: 13, fontWeight: 700 }}>Happening at Penn</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
                {campusActivity.map(item => (
                  <div
                    key={item.id}
                    onClick={() => navigate(`/profile/${item.userId}`)}
                    style={{
                      background: '#0D1728',
                      border: '1px solid #1A2A42',
                      borderRadius: 14,
                      padding: '12px 14px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{
                      width: 36, height: 36, borderRadius: '50%',
                      background: '#1A2A42',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: '#5A7A9A', fontSize: 12, fontWeight: 700, flexShrink: 0,
                    }}>
                      {item.initials}
                    </div>
                    <div style={{ flex: 1 }}>
                      <p style={{ color: '#FFFFFF', fontSize: 13, fontWeight: 600, margin: '0 0 2px' }}>{item.userName}</p>
                      <p style={{ color: '#5A7A9A', fontSize: 12, margin: 0 }}>{item.description} · {item.time}</p>
                    </div>
                  </div>
                ))}
                <p style={{ color: '#5A7A9A', fontSize: 11, margin: '4px 0 0', textAlign: 'center' }}>
                  Add friends on Profile to see their activity here
                </p>
              </div>
            </>
          )}

        </div>
      </div>
    </div>
  )
}
