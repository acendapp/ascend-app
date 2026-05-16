import { useEffect, useState, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useTheme } from '../lib/theme'

// ── Notifications ─────────────────────────────────────────────────────────────

interface AppNotification { id: string; message: string; timestamp: number; read: boolean }
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

// ── Gym placeholder users ─────────────────────────────────────────────────────

interface GymUser { id: string; name: string }
const DEMO_GYM_USERS: GymUser[] = [
  { id: 'd1', name: 'Alex Kim' }, { id: 'd2', name: 'Sarah Chen' },
  { id: 'd3', name: 'Marcus Lee' }, { id: 'd4', name: 'Priya Patel' },
  { id: 'd5', name: 'Jordan Wu' }, { id: 'd6', name: 'Tyler Ross' },
  { id: 'd7', name: 'Emma Liu' }, { id: 'd8', name: 'Kai Nguyen' },
  { id: 'd9', name: 'Zara Ahmed' }, { id: 'd10', name: 'Chris Park' },
  { id: 'd11', name: 'Nina Reyes' }, { id: 'd12', name: 'David Osei' },
  { id: 'd13', name: 'Lily Torres' }, { id: 'd14', name: 'Omar Hassan' },
  { id: 'd15', name: 'Mia Johnson' }, { id: 'd16', name: 'Ben Zhao' },
]

// ── Local types ───────────────────────────────────────────────────────────────

interface Challenge {
  id: string
  title: string
  description: string | null
  challenge_type: 'most_workouts' | 'biggest_score_gain' | 'most_volume'
  start_date: string
  end_date: string
}

interface RankEntry {
  user_id: string
  name: string
  value: number
}

interface ComputedChallenge {
  challenge: Challenge
  joined: boolean
  userRank: number
  totalParticipants: number
  daysRemaining: number
  aboveName: string | null
}

interface PersonRow {
  rank: number
  initials: string
  name: string
  subtitle: string
  score: number
  userId: string
  level: number
  avatarUrl: string | null
  isPlaceholder?: boolean
  weeklyGain?: number
}

interface GroupRow {
  rank: number
  groupId: string
  name: string
  category: string
  memberCount: number
  avgScore: number
  isPlaceholder?: boolean
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function initials(name: string) {
  return name.split(' ').map(n => n[0] ?? '').filter(Boolean).join('').slice(0, 2).toUpperCase() || '?'
}

function shortName(name: string) {
  const parts = name.split(' ')
  return parts.length >= 2 ? `${parts[0]} ${parts[1][0]}.` : parts[0]
}

function ordinal(n: number) {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0])
}

function daysLeft(endDate: string) {
  return Math.max(0, Math.ceil((new Date(endDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
}

const RANK_COLORS: Record<number, string> = { 1: '#F5A623', 2: '#B0B8C4', 3: '#CD7F32' }

interface ThemeColors {
  bg: string; surface: string; surfaceHigh: string; border: string; borderSub: string
  text: string; textSub: string; textMuted: string; textFaint: string
  accent: string; accentBg: string; accentBorder: string; inputBg: string; isDark: boolean
}

function AvatarCircle({ avatarUrl, ini, highlight, c, size = 32 }: { avatarUrl: string | null; ini: string; highlight: boolean; c: ThemeColors; size?: number }) {
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: c.border, border: highlight ? `1px solid ${c.accent}` : 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', color: c.accent, fontSize: Math.max(9, Math.round(size * 0.34)), fontWeight: 700, flexShrink: 0, overflow: 'hidden' }}>
      {avatarUrl
        ? <img src={avatarUrl} alt={ini} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        : ini}
    </div>
  )
}

function placeholderPerson(rank: number): PersonRow {
  return { rank, initials: 'BT', name: 'Beta Tester', subtitle: 'Penn', score: 0, userId: `__placeholder_${rank}`, level: 1, avatarUrl: null, isPlaceholder: true }
}

function placeholderGroup(rank: number): GroupRow {
  return { rank, groupId: `__placeholder_${rank}`, name: 'Beta Test Group', category: 'Fitness', memberCount: 0, avgScore: 0, isPlaceholder: true }
}

function topThreePeople(rows: PersonRow[]): PersonRow[] {
  const result = rows.slice(0, 3)
  while (result.length < 3) result.push(placeholderPerson(result.length + 1))
  return result
}

function topThreeGroups(rows: GroupRow[]): GroupRow[] {
  const result = rows.slice(0, 3)
  while (result.length < 3) result.push(placeholderGroup(result.length + 1))
  return result
}

const LB_SNAP_KEY = 'ascend_lb_snap'
function getStoredRanks(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem(LB_SNAP_KEY) ?? '{}') as Record<string, number> } catch { return {} }
}
function storeLeaderboardSnapshot(rows: PersonRow[]) {
  try {
    const snap: Record<string, number> = {}
    for (const r of rows) snap[r.userId] = r.rank
    localStorage.setItem(LB_SNAP_KEY, JSON.stringify(snap))
  } catch { /* ignore */ }
}

// ── Builtin always-available challenges ──────────────────────────────────────

type BuiltinChallengeKind = 'most_workouts' | 'most_volume' | 'most_prs' | 'longest_streak'

interface BuiltinChallengeMeta {
  id: string       // stable UUID matching migrations_v7 seed
  title: string
  icon: string
  kind: BuiltinChallengeKind
  autoEnroll: boolean
  valueLabel: (value: number) => string
}

const BUILTIN_CHALLENGES: BuiltinChallengeMeta[] = [
  {
    id: '11111111-1111-1111-1111-111111111111',
    title: 'Monthly Grind',
    icon: '🔥',
    kind: 'most_workouts',
    autoEnroll: true,
    valueLabel: v => `${v} workout${v === 1 ? '' : 's'}`,
  },
  {
    id: '22222222-2222-2222-2222-222222222222',
    title: 'Volume Leader',
    icon: '💪',
    kind: 'most_volume',
    autoEnroll: true,
    valueLabel: v => `${v.toLocaleString()} lb`,
  },
  {
    id: '33333333-3333-3333-3333-333333333333',
    title: 'PR Hunter',
    icon: '🏆',
    kind: 'most_prs',
    autoEnroll: false,
    valueLabel: v => `${v} PR${v === 1 ? '' : 's'}`,
  },
  {
    id: '44444444-4444-4444-4444-444444444444',
    title: 'Streak Master',
    icon: '⚡',
    kind: 'longest_streak',
    autoEnroll: false,
    valueLabel: v => `${v} day${v === 1 ? '' : 's'}`,
  },
]

interface ChallengeLeaderEntry {
  userId: string
  name: string
  initials: string
  avatarUrl: string | null
  level: number
  value: number
}

interface BuiltinChallengeData {
  meta: BuiltinChallengeMeta
  joined: boolean
  totalParticipants: number
  userRank: number              // 0 if user has no value / not joined
  userValue: number
  leaderboard: ChallengeLeaderEntry[]
}

function SectionHeader({ title, onAction, actionLabel = 'See all →', c }: { title: string; onAction?: () => void; actionLabel?: string; c: ThemeColors }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
      <span style={{ color: c.text, fontSize: 13, fontWeight: 700 }}>{title}</span>
      {onAction && (
        <button
          onClick={onAction}
          style={{ background: 'none', border: 'none', color: c.accent, fontSize: 12, cursor: 'pointer', padding: 0 }}
        >
          {actionLabel}
        </button>
      )}
    </div>
  )
}

function LockedCard({ hint, c }: { hint: string; c: ThemeColors }) {
  return (
    <div style={{
      background: c.surface,
      border: `1px solid ${c.accentBorder}`,
      borderRadius: 14,
      padding: '28px 20px',
      marginBottom: 20,
      textAlign: 'center',
      position: 'relative',
      overflow: 'hidden',
    }}>
      <div style={{ position: 'absolute', top: -24, left: '50%', transform: 'translateX(-50%)', width: 80, height: 80, borderRadius: '50%', background: c.accentBg, filter: 'blur(18px)', pointerEvents: 'none' }} />
      <div style={{ width: 42, height: 42, borderRadius: '50%', background: c.surfaceHigh, border: `1px solid ${c.accentBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px', fontSize: 18, position: 'relative' }}>
        🔒
      </div>
      <p style={{ color: c.text, fontSize: 13, fontWeight: 700, margin: '0 0 5px', position: 'relative' }}>
        Unlocks after 3 workouts
      </p>
      <p style={{ color: c.textSub, fontSize: 12, margin: 0, lineHeight: 1.5, position: 'relative' }}>
        {hint}
      </p>
    </div>
  )
}

// ── Active Challenges UI ──────────────────────────────────────────────────────

function ChallengeGridCard({
  data, joiningId, onJoin, onOpen, c,
}: {
  data: BuiltinChallengeData
  joiningId: string | null
  onJoin: (id: string) => void
  onOpen: () => void
  c: ThemeColors
}) {
  const { meta, joined, totalParticipants, userRank } = data
  return (
    <div
      onClick={onOpen}
      style={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 14, padding: '14px 10px', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 6, minWidth: 0 }}
    >
      <div style={{ width: 36, height: 36, borderRadius: '50%', background: c.accentBg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>
        {meta.icon}
      </div>
      <p style={{ color: c.text, fontSize: 12, fontWeight: 700, margin: 0, lineHeight: 1.2 }}>{meta.title}</p>
      <p style={{ color: c.textSub, fontSize: 11, margin: 0 }}>
        {joined && userRank > 0 ? `#${userRank} of ${totalParticipants}` : `${totalParticipants} in`}
      </p>
      {joined ? (
        <span style={{ color: c.textSub, fontSize: 11, fontWeight: 600 }}>Joined</span>
      ) : (
        <button
          onClick={e => { e.stopPropagation(); onJoin(meta.id) }}
          disabled={joiningId === meta.id}
          style={{ background: 'none', border: 'none', padding: 0, color: c.accent, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
        >
          {joiningId === meta.id ? 'Joining…' : 'Join'}
        </button>
      )}
    </div>
  )
}

// ── Campus accomplishments (placeholder data) ─────────────────────────────────

type Accomplishment = { icon: string; text: string; label: string }

const CAMPUS_ACCOMPLISHMENTS: Accomplishment[] = [
  { icon: '🏆', text: 'Castle climbed to #1', label: 'Group Rankings' },
  { icon: '💪', text: 'PRs logged today', label: 'New Records' },
  { icon: '🔥', text: '14 people kept their streak', label: 'Streaks' },
  { icon: '🎯', text: 'Quakers won the squat challenge', label: 'Challenges' },
]

function AccomplishmentBox({ item, c, compact = false }: { item: Accomplishment; c: ThemeColors; compact?: boolean }) {
  return (
    <div style={{
      background: c.surface,
      border: `1px solid ${c.border}`,
      borderRadius: compact ? 12 : 14,
      padding: compact ? 10 : 14,
      height: '100%',
      boxSizing: 'border-box',
      display: 'flex',
      flexDirection: 'column',
    }}>
      <div style={{ fontSize: compact ? 16 : 22, marginBottom: compact ? 5 : 8, lineHeight: 1 }}>{item.icon}</div>
      <p style={{ color: c.text, fontSize: compact ? 11 : 14, fontWeight: 700, margin: '0 0 3px', lineHeight: 1.3 }}>{item.text}</p>
      <p style={{ color: c.textSub, fontSize: compact ? 9 : 11, margin: 0, marginTop: 'auto', paddingTop: 3 }}>{item.label}</p>
    </div>
  )
}

// Stylized map-app-looking fill (land, water, parks, roads, city blocks)
function MapPlaceholder({ c }: { c: ThemeColors }) {
  const m = c.isDark
    ? { land: '#242f3e', water: '#17263c', park: '#2c3b34', road: '#3c4a5a', roadMajor: '#5d6b7a', block: '#2f3a4a' }
    : { land: '#e8eaed', water: '#aadaff', park: '#cfe8c2', road: '#ffffff', roadMajor: '#ffffff', block: '#dadce0' }
  return (
    <div style={{ position: 'absolute', inset: 0, background: m.land }}>
      {/* water — bottom-left */}
      <div style={{ position: 'absolute', left: -34, bottom: -34, width: 120, height: 96, background: m.water, borderRadius: '42% 58% 50% 50%', transform: 'rotate(-12deg)' }} />
      {/* parks */}
      <div style={{ position: 'absolute', right: 14, top: 12, width: 66, height: 42, background: m.park, borderRadius: 8 }} />
      <div style={{ position: 'absolute', left: 20, top: -12, width: 42, height: 40, background: m.park, borderRadius: 7 }} />
      <div style={{ position: 'absolute', right: 96, bottom: 8, width: 38, height: 30, background: m.park, borderRadius: 6 }} />
      {/* city blocks */}
      <div style={{ position: 'absolute', left: 108, top: 14, width: 30, height: 22, background: m.block, borderRadius: 3 }} />
      <div style={{ position: 'absolute', left: 146, top: 12, width: 22, height: 26, background: m.block, borderRadius: 3 }} />
      <div style={{ position: 'absolute', left: 110, top: 64, width: 26, height: 24, background: m.block, borderRadius: 3 }} />
      <div style={{ position: 'absolute', left: 144, top: 66, width: 30, height: 20, background: m.block, borderRadius: 3 }} />
      <div style={{ position: 'absolute', right: 22, bottom: 14, width: 28, height: 22, background: m.block, borderRadius: 3 }} />
      {/* roads */}
      <div style={{ position: 'absolute', left: -12, right: -12, top: 44, height: 7, background: m.roadMajor, transform: 'rotate(-5deg)' }} />
      <div style={{ position: 'absolute', left: -12, right: -12, top: 96, height: 4, background: m.road, transform: 'rotate(-3deg)' }} />
      <div style={{ position: 'absolute', left: -12, right: -12, top: 18, height: 3, background: m.road, transform: 'rotate(6deg)' }} />
      <div style={{ position: 'absolute', top: -12, bottom: -12, left: 86, width: 5, background: m.road, transform: 'rotate(7deg)' }} />
      <div style={{ position: 'absolute', top: -12, bottom: -12, left: 140, width: 4, background: m.road, transform: 'rotate(-4deg)' }} />
      <div style={{ position: 'absolute', top: -12, bottom: -12, right: 70, width: 3, background: m.road, transform: 'rotate(10deg)' }} />
      <div style={{ position: 'absolute', left: -24, right: -24, bottom: 28, height: 4, background: m.road, transform: 'rotate(19deg)' }} />
      <div style={{ position: 'absolute', top: -24, bottom: -24, right: 38, width: 3, background: m.road, transform: 'rotate(-15deg)' }} />
    </div>
  )
}

// ── Challenge ranking computation ─────────────────────────────────────────────

async function computeChallengeRankings(
  challenge: Challenge,
  participantIds: string[],
  userId: string
): Promise<{ userRank: number; aboveName: string | null }> {
  if (participantIds.length === 0) return { userRank: 0, aboveName: null }

  const valueMap = new Map<string, number>()

  if (challenge.challenge_type === 'most_workouts') {
    const { data: workouts } = await supabase
      .from('workouts')
      .select('user_id')
      .in('user_id', participantIds)
      .eq('completed', true)
      .gte('workout_date', challenge.start_date)
      .lte('workout_date', challenge.end_date)
    for (const w of workouts ?? []) {
      valueMap.set(w.user_id as string, (valueMap.get(w.user_id as string) ?? 0) + 1)
    }
  } else if (challenge.challenge_type === 'most_volume') {
    const { data: rangeWorkouts } = await supabase
      .from('workouts')
      .select('id, user_id')
      .in('user_id', participantIds)
      .eq('completed', true)
      .gte('workout_date', challenge.start_date)
      .lte('workout_date', challenge.end_date)
    const workoutIds = (rangeWorkouts ?? []).map(w => w.id as string)
    const workoutUserMap = new Map((rangeWorkouts ?? []).map(w => [w.id as string, w.user_id as string]))
    if (workoutIds.length > 0) {
      const { data: logs } = await supabase
        .from('exercise_logs')
        .select('workout_id, weight, reps')
        .in('workout_id', workoutIds)
      for (const log of logs ?? []) {
        const uid = workoutUserMap.get(log.workout_id as string)
        if (!uid) continue
        valueMap.set(uid, (valueMap.get(uid) ?? 0) + ((log.weight as number) ?? 0) * ((log.reps as number) ?? 0))
      }
    }
  } else {
    // biggest_score_gain: use current score as best available approximation
    const { data: scoreRows } = await supabase
      .from('user_scores')
      .select('user_id, ascend_score')
      .in('user_id', participantIds)
    for (const s of scoreRows ?? []) {
      valueMap.set(s.user_id as string, s.ascend_score as number)
    }
  }

  const { data: profiles } = await supabase
    .from('users')
    .select('id, name')
    .in('id', participantIds)
  const profileMap = new Map((profiles ?? []).map(p => [p.id as string, p.name as string]))

  const rankings: RankEntry[] = participantIds
    .map(id => ({ user_id: id, name: profileMap.get(id) ?? 'Unknown', value: valueMap.get(id) ?? 0 }))
    .sort((a, b) => b.value - a.value)

  const userIdx = rankings.findIndex(r => r.user_id === userId)
  const userRank = userIdx >= 0 ? userIdx + 1 : participantIds.length + 1
  const aboveName = userIdx > 0 ? shortName(rankings[userIdx - 1].name) : null

  return { userRank, aboveName }
}

// ── Builtin challenge loader ──────────────────────────────────────────────────

function currentStreakDays(workoutDates: Set<string>): number {
  // workoutDates contains YYYY-MM-DD strings. Streak counts consecutive days
  // ending today (or yesterday if the user hasn't worked out yet today).
  const today = new Date()
  const ymd = (d: Date) => d.toISOString().slice(0, 10)
  const cursor = new Date(today)
  if (!workoutDates.has(ymd(cursor))) {
    cursor.setDate(cursor.getDate() - 1)
    if (!workoutDates.has(ymd(cursor))) return 0
  }
  let streak = 0
  while (workoutDates.has(ymd(cursor))) {
    streak++
    cursor.setDate(cursor.getDate() - 1)
  }
  return streak
}

async function loadBuiltinChallenges(currentUserId: string): Promise<BuiltinChallengeData[]> {
  const monthStart = new Date()
  monthStart.setDate(1)
  monthStart.setHours(0, 0, 0, 0)
  const monthStartIso = monthStart.toISOString()

  // 1. Every user with an account — auto-enroll universe
  const { data: allUserRows } = await supabase.from('users').select('id, name, avatar_url')
  const allUserIds = (allUserRows ?? []).map(u => u.id as string)

  // 2. Month workouts → values for auto-enroll challenges
  const { data: mWorkouts } = await supabase
    .from('workouts')
    .select('id, user_id, workout_date')
    .eq('completed', true)
    .gte('workout_date', monthStartIso)

  const workoutsByUser = new Map<string, number>()
  const workoutIdToUser = new Map<string, string>()
  for (const w of mWorkouts ?? []) {
    const uid = w.user_id as string
    workoutsByUser.set(uid, (workoutsByUser.get(uid) ?? 0) + 1)
    workoutIdToUser.set(w.id as string, uid)
  }
  // Default everyone to 0 so they all appear on the leaderboard
  for (const uid of allUserIds) {
    if (!workoutsByUser.has(uid)) workoutsByUser.set(uid, 0)
  }

  // 3. Volume per user from exercise_logs (default everyone to 0)
  const volumeByUser = new Map<string, number>()
  const wIds = [...workoutIdToUser.keys()]
  if (wIds.length > 0) {
    const { data: volLogs } = await supabase
      .from('exercise_logs').select('workout_id, weight, reps').in('workout_id', wIds)
    for (const l of volLogs ?? []) {
      const uid = workoutIdToUser.get(l.workout_id as string)
      if (!uid) continue
      volumeByUser.set(uid, (volumeByUser.get(uid) ?? 0) + ((l.weight as number) ?? 0) * ((l.reps as number) ?? 0))
    }
  }
  for (const uid of allUserIds) {
    if (!volumeByUser.has(uid)) volumeByUser.set(uid, 0)
  }

  // 4. Opt-in participants for PR Hunter + Streak Master
  const optInIds = BUILTIN_CHALLENGES.filter(b => !b.autoEnroll).map(b => b.id)
  const { data: optInParts } = await supabase
    .from('challenge_participants')
    .select('challenge_id, user_id')
    .in('challenge_id', optInIds)
  const partsByChallenge = new Map<string, string[]>()
  for (const p of optInParts ?? []) {
    const cid = p.challenge_id as string
    const uid = p.user_id as string
    const arr = partsByChallenge.get(cid) ?? []
    arr.push(uid)
    partsByChallenge.set(cid, arr)
  }

  // 5. PR Hunter: count personal_records logged this month for joined users
  const prHunterId = BUILTIN_CHALLENGES.find(b => b.kind === 'most_prs')!.id
  const prHunterParticipants = partsByChallenge.get(prHunterId) ?? []
  const prsByUser = new Map<string, number>()
  if (prHunterParticipants.length > 0) {
    const { data: prRows } = await supabase
      .from('personal_records')
      .select('user_id, logged_at')
      .in('user_id', prHunterParticipants)
      .gte('logged_at', monthStartIso)
    for (const r of prRows ?? []) {
      const uid = r.user_id as string
      prsByUser.set(uid, (prsByUser.get(uid) ?? 0) + 1)
    }
    for (const uid of prHunterParticipants) {
      if (!prsByUser.has(uid)) prsByUser.set(uid, 0)
    }
  }

  // 6. Streak Master: longest current streak from last 365 days of workouts
  const streakId = BUILTIN_CHALLENGES.find(b => b.kind === 'longest_streak')!.id
  const streakParticipants = partsByChallenge.get(streakId) ?? []
  const streakByUser = new Map<string, number>()
  if (streakParticipants.length > 0) {
    const yearAgo = new Date(Date.now() - 365 * 86400000).toISOString()
    const { data: streakWorkouts } = await supabase
      .from('workouts')
      .select('user_id, workout_date')
      .eq('completed', true)
      .in('user_id', streakParticipants)
      .gte('workout_date', yearAgo)
    const datesByUser = new Map<string, Set<string>>()
    for (const w of streakWorkouts ?? []) {
      const uid = w.user_id as string
      const d = new Date(w.workout_date as string).toISOString().slice(0, 10)
      const set = datesByUser.get(uid) ?? new Set<string>()
      set.add(d)
      datesByUser.set(uid, set)
    }
    for (const uid of streakParticipants) {
      streakByUser.set(uid, currentStreakDays(datesByUser.get(uid) ?? new Set()))
    }
  }

  // 7. Profile + score lookup for every user that may appear on a leaderboard
  const profileMap = new Map(
    (allUserRows ?? []).map(p => [p.id as string, { name: p.name as string, avatarUrl: (p as { avatar_url?: string | null }).avatar_url ?? null }])
  )
  const { data: scoreRows } = allUserIds.length > 0
    ? await supabase.from('user_scores').select('user_id, ascend_score').in('user_id', allUserIds)
    : { data: [] }
  const scoreMap = new Map((scoreRows ?? []).map(s => [s.user_id as string, s.ascend_score as number]))
  const levelOf = (uid: string) => {
    const score = scoreMap.get(uid) ?? 0
    return Math.max(1, Math.floor(score / 100) + 1)
  }

  const buildLeaderboard = (valueByUser: Map<string, number>): ChallengeLeaderEntry[] => {
    const entries: ChallengeLeaderEntry[] = []
    for (const [uid, value] of valueByUser.entries()) {
      const prof = profileMap.get(uid)
      if (!prof) continue
      entries.push({
        userId: uid,
        name: prof.name,
        initials: initials(prof.name),
        avatarUrl: prof.avatarUrl,
        level: levelOf(uid),
        value,
      })
    }
    entries.sort((a, b) => b.value - a.value)
    return entries
  }

  const result: BuiltinChallengeData[] = []
  for (const meta of BUILTIN_CHALLENGES) {
    let valueByUser: Map<string, number>
    let joined: boolean
    if (meta.kind === 'most_workouts') {
      valueByUser = workoutsByUser
      joined = true
    } else if (meta.kind === 'most_volume') {
      valueByUser = new Map([...volumeByUser.entries()].map(([k, v]) => [k, Math.round(v)]))
      joined = true
    } else if (meta.kind === 'most_prs') {
      valueByUser = prsByUser
      joined = (partsByChallenge.get(meta.id) ?? []).includes(currentUserId)
    } else {
      valueByUser = streakByUser
      joined = (partsByChallenge.get(meta.id) ?? []).includes(currentUserId)
    }
    const leaderboard = buildLeaderboard(valueByUser)
    const userIdx = leaderboard.findIndex(e => e.userId === currentUserId)
    result.push({
      meta,
      joined,
      totalParticipants: leaderboard.length,
      userRank: userIdx >= 0 ? userIdx + 1 : 0,
      userValue: valueByUser.get(currentUserId) ?? 0,
      leaderboard,
    })
  }
  return result
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function Compete() {
  const navigate = useNavigate()
  const { colors: c, toggleTheme } = useTheme()

  const [userId, setUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const [computedChallenges, setComputedChallenges] = useState<ComputedChallenge[]>([])
  const [challengeLoading, setChallengeLoading] = useState(true)
  const [joiningId, setJoiningId] = useState<string | null>(null)

  const [userWorkoutsCompleted, setUserWorkoutsCompleted] = useState(0)
  const [friendsLeaderboard, setFriendsLeaderboard] = useState<PersonRow[]>([])
  const [hasFriends, setHasFriends] = useState(false)
  const [groupsLeaderboard, setGroupsLeaderboard] = useState<GroupRow[]>([])
  const [myGroupIds, setMyGroupIds] = useState<Set<string>>(new Set())
  const [campusLeaderboard, setCampusLeaderboard] = useState<PersonRow[]>([])
  const [weeklyTopPerformers, setWeeklyTopPerformers] = useState<PersonRow[]>([])
  const [pinnedRow, setPinnedRow] = useState<PersonRow | null>(null)
  const [builtinChallenges, setBuiltinChallenges] = useState<BuiltinChallengeData[]>([])
  const [joiningBuiltinId, setJoiningBuiltinId] = useState<string | null>(null)
  const [showAllChallenges, setShowAllChallenges] = useState(false)
  const [openChallengeId, setOpenChallengeId] = useState<string | null>(null)
  const [rankChanges, setRankChanges] = useState<Record<string, number>>({})
  const [showFullModal, setShowFullModal] = useState<'friends' | 'campus' | 'groups' | null>(null)
  const [showAccomplishments, setShowAccomplishments] = useState(false)

  const [notifications,     setNotifications]     = useState<AppNotification[]>(() => loadNotifs())
  const [showNotifDropdown, setShowNotifDropdown] = useState(false)
  const [notifPos,          setNotifPos]          = useState({ top: 0, right: 0 })
  const notifBtnRef   = useRef<HTMLButtonElement>(null)
  const gymUsersBtnRef = useRef<HTMLButtonElement>(null)
  const [todayWorkoutCount,  setTodayWorkoutCount]  = useState(0)
  const [liveAtGym,          setLiveAtGym]          = useState<GymUser[]>([])
  const [trainedTodayUsers,  setTrainedTodayUsers]  = useState<GymUser[]>([])
  const [showGymUsers,      setShowGymUsers]      = useState(false)
  const [gymUsersPos,       setGymUsersPos]       = useState({ top: 0, right: 0 })

  // ── Main data load ──────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { navigate('/auth'); return }
      setUserId(user.id)

      const [profileRes, scoresRes] = await Promise.all([
        supabase.from('users').select('*').eq('id', user.id).maybeSingle(),
        supabase.from('user_scores').select('*').eq('user_id', user.id).maybeSingle(),
      ])

      const userScore = scoresRes.data?.ascend_score ?? 0

      // Today's community workout count
      const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
      const { count: todayCount } = await supabase
        .from('workouts').select('id', { count: 'exact', head: true })
        .eq('completed', true).gte('workout_date', todayStart.toISOString())
      setTodayWorkoutCount(todayCount ?? 0)

      // Live gym users (for pulsing dot count)
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
      const { data: gymData } = await supabase.from('users').select('id, name')
        .gte('gym_checkin_at', twoHoursAgo).neq('id', user.id).limit(20)
      setLiveAtGym((gymData ?? []).map(u => ({ id: u.id as string, name: u.name as string })))

      // Users who trained today (for avatar cluster)
      const { data: todayWkRows } = await supabase
        .from('workouts').select('user_id').eq('completed', true)
        .gte('workout_date', todayStart.toISOString()).neq('user_id', user.id)
      const todayUids = [...new Set((todayWkRows ?? []).map(w => w.user_id as string))]
      if (todayUids.length > 0) {
        const { data: todayProfiles } = await supabase.from('users').select('id, name').in('id', todayUids).limit(20)
        setTrainedTodayUsers((todayProfiles ?? []).map(p => ({ id: p.id as string, name: p.name as string })))
      }

      // Leaderboard eligibility gate — require 3 completed workouts
      const { count: wCount } = await supabase
        .from('workouts')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('completed', true)
      setUserWorkoutsCompleted(wCount ?? 0)

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
        const allIds = [user.id, ...friendIds]
        const [friendScores, friendProfiles] = await Promise.all([
          supabase.from('user_scores').select('user_id, ascend_score, level').in('user_id', allIds),
          supabase.from('users').select('id, name, affiliation, avatar_url').in('id', allIds),
        ])
        if (friendProfiles.data) {
          const scoreMap = new Map(
            (friendScores.data ?? []).map(s => [s.user_id as string, s as { ascend_score?: number; level?: number }])
          )
          const rows: PersonRow[] = friendProfiles.data
            .map(p => {
              const s = scoreMap.get(p.id as string)
              return {
                rank: 0,
                initials: initials((p as { name?: string })?.name ?? '??'),
                name: (p as { name?: string })?.name ?? 'Unknown',
                subtitle: (p as { affiliation?: string })?.affiliation ?? 'Penn',
                score: s?.ascend_score ?? 0,
                userId: p.id as string,
                level: s?.level ?? 1,
                avatarUrl: (p as { avatar_url?: string | null })?.avatar_url ?? null,
              }
            })
            .sort((a, b) => b.score - a.score)
            .map((r, i) => ({ ...r, rank: i + 1 }))
          setFriendsLeaderboard(rows)
        }
      }

      // Campus leaderboard (top 10 + pin user if outside) — exclude zero-score rows
      const { data: allScores } = await supabase
        .from('user_scores')
        .select('user_id, ascend_score, level')
        .gt('ascend_score', 0)
        .order('ascend_score', { ascending: false })
        .limit(15)

      if (allScores && allScores.length > 0) {
        const allIds = allScores.map(s => s.user_id as string)
        const { data: allProfiles } = await supabase
          .from('users')
          .select('id, name, affiliation, avatar_url')
          .in('id', allIds)
        if (allProfiles) {
          const profileMap = new Map(allProfiles.map(p => [p.id, p]))
          const rows: PersonRow[] = allScores.map((s, i) => {
            const p = profileMap.get(s.user_id as string)
            return {
              rank: i + 1,
              initials: initials((p as { name?: string })?.name ?? '??'),
              name: (p as { name?: string })?.name ?? 'Unknown',
              subtitle: (p as { affiliation?: string })?.affiliation ?? 'Penn',
              score: s.ascend_score as number,
              userId: s.user_id as string,
              level: (s.level as number) ?? 1,
              avatarUrl: (p as { avatar_url?: string | null })?.avatar_url ?? null,
            }
          })
          setCampusLeaderboard(rows)
          // Rank movement since last visit
          const prevRanks = getStoredRanks()
          storeLeaderboardSnapshot(rows)
          const changes: Record<string, number> = {}
          for (const r of rows) {
            const prev = prevRanks[r.userId]
            if (prev !== undefined && prev !== r.rank) changes[r.userId] = prev - r.rank
          }
          setRankChanges(changes)
          const inTop10 = rows.some(r => r.userId === user.id)
          if (!inTop10) {
            const inRows = rows.find(r => r.userId === user.id)
            // Current user's campus rank for the pinned row when outside the top 15
            const { count: higherCount } = await supabase
              .from('user_scores')
              .select('user_id', { count: 'exact', head: true })
              .gt('ascend_score', userScore)
            const myRank = (higherCount ?? 0) + 1
            setPinnedRow(inRows ?? {
              rank: myRank,
              initials: initials(profileRes.data?.name ?? '??'),
              name: profileRes.data?.name ?? 'Unknown',
              subtitle: profileRes.data?.affiliation ?? 'Penn',
              score: userScore,
              userId: user.id,
              level: scoresRes.data?.level ?? 1,
              avatarUrl: profileRes.data?.avatar_url ?? null,
            })
          }
        }
      }

      // Top performers this week — ranked by ascend score gained in the last 7 days
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
      const { data: weekWorkouts, error: weekWorkoutsErr } = await supabase
        .from('workouts')
        .select('user_id, score_change, workout_date')
        .eq('completed', true)
        .gte('workout_date', weekAgo)
      console.log('[TopPerformers] weekWorkouts:', weekWorkouts, 'error:', weekWorkoutsErr)
      const weekGains = new Map<string, number>()
      for (const w of weekWorkouts ?? []) {
        const uid = w.user_id as string
        weekGains.set(uid, (weekGains.get(uid) ?? 0) + ((w.score_change as number) ?? 0))
      }
      const topWeek = [...weekGains.entries()]
        .filter(([, gain]) => gain > 0)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
      console.log('[TopPerformers] per-user gains:', [...weekGains.entries()], '→ topWeek:', topWeek)
      if (topWeek.length > 0) {
        const topWeekIds = topWeek.map(([uid]) => uid)
        const [weekProfiles, weekScores] = await Promise.all([
          supabase.from('users').select('id, name, affiliation, avatar_url').in('id', topWeekIds),
          supabase.from('user_scores').select('user_id, ascend_score, level').in('user_id', topWeekIds),
        ])
        const wpMap = new Map((weekProfiles.data ?? []).map(p => [p.id, p]))
        const wsMap = new Map((weekScores.data ?? []).map(s => [s.user_id, s]))
        const weekRows: PersonRow[] = topWeek.map(([uid, gain], i) => {
          const p = wpMap.get(uid) as { name?: string; affiliation?: string; avatar_url?: string | null } | undefined
          const s = wsMap.get(uid) as { ascend_score?: number; level?: number } | undefined
          return {
            rank: i + 1,
            initials: initials(p?.name ?? '??'),
            name: p?.name ?? 'Unknown',
            subtitle: p?.affiliation ?? 'Penn',
            score: s?.ascend_score ?? 0,
            userId: uid,
            level: s?.level ?? 1,
            avatarUrl: p?.avatar_url ?? null,
            weeklyGain: gain,
          }
        })
        setWeeklyTopPerformers(weekRows)
      }

      // Groups leaderboard
      try {
        const [myMembershipsRes, allMembershipsRes] = await Promise.all([
          supabase.from('group_members').select('group_id').eq('user_id', user.id).eq('status', 'approved'),
          supabase.from('group_members').select('group_id, user_id').eq('status', 'approved'),
        ])
        setMyGroupIds(new Set((myMembershipsRes.data ?? []).map(m => m.group_id as string)))

        const allMemberships = allMembershipsRes.data ?? []
        if (allMemberships.length > 0) {
          const memberUserIds = [...new Set(allMemberships.map(m => m.user_id as string))]
          const groupIds = [...new Set(allMemberships.map(m => m.group_id as string))]
          const [memberScoresRes, groupsDataRes] = await Promise.all([
            supabase.from('user_scores').select('user_id, ascend_score').in('user_id', memberUserIds),
            supabase.from('groups').select('id, name, category, member_count').in('id', groupIds),
          ])
          const scoreMap = new Map((memberScoresRes.data ?? []).map(s => [s.user_id as string, s.ascend_score as number]))
          const groupMap = new Map((groupsDataRes.data ?? []).map(g => [g.id as string, g]))
          const groupScoreMap = new Map<string, number[]>()
          for (const m of allMemberships) {
            const arr = groupScoreMap.get(m.group_id as string) ?? []
            arr.push(scoreMap.get(m.user_id as string) ?? 0)
            groupScoreMap.set(m.group_id as string, arr)
          }
          const rows: GroupRow[] = []
          for (const [gid, gscores] of groupScoreMap.entries()) {
            const g = groupMap.get(gid)
            if (!g) continue
            const nonZero = gscores.filter(s => s > 0)
            const avg = nonZero.length > 0 ? Math.round(nonZero.reduce((a, b) => a + b, 0) / nonZero.length) : 0
            if (avg === 0) continue
            rows.push({
              rank: 0,
              groupId: gid,
              name: g.name as string,
              category: g.category as string,
              memberCount: g.member_count as number,
              avgScore: avg,
            })
          }
          rows.sort((a, b) => b.avgScore - a.avgScore)
          rows.forEach((r, i) => { r.rank = i + 1 })
          setGroupsLeaderboard(rows)
        }
      } catch { /* groups non-critical */ }

      // Builtin always-available challenges (Monthly Grind, Volume Leader, PR Hunter, Streak Master)
      try {
        const data = await loadBuiltinChallenges(user.id)
        setBuiltinChallenges(data)
      } catch (err) { console.error('[Compete] builtin challenges error:', err) }

    } catch (err) {
      console.error('[Compete] loadData error:', err)
    } finally {
      setLoading(false)
    }
  }, [navigate])

  // ── Challenge load ──────────────────────────────────────────────────────────

  const loadChallenges = useCallback(async (uid: string) => {
    setChallengeLoading(true)
    try {
      const now = new Date().toISOString()
      const builtinIds = new Set(BUILTIN_CHALLENGES.map(b => b.id))
      const { data: allChallenges } = await supabase
        .from('challenges')
        .select('id, title, description, challenge_type, start_date, end_date')
        .gte('end_date', now)
        .order('start_date', { ascending: true })

      const challenges = (allChallenges ?? []).filter(c => !builtinIds.has(c.id as string))
      if (challenges.length === 0) {
        setComputedChallenges([])
        return
      }

      const { data: myParticipations } = await supabase
        .from('challenge_participants')
        .select('challenge_id')
        .eq('user_id', uid)
      const joinedIds = new Set((myParticipations ?? []).map(p => p.challenge_id as string))

      const computed: ComputedChallenge[] = []

      for (const ch of challenges as Challenge[]) {
        const { data: participants } = await supabase
          .from('challenge_participants')
          .select('user_id')
          .eq('challenge_id', ch.id)
        const participantIds = (participants ?? []).map(p => p.user_id as string)
        const joined = joinedIds.has(ch.id)

        if (!joined || participantIds.length === 0) {
          computed.push({
            challenge: ch,
            joined,
            userRank: 0,
            totalParticipants: participantIds.length,
            daysRemaining: daysLeft(ch.end_date),
            aboveName: null,
          })
          continue
        }

        const { userRank, aboveName } = await computeChallengeRankings(ch, participantIds, uid)
        computed.push({
          challenge: ch,
          joined,
          userRank,
          totalParticipants: participantIds.length,
          daysRemaining: daysLeft(ch.end_date),
          aboveName,
        })
      }

      setComputedChallenges(computed)
    } catch {
      // challenges tables may not exist before migration
      setComputedChallenges([])
    } finally {
      setChallengeLoading(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])
  useEffect(() => { if (userId) loadChallenges(userId) }, [userId, loadChallenges])

  // ── Join challenge ──────────────────────────────────────────────────────────

  async function handleJoin(challengeId: string) {
    if (!userId || joiningId) return
    setJoiningId(challengeId)
    try {
      const { error } = await supabase.from('challenge_participants').insert({
        challenge_id: challengeId,
        user_id: userId,
      })
      if (!error) {
        await loadChallenges(userId)
        // +10 social points for joining a challenge
        const { data: sr } = await supabase.from('user_scores').select('social_score').eq('user_id', userId).maybeSingle()
        await supabase.from('user_scores').update({ social_score: Math.min((sr?.social_score ?? 0) + 10, 100) }).eq('user_id', userId)
      }
    } finally {
      setJoiningId(null)
    }
  }

  async function handleJoinBuiltin(challengeId: string) {
    if (!userId || joiningBuiltinId) return
    setJoiningBuiltinId(challengeId)
    try {
      await supabase.from('challenge_participants').insert({
        challenge_id: challengeId,
        user_id: userId,
      })
      const fresh = await loadBuiltinChallenges(userId)
      setBuiltinChallenges(fresh)
    } catch (err) {
      console.error('[Compete] join builtin error:', err)
    } finally {
      setJoiningBuiltinId(null)
    }
  }

  async function handleLeaveBuiltin(challengeId: string) {
    if (!userId || joiningBuiltinId) return
    setJoiningBuiltinId(challengeId)
    try {
      await supabase.from('challenge_participants')
        .delete()
        .eq('challenge_id', challengeId)
        .eq('user_id', userId)
      const fresh = await loadBuiltinChallenges(userId)
      setBuiltinChallenges(fresh)
    } catch (err) {
      console.error('[Compete] leave builtin error:', err)
    } finally {
      setJoiningBuiltinId(null)
    }
  }

  // ── Notification handler ────────────────────────────────────────────────────

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

  // ── Loading state ───────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="app-shell">
        <div className="app-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: c.bg }}>
          <div style={{ color: c.textSub, fontSize: 14 }}>Loading…</div>
        </div>
      </div>
    )
  }

  const joinedChallenges = computedChallenges.filter(c => c.joined)
  const availableChallenges = computedChallenges.filter(c => !c.joined)

  const realGymCount = liveAtGym.length
  const displayedGymUsers = realGymCount >= 20
    ? liveAtGym
    : [...liveAtGym, ...DEMO_GYM_USERS.slice(0, Math.max(0, 16 - realGymCount))]
  const gymDisplayCount = displayedGymUsers.length

  const displayedTrainedUsers = trainedTodayUsers
  const hasUnread = notifications.some(n => !n.read)

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="app-shell">
      <div
        className="app-content page-scroll"
        style={{ background: c.bg }}
        onClick={() => { if (showGymUsers) setShowGymUsers(false); if (showNotifDropdown) setShowNotifDropdown(false) }}
      >
        <div style={{ padding: '52px 20px 0' }}>

          {/* Header */}
          <div style={{ height: 44, display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
            <h1 style={{ color: c.text, fontSize: 24, fontWeight: 700, margin: 0 }}>Campus</h1>
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
                  <span style={{ position: 'absolute', bottom: 0, right: 0, width: 7, height: 7, borderRadius: '50%', background: '#2B7FE0', border: `1.5px solid ${c.bg}` }} />
                )}
              </button>
            </div>
          </div>

          {/* University selector — same style as gym button on Home */}
          <button
            style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, padding: 0, marginBottom: 14 }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill={c.accent}>
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
            </svg>
            <span style={{ color: c.text, fontSize: 14, fontWeight: 600 }}>University of Pennsylvania</span>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
              <path d="M6 9l6 6 6-6" stroke={c.textSub} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          {/* Penn Fitness Activity */}
          <div style={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 14, padding: '12px 16px', marginBottom: 20 }}>
            <p style={{ color: c.textSub, fontSize: 9, letterSpacing: '1.5px', textTransform: 'uppercase', margin: '0 0 5px' }}>
              Penn Fitness Activity
            </p>

            {/* Workouts + avatar cluster on same row */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <p style={{ color: c.text, fontSize: 14, fontWeight: 700, margin: 0 }}>
                <span style={{ color: c.accent }}>{todayWorkoutCount}</span>{' '}
                {todayWorkoutCount === 1 ? 'workout' : 'workouts'} logged today
              </p>
              <div style={{ display: 'flex', flexDirection: 'row-reverse', alignItems: 'center' }}>
                {displayedTrainedUsers.length > 4 && (
                  <button
                    ref={gymUsersBtnRef}
                    onClick={e => {
                      e.stopPropagation()
                      const rect = gymUsersBtnRef.current?.getBoundingClientRect()
                      if (rect) setGymUsersPos({ top: rect.bottom + 6, right: window.innerWidth - rect.right })
                      setShowGymUsers(v => !v)
                    }}
                    style={{ width: 24, height: 24, borderRadius: '50%', background: c.accent, border: `2px solid ${c.bg}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 8, fontWeight: 700, flexShrink: 0, cursor: 'pointer' }}
                  >
                    +{displayedTrainedUsers.length - 4}
                  </button>
                )}
                {[...displayedTrainedUsers.slice(0, 4)].reverse().map((u, i) => (
                  <div key={u.id} style={{ width: 24, height: 24, borderRadius: '50%', background: c.border, border: `2px solid ${c.bg}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: c.accent, fontSize: 9, fontWeight: 700, marginLeft: (i > 0 || displayedTrainedUsers.length > 4) ? -6 : 0, flexShrink: 0 }}>
                    {initials(u.name)}
                  </div>
                ))}
              </div>
            </div>

            {/* People training */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span
                className="presence-dot"
                style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: '#3BF0A0', flexShrink: 0 }}
              />
              <span style={{ color: c.text, fontSize: 11, fontWeight: 600 }}>
                <span style={{ color: '#3BF0A0' }}>{gymDisplayCount}</span> people training now
              </span>
            </div>
          </div>

          {/* Trending on Campus header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ color: c.text, fontSize: 13, fontWeight: 700 }}>Trending on Campus</span>
            <button onClick={() => setShowAccomplishments(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: c.accent, fontSize: 12, padding: 0 }}>See all →</button>
          </div>

          {/* 3-workout gate banner */}
          {userWorkoutsCompleted < 3 && (
            <div style={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 14, padding: '14px 16px', marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <p style={{ color: c.text, fontSize: 13, fontWeight: 700, margin: 0 }}>Unlock the leaderboard</p>
                <span style={{ color: c.accent, fontSize: 13, fontWeight: 700 }}>{userWorkoutsCompleted}/3</span>
              </div>
              <div style={{ background: c.border, borderRadius: 4, height: 4, overflow: 'hidden', marginBottom: 8 }}>
                <div style={{ background: c.accent, height: '100%', width: `${(userWorkoutsCompleted / 3) * 100}%`, borderRadius: 4, transition: 'width 0.4s ease' }} />
              </div>
              <p style={{ color: c.textSub, fontSize: 11, margin: 0 }}>
                Complete {3 - userWorkoutsCompleted} more workout{3 - userWorkoutsCompleted !== 1 ? 's' : ''} to appear on the leaderboard and join challenges.
              </p>
            </div>
          )}

          {/* Accomplishment boxes */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 20, alignItems: 'stretch' }}>
            {CAMPUS_ACCOMPLISHMENTS.slice(0, 3).map((item, i) => (
              <div key={i} style={{ flex: 1, minWidth: 0 }}>
                <AccomplishmentBox item={item} c={c} compact />
              </div>
            ))}
          </div>

          {/* Gyms Live Now */}
          <SectionHeader title="Gyms Live Now" c={c} />

          {userWorkoutsCompleted < 3 ? (
            <LockedCard hint="Monthly competitions with real prizes on the line" c={c} />
          ) : challengeLoading ? (
            <div style={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 14, padding: 24, textAlign: 'center', marginBottom: 20 }}>
              <p style={{ color: c.textSub, fontSize: 13, margin: 0 }}>Loading challenges…</p>
            </div>
          ) : computedChallenges.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
              {/* Top — map-style placeholder */}
              <div style={{
                position: 'relative',
                overflow: 'hidden',
                border: `1px solid ${c.accentBorder}`,
                borderRadius: 14,
                height: 93,
              }}>
                <MapPlaceholder c={c} />
                {/* Gym cards floating on the map */}
                <div style={{ position: 'relative', height: '100%', display: 'flex', gap: 6, padding: 8, boxSizing: 'border-box' }}>
                  {[
                    { name: 'Pottruck Fitness Center', active: 8 },
                    { name: 'Fox Fitness Center', active: 5 },
                    { name: 'Private Gyms', active: 3 },
                  ].map(g => (
                    <div key={g.name} style={{ flex: 1, background: c.surface, border: `1px solid ${c.border}`, borderRadius: 8, padding: '6px 8px', display: 'flex', flexDirection: 'column', justifyContent: 'center', boxShadow: '0 1px 5px rgba(0,0,0,0.18)' }}>
                      <p style={{ color: c.text, fontSize: 11, fontWeight: 700, margin: 0, lineHeight: 1.25, height: 28, overflow: 'hidden' }}>{g.name}</p>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 3 }}>
                        <span style={{ color: c.textSub, fontSize: 10, fontWeight: 600 }}>{g.active} active</span>
                        <span
                          className="presence-dot"
                          style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: '#3BF0A0', flexShrink: 0 }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>

              {/* Joined challenges */}
              {joinedChallenges.map(cc => (
                <div key={cc.challenge.id} style={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 14, padding: '14px 16px' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
                    <div style={{ flex: 1, marginRight: 10 }}>
                      <p style={{ color: c.text, fontSize: 14, fontWeight: 700, margin: '0 0 3px' }}>{cc.challenge.title}</p>
                      {cc.challenge.description && (
                        <p style={{ color: c.textSub, fontSize: 12, margin: 0 }}>{cc.challenge.description}</p>
                      )}
                    </div>
                    <span style={{ background: c.accentBg, color: c.accent, fontSize: 11, borderRadius: 6, padding: '3px 8px', flexShrink: 0 }}>
                      {cc.daysRemaining}d left
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ color: c.accent, fontSize: 20, fontWeight: 700 }}>#{cc.userRank}</span>
                    <span style={{ color: c.textSub, fontSize: 11 }}>of {cc.totalParticipants}</span>
                  </div>
                  {cc.userRank === 1 ? (
                    <p style={{ color: c.textSub, fontSize: 12, margin: '6px 0 0' }}>You're leading! 🏆</p>
                  ) : cc.aboveName ? (
                    <p style={{ color: c.textSub, fontSize: 12, margin: '6px 0 0' }}>
                      You're {ordinal(cc.userRank)}. {cc.aboveName} is {ordinal(cc.userRank - 1)}.
                    </p>
                  ) : null}
                </div>
              ))}

              {/* Available challenges */}
              {availableChallenges.map(cc => (
                <div key={cc.challenge.id} style={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 14, padding: '14px 16px' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
                    <div style={{ flex: 1, marginRight: 10 }}>
                      <p style={{ color: c.text, fontSize: 14, fontWeight: 700, margin: '0 0 3px' }}>{cc.challenge.title}</p>
                      {cc.challenge.description && (
                        <p style={{ color: c.textSub, fontSize: 12, margin: 0 }}>{cc.challenge.description}</p>
                      )}
                    </div>
                    <span style={{ background: c.accentBg, color: c.accent, fontSize: 11, borderRadius: 6, padding: '3px 8px', flexShrink: 0 }}>
                      {cc.daysRemaining}d left
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ color: c.textSub, fontSize: 12 }}>
                      {cc.totalParticipants} participant{cc.totalParticipants !== 1 ? 's' : ''}
                    </span>
                    <button
                      onClick={() => handleJoin(cc.challenge.id)}
                      disabled={joiningId === cc.challenge.id || userWorkoutsCompleted < 3}
                      style={{ background: 'none', border: 'none', color: userWorkoutsCompleted < 3 ? c.textSub : c.accent, fontSize: 13, fontWeight: 600, cursor: userWorkoutsCompleted < 3 ? 'not-allowed' : 'pointer', padding: 0 }}
                      title={undefined}
                    >
                      {joiningId === cc.challenge.id ? 'Joining…' : userWorkoutsCompleted < 3 ? 'Locked 🔒' : 'Join →'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Top Performers This Week */}
          <SectionHeader
            title="Top Performers This Week"
            actionLabel="Full Leaderboard"
            onAction={() => setShowFullModal('campus')}
            c={c}
          />
          {weeklyTopPerformers.length === 0 ? (
            <div style={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 14, padding: 24, textAlign: 'center', marginBottom: 20 }}>
              <p style={{ color: c.textSub, fontSize: 13, margin: 0 }}>
                No score gains logged yet this week — finish a workout to get on the board.
              </p>
            </div>
          ) : (
            <div style={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 14, padding: '18px 12px', marginBottom: 20, display: 'flex', gap: 8 }}>
              {weeklyTopPerformers.map(row => {
                const isUser = row.userId === userId
                return (
                  <div
                    key={row.userId}
                    onClick={() => (!isUser ? navigate(`/profile/${row.userId}`) : undefined)}
                    style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: isUser ? 'default' : 'pointer' }}
                  >
                    {/* Profile picture with rank badge on the top-left */}
                    <div style={{ position: 'relative' }}>
                      <div style={{ width: 56, height: 56, borderRadius: '50%', background: c.border, border: isUser ? `2px solid ${c.accent}` : 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', color: c.accent, fontSize: 18, fontWeight: 700, overflow: 'hidden' }}>
                        {row.avatarUrl
                          ? <img src={row.avatarUrl} alt={row.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          : row.initials}
                      </div>
                      <div style={{ position: 'absolute', top: -3, left: -3, width: 20, height: 20, borderRadius: '50%', background: RANK_COLORS[row.rank] ?? c.textSub, color: '#fff', fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `2px solid ${c.surface}` }}>
                        {row.rank}
                      </div>
                    </div>
                    {/* Initials underneath */}
                    <p style={{ color: c.text, fontSize: 12, fontWeight: 700, margin: '8px 0 0' }}>{row.initials}</p>
                    {/* Ascend score underneath, in the user's theme color */}
                    <p style={{ color: c.accent, fontSize: 13, fontWeight: 700, margin: '2px 0 0' }}>{row.score}</p>
                    {/* Ascend score gained this week */}
                    <p style={{ color: '#3BF0A0', fontSize: 11, fontWeight: 600, margin: '2px 0 0' }}>
                      +{row.weeklyGain} this wk
                    </p>
                  </div>
                )
              })}
            </div>
          )}

          {/* Active Challenges — preview top 3 (side by side in one box) */}
          <SectionHeader title="Active Challenges" onAction={() => setShowAllChallenges(true)} c={c} />
          <div style={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 12, padding: '10px 6px', marginBottom: 20, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr' }}>
            {builtinChallenges.slice(0, 3).map((bc, i) => (
              <div
                key={bc.meta.id}
                onClick={() => setOpenChallengeId(bc.meta.id)}
                style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 4, padding: '2px 4px', borderLeft: i > 0 ? `1px solid ${c.border}` : 'none', minWidth: 0 }}
              >
                <div style={{ width: 26, height: 26, borderRadius: '50%', background: c.accentBg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>
                  {bc.meta.icon}
                </div>
                <p style={{ color: c.text, fontSize: 11, fontWeight: 700, margin: 0, lineHeight: 1.2 }}>{bc.meta.title}</p>
                <p style={{ color: c.textSub, fontSize: 9, margin: 0 }}>
                  {bc.joined && bc.userRank > 0 ? `#${bc.userRank} of ${bc.totalParticipants}` : `${bc.totalParticipants} in`}
                </p>
                {bc.joined ? (
                  <span style={{ color: c.textSub, fontSize: 9, fontWeight: 600 }}>Joined</span>
                ) : (
                  <button
                    onClick={e => { e.stopPropagation(); handleJoinBuiltin(bc.meta.id) }}
                    disabled={joiningBuiltinId === bc.meta.id}
                    style={{ background: 'none', border: 'none', padding: 0, color: c.accent, fontSize: 9, fontWeight: 700, cursor: 'pointer' }}
                  >
                    {joiningBuiltinId === bc.meta.id ? 'Joining…' : 'Join'}
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Friends leaderboard — top 3 snapshot */}
          <SectionHeader title="Friends" onAction={hasFriends ? () => setShowFullModal('friends') : undefined} c={c} />
          {userWorkoutsCompleted < 3 ? (
            <LockedCard hint="See how you stack up against your friends" c={c} />
          ) : !hasFriends ? (
            <div style={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 14, padding: 24, textAlign: 'center', marginBottom: 20 }}>
              <p style={{ color: c.text, fontSize: 13, fontWeight: 700, margin: '0 0 4px' }}>Add friends to climb faster</p>
              <p style={{ color: c.textSub, fontSize: 12, margin: 0, lineHeight: 1.5 }}>
                Each friend adds to your social score — 20% of your Ascend Score. Add them on your profile.
              </p>
            </div>
          ) : (
            <div style={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 12, padding: '2px 10px', marginBottom: 20 }}>
              {topThreePeople(friendsLeaderboard).map((row, idx) => {
                const isUser = !row.isPlaceholder && row.userId === userId
                return (
                  <div
                    key={row.userId}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '8px 0',
                      borderBottom: idx < 2 ? `1px solid ${c.border}` : 'none',
                      opacity: row.isPlaceholder ? 0.35 : 1,
                      background: isUser ? c.accentBg : 'transparent',
                      borderRadius: isUser ? 6 : 0,
                      margin: isUser ? '2px -4px' : 0,
                      paddingLeft: isUser ? 6 : 0,
                      paddingRight: isUser ? 6 : 0,
                    }}
                  >
                    <span style={{ color: RANK_COLORS[row.rank] ?? c.textSub, fontSize: 11, fontWeight: 700, width: 16, textAlign: 'center' }}>
                      {row.rank}
                    </span>
                    <AvatarCircle avatarUrl={row.avatarUrl} ini={row.initials} highlight={isUser} c={c} size={26} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ color: isUser ? c.accent : c.text, fontSize: 12, fontWeight: 700, margin: 0 }}>{row.name}</p>
                      <p style={{ color: c.textSub, fontSize: 10, margin: 0 }}>{row.subtitle}</p>
                    </div>
                    <span style={{ color: row.isPlaceholder ? c.textSub : c.accent, fontSize: 12, fontWeight: 700 }}>{row.isPlaceholder ? '—' : row.score}</span>
                  </div>
                )
              })}
            </div>
          )}

          {/* Groups leaderboard — top 3 snapshot */}
          <SectionHeader title="Groups" onAction={() => setShowFullModal('groups')} c={c} />
          {userWorkoutsCompleted < 3 ? (
            <LockedCard hint="See which Penn group reigns supreme" c={c} />
          ) : (
          <div style={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 12, padding: '2px 10px', marginBottom: 20 }}>
            {topThreeGroups(groupsLeaderboard).map((row, idx) => {
              const isMyGroup = !row.isPlaceholder && myGroupIds.has(row.groupId)
              return (
                <div
                  key={row.groupId}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '8px 0',
                    borderBottom: idx < 2 ? `1px solid ${c.border}` : 'none',
                    opacity: row.isPlaceholder ? 0.35 : 1,
                    background: isMyGroup ? c.accentBg : 'transparent',
                    borderRadius: isMyGroup ? 6 : 0,
                    margin: isMyGroup ? '2px -4px' : 0,
                    paddingLeft: isMyGroup ? 6 : 0,
                    paddingRight: isMyGroup ? 6 : 0,
                  }}
                >
                  <span style={{ color: RANK_COLORS[row.rank] ?? c.textSub, fontSize: 11, fontWeight: 700, width: 16, textAlign: 'center' }}>
                    {row.rank}
                  </span>
                  <AvatarCircle avatarUrl={null} ini={initials(row.name)} highlight={isMyGroup} c={c} size={26} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ color: c.text, fontSize: 12, fontWeight: 700, margin: 0 }}>{row.name}</p>
                    <p style={{ color: c.textSub, fontSize: 10, margin: 0 }}>
                      {row.isPlaceholder ? 'Placeholder' : `${row.category} · ${row.memberCount} members`}
                    </p>
                  </div>
                  <span style={{ color: row.isPlaceholder ? c.textSub : c.accent, fontSize: 12, fontWeight: 700 }}>{row.isPlaceholder ? '—' : row.avgScore}</span>
                </div>
              )
            })}
          </div>
          )}

          {/* Campus leaderboard — top 3 snapshot */}
          <SectionHeader title="Campus" onAction={() => setShowFullModal('campus')} c={c} />
          {userWorkoutsCompleted < 3 ? (
            <LockedCard hint="See where you rank among all Penn students" c={c} />
          ) : (
          <div style={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 12, padding: '2px 10px', marginBottom: 20 }}>
            {topThreePeople(campusLeaderboard).map((row, idx) => {
              const isUser = !row.isPlaceholder && row.userId === userId
              return (
                <div
                  key={row.userId}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '8px 0',
                    borderBottom: idx < 2 ? `1px solid ${c.border}` : 'none',
                    opacity: row.isPlaceholder ? 0.35 : 1,
                    background: isUser ? c.accentBg : 'transparent',
                    borderRadius: isUser ? 6 : 0,
                    margin: isUser ? '2px -4px' : 0,
                    paddingLeft: isUser ? 6 : 0,
                    paddingRight: isUser ? 6 : 0,
                  }}
                >
                  <span style={{ color: RANK_COLORS[row.rank] ?? c.textSub, fontSize: 11, fontWeight: 700, width: 16, textAlign: 'center' }}>
                    {row.rank}
                  </span>
                  <AvatarCircle avatarUrl={row.avatarUrl} ini={row.initials} highlight={isUser} c={c} size={26} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ color: isUser ? c.accent : c.text, fontSize: 12, fontWeight: 700, margin: 0 }}>{row.name}</p>
                    <p style={{ color: c.textSub, fontSize: 10, margin: 0 }}>{row.subtitle}</p>
                  </div>
                  <span style={{ color: row.isPlaceholder ? c.textSub : c.accent, fontSize: 12, fontWeight: 700 }}>{row.isPlaceholder ? '—' : row.score}</span>
                </div>
              )
            })}
          </div>
          )}

        </div>
      </div>

      {/* Notification dropdown */}
      {showNotifDropdown && (
        <div
          style={{ position: 'fixed', top: notifPos.top, right: notifPos.right, zIndex: 500, background: c.surface, border: `1px solid ${c.border}`, borderRadius: 14, width: 300, maxHeight: 400, overflowY: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,0.3)' }}
          onClick={e => e.stopPropagation()}
        >
          <div style={{ padding: '12px 16px 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${c.border}` }}>
            <span style={{ color: c.text, fontSize: 13, fontWeight: 700 }}>Notifications</span>
            <button onClick={() => { setNotifications([]); saveNotifs([]) }} style={{ background: 'none', border: 'none', color: c.textSub, fontSize: 11, cursor: 'pointer', padding: 0 }}>Clear all</button>
          </div>
          {notifications.length === 0 ? (
            <p style={{ color: c.textSub, fontSize: 13, textAlign: 'center', padding: '20px 16px', margin: 0 }}>No notifications yet</p>
          ) : notifications.map(n => (
            <div key={n.id} style={{ padding: '10px 16px', borderBottom: `1px solid ${c.border}` }}>
              <p style={{ color: c.text, fontSize: 12, margin: '0 0 3px', lineHeight: 1.5 }}>{n.message}</p>
            </div>
          ))}
        </div>
      )}

      {/* Gym users dropdown */}
      {showGymUsers && (
        <div
          style={{ position: 'fixed', top: gymUsersPos.top, right: gymUsersPos.right, zIndex: 500, background: c.surface, border: `1px solid ${c.border}`, borderRadius: 14, width: 220, maxHeight: 320, overflowY: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,0.3)' }}
          onClick={e => e.stopPropagation()}
        >
          <p style={{ color: c.textSub, fontSize: 10, letterSpacing: '1.5px', textTransform: 'uppercase', margin: 0, padding: '12px 14px 8px', borderBottom: `1px solid ${c.border}` }}>
            Trained Today
          </p>
          {displayedTrainedUsers.map(u => (
            <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', borderBottom: `1px solid ${c.border}` }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: c.border, display: 'flex', alignItems: 'center', justifyContent: 'center', color: c.accent, fontSize: 10, fontWeight: 700, flexShrink: 0 }}>
                {initials(u.name)}
              </div>
              <span style={{ color: c.text, fontSize: 13, fontWeight: 500 }}>{u.name}</span>
            </div>
          ))}
        </div>
      )}

      {/* Full leaderboard modal */}
      {showFullModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 300, background: c.bg, display: 'flex', flexDirection: 'column' }}>
          {/* Header */}
          <div style={{ padding: '52px 20px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: `1px solid ${c.border}`, flexShrink: 0 }}>
            <h2 style={{ color: c.text, fontSize: 18, fontWeight: 700, margin: 0 }}>
              {showFullModal === 'friends' ? 'Friends' : showFullModal === 'campus' ? 'Campus' : 'Groups'} Leaderboard
            </h2>
            <button
              onClick={() => setShowFullModal(null)}
              style={{ background: 'none', border: 'none', color: c.accent, fontSize: 14, fontWeight: 600, cursor: 'pointer', padding: 0 }}
            >
              Done
            </button>
          </div>

          {/* List */}
          <div style={{ flex: 1, overflow: 'auto', padding: '8px 20px 100px' }}>

            {/* Friends full list */}
            {showFullModal === 'friends' && (
              <div style={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 14, padding: '4px 14px', marginTop: 12 }}>
                {friendsLeaderboard.length === 0 ? (
                  <p style={{ color: c.textSub, fontSize: 13, textAlign: 'center', padding: '20px 0', margin: 0 }}>No friends with scores yet.</p>
                ) : friendsLeaderboard.map((row, idx) => {
                  const isUser = row.userId === userId
                  return (
                    <div key={row.userId} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: idx < friendsLeaderboard.length - 1 ? `1px solid ${c.border}` : 'none', background: isUser ? c.accentBg : 'transparent', borderRadius: isUser ? 8 : 0, margin: isUser ? '2px -4px' : 0, paddingLeft: isUser ? 8 : 0, paddingRight: isUser ? 8 : 0 }}>
                      <span style={{ color: RANK_COLORS[row.rank] ?? c.textSub, fontSize: 13, fontWeight: 700, width: 22, textAlign: 'center' }}>{row.rank}</span>
                      <AvatarCircle avatarUrl={row.avatarUrl} ini={row.initials} highlight={isUser} c={c} />
                      <div style={{ flex: 1 }}>
                        <p style={{ color: isUser ? c.accent : c.text, fontSize: 13, fontWeight: 700, margin: 0 }}>{row.name}</p>
                        <p style={{ color: c.textSub, fontSize: 11, margin: 0 }}>{row.subtitle}</p>
                      </div>
                      <span style={{ color: c.accent, fontSize: 14, fontWeight: 700 }}>{row.score}</span>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Groups full list */}
            {showFullModal === 'groups' && (
              <div style={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 14, padding: '4px 14px', marginTop: 12 }}>
                {groupsLeaderboard.length === 0 ? (
                  <p style={{ color: c.textSub, fontSize: 13, textAlign: 'center', padding: '20px 0', margin: 0 }}>No groups on the leaderboard yet.</p>
                ) : groupsLeaderboard.map((row, idx) => {
                  const isMyGroup = myGroupIds.has(row.groupId)
                  return (
                    <div key={row.groupId} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: idx < groupsLeaderboard.length - 1 ? `1px solid ${c.border}` : 'none', background: isMyGroup ? c.accentBg : 'transparent', borderRadius: isMyGroup ? 8 : 0, margin: isMyGroup ? '2px -4px' : 0, paddingLeft: isMyGroup ? 8 : 0, paddingRight: isMyGroup ? 8 : 0 }}>
                      <span style={{ color: RANK_COLORS[row.rank] ?? c.textSub, fontSize: 13, fontWeight: 700, width: 22, textAlign: 'center' }}>{row.rank}</span>
                      <AvatarCircle avatarUrl={null} ini={initials(row.name)} highlight={isMyGroup} c={c} />
                      <div style={{ flex: 1 }}>
                        <p style={{ color: c.text, fontSize: 13, fontWeight: 700, margin: 0 }}>{row.name}</p>
                        <p style={{ color: c.textSub, fontSize: 11, margin: 0 }}>{row.category} · {row.memberCount} members</p>
                      </div>
                      <span style={{ color: c.accent, fontSize: 14, fontWeight: 700 }}>{row.avgScore}</span>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Campus full list */}
            {showFullModal === 'campus' && (
              <div style={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 14, padding: '4px 14px', marginTop: 12 }}>
                {campusLeaderboard.length === 0 ? (
                  <p style={{ color: c.textSub, fontSize: 13, textAlign: 'center', padding: '20px 0', margin: 0 }}>No users on the leaderboard yet.</p>
                ) : campusLeaderboard.map((row, idx) => {
                  const isUser = row.userId === userId
                  return (
                    <div key={row.userId} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: idx < campusLeaderboard.length - 1 ? `1px solid ${c.border}` : 'none', background: isUser ? c.accentBg : 'transparent', borderRadius: isUser ? 8 : 0, margin: isUser ? '2px -4px' : 0, paddingLeft: isUser ? 8 : 0, paddingRight: isUser ? 8 : 0 }}>
                      <span style={{ color: RANK_COLORS[row.rank] ?? c.textSub, fontSize: 13, fontWeight: 700, width: 22, textAlign: 'center' }}>{row.rank}</span>
                      <AvatarCircle avatarUrl={row.avatarUrl} ini={row.initials} highlight={isUser} c={c} />
                      <div style={{ flex: 1 }}>
                        <p style={{ color: isUser ? c.accent : c.text, fontSize: 13, fontWeight: 700, margin: 0 }}>{row.name}</p>
                        <p style={{ color: c.textSub, fontSize: 11, margin: 0 }}>{row.subtitle}</p>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                        <span style={{ color: c.accent, fontSize: 14, fontWeight: 700 }}>{row.score}</span>
                        {rankChanges[row.userId] !== undefined && (
                          <span style={{ fontSize: 10, color: rankChanges[row.userId] > 0 ? '#3BF0A0' : '#FF6B6B' }}>
                            {rankChanges[row.userId] > 0 ? `↑${rankChanges[row.userId]}` : `↓${Math.abs(rankChanges[row.userId])}`}
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })}
                {/* Pinned row for users outside the fetched top 15 */}
                {pinnedRow && !campusLeaderboard.some(r => r.userId === userId) && (
                  <>
                    <div style={{ padding: '6px 0', textAlign: 'center', color: c.textSub, fontSize: 11 }}>· · ·</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 8px', background: c.accentBg, borderRadius: 8, margin: '2px -4px' }}>
                      <span style={{ color: c.textSub, fontSize: 13, fontWeight: 700, width: 22, textAlign: 'center' }}>{pinnedRow.rank}</span>
                      <AvatarCircle avatarUrl={pinnedRow.avatarUrl} ini={pinnedRow.initials} highlight={true} c={c} />
                      <div style={{ flex: 1 }}>
                        <p style={{ color: c.accent, fontSize: 13, fontWeight: 700, margin: 0 }}>{pinnedRow.name}</p>
                        <p style={{ color: c.textSub, fontSize: 11, margin: 0 }}>{pinnedRow.subtitle}</p>
                      </div>
                      <span style={{ color: c.accent, fontSize: 14, fontWeight: 700 }}>{pinnedRow.score}</span>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Trending on Campus — full list (styled like the Feed page) */}
      {showAccomplishments && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 300, background: c.bg, overflow: 'auto' }}>
          <div style={{ padding: '52px 16px 100px' }}>

            {/* Header — back arrow + title, matches Feed page */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
              <button
                onClick={() => setShowAccomplishments(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center' }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <path d="M15 18l-6-6 6-6" stroke={c.text} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              <span style={{ color: c.text, fontSize: 20, fontWeight: 700 }}>Trending on Campus</span>
            </div>

            {/* Boxes — two per row, same size as the Campus preview */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {CAMPUS_ACCOMPLISHMENTS.map((item, i) => (
                <AccomplishmentBox key={i} item={item} c={c} />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* All challenges — 3 per row grid */}
      {showAllChallenges && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 300, background: c.bg, display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '52px 20px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: `1px solid ${c.border}`, flexShrink: 0 }}>
            <h2 style={{ color: c.text, fontSize: 18, fontWeight: 700, margin: 0 }}>Active Challenges</h2>
            <button
              onClick={() => setShowAllChallenges(false)}
              style={{ background: 'none', border: 'none', color: c.accent, fontSize: 14, fontWeight: 600, cursor: 'pointer', padding: 0 }}
            >
              Done
            </button>
          </div>
          <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px 100px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
              {builtinChallenges.map(bc => (
                <ChallengeGridCard
                  key={bc.meta.id}
                  data={bc}
                  joiningId={joiningBuiltinId}
                  onJoin={handleJoinBuiltin}
                  onOpen={() => { setShowAllChallenges(false); setOpenChallengeId(bc.meta.id) }}
                  c={c}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Single-challenge leaderboard modal */}
      {openChallengeId && (() => {
        const ch = builtinChallenges.find(b => b.meta.id === openChallengeId)
        if (!ch) return null
        return (
          <div style={{ position: 'fixed', inset: 0, zIndex: 320, background: c.bg, display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '52px 20px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: `1px solid ${c.border}`, flexShrink: 0 }}>
              <h2 style={{ color: c.text, fontSize: 18, fontWeight: 700, margin: 0 }}>
                {ch.meta.icon} {ch.meta.title}
              </h2>
              <button
                onClick={() => setOpenChallengeId(null)}
                style={{ background: 'none', border: 'none', color: c.accent, fontSize: 14, fontWeight: 600, cursor: 'pointer', padding: 0 }}
              >
                Done
              </button>
            </div>
            <div style={{ flex: 1, overflow: 'auto', padding: '12px 20px 100px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <span style={{ color: c.textSub, fontSize: 12 }}>
                  {ch.totalParticipants} {ch.totalParticipants === 1 ? 'participant' : 'participants'}
                </span>
                {ch.meta.autoEnroll ? (
                  <span style={{ color: c.textSub, fontSize: 12, fontWeight: 600 }}>Joined</span>
                ) : ch.joined ? (
                  <button
                    onClick={() => handleLeaveBuiltin(ch.meta.id)}
                    disabled={joiningBuiltinId === ch.meta.id}
                    style={{ background: 'none', border: `1px solid ${c.border}`, color: c.textSub, fontSize: 12, fontWeight: 700, cursor: 'pointer', padding: '6px 14px', borderRadius: 8 }}
                  >
                    {joiningBuiltinId === ch.meta.id ? 'Leaving…' : 'Leave'}
                  </button>
                ) : (
                  <button
                    onClick={() => handleJoinBuiltin(ch.meta.id)}
                    disabled={joiningBuiltinId === ch.meta.id}
                    style={{ background: c.accent, border: 'none', color: c.bg, fontSize: 12, fontWeight: 700, cursor: 'pointer', padding: '6px 14px', borderRadius: 8 }}
                  >
                    {joiningBuiltinId === ch.meta.id ? 'Joining…' : 'Join'}
                  </button>
                )}
              </div>
              <div style={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 14, padding: '4px 14px' }}>
                {ch.leaderboard.length === 0 ? (
                  <p style={{ color: c.textSub, fontSize: 13, textAlign: 'center', padding: '20px 0', margin: 0 }}>
                    {ch.joined ? 'Be the first to set a score.' : 'No participants yet — join to be the first.'}
                  </p>
                ) : ch.leaderboard.map((row, idx) => {
                  const rank = idx + 1
                  const isUser = row.userId === userId
                  return (
                    <div key={row.userId} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: idx < ch.leaderboard.length - 1 ? `1px solid ${c.border}` : 'none', background: isUser ? c.accentBg : 'transparent', borderRadius: isUser ? 8 : 0, margin: isUser ? '2px -4px' : 0, paddingLeft: isUser ? 8 : 0, paddingRight: isUser ? 8 : 0 }}>
                      <span style={{ color: RANK_COLORS[rank] ?? c.textSub, fontSize: 13, fontWeight: 700, width: 22, textAlign: 'center' }}>{rank}</span>
                      <AvatarCircle avatarUrl={row.avatarUrl} ini={row.initials} highlight={isUser} c={c} />
                      <div style={{ flex: 1 }}>
                        <p style={{ color: isUser ? c.accent : c.text, fontSize: 13, fontWeight: 700, margin: 0 }}>{row.name}</p>
                      </div>
                      <span style={{ color: c.accent, fontSize: 14, fontWeight: 700 }}>{ch.meta.valueLabel(row.value)}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
