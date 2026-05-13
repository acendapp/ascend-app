import { useEffect, useState, useCallback, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { getRankInfo, getRankProgress, RANKS } from '../lib/scoring'
import { useTheme } from '../lib/theme'
import RankBadge from '../components/RankBadge'
import type { UserProfile, UserScores, ActivityItem } from '../types'

// ── Notifications ─────────────────────────────────────────────────────────────

interface AppNotification {
  id: string
  message: string
  timestamp: number
  read: boolean
}

const NOTIF_KEY = 'ascend_notifs'

const NOTIF_VERSION = 3

function loadNotifs(): AppNotification[] {
  try {
    if (Number(localStorage.getItem(NOTIF_KEY + '_v')) !== NOTIF_VERSION) return []
    return JSON.parse(localStorage.getItem(NOTIF_KEY) ?? '[]')
  } catch { return [] }
}
function saveNotifs(n: AppNotification[]) {
  localStorage.setItem(NOTIF_KEY, JSON.stringify(n))
  localStorage.setItem(NOTIF_KEY + '_v', String(NOTIF_VERSION))
}

function timeAgoShort(ms: number): string {
  const diff = Math.floor((Date.now() - ms) / 1000)
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface GymUser { id: string; name: string; isFriend: boolean }
interface GroupStanding { id: string; name: string; weeklyScore: number; rank: number; isMyGroup: boolean; logo_url: string | null }
interface ChallengeDetail {
  id: string; title: string; dayCount: number; totalDays: number
  participantCount: number; daysRemaining: number; progressPct: number
}
interface FeedItem extends ActivityItem {
  activityType: 'workout' | 'pr' | 'checkin'
  rawTimestamp: number
  prDetails?: string
}

interface FeedDisplayItem {
  id: string
  name: string
  mainText: string
  subText: string
  timeStr: string
  activityType: 'checkin' | 'pr' | 'streak' | 'workout' | 'leaderboard' | 'rank'
  leaderboardDelta?: number
  rankTier?: number
  isPlaceholder: boolean
  workoutId?: string
  kudosCount?: number
  userGaveKudos?: boolean
  userId?: string
}

// ── Reactions ─────────────────────────────────────────────────────────────────

type ReactKey = 'clap'
type Reactions = { clap: number }

const REACTION_EMOJIS: Record<ReactKey, string> = { clap: '👏' }
const REACTION_KEYS: ReactKey[] = ['clap']

function seedReactions(id: string): Reactions {
  let h = 5381
  for (let i = 0; i < id.length; i++) h = ((h << 5) + h) ^ id.charCodeAt(i)
  return { clap: (Math.abs(h) % 3) + 2 }  // 2–4
}

// ── Constants ─────────────────────────────────────────────────────────────────

const DEMO_GYM_USERS: GymUser[] = [
  { id: 'd1',  name: 'Alex Kim',    isFriend: false },
  { id: 'd2',  name: 'Sarah Chen',  isFriend: false },
  { id: 'd3',  name: 'Marcus Lee',  isFriend: false },
  { id: 'd4',  name: 'Priya Patel', isFriend: false },
  { id: 'd5',  name: 'Jordan Wu',   isFriend: false },
  { id: 'd6',  name: 'Tyler Ross',  isFriend: false },
  { id: 'd7',  name: 'Emma Liu',    isFriend: false },
  { id: 'd8',  name: 'Kai Nguyen',  isFriend: false },
  { id: 'd9',  name: 'Zara Ahmed',  isFriend: false },
  { id: 'd10', name: 'Chris Park',  isFriend: false },
  { id: 'd11', name: 'Nina Reyes',  isFriend: false },
  { id: 'd12', name: 'David Osei',  isFriend: false },
  { id: 'd13', name: 'Lily Torres', isFriend: false },
  { id: 'd14', name: 'Omar Hassan', isFriend: false },
  { id: 'd15', name: 'Mia Johnson', isFriend: false },
  { id: 'd16', name: 'Ben Zhao',    isFriend: false },
]
const GYM_OPTIONS = ['Pottruck Fitness Center', 'Fox Fitness Center', 'Private Gym']

const DEMO_FEED: FeedDisplayItem[] = [
  { id: 'df1', name: 'Jake Morrison',  mainText: 'hit a new PR',             subText: '315 lb Squat',           timeStr: '12m ago', activityType: 'pr',          isPlaceholder: true },
  { id: 'df2', name: 'Sarah Chen',     mainText: 'kept their streak',        subText: '14 day streak',          timeStr: '1h ago',  activityType: 'streak',      isPlaceholder: true },
  { id: 'df3', name: 'Marcus Lee',     mainText: 'checked in',               subText: 'Pottruck Fitness Center', timeStr: '2h ago',  activityType: 'checkin',     isPlaceholder: true },
  { id: 'df4', name: 'Priya Patel',    mainText: 'moved up',                 subText: 'Now ranked #2 at Penn',  timeStr: '3h ago',  activityType: 'leaderboard', leaderboardDelta: 4, isPlaceholder: true },
  { id: 'df5', name: 'Tyler Ross',     mainText: 'hit a new PR',             subText: '225 lb Bench Press',     timeStr: '5h ago',  activityType: 'pr',          isPlaceholder: true },
  { id: 'df6', name: 'Alex Kim',       mainText: 'reached Contender',        subText: 'New rank achieved',       timeStr: '6h ago',  activityType: 'rank',        rankTier: 3,  isPlaceholder: true },
]
const RANK_SNAP_KEY  = 'ascend_rank_snap'
const SCORE_SNAP_KEY = 'ascend_score_snap'
// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string) {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (diff < 60)    return 'just now'
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

function initials(name: string) {
  return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
}

function storeRankSnapshot(userId: string, rank: number) {
  try {
    const snap = JSON.parse(localStorage.getItem(RANK_SNAP_KEY) ?? '{}') as Record<string, number>
    snap[userId] = rank
    localStorage.setItem(RANK_SNAP_KEY, JSON.stringify(snap))
  } catch {}
}

// ── Feed Icon ─────────────────────────────────────────────────────────────────

function FeedIcon({ type, delta, rankTier, accent }: { type: string; delta?: number; rankTier?: number; accent: string }) {
  const wrap = (content: React.ReactNode) => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 24, flexShrink: 0 }}>
      {content}
    </div>
  )
  if (type === 'checkin') return wrap(
    <svg width="20" height="20" viewBox="0 0 24 24" fill={accent} style={{ display: 'block' }}>
      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
    </svg>
  )
  if (type === 'pr') return wrap(<span style={{ fontSize: 18, lineHeight: 1, display: 'block' }}>🥇</span>)
  if (type === 'streak') return wrap(<span style={{ fontSize: 18, lineHeight: 1, display: 'block' }}>🔥</span>)
  if (type === 'leaderboard') return wrap(
    <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
      <svg width="16" height="16" viewBox="0 0 18 18" fill="none" style={{ display: 'block' }}>
        <path d="M4 13 L9 8 L14 13" stroke={accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M4 9 L9 4 L14 9" stroke={accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {delta !== undefined && <span style={{ color: accent, fontSize: 11, fontWeight: 700, lineHeight: 1 }}>+{delta}</span>}
    </div>
  )
  if (type === 'rank') return wrap(<RankBadge tier={rankTier ?? 1} size={24} accentColor={accent} />)
  return wrap(<span style={{ fontSize: 18, lineHeight: 1, display: 'block' }}>💪</span>)
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function Home() {
  const navigate      = useNavigate()
  const location      = useLocation()
  const { colors: c, toggleTheme } = useTheme()

  const [profile,               setProfile]               = useState<UserProfile | null>(null)
  const [scores,                setScores]                = useState<UserScores | null>(null)
  const [loading,               setLoading]               = useState(true)
  const [activityFeed,          setActivityFeed]          = useState<FeedItem[]>([])
  const [isCheckedIn,           setIsCheckedIn]           = useState(false)
  const [checkinLoading,        setCheckinLoading]        = useState(false)
  const [workoutCompletedToday, setWorkoutCompletedToday] = useState(false)
  const [hasAnyWorkout,         setHasAnyWorkout]         = useState(false)
  const [workoutsCompleted,     setWorkoutsCompleted]     = useState(0)
  const [campusRank,            setCampusRank]            = useState(0)
  const [totalUsers,            setTotalUsers]            = useState(0)
  const [displayedScore,        setDisplayedScore]        = useState(0)
  const [groupStandings,        setGroupStandings]        = useState<GroupStanding[]>([])
  const [challengeDetail,       setChallengeDetail]       = useState<ChallengeDetail | null>(null)
  const [showScoreInfo,         setShowScoreInfo]         = useState(false)
  const [showCheckinPrompt,     setShowCheckinPrompt]     = useState(false)
  const [postCheckinDest,       setPostCheckinDest]       = useState<string | null>(null)
  const [liveAtGym,             setLiveAtGym]             = useState<GymUser[]>([])
  const [gymLocation,           setGymLocation]           = useState('Pottruck Fitness Center')
  const [showGymDropdown,       setShowGymDropdown]       = useState(false)
  const [dropdownPos,           setDropdownPos]           = useState({ top: 0, left: 0 })
  const [showGymUsers,          setShowGymUsers]          = useState(false)
  const [feedReactions,         setFeedReactions]         = useState<Record<string, { counts: Reactions; mine: { clap: boolean } }>>({})
  const [notifications,         setNotifications]         = useState<AppNotification[]>(() => loadNotifs())
  const [showNotifDropdown,     setShowNotifDropdown]     = useState(false)
  const [notifPos,              setNotifPos]              = useState({ top: 0, right: 0 })
  const notifBtnRef = useRef<HTMLButtonElement>(null)

  const [gymUsersPos,           setGymUsersPos]           = useState({ top: 0, right: 0 })
  const gymBtnRef = useRef<HTMLButtonElement>(null)
  const gymUsersBtnRef = useRef<HTMLButtonElement>(null)

  // ── Load data ───────────────────────────────────────────────────────────────

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
        const { data: byEmail } = await supabase.from('users').select('*').eq('email', user.email).maybeSingle()
        profileData = byEmail
      }
      if (profileData) {
        setProfile(profileData)
        const ci = profileData.gym_checkin_at
        const checkedIn = !!ci && new Date(ci).getTime() > Date.now() - 2 * 60 * 60 * 1000
        setIsCheckedIn(checkedIn)
        if (checkedIn) localStorage.setItem('ascend_gym_checkin', ci)
        else localStorage.removeItem('ascend_gym_checkin')
      }
      if (scoresRes.data) setScores(scoresRes.data)

      // Today's workout
      const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
      const { data: todayWks } = await supabase.from('workouts').select('id')
        .eq('user_id', user.id).eq('completed', true).gte('workout_date', todayStart.toISOString()).limit(1)
      const hasToday = (todayWks?.length ?? 0) > 0
      setWorkoutCompletedToday(hasToday)
      if (hasToday) localStorage.setItem('ascend_workout_today', '1')
      else localStorage.removeItem('ascend_workout_today')


      // Friends
      const { data: friendships } = await supabase.from('friendships')
        .select('requester_id, recipient_id')
        .or(`requester_id.eq.${user.id},recipient_id.eq.${user.id}`)
        .eq('status', 'accepted')
      const friendIds = (friendships ?? []).map(f =>
        f.requester_id === user.id ? f.recipient_id : f.requester_id
      )

      // Activity feed: friend workouts + PRs merged and sorted
      if (friendIds.length > 0) {
        const [fwRes, fpRes] = await Promise.all([
          supabase.from('workouts')
            .select('id, user_id, workout_date, workout_type, gym_verified')
            .in('user_id', friendIds).eq('completed', true)
            .order('workout_date', { ascending: false }).limit(8),
          supabase.from('personal_records')
            .select('id, user_id, exercise_name, weight, logged_at')
            .in('user_id', friendIds)
            .order('logged_at', { ascending: false }).limit(8),
        ])
        const allUids = [...new Set([
          ...(fwRes.data ?? []).map(w => w.user_id as string),
          ...(fpRes.data ?? []).map(p => p.user_id as string),
        ])]
        const { data: fps } = await supabase.from('users').select('id, name').in('id', allUids)
        const fpMap = new Map((fps ?? []).map(p => [p.id as string, p.name as string]))

        const workoutIds = (fwRes.data ?? []).map(w => w.id as string)
        const kudosMap = new Map<string, { count: number; userGave: boolean }>()
        if (workoutIds.length > 0) {
          const { data: kRows } = await supabase.from('kudos').select('workout_id, sender_id').in('workout_id', workoutIds)
          for (const k of kRows ?? []) {
            const prev = kudosMap.get(k.workout_id) ?? { count: 0, userGave: false }
            kudosMap.set(k.workout_id, {
              count: prev.count + 1,
              userGave: prev.userGave || k.sender_id === user.id,
            })
          }
        }

        const feedRaw: FeedItem[] = []
        for (const w of fwRes.data ?? []) {
          const fname = fpMap.get(w.user_id as string) ?? 'Someone'
          const ki = kudosMap.get(w.id as string) ?? { count: 0, userGave: false }
          feedRaw.push({
            id: w.id as string, userId: w.user_id as string, userName: fname, initials: initials(fname),
            description: 'worked out',
            time: timeAgo(w.workout_date as string),
            workoutId: w.id as string, kudosCount: ki.count, userGaveKudos: ki.userGave,
            gymVerified: (w as { gym_verified?: boolean }).gym_verified ?? false,
            activityType: 'workout', rawTimestamp: new Date(w.workout_date as string).getTime(),
          })
        }
        for (const pr of fpRes.data ?? []) {
          const fname = fpMap.get(pr.user_id as string) ?? 'Someone'
          const w = pr.weight as number | null
          feedRaw.push({
            id: pr.id as string, userId: pr.user_id as string, userName: fname, initials: initials(fname),
            description: 'hit a new PR',
            time: timeAgo(pr.logged_at as string),
            workoutId: '', kudosCount: 0, userGaveKudos: false, gymVerified: false,
            activityType: 'pr', rawTimestamp: new Date(pr.logged_at as string).getTime(),
            prDetails: w ? `${Math.round(w)} lb ${pr.exercise_name as string}` : pr.exercise_name as string,
          })
        }
        feedRaw.sort((a, b) => b.rawTimestamp - a.rawTimestamp)
        setActivityFeed(feedRaw.slice(0, 3))
      }

      // Total workouts + campus rank
      const { count: workoutCount } = await supabase.from('workouts').select('id', { count: 'exact', head: true })
        .eq('user_id', user.id).eq('completed', true)
      const wc = workoutCount ?? 0
      setHasAnyWorkout(wc > 0)
      setWorkoutsCompleted(wc)
      if (wc > 0) localStorage.setItem('ascend_has_workout', '1')
      else localStorage.removeItem('ascend_has_workout')

      const [higherRes, totalRes] = await Promise.all([
        supabase.from('user_scores').select('user_id', { count: 'exact', head: true })
          .gt('ascend_score', scoresRes.data?.ascend_score ?? 0),
        supabase.from('user_scores').select('user_id', { count: 'exact', head: true })
          .gt('ascend_score', 0),
      ])
      const currentRank = (higherRes.count ?? 0) + 1
      setCampusRank(currentRank)
      storeRankSnapshot(user.id, currentRank)
      setTotalUsers(totalRes.count ?? 0)

      try {
        const prevStr = localStorage.getItem(`${SCORE_SNAP_KEY}_${user.id}`)
        const currentScore = scoresRes.data?.ascend_score ?? 0
        localStorage.setItem(`${SCORE_SNAP_KEY}_${user.id}`, String(currentScore))
        void prevStr
      } catch {}

      // Live gym
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
      const { data: gymUsersData } = await supabase.from('users').select('id, name')
        .gte('gym_checkin_at', twoHoursAgo).neq('id', user.id).limit(20)
      setLiveAtGym((gymUsersData ?? []).map(u => ({
        id: u.id as string, name: u.name as string, isFriend: friendIds.includes(u.id as string),
      })))

      // Groups (graceful)
      try {
        const monday2 = new Date()
        monday2.setDate(monday2.getDate() - ((monday2.getDay() + 6) % 7))
        monday2.setHours(0, 0, 0, 0)
        const [myGroupRes, allGroupsRes, allMembersRes, weekWorkoutsRes] = await Promise.all([
          supabase.from('group_members').select('group_id').eq('user_id', user.id).limit(1),
          supabase.from('groups').select('id, name'),
          supabase.from('group_members').select('user_id, group_id'),
          supabase.from('workouts').select('user_id').eq('completed', true).gte('workout_date', monday2.toISOString()),
        ])
        const myGid = (myGroupRes.data?.[0] as { group_id: string } | undefined)?.group_id ?? null
        if (myGid && allGroupsRes.data && allMembersRes.data && weekWorkoutsRes.data) {
          type GRow = { id: string; name: string }
          type MRow = { user_id: string; group_id: string }
          const groupNameMap = new Map((allGroupsRes.data as GRow[]).map(g => [g.id, g.name]))
          const weekUserIds   = new Set((weekWorkoutsRes.data as { user_id: string }[]).map(w => w.user_id))
          const groupScores   = new Map<string, number>()
          for (const m of allMembersRes.data as MRow[]) {
            if (!groupScores.has(m.group_id)) groupScores.set(m.group_id, 0)
            if (weekUserIds.has(m.user_id)) groupScores.set(m.group_id, (groupScores.get(m.group_id) ?? 0) + 1)
          }
          const standings: GroupStanding[] = Array.from(groupScores.entries())
            .map(([id, score]) => ({ id, name: groupNameMap.get(id) ?? id, weeklyScore: score, rank: 0, isMyGroup: id === myGid, logo_url: null }))
            .sort((a, b) => b.weeklyScore - a.weeklyScore)
            .map((g, i) => ({ ...g, rank: i + 1 }))
          setGroupStandings(standings.slice(0, 4))
        }
      } catch { /* groups table not available */ }

      // Challenge (graceful)
      try {
        const now2 = new Date().toISOString()
        const { data: myParts } = await supabase.from('challenge_participants').select('challenge_id').eq('user_id', user.id)
        if (myParts && myParts.length > 0) {
          const { data: active } = await supabase.from('challenges')
            .select('id, title, start_date, end_date')
            .in('id', myParts.map(p => p.challenge_id as string))
            .lte('start_date', now2).gte('end_date', now2).limit(1)
          if (active && active.length > 0) {
            const ch = active[0]
            const startMs  = new Date(ch.start_date as string).getTime()
            const endMs    = new Date(ch.end_date as string).getTime()
            const nowMs    = Date.now()
            const totalDays     = Math.max(1, Math.round((endMs - startMs) / 86400000))
            const dayCount      = Math.min(Math.round((nowMs - startMs) / 86400000) + 1, totalDays)
            const daysRemaining = Math.max(0, Math.round((endMs - nowMs) / 86400000))
            const progressPct   = Math.min(Math.round(((nowMs - startMs) / (endMs - startMs)) * 100), 100)
            const { count: pCount } = await supabase.from('challenge_participants')
              .select('id', { count: 'exact', head: true }).eq('challenge_id', ch.id as string)
            setChallengeDetail({ id: ch.id as string, title: ch.title as string, dayCount, totalDays, participantCount: pCount ?? 0, daysRemaining, progressPct })
          }
        }
      } catch { /* challenges table not available */ }

    } catch (err) {
      console.error('[Home] loadData error:', err)
    } finally {
      setLoading(false)
    }
  }, [navigate])

  useEffect(() => { loadData() }, [loadData, location.key])

  // Realtime: friend gym check-ins
  useEffect(() => {
    if (liveAtGym.length === 0) return
    const channel = supabase
      .channel('friend-gym-checkins')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'users' }, (payload) => {
        const updated = payload.new as { id: string; name: string; gym_checkin_at: string | null }
        const ci = updated.gym_checkin_at ? new Date(updated.gym_checkin_at).getTime() : 0
        if (Date.now() - ci > 2 * 60 * 60 * 1000) return
        setLiveAtGym(prev => {
          if (prev.some(u => u.id === updated.id)) return prev
          return [{ id: updated.id, name: updated.name, isFriend: true }, ...prev]
        })
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [liveAtGym.length])

  // Count-up animation for score
  useEffect(() => {
    const target = scores?.ascend_score ?? 0
    if (!target) { setDisplayedScore(0); return }
    let frame: number
    const start = Date.now()
    const duration = 800
    function tick() {
      const p     = Math.min((Date.now() - start) / duration, 1)
      const eased = 1 - Math.pow(1 - p, 3)
      setDisplayedScore(Math.round(target * eased))
      if (p < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [scores?.ascend_score])

  // Clear home badge notification
  useEffect(() => {
    localStorage.removeItem('ascend_home_badge')
    window.dispatchEvent(new CustomEvent('ascend-badge-update'))
  }, [location.key])


  // Reset workout flag at midnight
  useEffect(() => {
    if (!workoutCompletedToday) return
    const now      = new Date()
    const midnight = new Date(now)
    midnight.setDate(midnight.getDate() + 1)
    midnight.setHours(0, 0, 0, 0)
    const id = setTimeout(() => setWorkoutCompletedToday(false), midnight.getTime() - now.getTime())
    return () => clearTimeout(id)
  }, [workoutCompletedToday])

  // ── Notification seeding (must be before early returns) ─────────────────────

  function addNotif(id: string, message: string) {
    setNotifications(prev => {
      if (prev.some(n => n.id === id)) return prev
      const next = [{ id, message, timestamp: Date.now(), read: false }, ...prev]
      saveNotifs(next)
      return next
    })
  }

  useEffect(() => {
    addNotif('welcome', "Welcome to Ascend 👋 Good to have you here. The Penn community trains together — you're part of it now.")
    if (workoutsCompleted >= 1) addNotif('wk-1', "First workout logged. Welcome to the routine — glad you're here.")
    const MILESTONE_MSGS: Record<number, string> = {
      5:   "5 workouts in. You're finding your rhythm — the community is growing alongside you.",
      10:  "10 sessions logged. Consistency like this is what builds real community.",
      15:  "15 workouts. You've been showing up — that means something to the people around you.",
      20:  "20 sessions. A month of commitment. The people you train alongside notice.",
      25:  "25 workouts logged. You're a familiar face in the gym now — that matters.",
      30:  "30 sessions. Showing up this consistently makes the whole community better.",
      40:  "40 workouts logged. The habit is real. Your presence here adds to something bigger.",
      50:  "50 sessions. That kind of dedication shapes the culture of a community.",
      60:  "60 workouts logged. You've been a steady part of this community for a while now.",
      70:  "70 sessions. Still here, still showing up — that's what it's about.",
      80:  "80 workouts logged. The people you train with are better for having you around.",
      90:  "90 sessions. You've helped build something real here at Penn.",
      100: "100 workouts. Thank you for being such a consistent part of this community. 🎉",
    }
    for (const [key, msg] of Object.entries(MILESTONE_MSGS)) {
      if (workoutsCompleted >= Number(key)) addNotif(`wk-${key}`, msg)
    }
  }, [workoutsCompleted]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Handlers ────────────────────────────────────────────────────────────────

  async function handleGymCheckin() {
    if (checkinLoading || !profile) return
    setCheckinLoading(true)
    const { error } = await supabase.from('users').update({ gym_checkin_at: new Date().toISOString() }).eq('id', profile.id)
    if (!error) {
      setIsCheckedIn(true)
      localStorage.setItem('ascend_gym_checkin', new Date().toISOString())
      const { data: scoreRow } = await supabase.from('user_scores').select('social_score').eq('user_id', profile.id).maybeSingle()
      const newSocial = Math.min((scoreRow?.social_score ?? 0) + 3, 100)
      await supabase.from('user_scores').update({ social_score: newSocial }).eq('user_id', profile.id)
      setScores(prev => prev ? { ...prev, social_score: newSocial } : prev)
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
      const { data: gymUsersData } = await supabase.from('users').select('id, name')
        .gte('gym_checkin_at', twoHoursAgo).neq('id', profile.id).limit(20)
      setLiveAtGym((gymUsersData ?? []).map(u => ({
        id: u.id as string, name: u.name as string, isFriend: false,
      })))
    }
    setCheckinLoading(false)
  }

  async function handleGymCheckout() {
    if (checkinLoading || !profile) return
    setCheckinLoading(true)
    const { error } = await supabase.from('users').update({ gym_checkin_at: null }).eq('id', profile.id)
    if (!error) {
      setIsCheckedIn(false)
      localStorage.removeItem('ascend_gym_checkin')
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
      const { data: gymUsersData } = await supabase.from('users').select('id, name')
        .gte('gym_checkin_at', twoHoursAgo).neq('id', profile.id).limit(20)
      setLiveAtGym((gymUsersData ?? []).map(u => ({
        id: u.id as string, name: u.name as string, isFriend: false,
      })))
    }
    setCheckinLoading(false)
  }


  // ── Loading / Empty states ───────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="app-shell">
        <div className="app-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: c.bg }}>
          <div style={{ color: c.textSub, fontSize: 14 }}>Loading…</div>
        </div>
      </div>
    )
  }


  // ── Derived values ───────────────────────────────────────────────────────────

  const firstName    = profile?.name?.split(' ')?.[0] ?? 'Athlete'
  const streakDays   = scores?.streak_days ?? 0
  const pct          = (totalUsers > 0 && campusRank > 0) ? Math.ceil((campusRank / totalUsers) * 100) : null
  const rank         = getRankInfo(scores?.ascend_score ?? 0)
  const rankProgress = getRankProgress(scores?.ascend_score ?? 0, rank)
  const myGroupStanding  = groupStandings.find(g => g.isMyGroup)
  const realCount        = liveAtGym.length
  const displayedGymUsers: GymUser[] = realCount >= 20
    ? liveAtGym
    : [...liveAtGym, ...DEMO_GYM_USERS.slice(0, Math.max(0, 16 - realCount))]
  const gymDisplayCount  = displayedGymUsers.length

  function getItemReactions(id: string) {
    return feedReactions[id] ?? { counts: seedReactions(id), mine: { clap: false } }
  }

  function handleReaction(itemId: string, key: ReactKey) {
    setFeedReactions(prev => {
      const current = prev[itemId] ?? { counts: seedReactions(itemId), mine: { clap: false } }
      const counts = { ...current.counts }
      const mine = { ...current.mine }
      if (mine[key]) {
        counts[key] = Math.max(0, counts[key] - 1)
        mine[key] = false
      } else {
        counts[key]++
        mine[key] = true
      }
      return { ...prev, [itemId]: { counts, mine } }
    })
  }

  const hasUnread = notifications.some(n => !n.read)

  function openNotifDropdown() {
    if (notifBtnRef.current) {
      const rect = notifBtnRef.current.getBoundingClientRect()
      setNotifPos({ top: rect.bottom + 8, right: window.innerWidth - rect.right })
    }
    setNotifications(prev => {
      const next = prev.map(n => ({ ...n, read: true }))
      saveNotifs(next)
      return next
    })
    setShowNotifDropdown(v => !v)
  }

  function clearNotifs() {
    setNotifications([])
    saveNotifs([])
  }

  const displayFeedItems: FeedDisplayItem[] = [
    ...activityFeed.map(item => ({
      id: item.id,
      name: item.userName,
      mainText: item.description,
      subText: item.activityType === 'pr'
        ? (item.prDetails ?? 'Personal record')
        : item.gymVerified ? 'Gym verified' : 'Workout logged',
      timeStr: item.time,
      activityType: item.activityType as FeedDisplayItem['activityType'],
      isPlaceholder: false,
      workoutId: item.workoutId,
      kudosCount: item.kudosCount,
      userGaveKudos: item.userGaveKudos,
      userId: item.userId,
    })),
    ...DEMO_FEED.slice(0, Math.max(0, 3 - activityFeed.length)),
  ]

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="app-shell">
      <div
        className="app-content"
        style={{ background: c.bg }}
        onClick={() => { showGymDropdown && setShowGymDropdown(false); showGymUsers && setShowGymUsers(false); showNotifDropdown && setShowNotifDropdown(false) }}
      >
        <div style={{ padding: '52px 16px calc(env(safe-area-inset-bottom, 0px) + 88px)' }}>

          {/* ── TOP BAR ── */}
          <div style={{ height: 44, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <button
              ref={gymBtnRef}
              onClick={e => {
                e.stopPropagation()
                if (gymBtnRef.current) {
                  const r = gymBtnRef.current.getBoundingClientRect()
                  setDropdownPos({ top: r.bottom + 4, left: r.left })
                }
                setShowGymDropdown(v => !v)
              }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, padding: 0 }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill={c.accent}>
                <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
              </svg>
              <span style={{ color: c.text, fontSize: 14, fontWeight: 600 }}>{gymLocation}</span>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
                <path d="M6 9l6 6 6-6" stroke={c.textSub} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <button onClick={toggleTheme} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {c.isDark ? (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="5" stroke={c.text} strokeWidth="2" />
                    <line x1="12" y1="2" x2="12" y2="4" stroke={c.text} strokeWidth="2" strokeLinecap="round" />
                    <line x1="12" y1="20" x2="12" y2="22" stroke={c.text} strokeWidth="2" strokeLinecap="round" />
                    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" stroke={c.text} strokeWidth="2" strokeLinecap="round" />
                    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" stroke={c.text} strokeWidth="2" strokeLinecap="round" />
                    <line x1="2" y1="12" x2="4" y2="12" stroke={c.text} strokeWidth="2" strokeLinecap="round" />
                    <line x1="20" y1="12" x2="22" y2="12" stroke={c.text} strokeWidth="2" strokeLinecap="round" />
                    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" stroke={c.text} strokeWidth="2" strokeLinecap="round" />
                    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" stroke={c.text} strokeWidth="2" strokeLinecap="round" />
                  </svg>
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" stroke={c.text} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </button>
              <button
                ref={notifBtnRef}
                onClick={e => { e.stopPropagation(); openNotifDropdown() }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, position: 'relative' }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" stroke={c.text} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M13.73 21a2 2 0 0 1-3.46 0" stroke={c.text} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {hasUnread && (
                  <span style={{
                    position: 'absolute', bottom: 0, right: 0,
                    width: 7, height: 7, borderRadius: '50%',
                    background: '#2B7FE0', border: `1.5px solid ${c.bg}`,
                  }} />
                )}
              </button>
            </div>
          </div>


          {/* ── PEOPLE TRAINING ROW ── */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
            <span style={{ fontSize: 18, fontWeight: 800 }}>
              <span style={{ color: c.accent }}>{gymDisplayCount}</span>
              <span style={{ color: c.text }}> people training now</span>
            </span>
            <div style={{ display: 'flex', flexDirection: 'row-reverse', alignItems: 'center' }}>
              {gymDisplayCount > 4 && (
                <button
                  ref={gymUsersBtnRef}
                  onClick={e => {
                    e.stopPropagation()
                    const rect = gymUsersBtnRef.current?.getBoundingClientRect()
                    if (rect) {
                      setGymUsersPos({ top: rect.bottom + 6, right: window.innerWidth - rect.right })
                    }
                    setShowGymUsers(v => !v)
                  }}
                  style={{ width: 30, height: 30, borderRadius: '50%', background: c.accent, border: `2px solid ${c.bg}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 10, fontWeight: 700, flexShrink: 0, cursor: 'pointer' }}
                >
                  +{gymDisplayCount - 4}
                </button>
              )}
              {[...displayedGymUsers.slice(0, 4)].reverse().map((u, i) => (
                <div key={u.id} style={{ width: 30, height: 30, borderRadius: '50%', background: c.border, border: `2px solid ${c.bg}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: c.accent, fontSize: 11, fontWeight: 700, marginLeft: (i > 0 || gymDisplayCount > 4) ? -8 : 0, flexShrink: 0 }}>
                  {initials(u.name)}
                </div>
              ))}
            </div>
          </div>

          {/* ── PROFILE HERO CARD ── */}
          <div style={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 16, padding: 14, marginTop: 12 }}>

            {/* Row 1: avatar · name+oval · streak */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              {/* Avatar */}
              <div style={{ width: 52, height: 52, flexShrink: 0, position: 'relative' }}>
                {profile?.avatar_url ? (
                  <img src={profile.avatar_url} alt="" style={{ width: 52, height: 52, borderRadius: '50%', border: `2px solid ${c.accent}`, objectFit: 'cover', display: 'block' }} />
                ) : (
                  <div style={{ width: 52, height: 52, borderRadius: '50%', border: `2px solid ${c.accent}`, background: c.border, display: 'flex', alignItems: 'center', justifyContent: 'center', color: c.text, fontSize: 16, fontWeight: 700 }}>
                    {profile ? initials(profile.name) : '?'}
                  </div>
                )}
                <span
                  className="presence-dot"
                  style={{
                    position: 'absolute', bottom: 1, right: 1,
                    width: 10, height: 10, borderRadius: '50%',
                    background: c.accent,
                    border: `2px solid ${c.bg}`,
                  }}
                />
              </div>
              {/* Name + rank oval */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <span style={{ color: c.text, fontSize: 18, fontWeight: 700, display: 'block', marginBottom: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{firstName}</span>
                {/* Oval: badge + rank name, progress bar pinned to bottom */}
                <button
                  onClick={() => setShowScoreInfo(true)}
                  style={{
                    position: 'relative',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    border: `1px solid ${c.border}`,
                    borderRadius: 20,
                    overflow: 'hidden',
                    padding: '2px 8px 5px',
                    marginLeft: -4,
                    background: 'none',
                    cursor: 'pointer',
                    lineHeight: 'normal',
                    fontFamily: 'inherit',
                    appearance: 'none',
                    WebkitAppearance: 'none',
                  }}
                >
                  <div style={{ lineHeight: 0, flexShrink: 0 }}>
                    <RankBadge tier={rank.tier} size={17} accentColor={c.accent} />
                  </div>
                  <span style={{ color: c.accent, fontSize: 11, fontWeight: 700 }}>{rank.name}</span>
                  {/* Progress bar at very bottom of oval */}
                  <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 2, background: c.border }}>
                    <div style={{ background: c.accent, height: '100%', width: `${Math.round(rankProgress * 100)}%` }} />
                  </div>
                </button>
              </div>
              {/* Streak */}
              <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                  <span style={{ color: c.text, fontSize: 18, fontWeight: 700, lineHeight: 1 }}>{streakDays}</span>
                  <span style={{ fontSize: 16, lineHeight: 1 }}>🔥</span>
                </div>
                <span style={{ color: c.textSub, fontSize: 10, marginTop: 2 }}>day streak</span>
              </div>
            </div>

            {/* Row 2: score · rank · top% */}
            <div style={{ display: 'flex', alignItems: 'stretch' }}>
              {/* Score */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
                <span style={{ color: c.accent, fontSize: 22, fontWeight: 800, lineHeight: 1 }}>{displayedScore}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                  <span style={{ color: c.textSub, fontSize: 8, fontWeight: 600 }}>Ascend Score</span>
                  <button
                    onClick={() => setShowScoreInfo(true)}
                    style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 13, height: 13, borderRadius: '50%', border: `1px solid ${c.textSub}`, flexShrink: 0 }}
                    aria-label="Learn about Ascend Score"
                  >
                    <span style={{ color: c.textSub, fontSize: 7, fontWeight: 700, lineHeight: 1 }}>i</span>
                  </button>
                </div>
              </div>

              <div style={{ width: 1, height: 36, background: c.border, flexShrink: 0, alignSelf: 'center' }} />

              {/* Campus rank */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
                <span style={{ color: c.text, fontSize: 16, fontWeight: 700, lineHeight: 1 }}>
                  {campusRank > 0 ? `#${campusRank}` : '—'}
                </span>
                <span style={{ color: c.textSub, fontSize: 10, marginTop: 3 }}>at Penn</span>
              </div>

              <div style={{ width: 1, height: 36, background: c.border, flexShrink: 0 }} />

              {/* Top % */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
                <span style={{ color: c.text, fontSize: 16, fontWeight: 700, lineHeight: 1 }}>
                  {pct !== null ? `Top ${pct}%` : '—'}
                </span>
                <span style={{ color: c.textSub, fontSize: 10, marginTop: 3 }}>of Penn</span>
              </div>

            </div>
          </div>

          {/* ── QUICK ACTIONS ROW ── */}
          <div style={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 14, padding: '14px 16px', marginTop: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              {/* Train Now */}
              <button
                onClick={() => {
                  const dest = '/workout'
                  const state = workoutCompletedToday ? { preview: true } : undefined
                  if (!isCheckedIn && !workoutCompletedToday) {
                    setPostCheckinDest(dest)
                    setShowCheckinPrompt(true)
                  } else {
                    navigate(dest, state ? { state } : undefined)
                  }
                }}
                style={{ flex: 1, background: 'none', border: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: 0 }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill={c.accent}>
                  <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                </svg>
                <span style={{ color: c.text, fontSize: 12, fontWeight: 600 }}>Work Out</span>
                <span style={{ color: c.textSub, fontSize: 10 }}>{workoutCompletedToday ? 'Plan tomorrow' : 'Log a workout'}</span>
              </button>
              <div style={{ width: 1, height: 36, background: c.border, flexShrink: 0 }} />
              {/* Check In */}
              <button onClick={() => isCheckedIn ? handleGymCheckout() : setShowCheckinPrompt(true)} disabled={checkinLoading} style={{ flex: 1, background: 'none', border: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: 0 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill={c.accent}>
                  <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
                </svg>
                <span style={{ color: c.text, fontSize: 12, fontWeight: 600 }}>{checkinLoading ? '…' : isCheckedIn ? 'Checked in ✓' : 'Check in'}</span>
                <span style={{ color: c.textSub, fontSize: 10 }}>At the gym</span>
              </button>
              <div style={{ width: 1, height: 36, background: c.border, flexShrink: 0 }} />
              {/* Progress */}
              <button onClick={() => navigate('/history')} style={{ flex: 1, background: 'none', border: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: 0 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <rect x="3"  y="10" width="4" height="11" rx="1" fill={c.accent} />
                  <rect x="10" y="6"  width="4" height="15" rx="1" fill={c.accent} />
                  <rect x="17" y="2"  width="4" height="19" rx="1" fill={c.accent} />
                </svg>
                <span style={{ color: c.text, fontSize: 12, fontWeight: 600 }}>Progress</span>
                <span style={{ color: c.textSub, fontSize: 10 }}>See your stats</span>
              </button>
            </div>
          </div>

          {/* ── ACTIVITY FEED ── */}
          <div style={{ marginTop: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ color: c.text, fontSize: 16, fontWeight: 700 }}>Feed</span>
              <button onClick={() => navigate('/feed')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: c.accent, fontSize: 13, padding: 0 }}>See all →</button>
            </div>
            <div style={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 16, overflow: 'hidden' }}>
              {displayFeedItems.map((item, i) => {
                const rx = getItemReactions(item.id)
                return (
                  <div
                    key={item.id}
                    style={{
                      padding: '10px 14px',
                      borderBottom: i < displayFeedItems.length - 1 ? `1px solid ${c.border}` : 'none',
                    }}
                  >
                    <div
                      onClick={() => !item.isPlaceholder && item.userId ? navigate(`/profile/${item.userId}`) : undefined}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: item.isPlaceholder ? 'default' : 'pointer' }}
                    >
                      <div style={{ width: 36, height: 36, borderRadius: '50%', background: c.surfaceHigh, border: `1px solid ${c.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: c.accent, fontSize: 12, fontWeight: 600, flexShrink: 0 }}>
                        {item.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ margin: '0 0 3px', fontSize: 13, lineHeight: '17px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          <span style={{ color: c.text, fontWeight: 600 }}>{item.name} </span>
                          <span style={{ color: c.text, fontWeight: 400 }}>{item.mainText}</span>
                        </p>
                        <p style={{ margin: 0, color: c.textSub, fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.subText}</p>
                      </div>
                      <span style={{ color: c.textSub, fontSize: 10, lineHeight: 1, flexShrink: 0 }}>{item.timeStr}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* ── GROUP STANDINGS + CHALLENGE ROW ── */}
          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            {/* Group Standings */}
            <div style={{ flex: 1, background: c.surface, border: `1px solid ${c.border}`, borderRadius: 14, padding: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ color: c.text, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>Group Standings</span>
                <span style={{ color: c.textSub, fontSize: 9, whiteSpace: 'nowrap' }}>Weekly</span>
              </div>
              {groupStandings.length > 0 ? (
                <>
                  {groupStandings.map(g => (
                    <div key={g.id} style={{ height: 36, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ color: c.textSub, fontSize: 13, fontWeight: 700, width: 20, flexShrink: 0 }}>{g.rank}</span>
                      <span style={{ flex: 1, color: g.isMyGroup ? c.accent : c.text, fontSize: 13, fontWeight: g.isMyGroup ? 700 : 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.name}</span>
                      <span style={{ color: c.accent, fontSize: 13, fontWeight: 700, flexShrink: 0 }}>{g.weeklyScore}</span>
                    </div>
                  ))}
                  <button onClick={() => navigate('/compete')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: c.accent, fontSize: 12, padding: '8px 0 0', display: 'block' }}>
                    View full leaderboard →
                  </button>
                </>
              ) : (
                <p style={{ color: c.textSub, fontSize: 12, margin: 0 }}>Join a group to see standings</p>
              )}
            </div>

            {/* Challenge */}
            <div style={{ flex: 1, background: c.surface, border: `1px solid ${c.border}`, borderRadius: 14, padding: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ color: c.text, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>Challenges</span>
              </div>
              {challengeDetail ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: 10 }}>
                  <div style={{ width: 48, height: 48, border: `3px solid ${c.accent}`, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <span style={{ color: c.text, fontSize: 18, fontWeight: 700 }}>{challengeDetail.dayCount}</span>
                  </div>
                  <p style={{ color: c.text, fontSize: 13, fontWeight: 600, margin: '8px 0 0', textAlign: 'center', width: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{challengeDetail.title}</p>
                  <p style={{ color: c.textSub, fontSize: 11, margin: '3px 0 0', textAlign: 'center' }}>{challengeDetail.participantCount} people · {challengeDetail.daysRemaining}d left</p>
                  <div style={{ width: '100%', background: c.border, borderRadius: 3, height: 6, overflow: 'hidden', marginTop: 8 }}>
                    <div style={{ background: c.accent, height: '100%', width: `${challengeDetail.progressPct}%`, borderRadius: 3 }} />
                  </div>
                  <button onClick={() => navigate('/compete')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: c.accent, fontSize: 12, padding: '8px 0 0', alignSelf: 'flex-start' }}>
                    View challenge →
                  </button>
                </div>
              ) : (
                <p style={{ color: c.textSub, fontSize: 12, margin: '10px 0 0', textAlign: 'center' }}>No active challenges</p>
              )}
            </div>
          </div>

        </div>
      </div>

      {/* ── Gym users dropdown ── */}
      {showGymUsers && (
        <div
          style={{ position: 'fixed', top: gymUsersPos.top, right: gymUsersPos.right, background: c.surface, border: `1px solid ${c.border}`, borderRadius: 12, zIndex: 1000, minWidth: 180, maxWidth: 220, boxShadow: '0 8px 32px rgba(0,0,0,0.3)', overflow: 'hidden' }}
          onClick={e => e.stopPropagation()}
        >
          <p style={{ color: c.textSub, fontSize: 10, fontWeight: 700, letterSpacing: '1.2px', textTransform: 'uppercase', margin: 0, padding: '10px 14px 6px' }}>At the gym now</p>
          <div style={{ maxHeight: 280, overflowY: 'auto' }}>
            {displayedGymUsers.map((u, i) => (
              <div
                key={u.id}
                onClick={() => { setShowGymUsers(false); navigate(`/profile/${u.id}`) }}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', borderTop: i === 0 ? `1px solid ${c.border}` : 'none', cursor: 'pointer' }}
              >
                <div style={{ width: 28, height: 28, borderRadius: '50%', background: u.isFriend ? c.accentBg : c.border, border: `1.5px solid ${u.isFriend ? c.accent : c.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: u.isFriend ? c.accent : c.text, fontSize: 10, fontWeight: 700, flexShrink: 0 }}>
                  {initials(u.name)}
                </div>
                <span style={{ color: u.isFriend ? c.accent : c.text, fontSize: 13, fontWeight: u.isFriend ? 600 : 400, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.name}</span>
                {u.isFriend && <span style={{ color: c.accent, fontSize: 9, fontWeight: 700 }}>FRIEND</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Notifications dropdown ── */}
      {showNotifDropdown && (
        <div
          style={{ position: 'fixed', top: notifPos.top, right: notifPos.right, background: c.surface, border: `1px solid ${c.border}`, borderRadius: 14, zIndex: 1000, width: 280, boxShadow: '0 8px 32px rgba(0,0,0,0.25)', overflow: 'hidden' }}
          onClick={e => e.stopPropagation()}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px 8px' }}>
            <span style={{ color: c.text, fontSize: 13, fontWeight: 700 }}>Notifications</span>
            {notifications.length > 0 && (
              <button onClick={clearNotifs} style={{ background: 'none', border: 'none', color: c.textSub, fontSize: 11, cursor: 'pointer', padding: 0 }}>Clear all</button>
            )}
          </div>
          <div style={{ borderTop: `1px solid ${c.border}`, maxHeight: 320, overflowY: 'auto' }}>
            {notifications.length === 0 ? (
              <p style={{ color: c.textSub, fontSize: 13, textAlign: 'center', margin: '20px 0' }}>No notifications</p>
            ) : (
              notifications.map((n, i) => (
                <div key={n.id} style={{ padding: '11px 14px', borderTop: i > 0 ? `1px solid ${c.border}` : 'none' }}>
                  <p style={{ color: c.text, fontSize: 13, margin: '0 0 3px', lineHeight: 1.4 }}>{n.message}</p>
                  <p style={{ color: c.textSub, fontSize: 10, margin: 0 }}>{timeAgoShort(n.timestamp)}</p>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ── Gym location dropdown ── */}
      {showGymDropdown && (
        <div
          style={{ position: 'fixed', top: dropdownPos.top, left: dropdownPos.left, background: c.surface, border: `1px solid ${c.border}`, borderRadius: 12, zIndex: 1000, minWidth: 200, boxShadow: '0 8px 32px rgba(0,0,0,0.4)' }}
          onClick={e => e.stopPropagation()}
        >
          {GYM_OPTIONS.map((opt, i) => (
            <button
              key={opt}
              onClick={() => { setGymLocation(opt); setShowGymDropdown(false) }}
              style={{
                width: '100%', background: opt === gymLocation ? c.accentBg : 'none',
                border: 'none', cursor: 'pointer', padding: '12px 16px', textAlign: 'left',
                color: opt === gymLocation ? c.accent : c.text, fontSize: 14,
                fontWeight: opt === gymLocation ? 700 : 400,
                borderRadius: i === 0 ? '12px 12px 0 0' : i === GYM_OPTIONS.length - 1 ? '0 0 12px 12px' : 0,
              }}
            >
              {opt}
            </button>
          ))}
        </div>
      )}

      {/* ── Score info sheet ── */}
      {showScoreInfo && (() => {
        const ascendScore = scores?.ascend_score ?? 0
        const currentRank = getRankInfo(ascendScore)
        const progress = getRankProgress(ascendScore, currentRank)
        const rankColor = currentRank.color === 'accent' ? c.accent : currentRank.color
        const nextRank = RANKS.find(r => r.tier === currentRank.tier + 1) ?? null
        const ptsToNext = nextRank ? Math.max(0, nextRank.minScore - ascendScore) : 0
        return (
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            onClick={() => setShowScoreInfo(false)}
          >
            <div
              style={{ background: c.surface, border: `0.5px solid ${c.border}`, borderRadius: 22, padding: '20px 24px 32px', width: 'calc(100% - 48px)', maxWidth: 342, maxHeight: '90vh', overflowY: 'auto' }}
              onClick={e => e.stopPropagation()}
            >
              {/* Back arrow */}
              <button
                onClick={() => setShowScoreInfo(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 0 20px', display: 'flex', alignItems: 'center', gap: 6, color: c.textSub }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <path d="M15 18l-6-6 6-6" stroke={c.textSub} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span style={{ fontSize: 14, fontWeight: 600 }}>Back</span>
              </button>

              {/* Badge + rank */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, marginBottom: 28 }}>
                <RankBadge tier={currentRank.tier} size={80} accentColor={c.accent} />
                <div style={{ textAlign: 'center' }}>
                  <p style={{ color: rankColor, fontSize: 22, fontWeight: 800, margin: '0 0 2px', letterSpacing: '-0.4px' }}>{currentRank.name}</p>
                  <p style={{ color: c.textSub, fontSize: 12, margin: 0 }}>Tier {currentRank.tier} of {RANKS.length}</p>
                </div>
              </div>

              {/* Score — glass card */}
              <div style={{
                background: c.isDark ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.65)',
                backdropFilter: 'blur(16px)',
                WebkitBackdropFilter: 'blur(16px)',
                border: `1px solid ${c.isDark ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.9)'}`,
                boxShadow: c.isDark ? 'none' : '0 4px 20px rgba(0,0,0,0.10)',
                borderRadius: 14,
                padding: '12px 16px',
                marginBottom: 14,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}>
                <span style={{ color: c.textSub, fontSize: 12, fontWeight: 600, letterSpacing: '1px', textTransform: 'uppercase' }}>Ascend Score</span>
                <span style={{ color: c.accent, fontSize: 32, fontWeight: 800, lineHeight: 1 }}>{ascendScore}</span>
              </div>

              {/* Progress to next rank */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                  <span style={{ color: c.textSub, fontSize: 11 }}>{currentRank.name}</span>
                  {nextRank
                    ? <span style={{ color: c.textSub, fontSize: 11 }}>{nextRank.name} in {ptsToNext} pts</span>
                    : <span style={{ color: rankColor, fontSize: 11, fontWeight: 700 }}>Max rank reached</span>
                  }
                </div>
                <div style={{ height: 5, borderRadius: 3, background: c.border }}>
                  <div style={{ height: '100%', borderRadius: 3, background: rankColor, width: `${Math.round(progress * 100)}%`, transition: 'width 0.4s ease' }} />
                </div>
              </div>

              {/* Explanation */}
              <p style={{ color: c.textSub, fontSize: 13, lineHeight: 1.6, margin: 0 }}>
                Your Ascend Score reflects how consistently you train, how hard you push, and how you engage with the community. It updates after every logged workout.
              </p>
            </div>
          </div>
        )
      })()}

      {/* ── Check-in prompt ── */}
      {showCheckinPrompt && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
          onClick={() => { setShowCheckinPrompt(false); if (postCheckinDest) { navigate(postCheckinDest); setPostCheckinDest(null) } }}
        >
          <div
            style={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: '22px 22px 0 0', padding: '28px 24px 44px', width: '100%', maxWidth: 390 }}
            onClick={e => e.stopPropagation()}
          >
            <p style={{ color: c.text, fontSize: 20, fontWeight: 800, margin: '0 0 6px', letterSpacing: '-0.5px' }}>Are you at the gym?</p>
            <p style={{ color: c.textSub, fontSize: 14, margin: '0 0 28px', lineHeight: 1.6 }}>
              Check in to let your friends know you're training and earn social points.
            </p>
            <button
              onClick={async () => {
                setShowCheckinPrompt(false)
                await handleGymCheckin()
                if (postCheckinDest) { navigate(postCheckinDest); setPostCheckinDest(null) }
              }}
              style={{ width: '100%', background: c.accent, color: '#FFFFFF', fontSize: 16, fontWeight: 700, borderRadius: 14, padding: '17px', border: 'none', cursor: 'pointer', marginBottom: 10, boxShadow: `0 6px 24px ${c.accentBorder}` }}
            >
              Check in →
            </button>
            <button
              onClick={() => { setShowCheckinPrompt(false); if (postCheckinDest) { navigate(postCheckinDest); setPostCheckinDest(null) } }}
              style={{ width: '100%', background: 'none', color: c.textMuted, fontSize: 15, fontWeight: 600, borderRadius: 14, padding: '14px', border: `1px solid ${c.border}`, cursor: 'pointer' }}
            >
              Skip
            </button>
          </div>
        </div>
      )}

    </div>
  )
}
