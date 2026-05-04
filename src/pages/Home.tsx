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
  const [workoutsCompleted, setWorkoutsCompleted] = useState(0)
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

      const monday = new Date()
      monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7))
      monday.setHours(0, 0, 0, 0)
      setWorkoutsThisWeek(recentWorkouts.filter(w => new Date(w.workout_date) >= monday).length)
    }

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
      const { data: friendWorkouts } = await supabase
        .from('workouts')
        .select('id, user_id, workout_date, workout_type, gym_verified')
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
            gymVerified: (w as { gym_verified?: boolean }).gym_verified ?? false,
          }
        })
        setActivityFeed(feed)
      }
    }

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

    const { count: workoutCount } = await supabase
      .from('workouts')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('completed', true)
    const wc = workoutCount ?? 0
    setHasAnyWorkout(wc > 0)
    setWorkoutsCompleted(wc)

    const [higherRes, totalRes] = await Promise.all([
      supabase.from('user_scores').select('user_id', { count: 'exact', head: true }).gt('ascend_score', scoresRes.data?.ascend_score ?? 0),
      supabase.from('user_scores').select('user_id', { count: 'exact', head: true }).gt('ascend_score', 0),
    ])
    const currentRank = (higherRes.count ?? 0) + 1
    setCampusRank(currentRank)
    setRankDelta(getRankDelta(user.id, currentRank))
    storeRankSnapshot(user.id, currentRank)
    setTotalUsers(totalRes.count ?? 0)

    const currentScore = scoresRes.data?.ascend_score ?? 0
    try {
      const prevStr = localStorage.getItem(`${SCORE_SNAP_KEY}_${user.id}`)
      if (prevStr !== null) {
        const prev = parseInt(prevStr)
        if (!isNaN(prev) && currentScore > prev) setAscendScoreDelta(currentScore - prev)
      }
      localStorage.setItem(`${SCORE_SNAP_KEY}_${user.id}`, String(currentScore))
    } catch {}

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

  useEffect(() => {
    localStorage.removeItem('ascend_home_badge')
    window.dispatchEvent(new CustomEvent('ascend-badge-update'))
  }, [location.key])

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
          <div style={{ color: '#9CA3AF', fontSize: 14, fontWeight: 500 }}>Loading…</div>
        </div>
      </div>
    )
  }

  if (!hasAnyWorkout) {
    return (
      <div className="app-shell">
        <div className="app-content" style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
          <div style={{ background: '#FFFFFF', padding: '56px 20px 24px', borderBottom: '1px solid #E5E7EB' }}>
            <p style={{ color: '#9CA3AF', fontSize: 13, fontWeight: 500, margin: '0 0 6px' }}>Welcome to Ascend</p>
            <h1 style={{ color: '#111827', fontSize: 28, fontWeight: 800, margin: 0, lineHeight: 1.2 }}>
              Your first workout<br />unlocks everything.
            </h1>
          </div>
          <div style={{ padding: '24px 20px', flex: 1, display: 'flex', flexDirection: 'column' }}>
            <p style={{ color: '#6B7280', fontSize: 15, margin: '0 0 32px', lineHeight: 1.7 }}>
              Your Ascend Score, campus rank, and workout history — all of it starts with your first session. Every top-ranked student at Penn started right here.
            </p>
            <button
              onClick={() => navigate('/workout')}
              style={{
                width: '100%', background: '#FF5C00', color: '#FFFFFF',
                fontSize: 17, fontWeight: 700, borderRadius: 16, padding: '20px',
                border: 'none', cursor: 'pointer', marginBottom: 14,
                boxShadow: '0 4px 16px rgba(255,92,0,0.35)',
              }}
            >
              Start My First Workout →
            </button>
            {campusActivity.length > 0 && (
              <p style={{ color: '#9CA3AF', fontSize: 12, textAlign: 'center', margin: 0 }}>
                {campusActivity.length} Penn students have trained recently.
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
  const xp = scores?.xp ?? 0
  const level = scores?.level ?? 1
  const { current, needed, fraction } = getXPProgress(xp, level)

  const cardStyle: React.CSSProperties = {
    background: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
  }

  return (
    <div className="app-shell">
      <div className="app-content page-scroll">

        {/* PR Banner */}
        {showPRBanner && newPRs.length > 0 && (
          <div style={{
            background: 'rgba(255,92,0,0.08)',
            borderBottom: '1px solid rgba(255,92,0,0.2)',
            padding: '14px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <div>
              <p style={{ color: '#FF5C00', fontSize: 12, fontWeight: 700, margin: '0 0 2px' }}>
                🏆 New PR{newPRs.length > 1 ? 's' : ''}!
              </p>
              <p style={{ color: '#111827', fontSize: 13, margin: 0, fontWeight: 500 }}>
                {newPRs.slice(0, 2).join(', ')}{newPRs.length > 2 ? ` +${newPRs.length - 2} more` : ''}
              </p>
            </div>
            <button
              onClick={() => setShowPRBanner(false)}
              style={{ background: 'none', border: 'none', color: '#9CA3AF', fontSize: 20, cursor: 'pointer', padding: 0, lineHeight: 1 }}
            >
              ×
            </button>
          </div>
        )}

        {/* Header */}
        <div style={{ background: '#FFFFFF', padding: '52px 20px 20px', borderBottom: '1px solid #E5E7EB' }}>
          <p style={{ color: '#6B7280', fontSize: 13, fontWeight: 500, margin: '0 0 3px' }}>{getGreeting()}</p>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <h1 style={{ color: '#111827', fontSize: 26, fontWeight: 800, margin: 0 }}>{firstName}</h1>
            <div style={{ background: 'rgba(255,92,0,0.1)', borderRadius: 20, padding: '5px 12px' }}>
              <span style={{ color: '#FF5C00', fontSize: 12, fontWeight: 700 }}>
                Lv {level} · {getLevelName(level)}
              </span>
            </div>
          </div>
          <div style={{ background: '#F5F5F7', borderRadius: 4, height: 5, overflow: 'hidden' }}>
            <div style={{ background: '#FF5C00', height: '100%', width: `${fraction * 100}%`, borderRadius: 4, transition: 'width 0.6s ease' }} />
          </div>
          <p style={{ color: '#9CA3AF', fontSize: 11, margin: '5px 0 0', textAlign: 'right', fontWeight: 500 }}>
            {current} / {needed} XP · Level {level + 1} next
          </p>
          {streakDays > 0 && (
            <p style={{ color: '#FF5C00', fontSize: 12, fontWeight: 600, margin: '8px 0 0' }}>
              🔥 {streakDays}-day streak
            </p>
          )}
        </div>

        {/* Page content */}
        <div style={{ padding: '16px 16px 0' }}>

          {/* Primary CTA */}
          <button
            onClick={() => navigate('/workout', workoutCompletedToday ? { state: { preview: true } } : {})}
            style={{
              width: '100%',
              background: workoutCompletedToday ? '#FFFFFF' : '#FF5C00',
              color: workoutCompletedToday ? '#6B7280' : '#FFFFFF',
              border: workoutCompletedToday ? '1.5px solid #E5E7EB' : 'none',
              fontSize: 16,
              fontWeight: 700,
              borderRadius: 16,
              padding: '18px',
              cursor: 'pointer',
              marginBottom: 12,
              boxShadow: workoutCompletedToday ? 'none' : '0 4px 14px rgba(255,92,0,0.3)',
              transition: 'all 0.2s',
            }}
          >
            {workoutCompletedToday ? 'Workout done · Preview tomorrow →' : "Generate Today's Workout →"}
          </button>

          {/* Score / Rank / Streak row */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
            {/* Ascend Score — big */}
            <div style={{ ...cardStyle, flex: 2, marginBottom: 0, padding: '16px' }}>
              <p style={{ color: '#9CA3AF', fontSize: 11, fontWeight: 600, margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Score</p>
              <p style={{ color: '#111827', fontSize: 32, fontWeight: 800, margin: '0 0 4px', lineHeight: 1 }}>{displayedScore}</p>
              {ascendScoreDelta !== null && ascendScoreDelta > 0 && (
                <p style={{ color: '#16A34A', fontSize: 12, fontWeight: 600, margin: '0 0 4px' }}>+{ascendScoreDelta} this session</p>
              )}
              {workoutsCompleted >= 3 && (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 3, background: 'rgba(255,92,0,0.08)', borderRadius: 20, padding: '3px 8px' }}>
                  <span style={{ color: '#FF5C00', fontSize: 11, fontWeight: 700 }}>
                    {(() => {
                      if (!totalUsers || campusRank <= 0) return 'Penn Campus'
                      const pct = Math.ceil((campusRank / totalUsers) * 100)
                      if (pct <= 5) return 'Top 5%'
                      if (pct <= 10) return 'Top 10%'
                      if (pct <= 15) return 'Top 15%'
                      if (pct <= 25) return 'Top 25%'
                      return 'Penn Campus'
                    })()}
                  </span>
                </div>
              )}
            </div>

            {/* Rank + Streak stacked */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ ...cardStyle, marginBottom: 0, flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <p style={{ color: '#9CA3AF', fontSize: 10, fontWeight: 600, margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Rank</p>
                {workoutsCompleted < 3 ? (
                  <>
                    <p style={{ color: '#9CA3AF', fontSize: 20, fontWeight: 800, margin: 0, lineHeight: 1 }}>🔒</p>
                    <p style={{ color: '#9CA3AF', fontSize: 9, margin: '3px 0 0', lineHeight: 1.3 }}>
                      {3 - workoutsCompleted} more workout{3 - workoutsCompleted !== 1 ? 's' : ''}
                    </p>
                  </>
                ) : (
                  <>
                    <p style={{ color: '#FF5C00', fontSize: 22, fontWeight: 800, margin: 0, lineHeight: 1 }}>
                      #{campusRank > 0 ? campusRank : '—'}
                    </p>
                    {rankDelta !== null && rankDelta !== 0 && (
                      <p style={{ color: rankDelta > 0 ? '#16A34A' : '#DC2626', fontSize: 10, fontWeight: 600, margin: '2px 0 0' }}>
                        {rankDelta > 0 ? `↑${rankDelta}` : `↓${Math.abs(rankDelta)}`}
                      </p>
                    )}
                  </>
                )}
              </div>
              <div style={{ ...cardStyle, marginBottom: 0, flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <p style={{ color: '#9CA3AF', fontSize: 10, fontWeight: 600, margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Streak</p>
                <p style={{ color: streakDays > 0 ? '#FF5C00' : '#9CA3AF', fontSize: 22, fontWeight: 800, margin: 0, lineHeight: 1 }}>
                  {streakDays > 0 ? `${streakDays}d` : '—'}
                </p>
              </div>
            </div>
          </div>

          {/* Sub-scores */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
            <div style={{ ...cardStyle, marginBottom: 0, flex: 1 }}>
              <p style={{ color: '#9CA3AF', fontSize: 10, fontWeight: 600, margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Strength</p>
              <p style={{ color: '#111827', fontSize: 24, fontWeight: 800, margin: '0 0 2px', lineHeight: 1 }}>{strengthScore}</p>
              <p style={{ color: '#9CA3AF', fontSize: 11, margin: 0 }}>Based on training weights</p>
            </div>
            <div style={{ ...cardStyle, marginBottom: 0, flex: 1 }}>
              <p style={{ color: '#9CA3AF', fontSize: 10, fontWeight: 600, margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Consistency</p>
              <p style={{ color: isPerfectWeek ? '#FF5C00' : '#111827', fontSize: 24, fontWeight: 800, margin: '0 0 2px', lineHeight: 1 }}>{consistencyScore}%</p>
              <p style={{ color: isPerfectWeek ? '#FF5C00' : '#9CA3AF', fontSize: 11, margin: 0, fontWeight: isPerfectWeek ? 700 : 400 }}>
                {isPerfectWeek ? '🔥 Perfect week' : 'Last 30 days'}
              </p>
            </div>
          </div>

          {/* This week */}
          <div style={cardStyle}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <p style={{ color: '#111827', fontSize: 14, fontWeight: 700, margin: 0 }}>This Week</p>
              {isPerfectWeek && (
                <span style={{ color: '#FF5C00', fontSize: 12, fontWeight: 700 }}>Perfect Week 🔥</span>
              )}
            </div>
            <StreakDots days={weekDays} />
          </div>

          {/* Compete teaser */}
          <div style={cardStyle}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <p style={{ color: '#111827', fontSize: 14, fontWeight: 700, margin: 0 }}>Campus Leaderboard</p>
              <button
                onClick={() => navigate('/compete')}
                style={{ background: 'none', border: 'none', color: '#FF5C00', fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: 0 }}
              >
                View all →
              </button>
            </div>
            {workoutsCompleted < 3 ? (
              <p style={{ color: '#9CA3AF', fontSize: 13, margin: 0 }}>
                🔒 Rank unlocks after {3 - workoutsCompleted} more workout{3 - workoutsCompleted !== 1 ? 's' : ''}
              </p>
            ) : (
              <>
                <p style={{ color: '#FF5C00', fontSize: 22, fontWeight: 800, margin: '0 0 4px' }}>
                  #{campusRank > 0 ? campusRank : '—'} at Penn
                </p>
                {bestChallenge && (
                  <p style={{ color: '#6B7280', fontSize: 13, margin: '4px 0 0' }}>{bestChallenge}</p>
                )}
              </>
            )}
          </div>

          {/* Gym presence */}
          <div style={cardStyle}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: liveAtGym.length > 0 ? '#16A34A' : '#9CA3AF', flexShrink: 0 }} />
                <span style={{ color: '#111827', fontSize: 13, fontWeight: 600 }}>
                  {(() => {
                    if (liveAtGym.length === 0) return 'Gym is quiet right now'
                    const friends = liveAtGym.filter(u => u.isFriend)
                    if (friends.length > 0) {
                      const first = friends[0].name.split(' ')[0]
                      const others = liveAtGym.length - 1
                      return others === 0
                        ? `${first} is at the gym now 👊`
                        : `${first} and ${others} other${others > 1 ? 's' : ''} at the gym`
                    }
                    return `${liveAtGym.length} ${liveAtGym.length === 1 ? 'person' : 'people'} at the gym`
                  })()}
                </span>
              </div>
              {isCheckedIn ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ color: '#FF5C00', fontSize: 11, fontWeight: 700 }}>You're here 💪</span>
                  <button
                    onClick={handleGymCheckout}
                    disabled={checkinLoading}
                    style={{ background: 'none', border: '1px solid #E5E7EB', borderRadius: 6, color: '#6B7280', fontSize: 11, fontWeight: 600, cursor: 'pointer', padding: '3px 9px' }}
                  >
                    {checkinLoading ? '…' : 'Leave'}
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleGymCheckin}
                  disabled={checkinLoading}
                  style={{ background: 'none', border: 'none', color: '#FF5C00', fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: 0 }}
                >
                  {checkinLoading ? '…' : 'Check in →'}
                </button>
              )}
            </div>
            {liveAtGym.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                {liveAtGym.slice(0, 5).map(u => (
                  <span key={u.id} style={{
                    background: u.isFriend ? 'rgba(255,92,0,0.08)' : '#F5F5F7',
                    border: u.isFriend ? '1px solid rgba(255,92,0,0.3)' : '1px solid #E5E7EB',
                    color: u.isFriend ? '#FF5C00' : '#6B7280',
                    fontSize: 11,
                    fontWeight: u.isFriend ? 600 : 500,
                    borderRadius: 20,
                    padding: '3px 10px',
                  }}>
                    {u.name.split(' ')[0]}
                  </span>
                ))}
                {liveAtGym.length > 5 && (
                  <span style={{ color: '#9CA3AF', fontSize: 11, alignSelf: 'center' }}>+{liveAtGym.length - 5} more</span>
                )}
              </div>
            )}
          </div>

          {/* View history */}
          <button
            onClick={() => navigate('/history')}
            style={{ background: 'none', border: 'none', color: '#FF5C00', fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: '0 0 12px', display: 'block' }}
          >
            View workout history →
          </button>

          {/* Activity feed */}
          {activityFeed.length > 0 && (
            <>
              <p style={{ color: '#111827', fontSize: 15, fontWeight: 700, margin: '4px 0 12px' }}>Friend Activity</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 12 }}>
                {activityFeed.map(item => (
                  <div
                    key={item.id}
                    onClick={() => navigate(`/profile/${item.userId}`)}
                    style={{
                      background: '#FFFFFF',
                      borderRadius: 16,
                      padding: '14px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      cursor: 'pointer',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
                    }}
                  >
                    <div style={{
                      width: 42, height: 42, borderRadius: '50%',
                      background: 'rgba(255,92,0,0.1)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: '#FF5C00', fontSize: 13, fontWeight: 700, flexShrink: 0,
                    }}>
                      {item.initials}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ color: '#111827', fontSize: 14, fontWeight: 600, margin: '0 0 2px' }}>{item.userName}</p>
                      <p style={{ color: '#6B7280', fontSize: 12, margin: 0 }}>
                        {item.description} · {item.time}
                        {item.gymVerified && <span style={{ color: '#16A34A', marginLeft: 6, fontSize: 11, fontWeight: 600 }}>📍 Verified</span>}
                      </p>
                    </div>
                    <button
                      onClick={e => { e.stopPropagation(); handleKudos(item) }}
                      disabled={item.userGaveKudos}
                      style={{
                        background: item.userGaveKudos ? 'rgba(255,92,0,0.08)' : 'transparent',
                        border: `1.5px solid ${item.userGaveKudos ? '#FF5C00' : '#E5E7EB'}`,
                        borderRadius: 10,
                        padding: '5px 10px',
                        color: item.userGaveKudos ? '#FF5C00' : '#6B7280',
                        fontSize: 12,
                        fontWeight: item.userGaveKudos ? 700 : 500,
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

          {/* Campus activity fallback */}
          {activityFeed.length === 0 && campusActivity.length > 0 && (
            <>
              <p style={{ color: '#111827', fontSize: 15, fontWeight: 700, margin: '4px 0 12px' }}>Happening at Penn</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 12 }}>
                {campusActivity.map(item => (
                  <div
                    key={item.id}
                    onClick={() => navigate(`/profile/${item.userId}`)}
                    style={{
                      background: '#FFFFFF',
                      borderRadius: 16,
                      padding: '14px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      cursor: 'pointer',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
                    }}
                  >
                    <div style={{
                      width: 42, height: 42, borderRadius: '50%',
                      background: '#F5F5F7',
                      border: '1.5px solid #E5E7EB',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: '#6B7280', fontSize: 13, fontWeight: 700, flexShrink: 0,
                    }}>
                      {item.initials}
                    </div>
                    <div style={{ flex: 1 }}>
                      <p style={{ color: '#111827', fontSize: 14, fontWeight: 600, margin: '0 0 2px' }}>{item.userName}</p>
                      <p style={{ color: '#6B7280', fontSize: 12, margin: 0 }}>{item.description} · {item.time}</p>
                    </div>
                  </div>
                ))}
                <p style={{ color: '#9CA3AF', fontSize: 11, margin: '2px 0 0', textAlign: 'center' }}>
                  Add friends on Profile to see their activity
                </p>
              </div>
            </>
          )}

        </div>
      </div>
    </div>
  )
}
