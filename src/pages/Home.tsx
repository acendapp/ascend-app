import { useEffect, useState, useCallback } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import StreakDots from '../components/StreakDots'
import AscendBolt from '../components/AscendBolt'
import { supabase } from '../lib/supabase'
import { getRankInfo, getRankProgress } from '../lib/scoring'
import RankBadge from '../components/RankBadge'
import { useTheme } from '../lib/theme'
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
  const { colors: c, toggleTheme, theme } = useTheme()
  const newPRs: string[] = (location.state as { prs?: string[] } | null)?.prs ?? []

  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [scores, setScores] = useState<UserScores | null>(null)
  const [loading, setLoading] = useState(true)

  const [weekDays, setWeekDays] = useState<boolean[]>(new Array(7).fill(false))
  const [workoutsThisWeek, setWorkoutsThisWeek] = useState(0)
  const [_workoutsLast30Days, setWorkoutsLast30Days] = useState(0)

  const [activityFeed, setActivityFeed] = useState<ActivityItem[]>([])
  const [isCheckedIn, setIsCheckedIn] = useState(false)
  const [checkinLoading, setCheckinLoading] = useState(false)
  const [showCheckinPrompt, setShowCheckinPrompt] = useState(false)
  const [workoutCompletedToday, setWorkoutCompletedToday] = useState(false)

  const [showPRBanner, setShowPRBanner] = useState(newPRs.length > 0)
  const [streakBannerDismissed, setStreakBannerDismissed] = useState(false)
  const [hasAnyWorkout, setHasAnyWorkout] = useState(false)
  const [workoutsCompleted, setWorkoutsCompleted] = useState(0)
  const [campusRank, setCampusRank] = useState(0)
  const [_bestChallenge, setBestChallenge] = useState<string | null>(null)
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
      const checkedIn = !!ci && new Date(ci).getTime() > Date.now() - 2 * 60 * 60 * 1000
      setIsCheckedIn(checkedIn)
      // Sync to localStorage so BottomNav can read without a Supabase call
      if (checkedIn) localStorage.setItem('ascend_gym_checkin', ci)
      else localStorage.removeItem('ascend_gym_checkin')
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
    const hasToday = (todayWorkouts?.length ?? 0) > 0
    setWorkoutCompletedToday(hasToday)
    if (hasToday) localStorage.setItem('ascend_workout_today', '1')
    else localStorage.removeItem('ascend_workout_today')

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
            gymVerified: (w as { gym_verified?: boolean }).gym_verified ?? false,
          }
        })
        setActivityFeed(feed)
      }
    }

    // Campus activity: always shown, non-friends anonymized
    {
      const excludeIds = [user.id, ...friendIds]
      const { data: campusWorkouts } = await supabase
        .from('workouts')
        .select('id, user_id, workout_date, workout_type')
        .eq('completed', true)
        .not('user_id', 'in', `(${excludeIds.join(',')})`)
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
          userName: 'A Penn student',
          initials: '?',
          description: `Completed a ${(w.workout_type as string) ?? 'workout'}`,
          time: timeAgo(w.workout_date as string),
          workoutId: w.id as string,
          kudosCount: 0,
          userGaveKudos: false,
        })))
        void cpMap // fetched for future use if we add friend-aware display
      }
    }

    // Total workout count (for empty state detection)
    const { count: workoutCount } = await supabase
      .from('workouts')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('completed', true)
    const wc = workoutCount ?? 0
    setHasAnyWorkout(wc > 0)
    setWorkoutsCompleted(wc)
    // Sync to localStorage so BottomNav can read without a Supabase call
    if (wc > 0) localStorage.setItem('ascend_has_workout', '1')
    else localStorage.removeItem('ascend_has_workout')

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
      localStorage.setItem('ascend_gym_checkin', new Date().toISOString())
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
      localStorage.removeItem('ascend_gym_checkin')
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
        <div className="app-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: c.bg }}>
          <div style={{ color: c.textSub, fontSize: 14 }}>Loading…</div>
        </div>
      </div>
    )
  }

  // New user activation screen — shown until first workout is completed
  if (!hasAnyWorkout) {
    return (
      <div className="app-shell">
        <div className="app-content" style={{ display: 'flex', flexDirection: 'column', height: '100vh', padding: '0 24px', background: c.bg, position: 'relative', overflow: 'hidden' }}>
          {/* Soft radial glow */}
          <div style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', width: '200%', height: '50%', background: `radial-gradient(ellipse at 50% 0%, ${c.accentBg} 0%, transparent 65%)`, pointerEvents: 'none' }} />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', position: 'relative', zIndex: 1 }}>
            <p style={{ color: c.accent, fontSize: 11, letterSpacing: '2px', textTransform: 'uppercase', margin: '0 0 14px' }}>Welcome to Ascend</p>
            <h1 style={{ color: c.text, fontSize: 30, fontWeight: 700, margin: '0 0 14px', lineHeight: 1.15 }}>
              Your first workout<br />unlocks everything.
            </h1>
            <p style={{ color: c.textSub, fontSize: 14, margin: '0 0 40px', lineHeight: 1.65 }}>
              Your Ascend Score, your campus rank, your history — none of it exists until you train. Every person on the leaderboard started right here.
            </p>
            <button
              onClick={() => navigate('/workout')}
              style={{ width: '100%', background: c.accent, color: '#FFFFFF', fontSize: 18, fontWeight: 700, borderRadius: 16, padding: '20px', border: 'none', cursor: 'pointer', marginBottom: 14, boxShadow: `0 8px 32px ${c.accentBorder}` }}
            >
              Start My First Workout →
            </button>
            {campusActivity.length > 0 && (
              <p style={{ color: c.textSub, fontSize: 12, textAlign: 'center', margin: 0 }}>
                {campusActivity.length} Penn students trained recently. You're next.
              </p>
            )}
          </div>
        </div>
      </div>
    )
  }

  const firstName = profile ? profile.name.split(' ')[0] : 'Athlete'
  const streakDays = scores?.streak_days ?? 0
  const rank = getRankInfo(scores?.ascend_score ?? 0)
  const rankProgress = getRankProgress(scores?.ascend_score ?? 0, rank)

  return (
    <div className="app-shell">
      <div className="app-content page-scroll" style={{ background: c.bg }}>
        <div style={{ padding: '52px 0 100px' }}>

          {/* ── Banners ── */}
          {(showPRBanner && newPRs.length > 0) || (streakDays > 0 && !workoutCompletedToday && !streakBannerDismissed) ? (
            <div style={{ padding: '0 16px', marginBottom: 12 }}>
              {showPRBanner && newPRs.length > 0 ? (
                <div style={{ background: c.accentBg, border: `1px solid ${c.accentBorder}`, borderRadius: 12, padding: '11px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <p style={{ color: c.accent, fontSize: 10, fontWeight: 700, margin: '0 0 2px', letterSpacing: '1.5px', textTransform: 'uppercase' }}>New PR{newPRs.length > 1 ? 's' : ''}</p>
                    <p style={{ color: c.text, fontSize: 13, margin: 0, fontWeight: 600 }}>{newPRs.slice(0, 2).join(', ')}{newPRs.length > 2 ? ` +${newPRs.length - 2} more` : ''}</p>
                  </div>
                  <button onClick={() => setShowPRBanner(false)} style={{ background: 'none', border: 'none', color: c.textSub, fontSize: 20, cursor: 'pointer', padding: '0 0 0 12px', lineHeight: 1 }}>×</button>
                </div>
              ) : (
                <div style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 12, padding: '11px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <p style={{ color: '#F59E0B', fontSize: 13, fontWeight: 600, margin: 0 }}>🔥 {streakDays}-day streak — train today to keep it</p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, marginLeft: 10 }}>
                    <button onClick={() => (!hasAnyWorkout || isCheckedIn) ? navigate('/workout') : setShowCheckinPrompt(true)} style={{ background: '#F59E0B', border: 'none', borderRadius: 7, padding: '4px 10px', color: '#000', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Train now</button>
                    <button onClick={() => setStreakBannerDismissed(true)} style={{ background: 'none', border: 'none', color: 'rgba(245,158,11,0.4)', fontSize: 20, cursor: 'pointer', padding: 0, lineHeight: 1 }}>×</button>
                  </div>
                </div>
              )}
            </div>
          ) : null}

          {/* ── Greeting + Rank + Theme toggle ── */}
          <div style={{ padding: '0 16px', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <p style={{ color: c.textMuted, fontSize: 12, margin: '0 0 2px', letterSpacing: '0.2px' }}>{getGreeting()}</p>
                <h1 style={{ color: c.text, fontSize: 28, fontWeight: 800, margin: 0, letterSpacing: '-0.5px' }}>{firstName}</h1>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 20, padding: '5px 12px', flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, minWidth: 90, boxShadow: c.isDark ? 'inset 0 1px 0 rgba(255,255,255,0.04)' : 'none' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <RankBadge tier={rank.tier} size={22} accentColor={c.accent} />
                    <span style={{ color: c.accent, fontSize: 11, fontWeight: 700 }}>{rank.name}</span>
                  </div>
                  {rank.nextScore !== null && (
                    <div style={{ width: '100%', background: c.border, borderRadius: 3, height: 3, overflow: 'hidden' }}>
                      <div style={{ background: c.accent, height: '100%', width: `${Math.round(rankProgress * 100)}%`, borderRadius: 3, transition: 'width 0.6s ease', boxShadow: `0 0 6px ${c.accentBorder}` }} />
                    </div>
                  )}
                </div>
                <button
                  onClick={toggleTheme}
                  title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                  style={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 20, width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 16, flexShrink: 0 }}
                >
                  {theme === 'dark' ? '☀️' : '🌙'}
                </button>
              </div>
            </div>
          </div>

          {/* ── Streak + Weekly Calendar ── */}
          <div style={{ padding: '0 16px', marginBottom: 12 }}>
            <div style={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 18, padding: '16px 18px', boxShadow: c.isDark ? 'inset 0 1px 0 rgba(255,255,255,0.04)' : '0 1px 4px rgba(0,0,0,0.04)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 13 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
                  <div>
                    <span style={{ color: streakDays > 0 ? '#F59E0B' : c.border, fontSize: 22, fontWeight: 800, textShadow: streakDays > 0 && c.isDark ? '0 0 14px rgba(245,158,11,0.45)' : 'none' }}>
                      🔥 {streakDays > 0 ? streakDays : '—'}
                    </span>
                    <span style={{ color: c.textSub, fontSize: 11, marginLeft: 4 }}>day streak</span>
                  </div>
                  <div style={{ width: 1, height: 22, background: c.border }} />
                  <div>
                    <span style={{ color: workoutsThisWeek >= 5 ? c.accent : c.text, fontSize: 20, fontWeight: 700 }}>
                      {workoutsThisWeek}
                      <span style={{ color: c.textSub, fontSize: 13, fontWeight: 400 }}>/5</span>
                    </span>
                    <span style={{ color: c.textSub, fontSize: 11, marginLeft: 5 }}>this week</span>
                  </div>
                </div>
                {workoutsThisWeek >= 5 && (
                  <span style={{ background: c.accentBg, border: `1px solid ${c.accentBorder}`, borderRadius: 20, padding: '3px 10px', color: c.accent, fontSize: 11, fontWeight: 700 }}>Perfect week 🎯</span>
                )}
              </div>
              <StreakDots days={weekDays} />
              <div style={{ background: c.border, borderRadius: 4, height: 3, overflow: 'hidden', marginTop: 11 }}>
                <div style={{ background: c.accent, height: '100%', width: `${Math.min((workoutsThisWeek / 5) * 100, 100)}%`, borderRadius: 4, transition: 'width 0.6s ease', boxShadow: c.isDark ? `0 0 8px ${c.accentBorder}` : 'none' }} />
              </div>
            </div>
          </div>

          {/* ── Ascend Score Hero ── */}
          <div style={{ padding: '0 16px', marginBottom: 12 }}>
            <div style={{
              position: 'relative', overflow: 'hidden', borderRadius: 22,
              background: c.isDark
                ? `linear-gradient(145deg, #06111E 0%, #0B1E38 50%, #070F1C 100%)`
                : `linear-gradient(145deg, #EBF3FF 0%, #DFF0FF 50%, #E8F4FF 100%)`,
              border: `1px solid ${c.isDark ? '#162540' : '#C5DEFF'}`,
              padding: '26px 22px 22px',
              boxShadow: c.isDark ? `0 0 0 1px rgba(255,255,255,0.03), inset 0 1px 0 rgba(255,255,255,0.05)` : '0 2px 12px rgba(0,0,0,0.06)',
            }}>
              {/* Watermark bolt */}
              <div style={{ position: 'absolute', right: -10, top: '50%', transform: 'translateY(-50%)', opacity: c.isDark ? 0.045 : 0.06, pointerEvents: 'none' }}>
                <AscendBolt size={160} />
              </div>
              {/* Accent sweep — top right corner glow */}
              <div style={{ position: 'absolute', top: 0, right: 0, width: 180, height: 180, background: `radial-gradient(circle at 100% 0%, ${c.accentBg} 0%, transparent 65%)`, pointerEvents: 'none' }} />

              <p style={{ color: c.textMuted, fontSize: 10, letterSpacing: '2px', textTransform: 'uppercase', margin: '0 0 8px', position: 'relative' }}>Ascend Score</p>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 14, position: 'relative' }}>
                <span style={{ color: c.accent, fontSize: 80, fontWeight: 800, lineHeight: 1, letterSpacing: '-4px', textShadow: c.isDark ? `0 0 40px ${c.accentBorder}, 0 0 80px ${c.accentBg}` : 'none' }}>
                  {displayedScore}
                </span>
                {ascendScoreDelta !== null && ascendScoreDelta > 0 && (
                  <span style={{ color: c.accent, fontSize: 20, fontWeight: 700, opacity: 0.8 }}>+{ascendScoreDelta}</span>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8, position: 'relative' }}>
                {workoutsCompleted >= 3 && campusRank > 0 ? (
                  <span style={{ background: c.accentBg, border: `1px solid ${c.accentBorder}`, borderRadius: 20, padding: '5px 14px', color: c.accent, fontSize: 13, fontWeight: 700 }}>
                    #{campusRank} at Penn
                  </span>
                ) : (
                  <span style={{ color: c.textMuted, fontSize: 12 }}>
                    🔒 {3 - workoutsCompleted} more workout{3 - workoutsCompleted !== 1 ? 's' : ''} to unlock rank
                  </span>
                )}
                {workoutsCompleted >= 3 && rankDelta !== null && rankDelta !== 0 && (
                  <span style={{ background: rankDelta > 0 ? (c.isDark ? 'rgba(59,240,160,0.1)' : '#E6FFF5') : (c.isDark ? 'rgba(255,107,107,0.1)' : '#FFF0F0'), border: `1px solid ${rankDelta > 0 ? 'rgba(59,240,160,0.3)' : 'rgba(255,107,107,0.3)'}`, borderRadius: 20, padding: '5px 12px', color: rankDelta > 0 ? '#3BF0A0' : '#FF6B6B', fontSize: 12, fontWeight: 700 }}>
                    {rankDelta > 0 ? `↑ ${rankDelta} spots` : `↓ ${Math.abs(rankDelta)} spots`}
                  </span>
                )}
                {workoutsCompleted >= 3 && totalUsers > 0 && campusRank > 0 && (() => {
                  const pct = Math.ceil((campusRank / totalUsers) * 100)
                  if (pct > 25) return null
                  return (
                    <span style={{ background: c.accentBg, border: `1px solid ${c.accentBorder}`, borderRadius: 20, padding: '5px 12px', color: c.accent, fontSize: 12, fontWeight: 600 }}>
                      {pct <= 5 ? 'Top 5% 🔥' : pct <= 10 ? 'Top 10%' : 'Top 25%'}
                    </span>
                  )
                })()}
              </div>
            </div>
          </div>

          {/* ── Primary CTA ── */}
          <div style={{ padding: '0 16px', marginBottom: 12 }}>
            <button
              onClick={() => {
                if (workoutCompletedToday) { navigate('/workout', { state: { preview: true } }); return }
                if (!hasAnyWorkout || isCheckedIn) { navigate('/workout'); return }
                setShowCheckinPrompt(true)
              }}
              style={{
                width: '100%',
                background: workoutCompletedToday ? c.surface : c.accent,
                color: workoutCompletedToday ? c.textMuted : '#FFFFFF',
                fontSize: 16, fontWeight: 700,
                borderRadius: 16, padding: '18px',
                border: workoutCompletedToday ? `1px solid ${c.border}` : 'none',
                cursor: 'pointer', letterSpacing: '-0.3px',
                boxShadow: workoutCompletedToday ? 'none' : `0 6px 28px ${c.accentBorder}, 0 2px 8px rgba(0,0,0,0.2)`,
              }}
            >
              {workoutCompletedToday ? '✓ Done today · Preview Tomorrow →' : 'Workout Now →'}
            </button>
          </div>

          {/* ── Gym Presence ── */}
          <div style={{ padding: '0 16px', marginBottom: 12 }}>
            <div style={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 16, padding: '13px 16px', boxShadow: c.isDark ? 'inset 0 1px 0 rgba(255,255,255,0.04)' : '0 1px 4px rgba(0,0,0,0.04)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: liveAtGym.length > 0 || isCheckedIn ? c.accent : c.border, flexShrink: 0, boxShadow: liveAtGym.length > 0 || isCheckedIn ? `0 0 7px ${c.accent}` : 'none' }} />
                  <span style={{ color: liveAtGym.length > 0 || isCheckedIn ? c.text : c.textMuted, fontSize: 13, fontWeight: 600 }}>
                    {liveAtGym.length > 0 ? (() => {
                      const friends = liveAtGym.filter(u => u.isFriend)
                      if (friends.length > 0) {
                        const first = friends[0].name.split(' ')[0]
                        const others = liveAtGym.length - 1
                        return others === 0 ? `${first} is at the gym` : `${first} + ${others} other${others > 1 ? 's' : ''} at the gym`
                      }
                      return `${liveAtGym.length} ${liveAtGym.length === 1 ? 'person' : 'people'} at the gym now`
                    })() : isCheckedIn ? "You're at the gym 💪" : 'Nobody here yet · Be the first'}
                  </span>
                </div>
                {isCheckedIn ? (
                  <button onClick={handleGymCheckout} disabled={checkinLoading} style={{ background: 'none', border: `1px solid ${c.border}`, borderRadius: 8, color: c.textSub, fontSize: 11, fontWeight: 600, cursor: 'pointer', padding: '4px 11px', flexShrink: 0 }}>
                    {checkinLoading ? '…' : 'Leave'}
                  </button>
                ) : (
                  <button onClick={handleGymCheckin} disabled={checkinLoading} style={{ background: c.accent, border: 'none', borderRadius: 8, color: '#FFFFFF', fontSize: 11, fontWeight: 700, cursor: 'pointer', padding: '5px 13px', flexShrink: 0, boxShadow: `0 0 10px ${c.accentBorder}` }}>
                    {checkinLoading ? '…' : 'Check in'}
                  </button>
                )}
              </div>
              {liveAtGym.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 10 }}>
                  {liveAtGym.slice(0, 6).map(u => (
                    <span key={u.id} style={{ background: u.isFriend ? c.accentBg : c.surfaceHigh, border: u.isFriend ? `1px solid ${c.accentBorder}` : 'none', color: u.isFriend ? c.accent : c.textSub, fontSize: 11, borderRadius: 20, padding: '3px 10px' }}>
                      {u.name.split(' ')[0]}
                    </span>
                  ))}
                  {liveAtGym.length > 6 && <span style={{ color: c.textMuted, fontSize: 11, alignSelf: 'center' }}>+{liveAtGym.length - 6}</span>}
                </div>
              )}
            </div>
          </div>

          {/* ── Activity Feed ── */}
          <div style={{ padding: '0 16px' }}>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <p style={{ color: c.textMuted, fontSize: 10, letterSpacing: '1.5px', textTransform: 'uppercase', margin: 0, fontWeight: 600 }}>Friend Activity</p>
              {activityFeed.length === 0 && (
                <button onClick={() => navigate('/profile')} style={{ background: 'none', border: 'none', color: c.accent, fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: 0 }}>Find people →</button>
              )}
            </div>

            {activityFeed.length > 0 ? (
              <div style={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 18, overflow: 'hidden', marginBottom: 24, boxShadow: c.isDark ? 'inset 0 1px 0 rgba(255,255,255,0.04)' : '0 1px 4px rgba(0,0,0,0.04)' }}>
                {activityFeed.map((item, i) => (
                  <div
                    key={item.id}
                    onClick={() => navigate(`/profile/${item.userId}`)}
                    style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', borderBottom: i < activityFeed.length - 1 ? `1px solid ${c.border}` : 'none' }}
                  >
                    <div style={{ width: 38, height: 38, borderRadius: '50%', background: `linear-gradient(135deg, ${c.accentBg} 0%, ${c.surfaceHigh} 100%)`, border: `1.5px solid ${c.accentBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: c.accent, fontSize: 13, fontWeight: 700, flexShrink: 0 }}>
                      {item.initials}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <p style={{ color: c.text, fontSize: 13, fontWeight: 600, margin: 0 }}>{item.userName}</p>
                        {item.gymVerified && <span style={{ width: 6, height: 6, borderRadius: '50%', background: c.accent, boxShadow: `0 0 5px ${c.accent}`, display: 'inline-block', flexShrink: 0 }} />}
                      </div>
                      <p style={{ color: c.textSub, fontSize: 12, margin: '1px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {item.description} · {item.time}
                      </p>
                    </div>
                    <button
                      onClick={e => { e.stopPropagation(); handleKudos(item) }}
                      disabled={item.userGaveKudos}
                      style={{ background: item.userGaveKudos ? c.accentBg : 'transparent', border: `1px solid ${item.userGaveKudos ? c.accentBorder : c.border}`, borderRadius: 8, padding: '5px 11px', color: item.userGaveKudos ? c.accent : c.textSub, fontSize: 12, cursor: item.userGaveKudos ? 'default' : 'pointer', display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0, whiteSpace: 'nowrap' }}
                    >
                      👊{item.kudosCount > 0 ? ` ${item.kudosCount}` : ''}
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 16, padding: '20px', textAlign: 'center', marginBottom: 24 }}>
                <p style={{ color: c.textMuted, fontSize: 13, fontWeight: 600, margin: '0 0 4px' }}>No friends yet</p>
                <p style={{ color: c.textFaint, fontSize: 12, margin: 0, lineHeight: 1.5 }}>
                  Add classmates on{' '}
                  <button onClick={() => navigate('/profile')} style={{ background: 'none', border: 'none', color: c.accent, fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: 0 }}>Profile</button>
                  {' '}to see their workouts here.
                </p>
              </div>
            )}

            {campusActivity.length > 0 && (
              <>
                <p style={{ color: c.textMuted, fontSize: 10, letterSpacing: '1.5px', textTransform: 'uppercase', margin: '0 0 10px', fontWeight: 600 }}>Happening at Penn</p>
                <div style={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 18, overflow: 'hidden', boxShadow: c.isDark ? 'inset 0 1px 0 rgba(255,255,255,0.04)' : '0 1px 4px rgba(0,0,0,0.04)' }}>
                  {campusActivity.map((item, i) => (
                    <div key={item.id} style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, borderBottom: i < campusActivity.length - 1 ? `1px solid ${c.border}` : 'none' }}>
                      <div style={{ width: 36, height: 36, borderRadius: '50%', background: c.surfaceHigh, border: `1px solid ${c.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: c.textMuted, fontSize: 14, flexShrink: 0 }}>
                        🎓
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ color: c.text, fontSize: 13, fontWeight: 600, margin: '0 0 1px' }}>{item.userName}</p>
                        <p style={{ color: c.textSub, fontSize: 12, margin: 0 }}>{item.description} · {item.time}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {activityFeed.length === 0 && campusActivity.length === 0 && (
              <div style={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 16, padding: '24px 20px', textAlign: 'center' }}>
                <p style={{ color: c.textMuted, fontSize: 13, fontWeight: 600, margin: '0 0 6px' }}>No activity yet</p>
                <p style={{ color: c.textFaint, fontSize: 12, margin: '0 0 14px', lineHeight: 1.5 }}>
                  Your friends' workouts appear here once you connect with people.
                </p>
                <button onClick={() => navigate('/profile')} style={{ background: c.accentBg, border: `1px solid ${c.accentBorder}`, borderRadius: 10, padding: '8px 18px', color: c.accent, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                  Find people →
                </button>
              </div>
            )}
          </div>

        </div>
      </div>

      {/* ── Gym check-in modal ── */}
      {showCheckinPrompt && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
          onClick={() => setShowCheckinPrompt(false)}
        >
          <div
            style={{ background: c.surface, border: `1px solid ${c.border}`, boxShadow: c.isDark ? 'inset 0 1px 0 rgba(255,255,255,0.06)' : '0 -4px 24px rgba(0,0,0,0.12)', borderRadius: '22px 22px 0 0', padding: '28px 24px 44px', width: '100%', maxWidth: 390 }}
            onClick={e => e.stopPropagation()}
          >
            <p style={{ color: c.text, fontSize: 20, fontWeight: 800, margin: '0 0 6px', letterSpacing: '-0.5px' }}>Are you at the gym?</p>
            <p style={{ color: c.textSub, fontSize: 14, margin: '0 0 28px', lineHeight: 1.6 }}>
              Check in to let your friends know you're training and earn social points.
            </p>
            <button
              onClick={async () => {
                setShowCheckinPrompt(false)
                navigate('/workout')
                if (profile) {
                  const now = new Date().toISOString()
                  localStorage.setItem('ascend_gym_checkin', now)
                  await supabase.from('users').update({ gym_checkin_at: now }).eq('id', profile.id)
                  const { data: scoreRow } = await supabase.from('user_scores').select('social_score').eq('user_id', profile.id).maybeSingle()
                  const newSocial = Math.min((scoreRow?.social_score ?? 0) + 3, 100)
                  await supabase.from('user_scores').update({ social_score: newSocial }).eq('user_id', profile.id)
                }
              }}
              style={{ width: '100%', background: c.accent, color: '#FFFFFF', fontSize: 16, fontWeight: 700, borderRadius: 14, padding: '17px', border: 'none', cursor: 'pointer', marginBottom: 10, letterSpacing: '-0.2px', boxShadow: `0 6px 24px ${c.accentBorder}` }}
            >
              Check in + Start →
            </button>
            <button
              onClick={() => { setShowCheckinPrompt(false); navigate('/workout') }}
              style={{ width: '100%', background: 'none', color: c.textMuted, fontSize: 15, fontWeight: 600, borderRadius: 14, padding: '14px', border: `1px solid ${c.border}`, cursor: 'pointer' }}
            >
              Skip, just start
            </button>
          </div>
        </div>
      )}

    </div>
  )
}
