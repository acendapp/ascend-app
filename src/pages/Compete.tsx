import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { UserProfile, UserScores } from '../types'

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
}

interface GroupRow {
  rank: number
  groupId: string
  name: string
  category: string
  memberCount: number
  avgScore: number
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

function SectionHeader({ title, onAction }: { title: string; onAction?: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
      <span style={{ color: '#FFFFFF', fontSize: 13, fontWeight: 700 }}>{title}</span>
      <button
        onClick={onAction}
        style={{ background: 'none', border: 'none', color: '#4A9EFF', fontSize: 12, cursor: 'pointer', padding: 0 }}
      >
        See all →
      </button>
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

// ── Component ─────────────────────────────────────────────────────────────────

export default function Compete() {
  const navigate = useNavigate()

  const [userId, setUserId] = useState<string | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [scores, setScores] = useState<UserScores | null>(null)
  const [campusRank, setCampusRank] = useState(0)
  const [loading, setLoading] = useState(true)

  const [computedChallenges, setComputedChallenges] = useState<ComputedChallenge[]>([])
  const [challengeLoading, setChallengeLoading] = useState(true)
  const [joiningId, setJoiningId] = useState<string | null>(null)

  const [friendsLeaderboard, setFriendsLeaderboard] = useState<PersonRow[]>([])
  const [hasFriends, setHasFriends] = useState(false)
  const [groupsLeaderboard, setGroupsLeaderboard] = useState<GroupRow[]>([])
  const [myGroupIds, setMyGroupIds] = useState<Set<string>>(new Set())
  const [campusLeaderboard, setCampusLeaderboard] = useState<PersonRow[]>([])
  const [pinnedRow, setPinnedRow] = useState<PersonRow | null>(null)

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
      if (profileRes.data) setProfile(profileRes.data)
      if (scoresRes.data) setScores(scoresRes.data)

      const userScore = scoresRes.data?.ascend_score ?? 0

      // Campus rank
      const { count: higherCount } = await supabase
        .from('user_scores')
        .select('user_id', { count: 'exact', head: true })
        .gt('ascend_score', userScore)
      const myRank = (higherCount ?? 0) + 1
      setCampusRank(myRank)

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
          supabase.from('user_scores').select('user_id, ascend_score').in('user_id', allIds),
          supabase.from('users').select('id, name, affiliation').in('id', allIds),
        ])
        if (friendScores.data && friendProfiles.data) {
          const profileMap = new Map(friendProfiles.data.map(p => [p.id, p]))
          const rows: PersonRow[] = friendScores.data
            .sort((a, b) => (b.ascend_score as number) - (a.ascend_score as number))
            .slice(0, 5)
            .map((s, i) => {
              const p = profileMap.get(s.user_id as string)
              return {
                rank: i + 1,
                initials: initials((p as { name?: string })?.name ?? '??'),
                name: (p as { name?: string })?.name ?? 'Unknown',
                subtitle: (p as { affiliation?: string })?.affiliation ?? 'Penn',
                score: s.ascend_score as number,
                userId: s.user_id as string,
              }
            })
          setFriendsLeaderboard(rows)
        }
      }

      // Campus leaderboard (top 10 + pin user if outside)
      const { data: allScores } = await supabase
        .from('user_scores')
        .select('user_id, ascend_score')
        .order('ascend_score', { ascending: false })
        .limit(15)

      if (allScores && allScores.length > 0) {
        const allIds = allScores.map(s => s.user_id as string)
        const { data: allProfiles } = await supabase
          .from('users')
          .select('id, name, affiliation')
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
            }
          })
          setCampusLeaderboard(rows.slice(0, 10))
          const inTop10 = rows.slice(0, 10).some(r => r.userId === user.id)
          if (!inTop10) {
            const inRows = rows.find(r => r.userId === user.id)
            setPinnedRow(inRows ?? {
              rank: myRank,
              initials: initials(profileRes.data?.name ?? '??'),
              name: profileRes.data?.name ?? 'Unknown',
              subtitle: profileRes.data?.affiliation ?? 'Penn',
              score: userScore,
              userId: user.id,
            })
          }
        }
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
            const avg = gscores.length > 0 ? Math.round(gscores.reduce((a, b) => a + b, 0) / gscores.length) : 0
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
          setGroupsLeaderboard(rows.slice(0, 5))
        }
      } catch { /* groups non-critical */ }

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
      if (!error) await loadChallenges(userId)
    } finally {
      setJoiningId(null)
    }
  }

  // ── Loading state ───────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="app-shell">
        <div className="app-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
          <div style={{ color: '#5A7A9A', fontSize: 14 }}>Loading…</div>
        </div>
      </div>
    )
  }

  const ascendScore = scores?.ascend_score ?? 0
  const joinedChallenges = computedChallenges.filter(c => c.joined)
  const availableChallenges = computedChallenges.filter(c => !c.joined)

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="app-shell">
      <div className="app-content page-scroll">
        <div style={{ padding: '52px 20px 0' }}>

          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
            <h1 style={{ color: '#FFFFFF', fontSize: 24, fontWeight: 700, margin: 0 }}>Compete</h1>
            <button
              onClick={() => navigate('/groups')}
              style={{ background: 'none', border: 'none', color: '#4A9EFF', fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: 0 }}
            >
              My Groups →
            </button>
          </div>

          {/* Personal rank card */}
          <div style={{ background: '#0A1F3A', border: '1px solid #1E3D6E', borderRadius: 14, padding: 16, marginBottom: 20 }}>
            <p style={{ color: '#5A7A9A', fontSize: 10, letterSpacing: '1.5px', textTransform: 'uppercase', margin: '0 0 10px' }}>
              YOUR RANK
            </p>
            <p style={{ color: '#4A9EFF', fontSize: 36, fontWeight: 700, margin: '0 0 4px', lineHeight: 1 }}>
              #{campusRank > 0 ? campusRank : '—'}
            </p>
            <p style={{ color: '#FFFFFF', fontSize: 18, fontWeight: 600, margin: '0 0 6px' }}>
              Ascend Score: {ascendScore}
            </p>
            <p style={{ color: '#4A9EFF', fontSize: 13, margin: 0 }}>
              ↑ Keep climbing
            </p>
          </div>

          {/* Challenges */}
          <SectionHeader title="Challenges" />

          {challengeLoading ? (
            <div style={{ background: '#0D1728', border: '1px solid #1A2A42', borderRadius: 14, padding: 24, textAlign: 'center', marginBottom: 20 }}>
              <p style={{ color: '#5A7A9A', fontSize: 13, margin: 0 }}>Loading challenges…</p>
            </div>
          ) : computedChallenges.length === 0 ? (
            <div style={{ background: '#0D1728', border: '1px solid #1A2A42', borderRadius: 14, padding: 24, textAlign: 'center', marginBottom: 20 }}>
              <p style={{ color: '#5A7A9A', fontSize: 13, margin: 0 }}>No active challenges right now.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>

              {/* Joined challenges */}
              {joinedChallenges.map(cc => (
                <div key={cc.challenge.id} style={{ background: '#0D1728', border: '1px solid #1A2A42', borderRadius: 14, padding: '14px 16px' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
                    <div style={{ flex: 1, marginRight: 10 }}>
                      <p style={{ color: '#FFFFFF', fontSize: 14, fontWeight: 700, margin: '0 0 3px' }}>{cc.challenge.title}</p>
                      {cc.challenge.description && (
                        <p style={{ color: '#5A7A9A', fontSize: 12, margin: 0 }}>{cc.challenge.description}</p>
                      )}
                    </div>
                    <span style={{ background: '#0D2E5A', color: '#4A9EFF', fontSize: 11, borderRadius: 6, padding: '3px 8px', flexShrink: 0 }}>
                      {cc.daysRemaining}d left
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ color: '#4A9EFF', fontSize: 20, fontWeight: 700 }}>#{cc.userRank}</span>
                    <span style={{ color: '#5A7A9A', fontSize: 11 }}>of {cc.totalParticipants}</span>
                  </div>
                  {cc.userRank === 1 ? (
                    <p style={{ color: '#5A7A9A', fontSize: 12, margin: '6px 0 0' }}>You're leading! 🏆</p>
                  ) : cc.aboveName ? (
                    <p style={{ color: '#5A7A9A', fontSize: 12, margin: '6px 0 0' }}>
                      You're {ordinal(cc.userRank)}. {cc.aboveName} is {ordinal(cc.userRank - 1)}.
                    </p>
                  ) : null}
                </div>
              ))}

              {/* Available challenges */}
              {availableChallenges.map(cc => (
                <div key={cc.challenge.id} style={{ background: '#0D1728', border: '1px solid #1A2A42', borderRadius: 14, padding: '14px 16px' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
                    <div style={{ flex: 1, marginRight: 10 }}>
                      <p style={{ color: '#FFFFFF', fontSize: 14, fontWeight: 700, margin: '0 0 3px' }}>{cc.challenge.title}</p>
                      {cc.challenge.description && (
                        <p style={{ color: '#5A7A9A', fontSize: 12, margin: 0 }}>{cc.challenge.description}</p>
                      )}
                    </div>
                    <span style={{ background: '#0D2E5A', color: '#4A9EFF', fontSize: 11, borderRadius: 6, padding: '3px 8px', flexShrink: 0 }}>
                      {cc.daysRemaining}d left
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ color: '#5A7A9A', fontSize: 12 }}>
                      {cc.totalParticipants} participant{cc.totalParticipants !== 1 ? 's' : ''}
                    </span>
                    <button
                      onClick={() => handleJoin(cc.challenge.id)}
                      disabled={joiningId === cc.challenge.id}
                      style={{ background: 'none', border: 'none', color: '#4A9EFF', fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: 0 }}
                    >
                      {joiningId === cc.challenge.id ? 'Joining…' : 'Join →'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Friends leaderboard */}
          <SectionHeader title="Friends" />
          {!hasFriends ? (
            <div style={{ background: '#0D1728', border: '1px solid #1A2A42', borderRadius: 14, padding: 24, textAlign: 'center', marginBottom: 20 }}>
              <p style={{ color: '#5A7A9A', fontSize: 13, margin: 0 }}>Add friends on your profile to compete</p>
            </div>
          ) : (
            <div style={{ background: '#0D1728', border: '1px solid #1A2A42', borderRadius: 14, padding: '4px 14px', marginBottom: 20 }}>
              {friendsLeaderboard.map((row, idx) => {
                const isUser = row.userId === userId
                return (
                  <div
                    key={idx}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '12px 0',
                      borderBottom: idx < friendsLeaderboard.length - 1 ? '1px solid #1A2A42' : 'none',
                      background: isUser ? '#0D2E5A' : 'transparent',
                      borderRadius: isUser ? 8 : 0,
                      margin: isUser ? '2px -4px' : 0,
                      paddingLeft: isUser ? 8 : 0,
                      paddingRight: isUser ? 8 : 0,
                    }}
                  >
                    <span style={{ color: RANK_COLORS[row.rank] ?? '#5A7A9A', fontSize: 13, fontWeight: 700, width: 18, textAlign: 'center' }}>
                      {row.rank}
                    </span>
                    <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#1A2A42', border: isUser ? '1px solid #4A9EFF' : 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4A9EFF', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                      {row.initials}
                    </div>
                    <div style={{ flex: 1 }}>
                      <p style={{ color: isUser ? '#4A9EFF' : '#FFFFFF', fontSize: 13, fontWeight: 700, margin: 0 }}>{row.name}</p>
                      <p style={{ color: '#5A7A9A', fontSize: 11, margin: 0 }}>{row.subtitle}</p>
                    </div>
                    <span style={{ color: '#4A9EFF', fontSize: 14, fontWeight: 700 }}>{row.score}</span>
                  </div>
                )
              })}
            </div>
          )}

          {/* Groups leaderboard */}
          <SectionHeader title="Groups" onAction={() => navigate('/groups')} />
          {groupsLeaderboard.length === 0 ? (
            <div style={{ background: '#0D1728', border: '1px solid #1A2A42', borderRadius: 14, padding: 24, textAlign: 'center', marginBottom: 20 }}>
              <p style={{ color: '#5A7A9A', fontSize: 13, margin: 0 }}>No groups on the leaderboard yet.</p>
            </div>
          ) : (
            <div style={{ background: '#0D1728', border: '1px solid #1A2A42', borderRadius: 14, padding: '4px 14px', marginBottom: 20 }}>
              {groupsLeaderboard.map((row, idx) => {
                const isMyGroup = myGroupIds.has(row.groupId)
                return (
                  <div
                    key={idx}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '12px 0',
                      borderBottom: idx < groupsLeaderboard.length - 1 ? '1px solid #1A2A42' : 'none',
                      background: isMyGroup ? '#0D2E5A' : 'transparent',
                      borderRadius: isMyGroup ? 8 : 0,
                      margin: isMyGroup ? '2px -4px' : 0,
                      paddingLeft: isMyGroup ? 8 : 0,
                      paddingRight: isMyGroup ? 8 : 0,
                    }}
                  >
                    <span style={{ color: RANK_COLORS[row.rank] ?? '#5A7A9A', fontSize: 13, fontWeight: 700, width: 18, textAlign: 'center' }}>
                      {row.rank}
                    </span>
                    <div style={{ flex: 1 }}>
                      <p style={{ color: '#FFFFFF', fontSize: 13, fontWeight: 700, margin: 0 }}>{row.name}</p>
                      <p style={{ color: '#5A7A9A', fontSize: 11, margin: 0 }}>{row.category} · {row.memberCount} members</p>
                    </div>
                    <span style={{ color: '#4A9EFF', fontSize: 14, fontWeight: 700 }}>{row.avgScore}</span>
                  </div>
                )
              })}
            </div>
          )}

          {/* Campus leaderboard */}
          <SectionHeader title="Campus" />
          {campusLeaderboard.length < 3 ? (
            <div style={{ background: '#0D1728', border: '1px solid #1A2A42', borderRadius: 14, padding: 32, textAlign: 'center', marginBottom: 20 }}>
              <p style={{ color: '#5A7A9A', fontSize: 13, margin: 0 }}>Be the first on the leaderboard. Start training.</p>
            </div>
          ) : (
            <div style={{ background: '#0D1728', border: '1px solid #1A2A42', borderRadius: 14, padding: '4px 14px', marginBottom: 20 }}>
              {campusLeaderboard.map((row, idx) => {
                const isUser = row.userId === userId
                return (
                  <div
                    key={idx}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '12px 0',
                      borderBottom: idx < campusLeaderboard.length - 1 || pinnedRow ? '1px solid #1A2A42' : 'none',
                      background: isUser ? '#0D2E5A' : 'transparent',
                      borderRadius: isUser ? 8 : 0,
                      margin: isUser ? '2px -4px' : 0,
                      paddingLeft: isUser ? 8 : 0,
                      paddingRight: isUser ? 8 : 0,
                    }}
                  >
                    <span style={{ color: RANK_COLORS[row.rank] ?? '#5A7A9A', fontSize: 13, fontWeight: 700, width: 18, textAlign: 'center' }}>
                      {row.rank}
                    </span>
                    <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#1A2A42', border: isUser ? '1px solid #4A9EFF' : 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4A9EFF', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                      {row.initials}
                    </div>
                    <div style={{ flex: 1 }}>
                      <p style={{ color: isUser ? '#4A9EFF' : '#FFFFFF', fontSize: 13, fontWeight: 700, margin: 0 }}>{row.name}</p>
                      <p style={{ color: '#5A7A9A', fontSize: 11, margin: 0 }}>{row.subtitle}</p>
                    </div>
                    <span style={{ color: '#4A9EFF', fontSize: 14, fontWeight: 700 }}>{row.score}</span>
                  </div>
                )
              })}

              {/* Pinned row when user is outside top 10 */}
              {pinnedRow && !campusLeaderboard.some(r => r.userId === userId) && (
                <>
                  <div style={{ padding: '6px 0', textAlign: 'center', color: '#5A7A9A', fontSize: 11 }}>· · ·</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 8px', background: '#0D2E5A', borderRadius: 8, margin: '2px -4px' }}>
                    <span style={{ color: '#5A7A9A', fontSize: 13, fontWeight: 700, width: 18, textAlign: 'center' }}>
                      {pinnedRow.rank}
                    </span>
                    <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#1A2A42', border: '1px solid #4A9EFF', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4A9EFF', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                      {pinnedRow.initials}
                    </div>
                    <div style={{ flex: 1 }}>
                      <p style={{ color: '#4A9EFF', fontSize: 13, fontWeight: 700, margin: 0 }}>{pinnedRow.name}</p>
                      <p style={{ color: '#5A7A9A', fontSize: 11, margin: 0 }}>{pinnedRow.subtitle}</p>
                    </div>
                    <span style={{ color: '#4A9EFF', fontSize: 14, fontWeight: 700 }}>{pinnedRow.score}</span>
                  </div>
                </>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
