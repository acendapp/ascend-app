import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { UserScores } from '../types'

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

const RANK_COLORS: Record<number, string> = { 1: '#D97706', 2: '#6B7280', 3: '#92400E' }

function tierBadge(level: number): { label: string; bg: string; color: string } {
  if (level >= 7) return { label: `Lv ${level}`, bg: '#F3E8FF', color: '#7C3AED' }
  if (level >= 5) return { label: `Lv ${level}`, bg: '#FEF3C7', color: '#D97706' }
  if (level >= 3) return { label: `Lv ${level}`, bg: '#EFF6FF', color: '#2563EB' }
  return { label: `Lv ${level}`, bg: '#F5F5F7', color: '#6B7280' }
}

function AvatarCircle({ avatarUrl, ini, highlight }: { avatarUrl: string | null; ini: string; highlight: boolean }) {
  return (
    <div style={{
      width: 34, height: 34, borderRadius: '50%',
      background: highlight ? 'rgba(255,92,0,0.1)' : '#F5F5F7',
      border: highlight ? '2px solid #FF5C00' : '1.5px solid #E5E7EB',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: highlight ? '#FF5C00' : '#6B7280',
      fontSize: 11, fontWeight: 700, flexShrink: 0, overflow: 'hidden',
    }}>
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
  } catch {}
}
function daysUntilMonthEnd(): number {
  const now = new Date()
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  return Math.ceil((lastDay.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
}

interface LiveChallenge {
  title: string
  icon: string
  userRank: number
  totalParticipants: number
  userValue: number
  valueLabel: string
  aboveName: string | null
  aboveValue: number | null
  daysLabel: string
}

function SectionHeader({ title, onAction }: { title: string; onAction?: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
      <span style={{ color: '#111827', fontSize: 15, fontWeight: 700 }}>{title}</span>
      {onAction && (
        <button
          onClick={onAction}
          style={{ background: 'none', border: 'none', color: '#FF5C00', fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: 0 }}
        >
          See all →
        </button>
      )}
    </div>
  )
}

function LockedCard({ hint }: { hint: string }) {
  return (
    <div style={{
      background: '#FFFFFF',
      border: '1.5px dashed #E5E7EB',
      borderRadius: 16,
      padding: '28px 20px',
      marginBottom: 20,
      textAlign: 'center',
      boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
    }}>
      <div style={{
        width: 44, height: 44, borderRadius: '50%',
        background: 'rgba(255,92,0,0.08)',
        border: '1.5px solid rgba(255,92,0,0.2)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        margin: '0 auto 12px', fontSize: 20,
      }}>
        🔒
      </div>
      <p style={{ color: '#111827', fontSize: 14, fontWeight: 700, margin: '0 0 5px' }}>
        Unlocks after 3 workouts
      </p>
      <p style={{ color: '#6B7280', fontSize: 13, margin: 0, lineHeight: 1.5 }}>
        {hint}
      </p>
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

// ── Component ─────────────────────────────────────────────────────────────────

export default function Compete() {
  const navigate = useNavigate()

  const [userId, setUserId] = useState<string | null>(null)
  const [scores, setScores] = useState<UserScores | null>(null)
  const [campusRank, setCampusRank] = useState(0)
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
  const [pinnedRow, setPinnedRow] = useState<PersonRow | null>(null)
  const [liveChallenges, setLiveChallenges] = useState<LiveChallenge[]>([])
  const [rankChanges, setRankChanges] = useState<Record<string, number>>({})
  const [showFullModal, setShowFullModal] = useState<'friends' | 'campus' | 'groups' | null>(null)

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
      if (scoresRes.data) setScores(scoresRes.data)

      const userScore = scoresRes.data?.ascend_score ?? 0

      const { count: higherCount } = await supabase
        .from('user_scores')
        .select('user_id', { count: 'exact', head: true })
        .gt('ascend_score', userScore)
      const myRank = (higherCount ?? 0) + 1
      setCampusRank(myRank)

      const { count: wCount } = await supabase
        .from('workouts')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('completed', true)
      setUserWorkoutsCompleted(wCount ?? 0)

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
          supabase.from('user_scores').select('user_id, ascend_score, level').in('user_id', allIds).gt('ascend_score', 0),
          supabase.from('users').select('id, name, affiliation, avatar_url').in('id', allIds),
        ])
        if (friendScores.data && friendProfiles.data) {
          const profileMap = new Map(friendProfiles.data.map(p => [p.id, p]))
          const rows: PersonRow[] = friendScores.data
            .sort((a, b) => (b.ascend_score as number) - (a.ascend_score as number))
            .map((s, i) => {
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
          setFriendsLeaderboard(rows)
        }
      }

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

      try {
        const monthStart = new Date()
        monthStart.setDate(1)
        monthStart.setHours(0, 0, 0, 0)

        const { data: mWorkouts } = await supabase
          .from('workouts')
          .select('id, user_id')
          .eq('completed', true)
          .gte('workout_date', monthStart.toISOString())

        if (mWorkouts && mWorkouts.length > 0) {
          const cntMap = new Map<string, number>()
          const wMap = new Map<string, string>()
          for (const w of mWorkouts) {
            const uid = w.user_id as string
            cntMap.set(uid, (cntMap.get(uid) ?? 0) + 1)
            wMap.set(w.id as string, uid)
          }

          const sortedCnt = [...cntMap.entries()].sort((a, b) => b[1] - a[1])
          const myGrindIdx = sortedCnt.findIndex(([id]) => id === user.id)
          const myGrindRank = myGrindIdx >= 0 ? myGrindIdx + 1 : sortedCnt.length + 1
          const myGrindCount = cntMap.get(user.id) ?? 0
          const aboveCntEntry = myGrindIdx > 0 ? sortedCnt[myGrindIdx - 1] : null

          let aboveGrindName: string | null = null
          if (aboveCntEntry) {
            const { data: p } = await supabase.from('users').select('name').eq('id', aboveCntEntry[0]).maybeSingle()
            aboveGrindName = p ? shortName(p.name as string) : null
          }

          const newChallenges: LiveChallenge[] = [{
            title: 'Monthly Grind',
            icon: '🔥',
            userRank: myGrindRank,
            totalParticipants: sortedCnt.length,
            userValue: myGrindCount,
            valueLabel: `workout${myGrindCount !== 1 ? 's' : ''} this month`,
            aboveName: aboveGrindName,
            aboveValue: aboveCntEntry ? aboveCntEntry[1] : null,
            daysLabel: `${daysUntilMonthEnd()}d left`,
          }]

          const wIds = mWorkouts.map(w => w.id as string)
          const { data: volLogs } = await supabase
            .from('exercise_logs').select('workout_id, weight, reps').in('workout_id', wIds)

          if (volLogs && volLogs.length > 0) {
            const volMap = new Map<string, number>()
            for (const l of volLogs) {
              const uid = wMap.get(l.workout_id as string)
              if (!uid) continue
              volMap.set(uid, (volMap.get(uid) ?? 0) + ((l.weight as number) ?? 0) * ((l.reps as number) ?? 0))
            }
            const sortedVol = [...volMap.entries()].sort((a, b) => b[1] - a[1])
            const myVolIdx = sortedVol.findIndex(([id]) => id === user.id)
            const myVolRank = myVolIdx >= 0 ? myVolIdx + 1 : sortedVol.length + 1
            const myVol = volMap.get(user.id) ?? 0
            const aboveVolEntry = myVolIdx > 0 ? sortedVol[myVolIdx - 1] : null

            let aboveVolName: string | null = null
            if (aboveVolEntry) {
              const { data: p } = await supabase.from('users').select('name').eq('id', aboveVolEntry[0]).maybeSingle()
              aboveVolName = p ? shortName(p.name as string) : null
            }

            newChallenges.push({
              title: 'Volume King',
              icon: '💪',
              userRank: myVolRank,
              totalParticipants: sortedVol.length,
              userValue: Math.round(myVol),
              valueLabel: 'lb volume this month',
              aboveName: aboveVolName,
              aboveValue: aboveVolEntry ? Math.round(aboveVolEntry[1]) : null,
              daysLabel: `${daysUntilMonthEnd()}d left`,
            })
          }

          setLiveChallenges(newChallenges)
        }
      } catch { /* live challenges non-critical */ }

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
      const { data: challenges } = await supabase
        .from('challenges')
        .select('id, title, description, challenge_type, start_date, end_date')
        .gte('end_date', now)
        .order('start_date', { ascending: true })

      if (!challenges || challenges.length === 0) {
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
        const { data: sr } = await supabase.from('user_scores').select('social_score').eq('user_id', userId).maybeSingle()
        await supabase.from('user_scores').update({ social_score: Math.min((sr?.social_score ?? 0) + 10, 100) }).eq('user_id', userId)
      }
    } finally {
      setJoiningId(null)
    }
  }

  // ── Loading state ───────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="app-shell">
        <div className="app-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
          <div style={{ color: '#9CA3AF', fontSize: 14, fontWeight: 500 }}>Loading…</div>
        </div>
      </div>
    )
  }

  const ascendScore = scores?.ascend_score ?? 0
  const joinedChallenges = computedChallenges.filter(c => c.joined)
  const availableChallenges = computedChallenges.filter(c => !c.joined)

  const cardStyle: React.CSSProperties = {
    background: '#FFFFFF',
    borderRadius: 16,
    boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="app-shell">
      <div className="app-content page-scroll">

        {/* Header */}
        <div style={{ background: '#FFFFFF', padding: '52px 20px 20px', borderBottom: '1px solid #E5E7EB' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h1 style={{ color: '#111827', fontSize: 26, fontWeight: 800, margin: 0 }}>Compete</h1>
            <button
              onClick={() => navigate('/groups')}
              style={{ background: 'none', border: 'none', color: '#FF5C00', fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: 0 }}
            >
              My Groups →
            </button>
          </div>
        </div>

        <div style={{ padding: '16px 16px 0' }}>

          {/* Personal rank card */}
          <div style={{ ...cardStyle, padding: 20, marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <div>
                <p style={{ color: '#9CA3AF', fontSize: 11, fontWeight: 600, margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Your Rank</p>
                {userWorkoutsCompleted < 3 ? (
                  <p style={{ color: '#9CA3AF', fontSize: 26, fontWeight: 800, margin: '0 0 4px', lineHeight: 1 }}>—</p>
                ) : (
                  <p style={{ color: '#FF5C00', fontSize: 36, fontWeight: 800, margin: '0 0 4px', lineHeight: 1 }}>
                    #{campusRank > 0 ? campusRank : '—'}
                  </p>
                )}
                <p style={{ color: '#111827', fontSize: 16, fontWeight: 700, margin: '0 0 4px' }}>
                  {ascendScore} pts
                </p>
                {userWorkoutsCompleted >= 3 && (
                  <p style={{ color: '#FF5C00', fontSize: 13, fontWeight: 600, margin: 0 }}>↑ Keep climbing</p>
                )}
              </div>
              {myGroupIds.size > 0 && groupsLeaderboard.length > 0 && (() => {
                const myGroup = groupsLeaderboard.find(g => myGroupIds.has(g.groupId))
                return myGroup ? (
                  <div style={{ background: '#F5F5F7', borderRadius: 10, padding: '8px 12px', textAlign: 'right' }}>
                    <p style={{ color: '#6B7280', fontSize: 11, margin: '0 0 2px' }}>Group rank</p>
                    <p style={{ color: '#111827', fontSize: 14, fontWeight: 700, margin: 0 }}>#{myGroup.rank}</p>
                    <p style={{ color: '#9CA3AF', fontSize: 11, margin: '2px 0 0' }}>{myGroup.name}</p>
                  </div>
                ) : null
              })()}
            </div>
          </div>

          {/* 3-workout gate progress */}
          {userWorkoutsCompleted < 3 && (
            <div style={{ ...cardStyle, padding: '14px 16px', marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <p style={{ color: '#111827', fontSize: 14, fontWeight: 700, margin: 0 }}>Unlock the leaderboard</p>
                <span style={{ color: '#FF5C00', fontSize: 14, fontWeight: 800 }}>{userWorkoutsCompleted}/3</span>
              </div>
              <div style={{ background: '#F5F5F7', borderRadius: 4, height: 6, overflow: 'hidden', marginBottom: 8 }}>
                <div style={{ background: '#FF5C00', height: '100%', width: `${(userWorkoutsCompleted / 3) * 100}%`, borderRadius: 4, transition: 'width 0.4s ease' }} />
              </div>
              <p style={{ color: '#6B7280', fontSize: 12, margin: 0 }}>
                Complete {3 - userWorkoutsCompleted} more workout{3 - userWorkoutsCompleted !== 1 ? 's' : ''} to appear on the leaderboard.
              </p>
            </div>
          )}

          {/* Challenges */}
          <SectionHeader title="Challenges" />

          {userWorkoutsCompleted < 3 ? (
            <LockedCard hint="Monthly competitions with real prizes on the line" />
          ) : challengeLoading ? (
            <div style={{ ...cardStyle, padding: 24, textAlign: 'center', marginBottom: 20 }}>
              <p style={{ color: '#9CA3AF', fontSize: 13, margin: 0 }}>Loading challenges…</p>
            </div>
          ) : computedChallenges.length === 0 ? (
            <div style={{ ...cardStyle, padding: 24, textAlign: 'center', marginBottom: 20 }}>
              <p style={{ color: '#6B7280', fontSize: 13, margin: 0 }}>No active challenges right now.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
              {joinedChallenges.map(cc => (
                <div key={cc.challenge.id} style={{ ...cardStyle, padding: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
                    <div style={{ flex: 1, marginRight: 10 }}>
                      <p style={{ color: '#111827', fontSize: 14, fontWeight: 700, margin: '0 0 3px' }}>{cc.challenge.title}</p>
                      {cc.challenge.description && (
                        <p style={{ color: '#6B7280', fontSize: 12, margin: 0 }}>{cc.challenge.description}</p>
                      )}
                    </div>
                    <span style={{ background: 'rgba(255,92,0,0.08)', color: '#FF5C00', fontSize: 11, fontWeight: 600, borderRadius: 20, padding: '3px 10px', flexShrink: 0 }}>
                      {cc.daysRemaining}d left
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ color: '#FF5C00', fontSize: 22, fontWeight: 800 }}>#{cc.userRank}</span>
                    <span style={{ color: '#6B7280', fontSize: 12 }}>of {cc.totalParticipants}</span>
                  </div>
                  {cc.userRank === 1 ? (
                    <p style={{ color: '#16A34A', fontSize: 12, fontWeight: 600, margin: '6px 0 0' }}>You're leading! 🏆</p>
                  ) : cc.aboveName ? (
                    <p style={{ color: '#6B7280', fontSize: 12, margin: '6px 0 0' }}>
                      You're {ordinal(cc.userRank)}. {cc.aboveName} is {ordinal(cc.userRank - 1)}.
                    </p>
                  ) : null}
                </div>
              ))}

              {availableChallenges.map(cc => (
                <div key={cc.challenge.id} style={{ ...cardStyle, padding: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
                    <div style={{ flex: 1, marginRight: 10 }}>
                      <p style={{ color: '#111827', fontSize: 14, fontWeight: 700, margin: '0 0 3px' }}>{cc.challenge.title}</p>
                      {cc.challenge.description && (
                        <p style={{ color: '#6B7280', fontSize: 12, margin: 0 }}>{cc.challenge.description}</p>
                      )}
                    </div>
                    <span style={{ background: '#F5F5F7', color: '#6B7280', fontSize: 11, fontWeight: 600, borderRadius: 20, padding: '3px 10px', flexShrink: 0 }}>
                      {cc.daysRemaining}d left
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ color: '#6B7280', fontSize: 12 }}>
                      {cc.totalParticipants} participant{cc.totalParticipants !== 1 ? 's' : ''}
                    </span>
                    <button
                      onClick={() => userWorkoutsCompleted >= 3 && handleJoin(cc.challenge.id)}
                      disabled={joiningId === cc.challenge.id || userWorkoutsCompleted < 3}
                      style={{ background: 'none', border: 'none', color: userWorkoutsCompleted < 3 ? '#9CA3AF' : '#FF5C00', fontSize: 13, fontWeight: 700, cursor: userWorkoutsCompleted < 3 ? 'not-allowed' : 'pointer', padding: 0 }}
                    >
                      {joiningId === cc.challenge.id ? 'Joining…' : userWorkoutsCompleted < 3 ? 'Locked 🔒' : 'Join →'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Campus Standings */}
          {liveChallenges.length > 0 && userWorkoutsCompleted >= 3 && (
            <>
              <SectionHeader title="Campus Standings" />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
                {liveChallenges.map(lc => (
                  <div key={lc.title} style={{ ...cardStyle, padding: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
                      <div>
                        <p style={{ color: '#111827', fontSize: 14, fontWeight: 700, margin: '0 0 3px' }}>
                          {lc.icon} {lc.title}
                        </p>
                        <p style={{ color: '#6B7280', fontSize: 12, margin: 0 }}>
                          {lc.userValue.toLocaleString()} {lc.valueLabel}
                        </p>
                      </div>
                      <span style={{ background: 'rgba(255,92,0,0.08)', color: '#FF5C00', fontSize: 11, fontWeight: 600, borderRadius: 20, padding: '3px 10px', flexShrink: 0 }}>
                        {lc.daysLabel}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ color: '#FF5C00', fontSize: 22, fontWeight: 800 }}>#{lc.userRank}</span>
                      <span style={{ color: '#6B7280', fontSize: 12 }}>of {lc.totalParticipants}</span>
                    </div>
                    {lc.userRank === 1 ? (
                      <p style={{ color: '#16A34A', fontSize: 12, fontWeight: 600, margin: '6px 0 0' }}>You're leading! 🏆</p>
                    ) : lc.aboveName && lc.aboveValue !== null ? (
                      <p style={{ color: '#6B7280', fontSize: 12, margin: '6px 0 0' }}>
                        {lc.aboveName} is {ordinal(lc.userRank - 1)} with {lc.aboveValue.toLocaleString()} {lc.valueLabel}.
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Friends leaderboard */}
          <SectionHeader title="Friends" onAction={userWorkoutsCompleted >= 3 && hasFriends ? () => setShowFullModal('friends') : undefined} />
          {userWorkoutsCompleted < 3 ? (
            <LockedCard hint="See how you stack up against your friends" />
          ) : !hasFriends ? (
            <div style={{ ...cardStyle, padding: 24, textAlign: 'center', marginBottom: 20 }}>
              <p style={{ color: '#6B7280', fontSize: 13, margin: 0 }}>Add friends on your profile to compete</p>
            </div>
          ) : (
            <div style={{ ...cardStyle, padding: '4px 16px', marginBottom: 20 }}>
              {topThreePeople(friendsLeaderboard).map((row, idx) => {
                const isUser = !row.isPlaceholder && row.userId === userId
                const t = tierBadge(row.level)
                return (
                  <div
                    key={row.userId}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '13px 0',
                      borderBottom: idx < 2 ? '1px solid #F5F5F7' : 'none',
                      opacity: row.isPlaceholder ? 0.3 : 1,
                      background: isUser ? 'rgba(255,92,0,0.04)' : 'transparent',
                      borderRadius: isUser ? 10 : 0,
                      margin: isUser ? '2px -6px' : 0,
                      paddingLeft: isUser ? 10 : 0,
                      paddingRight: isUser ? 10 : 0,
                    }}
                  >
                    <span style={{ color: RANK_COLORS[row.rank] ?? '#9CA3AF', fontSize: 14, fontWeight: 800, width: 20, textAlign: 'center' }}>
                      {row.rank}
                    </span>
                    <AvatarCircle avatarUrl={row.avatarUrl} ini={row.initials} highlight={isUser} />
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <p style={{ color: isUser ? '#FF5C00' : '#111827', fontSize: 13, fontWeight: 700, margin: 0 }}>{row.name}</p>
                        {!row.isPlaceholder && <span style={{ background: t.bg, color: t.color, fontSize: 9, borderRadius: 4, padding: '1px 5px', flexShrink: 0, fontWeight: 600 }}>{t.label}</span>}
                      </div>
                      <p style={{ color: '#9CA3AF', fontSize: 11, margin: 0 }}>{row.subtitle}</p>
                    </div>
                    <span style={{ color: row.isPlaceholder ? '#9CA3AF' : (isUser ? '#FF5C00' : '#111827'), fontSize: 14, fontWeight: 800 }}>
                      {row.isPlaceholder ? '—' : row.score}
                    </span>
                  </div>
                )
              })}
            </div>
          )}

          {/* Groups leaderboard */}
          <SectionHeader title="Groups" onAction={userWorkoutsCompleted >= 3 ? () => setShowFullModal('groups') : undefined} />
          {userWorkoutsCompleted < 3 ? (
            <LockedCard hint="See which Penn group reigns supreme" />
          ) : (
            <div style={{ ...cardStyle, padding: '4px 16px', marginBottom: 20 }}>
              {topThreeGroups(groupsLeaderboard).map((row, idx) => {
                const isMyGroup = !row.isPlaceholder && myGroupIds.has(row.groupId)
                return (
                  <div
                    key={row.groupId}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '13px 0',
                      borderBottom: idx < 2 ? '1px solid #F5F5F7' : 'none',
                      opacity: row.isPlaceholder ? 0.3 : 1,
                      background: isMyGroup ? 'rgba(255,92,0,0.04)' : 'transparent',
                      borderRadius: isMyGroup ? 10 : 0,
                      margin: isMyGroup ? '2px -6px' : 0,
                      paddingLeft: isMyGroup ? 10 : 0,
                      paddingRight: isMyGroup ? 10 : 0,
                    }}
                  >
                    <span style={{ color: RANK_COLORS[row.rank] ?? '#9CA3AF', fontSize: 14, fontWeight: 800, width: 20, textAlign: 'center' }}>
                      {row.rank}
                    </span>
                    <div style={{ flex: 1 }}>
                      <p style={{ color: '#111827', fontSize: 13, fontWeight: 700, margin: 0 }}>{row.name}</p>
                      <p style={{ color: '#9CA3AF', fontSize: 11, margin: 0 }}>
                        {row.isPlaceholder ? 'Placeholder' : `${row.category} · ${row.memberCount} members`}
                      </p>
                    </div>
                    <span style={{ color: row.isPlaceholder ? '#9CA3AF' : (isMyGroup ? '#FF5C00' : '#111827'), fontSize: 14, fontWeight: 800 }}>
                      {row.isPlaceholder ? '—' : row.avgScore}
                    </span>
                  </div>
                )
              })}
            </div>
          )}

          {/* Campus leaderboard */}
          <SectionHeader title="Campus" onAction={userWorkoutsCompleted >= 3 ? () => setShowFullModal('campus') : undefined} />
          {userWorkoutsCompleted < 3 ? (
            <LockedCard hint="See where you rank among all Penn students" />
          ) : (
            <div style={{ ...cardStyle, padding: '4px 16px', marginBottom: 20 }}>
              {topThreePeople(campusLeaderboard).map((row, idx) => {
                const isUser = !row.isPlaceholder && row.userId === userId
                const t = tierBadge(row.level)
                return (
                  <div
                    key={row.userId}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '13px 0',
                      borderBottom: idx < 2 ? '1px solid #F5F5F7' : 'none',
                      opacity: row.isPlaceholder ? 0.3 : 1,
                      background: isUser ? 'rgba(255,92,0,0.04)' : 'transparent',
                      borderRadius: isUser ? 10 : 0,
                      margin: isUser ? '2px -6px' : 0,
                      paddingLeft: isUser ? 10 : 0,
                      paddingRight: isUser ? 10 : 0,
                    }}
                  >
                    <span style={{ color: RANK_COLORS[row.rank] ?? '#9CA3AF', fontSize: 14, fontWeight: 800, width: 20, textAlign: 'center' }}>
                      {row.rank}
                    </span>
                    <AvatarCircle avatarUrl={row.avatarUrl} ini={row.initials} highlight={isUser} />
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <p style={{ color: isUser ? '#FF5C00' : '#111827', fontSize: 13, fontWeight: 700, margin: 0 }}>{row.name}</p>
                        {!row.isPlaceholder && <span style={{ background: t.bg, color: t.color, fontSize: 9, borderRadius: 4, padding: '1px 5px', flexShrink: 0, fontWeight: 600 }}>{t.label}</span>}
                      </div>
                      <p style={{ color: '#9CA3AF', fontSize: 11, margin: 0 }}>{row.subtitle}</p>
                    </div>
                    <span style={{ color: row.isPlaceholder ? '#9CA3AF' : (isUser ? '#FF5C00' : '#111827'), fontSize: 14, fontWeight: 800 }}>
                      {row.isPlaceholder ? '—' : row.score}
                    </span>
                  </div>
                )
              })}
            </div>
          )}

        </div>
      </div>

      {/* Full leaderboard modal */}
      {showFullModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 300, background: '#F5F5F7', display: 'flex', flexDirection: 'column', maxWidth: 390, left: '50%', transform: 'translateX(-50%)' }}>
          <div style={{ padding: '52px 20px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #E5E7EB', background: '#FFFFFF', flexShrink: 0 }}>
            <h2 style={{ color: '#111827', fontSize: 18, fontWeight: 800, margin: 0 }}>
              {showFullModal === 'friends' ? 'Friends' : showFullModal === 'campus' ? 'Campus' : 'Groups'} Leaderboard
            </h2>
            <button
              onClick={() => setShowFullModal(null)}
              style={{ background: 'none', border: 'none', color: '#FF5C00', fontSize: 14, fontWeight: 700, cursor: 'pointer', padding: 0 }}
            >
              Done
            </button>
          </div>

          <div style={{ flex: 1, overflow: 'auto', padding: '16px 16px 100px' }}>

            {showFullModal === 'friends' && (
              <div style={{ background: '#FFFFFF', borderRadius: 16, padding: '4px 16px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                {friendsLeaderboard.length === 0 ? (
                  <p style={{ color: '#6B7280', fontSize: 13, textAlign: 'center', padding: '20px 0', margin: 0 }}>No friends with scores yet.</p>
                ) : friendsLeaderboard.map((row, idx) => {
                  const isUser = row.userId === userId
                  const t = tierBadge(row.level)
                  return (
                    <div key={row.userId} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 0', borderBottom: idx < friendsLeaderboard.length - 1 ? '1px solid #F5F5F7' : 'none', background: isUser ? 'rgba(255,92,0,0.04)' : 'transparent', borderRadius: isUser ? 10 : 0, margin: isUser ? '2px -6px' : 0, paddingLeft: isUser ? 10 : 0, paddingRight: isUser ? 10 : 0 }}>
                      <span style={{ color: RANK_COLORS[row.rank] ?? '#9CA3AF', fontSize: 14, fontWeight: 800, width: 22, textAlign: 'center' }}>{row.rank}</span>
                      <AvatarCircle avatarUrl={row.avatarUrl} ini={row.initials} highlight={isUser} />
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          <p style={{ color: isUser ? '#FF5C00' : '#111827', fontSize: 13, fontWeight: 700, margin: 0 }}>{row.name}</p>
                          <span style={{ background: t.bg, color: t.color, fontSize: 9, borderRadius: 4, padding: '1px 5px', flexShrink: 0, fontWeight: 600 }}>{t.label}</span>
                        </div>
                        <p style={{ color: '#9CA3AF', fontSize: 11, margin: 0 }}>{row.subtitle}</p>
                      </div>
                      <span style={{ color: isUser ? '#FF5C00' : '#111827', fontSize: 14, fontWeight: 800 }}>{row.score}</span>
                    </div>
                  )
                })}
              </div>
            )}

            {showFullModal === 'groups' && (
              <div style={{ background: '#FFFFFF', borderRadius: 16, padding: '4px 16px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                {groupsLeaderboard.length === 0 ? (
                  <p style={{ color: '#6B7280', fontSize: 13, textAlign: 'center', padding: '20px 0', margin: 0 }}>No groups on the leaderboard yet.</p>
                ) : groupsLeaderboard.map((row, idx) => {
                  const isMyGroup = myGroupIds.has(row.groupId)
                  return (
                    <div key={row.groupId} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 0', borderBottom: idx < groupsLeaderboard.length - 1 ? '1px solid #F5F5F7' : 'none', background: isMyGroup ? 'rgba(255,92,0,0.04)' : 'transparent', borderRadius: isMyGroup ? 10 : 0, margin: isMyGroup ? '2px -6px' : 0, paddingLeft: isMyGroup ? 10 : 0, paddingRight: isMyGroup ? 10 : 0 }}>
                      <span style={{ color: RANK_COLORS[row.rank] ?? '#9CA3AF', fontSize: 14, fontWeight: 800, width: 22, textAlign: 'center' }}>{row.rank}</span>
                      <div style={{ flex: 1 }}>
                        <p style={{ color: '#111827', fontSize: 13, fontWeight: 700, margin: 0 }}>{row.name}</p>
                        <p style={{ color: '#9CA3AF', fontSize: 11, margin: 0 }}>{row.category} · {row.memberCount} members</p>
                      </div>
                      <span style={{ color: isMyGroup ? '#FF5C00' : '#111827', fontSize: 14, fontWeight: 800 }}>{row.avgScore}</span>
                    </div>
                  )
                })}
              </div>
            )}

            {showFullModal === 'campus' && (
              <div style={{ background: '#FFFFFF', borderRadius: 16, padding: '4px 16px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                {campusLeaderboard.length === 0 ? (
                  <p style={{ color: '#6B7280', fontSize: 13, textAlign: 'center', padding: '20px 0', margin: 0 }}>No users on the leaderboard yet.</p>
                ) : campusLeaderboard.map((row, idx) => {
                  const isUser = row.userId === userId
                  const t = tierBadge(row.level)
                  return (
                    <div key={row.userId} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 0', borderBottom: idx < campusLeaderboard.length - 1 ? '1px solid #F5F5F7' : 'none', background: isUser ? 'rgba(255,92,0,0.04)' : 'transparent', borderRadius: isUser ? 10 : 0, margin: isUser ? '2px -6px' : 0, paddingLeft: isUser ? 10 : 0, paddingRight: isUser ? 10 : 0 }}>
                      <span style={{ color: RANK_COLORS[row.rank] ?? '#9CA3AF', fontSize: 14, fontWeight: 800, width: 22, textAlign: 'center' }}>{row.rank}</span>
                      <AvatarCircle avatarUrl={row.avatarUrl} ini={row.initials} highlight={isUser} />
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          <p style={{ color: isUser ? '#FF5C00' : '#111827', fontSize: 13, fontWeight: 700, margin: 0 }}>{row.name}</p>
                          <span style={{ background: t.bg, color: t.color, fontSize: 9, borderRadius: 4, padding: '1px 5px', flexShrink: 0, fontWeight: 600 }}>{t.label}</span>
                        </div>
                        <p style={{ color: '#9CA3AF', fontSize: 11, margin: 0 }}>{row.subtitle}</p>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                        <span style={{ color: isUser ? '#FF5C00' : '#111827', fontSize: 14, fontWeight: 800 }}>{row.score}</span>
                        {rankChanges[row.userId] !== undefined && (
                          <span style={{ fontSize: 10, fontWeight: 600, color: rankChanges[row.userId] > 0 ? '#16A34A' : '#DC2626' }}>
                            {rankChanges[row.userId] > 0 ? `↑${rankChanges[row.userId]}` : `↓${Math.abs(rankChanges[row.userId])}`}
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })}
                {pinnedRow && !campusLeaderboard.some(r => r.userId === userId) && (
                  <>
                    <div style={{ padding: '6px 0', textAlign: 'center', color: '#9CA3AF', fontSize: 11 }}>· · ·</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 10px', background: 'rgba(255,92,0,0.04)', borderRadius: 10, margin: '2px -6px' }}>
                      <span style={{ color: '#9CA3AF', fontSize: 14, fontWeight: 800, width: 22, textAlign: 'center' }}>{pinnedRow.rank}</span>
                      <AvatarCircle avatarUrl={pinnedRow.avatarUrl} ini={pinnedRow.initials} highlight={true} />
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          <p style={{ color: '#FF5C00', fontSize: 13, fontWeight: 700, margin: 0 }}>{pinnedRow.name}</p>
                          {(() => { const t = tierBadge(pinnedRow.level); return <span style={{ background: t.bg, color: t.color, fontSize: 9, borderRadius: 4, padding: '1px 5px', flexShrink: 0, fontWeight: 600 }}>{t.label}</span> })()}
                        </div>
                        <p style={{ color: '#9CA3AF', fontSize: 11, margin: 0 }}>{pinnedRow.subtitle}</p>
                      </div>
                      <span style={{ color: '#FF5C00', fontSize: 14, fontWeight: 800 }}>{pinnedRow.score}</span>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
