import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useTheme } from '../lib/theme'

// ── Types ─────────────────────────────────────────────────────────────────────

const CATEGORIES = ['Fraternity', 'Sorority', 'Club Sport', 'Club'] as const
type Category = typeof CATEGORIES[number]
type Tab = 'browse' | 'my-groups'

const CATEGORY_PLURAL: Record<Category, string> = {
  'Fraternity': 'Fraternities',
  'Sorority':   'Sororities',
  'Club Sport': 'Club Sports',
  'Club':       'Clubs',
}

interface Group {
  id: string
  name: string
  formal_name: string | null
  category: string
  member_count: number
}

interface GroupMember {
  id: string
  group_id: string
  user_id: string
  role: 'admin' | 'member'
  status: 'pending' | 'approved'
}

interface DetailMember {
  user_id: string
  name: string
  username: string
  score: number
}

interface MyMembership {
  membershipId: string
  group: Group
  role: 'admin' | 'member'
  avgScore: number
}

interface PendingRequest {
  membershipId: string
  user_id: string
  name: string
  username: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function initials(name: string): string {
  return name.split(' ').map(n => n[0] ?? '').filter(Boolean).join('').slice(0, 2).toUpperCase() || '?'
}

const RANK_COLORS: Record<number, string> = { 1: '#F5A623', 2: '#B0B8C4', 3: '#CD7F32' }

interface ThemeColors {
  bg: string; surface: string; surfaceHigh: string; border: string; borderSub: string
  text: string; textSub: string; textMuted: string; textFaint: string
  accent: string; accentBg: string; accentBorder: string; inputBg: string; isDark: boolean
}

function AdminBadge({ c }: { c: ThemeColors }) {
  return (
    <span style={{
      background: c.accentBg,
      color: c.accent,
      fontSize: 10,
      fontWeight: 700,
      borderRadius: 6,
      padding: '2px 7px',
      letterSpacing: '0.5px',
      flexShrink: 0,
    }}>
      ADMIN
    </span>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function Groups() {
  const navigate = useNavigate()
  const { colors: c } = useTheme()
  const [tab, setTab] = useState<Tab>('browse')
  const [userId, setUserId] = useState<string | null>(null)
  const [allGroups, setAllGroups] = useState<Group[]>([])
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  // Screen: null = main, set = overlay
  const [detailGroup, setDetailGroup] = useState<Group | null>(null)
  const [manageGroup, setManageGroup] = useState<Group | null>(null)

  // Detail screen
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailMembers, setDetailMembers] = useState<DetailMember[]>([])
  const [detailAvgScore, setDetailAvgScore] = useState(0)
  const [myMembership, setMyMembership] = useState<GroupMember | null>(null)
  const [joinLoading, setJoinLoading] = useState(false)

  // My groups tab
  const [myGroups, setMyGroups] = useState<MyMembership[]>([])
  const [myGroupsLoading, setMyGroupsLoading] = useState(false)

  // Manage screen
  const [pendingRequests, setPendingRequests] = useState<PendingRequest[]>([])
  const [manageLoading, setManageLoading] = useState(false)
  const [managingId, setManagingId] = useState<string | null>(null)

  // Leave group
  const [leaveConfirm, setLeaveConfirm] = useState<MyMembership | null>(null)
  const [leaveLoading, setLeaveLoading] = useState(false)

  // ── Init: get user + all groups ───────────────────────────────────────────

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setUserId(user.id)

      const { data } = await supabase
        .from('groups')
        .select('id, name, formal_name, category, member_count')
        .order('name')
      setAllGroups((data as Group[]) ?? [])
    }
    init()
  }, [])

  // ── Group detail ──────────────────────────────────────────────────────────

  const loadGroupDetail = useCallback(async (groupId: string, uid: string) => {
    setDetailLoading(true)
    try {
      const { data: myRow } = await supabase
        .from('group_members')
        .select('id, group_id, user_id, role, status')
        .eq('group_id', groupId)
        .eq('user_id', uid)
        .maybeSingle()
      setMyMembership(myRow as GroupMember | null)

      const { data: memberRows } = await supabase
        .from('group_members')
        .select('user_id')
        .eq('group_id', groupId)
        .eq('status', 'approved')

      const memberUserIds = (memberRows ?? []).map(m => m.user_id as string)
      if (memberUserIds.length === 0) {
        setDetailMembers([])
        setDetailAvgScore(0)
        return
      }

      const [scoresRes, profilesRes] = await Promise.all([
        supabase.from('user_scores').select('user_id, ascend_score').in('user_id', memberUserIds),
        supabase.from('users').select('id, name, username').in('id', memberUserIds),
      ])

      const scoreMap = new Map((scoresRes.data ?? []).map(s => [s.user_id, s.ascend_score as number]))
      const profileMap = new Map((profilesRes.data ?? []).map(p => [p.id, p as { id: string; name: string; username: string }]))

      const rows: DetailMember[] = memberUserIds
        .map(id => {
          const p = profileMap.get(id)
          return { user_id: id, name: p?.name ?? 'Unknown', username: p?.username ?? '', score: scoreMap.get(id) ?? 0 }
        })
        .sort((a, b) => b.score - a.score)

      setDetailMembers(rows)
      setDetailAvgScore(rows.length > 0 ? Math.round(rows.reduce((s, r) => s + r.score, 0) / rows.length) : 0)
    } finally {
      setDetailLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!detailGroup || !userId) return
    loadGroupDetail(detailGroup.id, userId)
  }, [detailGroup, userId, loadGroupDetail])

  // ── My groups ─────────────────────────────────────────────────────────────

  const loadMyGroups = useCallback(async (uid: string) => {
    setMyGroupsLoading(true)
    try {
      const { data: memberships } = await supabase
        .from('group_members')
        .select('id, group_id, role')
        .eq('user_id', uid)
        .eq('status', 'approved')

      if (!memberships || memberships.length === 0) { setMyGroups([]); return }

      const groupIds = memberships.map(m => m.group_id as string)

      const [groupsRes, allMemberRes] = await Promise.all([
        supabase.from('groups').select('id, name, formal_name, category, member_count').in('id', groupIds),
        supabase.from('group_members').select('group_id, user_id').in('group_id', groupIds).eq('status', 'approved'),
      ])

      const groupMap = new Map((groupsRes.data ?? []).map(g => [g.id, g as Group]))
      const allMemberRows = allMemberRes.data ?? []

      const allUserIds = [...new Set(allMemberRows.map(m => m.user_id as string))]
      const { data: allScores } = await supabase
        .from('user_scores').select('user_id, ascend_score').in('user_id', allUserIds)
      const scoreMap = new Map((allScores ?? []).map(s => [s.user_id, s.ascend_score as number]))

      const avgPerGroup = new Map<string, number>()
      for (const gid of groupIds) {
        const memberIds = allMemberRows.filter(m => m.group_id === gid).map(m => m.user_id as string)
        const scores = memberIds.map(id => scoreMap.get(id) ?? 0)
        avgPerGroup.set(gid, scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0)
      }

      setMyGroups(memberships.map(m => ({
        membershipId: m.id as string,
        group: groupMap.get(m.group_id) ?? { id: m.group_id, name: '', formal_name: null, category: '', member_count: 0 },
        role: m.role as 'admin' | 'member',
        avgScore: avgPerGroup.get(m.group_id) ?? 0,
      })))
    } finally {
      setMyGroupsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (tab === 'my-groups' && userId) loadMyGroups(userId)
  }, [tab, userId, loadMyGroups])

  // ── Manage screen ─────────────────────────────────────────────────────────

  const loadPendingRequests = useCallback(async (groupId: string) => {
    setManageLoading(true)
    try {
      const { data: pending } = await supabase
        .from('group_members')
        .select('id, user_id')
        .eq('group_id', groupId)
        .eq('status', 'pending')

      if (!pending || pending.length === 0) { setPendingRequests([]); return }

      const userIds = pending.map(p => p.user_id as string)
      const { data: profiles } = await supabase.from('users').select('id, name, username').in('id', userIds)
      const profileMap = new Map((profiles ?? []).map(p => [p.id, p as { id: string; name: string; username: string }]))

      setPendingRequests(pending.map(p => {
        const prof = profileMap.get(p.user_id)
        return { membershipId: p.id as string, user_id: p.user_id as string, name: prof?.name ?? 'Unknown', username: prof?.username ?? '' }
      }))
    } finally {
      setManageLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!manageGroup) return
    loadPendingRequests(manageGroup.id)
  }, [manageGroup, loadPendingRequests])

  // ── Actions ───────────────────────────────────────────────────────────────

  async function handleJoin() {
    if (!userId || !detailGroup || joinLoading) return
    setJoinLoading(true)
    try {
      const { count, error: countError } = await supabase
        .from('group_members')
        .select('id', { count: 'exact', head: true })
        .eq('group_id', detailGroup.id)
        .eq('status', 'approved')

      if (countError) throw countError
      const isFirst = count === 0
      const now = new Date().toISOString()

      const { error } = await supabase.from('group_members').insert({
        group_id: detailGroup.id,
        user_id: userId,
        role: isFirst ? 'admin' : 'member',
        status: isFirst ? 'approved' : 'pending',
        approved_at: isFirst ? now : null,
      })

      if (!error && isFirst) {
        const { data: gd } = await supabase.from('groups').select('member_count').eq('id', detailGroup.id).maybeSingle()
        const newCount = (gd?.member_count ?? 0) + 1
        await supabase.from('groups').update({ member_count: newCount }).eq('id', detailGroup.id)
        setDetailGroup(prev => prev ? { ...prev, member_count: newCount } : prev)
        setAllGroups(prev => prev.map(g => g.id === detailGroup.id ? { ...g, member_count: newCount } : g))
      }

      if (!error) await loadGroupDetail(detailGroup.id, userId)
    } finally {
      setJoinLoading(false)
    }
  }

  async function handleApprove(req: PendingRequest) {
    if (!manageGroup || managingId) return
    setManagingId(req.membershipId)
    try {
      await supabase.from('group_members')
        .update({ status: 'approved', approved_at: new Date().toISOString() })
        .eq('id', req.membershipId)

      const { data: gd } = await supabase.from('groups').select('member_count').eq('id', manageGroup.id).maybeSingle()
      const newCount = (gd?.member_count ?? 0) + 1
      await supabase.from('groups').update({ member_count: newCount }).eq('id', manageGroup.id)

      setPendingRequests(prev => prev.filter(r => r.membershipId !== req.membershipId))
      setMyGroups(prev => prev.map(m => m.group.id === manageGroup.id
        ? { ...m, group: { ...m.group, member_count: newCount } } : m))
      setAllGroups(prev => prev.map(g => g.id === manageGroup.id ? { ...g, member_count: newCount } : g))
    } finally {
      setManagingId(null)
    }
  }

  async function handleDeny(req: PendingRequest) {
    if (managingId) return
    setManagingId(req.membershipId)
    try {
      await supabase.from('group_members').delete().eq('id', req.membershipId)
      setPendingRequests(prev => prev.filter(r => r.membershipId !== req.membershipId))
    } finally {
      setManagingId(null)
    }
  }

  async function handleLeave(m: MyMembership) {
    if (!userId || leaveLoading) return
    setLeaveLoading(true)
    try {
      const groupId = m.group.id

      // If leaving user is admin, promote the earliest-joined remaining member
      if (m.role === 'admin') {
        const { data: nextMembers } = await supabase
          .from('group_members')
          .select('id')
          .eq('group_id', groupId)
          .eq('status', 'approved')
          .neq('user_id', userId)
          .order('approved_at', { ascending: true })
          .limit(1)
        if (nextMembers && nextMembers.length > 0) {
          await supabase.from('group_members').update({ role: 'admin' }).eq('id', nextMembers[0].id)
        }
      }

      // Delete own membership row
      await supabase.from('group_members').delete().eq('group_id', groupId).eq('user_id', userId)

      // Decrement member_count
      const { data: gd } = await supabase.from('groups').select('member_count').eq('id', groupId).maybeSingle()
      const newCount = Math.max(0, (gd?.member_count ?? 1) - 1)
      await supabase.from('groups').update({ member_count: newCount }).eq('id', groupId)

      setMyGroups(prev => prev.filter(mg => mg.membershipId !== m.membershipId))
      setAllGroups(prev => prev.map(g => g.id === groupId ? { ...g, member_count: newCount } : g))
      setLeaveConfirm(null)
    } finally {
      setLeaveLoading(false)
    }
  }

  // ── Derived ───────────────────────────────────────────────────────────────

  const categoryCounts = Object.fromEntries(
    CATEGORIES.map(cat => [cat, allGroups.filter(g => g.category === cat).length])
  )

  const filteredGroups = selectedCategory
    ? allGroups
        .filter(g => g.category === selectedCategory)
        .filter(g =>
          searchQuery === '' ||
          g.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (g.formal_name ?? '').toLowerCase().includes(searchQuery.toLowerCase())
        )
    : []

  // ── Manage screen ─────────────────────────────────────────────────────────

  if (manageGroup) {
    return (
      <div className="app-shell">
        <div className="app-content page-scroll" style={{ background: c.bg }}>
          <div style={{ padding: '52px 20px 0' }}>
            <button
              onClick={() => setManageGroup(null)}
              style={{ background: 'none', border: 'none', color: c.accent, fontSize: 13, cursor: 'pointer', padding: '0 0 16px', display: 'block' }}
            >
              ← Back
            </button>

            <p style={{ color: c.accent, fontSize: 11, letterSpacing: '2px', textTransform: 'uppercase', margin: '0 0 4px' }}>Admin</p>
            <h1 style={{ color: c.text, fontSize: 22, fontWeight: 700, margin: '0 0 4px' }}>{manageGroup.name}</h1>
            <p style={{ color: c.textSub, fontSize: 13, margin: '0 0 24px' }}>Pending join requests</p>

            {manageLoading ? (
              <p style={{ color: c.textSub, fontSize: 14 }}>Loading…</p>
            ) : pendingRequests.length === 0 ? (
              <div style={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 14, padding: 28, textAlign: 'center' }}>
                <p style={{ color: c.textSub, fontSize: 13, margin: 0 }}>No pending requests</p>
              </div>
            ) : (
              <div style={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 14, padding: '4px 16px' }}>
                {pendingRequests.map((req, i) => (
                  <div
                    key={req.membershipId}
                    style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: i < pendingRequests.length - 1 ? `1px solid ${c.border}` : 'none' }}
                  >
                    <div style={{ width: 36, height: 36, borderRadius: '50%', background: c.border, display: 'flex', alignItems: 'center', justifyContent: 'center', color: c.accent, fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
                      {initials(req.name)}
                    </div>
                    <div style={{ flex: 1 }}>
                      <p style={{ color: c.text, fontSize: 13, fontWeight: 600, margin: 0 }}>{req.name}</p>
                      <p style={{ color: c.textSub, fontSize: 11, margin: 0 }}>@{req.username}</p>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        onClick={() => handleApprove(req)}
                        disabled={managingId === req.membershipId}
                        style={{ background: c.accent, border: 'none', borderRadius: 8, padding: '6px 12px', color: '#FFF', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => handleDeny(req)}
                        disabled={managingId === req.membershipId}
                        style={{ background: 'transparent', border: `1px solid ${c.border}`, borderRadius: 8, padding: '6px 10px', color: c.textSub, fontSize: 12, cursor: 'pointer' }}
                      >
                        Deny
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ── Group detail screen ───────────────────────────────────────────────────

  if (detailGroup) {
    const memberStatus = myMembership?.status
    const memberRole = myMembership?.role

    return (
      <div className="app-shell">
        <div className="app-content page-scroll" style={{ background: c.bg }}>
          <div style={{ padding: '52px 20px 0' }}>
            <button
              onClick={() => { setDetailGroup(null); setMyMembership(null); setDetailMembers([]) }}
              style={{ background: 'none', border: 'none', color: c.accent, fontSize: 13, cursor: 'pointer', padding: '0 0 16px', display: 'block' }}
            >
              ← Back
            </button>

            <p style={{ color: c.textSub, fontSize: 11, letterSpacing: '2px', textTransform: 'uppercase', margin: '0 0 4px' }}>
              {detailGroup.category}
            </p>
            <h1 style={{ color: c.text, fontSize: 26, fontWeight: 700, margin: '0 0 4px' }}>{detailGroup.name}</h1>
            {detailGroup.formal_name && (
              <p style={{ color: c.textSub, fontSize: 13, margin: '0 0 20px' }}>{detailGroup.formal_name}</p>
            )}
            {!detailGroup.formal_name && <div style={{ marginBottom: 20 }} />}

            {/* Stats */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
              <div style={{ flex: 1, background: c.surface, border: `1px solid ${c.border}`, borderRadius: 14, padding: '12px 10px', textAlign: 'center' }}>
                <p style={{ color: c.textSub, fontSize: 9, letterSpacing: '1.2px', textTransform: 'uppercase', margin: '0 0 6px' }}>Members</p>
                <p style={{ color: c.text, fontSize: 22, fontWeight: 700, margin: 0 }}>{detailGroup.member_count}</p>
              </div>
              <div style={{ flex: 1, background: c.accentBg, border: `1px solid ${c.accentBorder}`, borderRadius: 14, padding: '12px 10px', textAlign: 'center' }}>
                <p style={{ color: c.textSub, fontSize: 9, letterSpacing: '1.2px', textTransform: 'uppercase', margin: '0 0 6px' }}>Avg Score</p>
                <p style={{ color: c.accent, fontSize: 22, fontWeight: 700, margin: 0 }}>
                  {detailLoading ? '…' : detailAvgScore || '—'}
                </p>
              </div>
            </div>

            {/* Join / Pending / Member */}
            <div style={{ marginBottom: 24 }}>
              {!myMembership ? (
                <button
                  onClick={handleJoin}
                  disabled={joinLoading}
                  style={{ width: '100%', background: joinLoading ? c.border : c.accent, color: '#FFF', fontSize: 16, fontWeight: 700, borderRadius: 14, padding: '16px', border: 'none', cursor: joinLoading ? 'not-allowed' : 'pointer' }}
                >
                  {joinLoading ? 'Requesting…' : 'Request to Join'}
                </button>
              ) : memberStatus === 'pending' ? (
                <div style={{ width: '100%', background: c.surface, border: `1px solid ${c.border}`, borderRadius: 14, padding: '16px', textAlign: 'center' }}>
                  <span style={{ color: c.textSub, fontSize: 16, fontWeight: 600 }}>Request Pending</span>
                </div>
              ) : (
                <div style={{ width: '100%', background: c.accentBg, border: `1px solid ${c.accentBorder}`, borderRadius: 14, padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ color: '#10B981', fontSize: 16, fontWeight: 700 }}>Member ✓</span>
                  {memberRole === 'admin' && <AdminBadge c={c} />}
                </div>
              )}
            </div>

            {/* Member leaderboard */}
            <p style={{ color: c.textSub, fontSize: 10, letterSpacing: '1.5px', textTransform: 'uppercase', margin: '0 0 10px' }}>
              Member Leaderboard
            </p>
            {detailLoading ? (
              <div style={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 14, padding: 28, textAlign: 'center' }}>
                <p style={{ color: c.textSub, fontSize: 13, margin: 0 }}>Loading…</p>
              </div>
            ) : detailMembers.length === 0 ? (
              <div style={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 14, padding: 28, textAlign: 'center' }}>
                <p style={{ color: c.textSub, fontSize: 13, margin: 0 }}>No members yet. Be the first to join.</p>
              </div>
            ) : (
              <div style={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 14, padding: '4px 14px' }}>
                {detailMembers.map((member, i) => {
                  const isMe = member.user_id === userId
                  return (
                    <div
                      key={member.user_id}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0',
                        borderBottom: i < detailMembers.length - 1 ? `1px solid ${c.border}` : 'none',
                      }}
                    >
                      <span style={{ color: RANK_COLORS[i + 1] ?? c.textSub, fontSize: 13, fontWeight: 700, width: 18, textAlign: 'center' }}>
                        {i + 1}
                      </span>
                      <div style={{ width: 32, height: 32, borderRadius: '50%', background: c.border, border: isMe ? `1px solid ${c.accent}` : 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', color: c.accent, fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                        {initials(member.name)}
                      </div>
                      <div style={{ flex: 1 }}>
                        <p style={{ color: isMe ? c.accent : c.text, fontSize: 13, fontWeight: 700, margin: 0 }}>{member.name}</p>
                        <p style={{ color: c.textSub, fontSize: 11, margin: 0 }}>@{member.username}</p>
                      </div>
                      <span style={{ color: c.accent, fontSize: 14, fontWeight: 700 }}>{member.score}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ── Main screen ───────────────────────────────────────────────────────────

  return (
    <div className="app-shell">
      <div className="app-content page-scroll" style={{ background: c.bg }}>
        <div style={{ padding: '52px 20px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
            <h1 style={{ color: c.text, fontSize: 24, fontWeight: 700, margin: 0 }}>Groups</h1>
            <button
              onClick={() => navigate('/compete')}
              style={{ background: 'none', border: 'none', color: c.accent, fontSize: 13, cursor: 'pointer', padding: 0 }}
            >
              ← Compete
            </button>
          </div>

          {/* Tab toggle */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 20, background: c.surface, borderRadius: 10, padding: 4 }}>
            {(['browse', 'my-groups'] as const).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  flex: 1, background: tab === t ? c.accent : 'transparent', border: 'none',
                  borderRadius: 8, padding: '8px 0', color: tab === t ? '#FFFFFF' : c.textSub,
                  fontSize: 13, fontWeight: tab === t ? 700 : 400, cursor: 'pointer', transition: 'all 0.15s',
                }}
              >
                {t === 'browse' ? 'Browse' : 'My Groups'}
              </button>
            ))}
          </div>

          {/* ── Browse ── */}
          {tab === 'browse' && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 20 }}>
                {CATEGORIES.map(cat => {
                  const selected = selectedCategory === cat
                  return (
                    <button
                      key={cat}
                      onClick={() => { setSelectedCategory(selected ? null : cat); setSearchQuery('') }}
                      style={{
                        background: selected ? c.accentBg : c.surface,
                        border: `1px solid ${selected ? c.accent : c.border}`,
                        borderRadius: 14, padding: '14px 12px', textAlign: 'left',
                        cursor: 'pointer', transition: 'border-color 0.15s',
                      }}
                    >
                      <p style={{ color: c.text, fontSize: 13, fontWeight: 700, margin: '0 0 4px' }}>{cat}</p>
                      <p style={{ color: c.textSub, fontSize: 11, margin: 0 }}>{categoryCounts[cat] ?? 0} groups</p>
                    </button>
                  )
                })}
              </div>

              {selectedCategory && (
                <>
                  <input
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder={`Search ${CATEGORY_PLURAL[selectedCategory].toLowerCase()}…`}
                    style={{ width: '100%', background: c.inputBg, border: `1px solid ${c.border}`, borderRadius: 12, padding: '12px 16px', color: c.text, fontSize: 14, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box', marginBottom: 10 }}
                  />
                  {filteredGroups.length === 0 ? (
                    <p style={{ color: c.textSub, fontSize: 13, textAlign: 'center', padding: '20px 0' }}>No results</p>
                  ) : (
                    <div style={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 14, padding: '4px 16px' }}>
                      {filteredGroups.map((group, i) => (
                        <button
                          key={group.id}
                          onClick={() => setDetailGroup(group)}
                          style={{
                            width: '100%', display: 'flex', alignItems: 'center', gap: 12,
                            padding: '12px 0', background: 'none', border: 'none',
                            borderBottom: i < filteredGroups.length - 1 ? `1px solid ${c.border}` : 'none',
                            cursor: 'pointer', textAlign: 'left',
                          }}
                        >
                          <div style={{ flex: 1 }}>
                            <p style={{ color: c.text, fontSize: 14, fontWeight: 700, margin: 0 }}>{group.name}</p>
                            {group.formal_name && (
                              <p style={{ color: c.textSub, fontSize: 11, margin: '2px 0 0' }}>{group.formal_name}</p>
                            )}
                          </div>
                          <span style={{ color: c.textSub, fontSize: 12, flexShrink: 0 }}>{group.member_count} members</span>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {/* ── My Groups ── */}
          {tab === 'my-groups' && (
            <>
              {myGroupsLoading ? (
                <p style={{ color: c.textSub, fontSize: 14 }}>Loading…</p>
              ) : myGroups.length === 0 ? (
                <div style={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 14, padding: 28, textAlign: 'center' }}>
                  <p style={{ color: c.textSub, fontSize: 13, margin: '0 0 10px' }}>You haven't joined any groups yet.</p>
                  <button
                    onClick={() => setTab('browse')}
                    style={{ background: 'none', border: 'none', color: c.accent, fontSize: 13, cursor: 'pointer', padding: 0 }}
                  >
                    Browse groups →
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {myGroups.map(m => (
                    <div
                      key={m.membershipId}
                      style={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 14, padding: '14px 16px' }}
                    >
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                            <span style={{ color: c.text, fontSize: 15, fontWeight: 700 }}>{m.group.name}</span>
                            {m.role === 'admin' && <AdminBadge c={c} />}
                          </div>
                          <span style={{ color: c.textSub, fontSize: 11 }}>{m.group.category}</span>
                        </div>
                        {m.role === 'admin' && (
                          <button
                            onClick={() => setManageGroup(m.group)}
                            style={{ background: c.accentBg, border: `1px solid ${c.accentBorder}`, borderRadius: 8, padding: '5px 12px', color: c.accent, fontSize: 12, fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}
                          >
                            Manage
                          </button>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <div style={{ flex: 1, background: c.bg, borderRadius: 10, padding: '8px 10px', textAlign: 'center' }}>
                          <p style={{ color: c.textSub, fontSize: 9, letterSpacing: '1px', textTransform: 'uppercase', margin: '0 0 3px' }}>Members</p>
                          <p style={{ color: c.text, fontSize: 16, fontWeight: 700, margin: 0 }}>{m.group.member_count}</p>
                        </div>
                        <div style={{ flex: 1, background: c.bg, borderRadius: 10, padding: '8px 10px', textAlign: 'center' }}>
                          <p style={{ color: c.textSub, fontSize: 9, letterSpacing: '1px', textTransform: 'uppercase', margin: '0 0 3px' }}>Avg Score</p>
                          <p style={{ color: c.accent, fontSize: 16, fontWeight: 700, margin: 0 }}>{m.avgScore || '—'}</p>
                        </div>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
                        <button
                          onClick={() => setLeaveConfirm(m)}
                          style={{ background: 'none', border: 'none', color: c.textSub, fontSize: 12, cursor: 'pointer', padding: 0 }}
                        >
                          Leave group
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Leave group confirmation modal */}
      {leaveConfirm && (
        <div style={{ position: 'fixed', inset: 0, background: c.isDark ? 'rgba(8,14,28,0.85)' : 'rgba(0,0,0,0.4)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 24px' }}>
          <div style={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 16, padding: '24px 20px', width: '100%', maxWidth: 342 }}>
            <p style={{ color: c.text, fontSize: 16, fontWeight: 700, margin: '0 0 10px' }}>
              Leave {leaveConfirm.group.name}?
            </p>
            <p style={{ color: c.textSub, fontSize: 13, margin: '0 0 22px', lineHeight: 1.5 }}>
              Are you sure you want to leave {leaveConfirm.group.name}? This cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => setLeaveConfirm(null)}
                disabled={leaveLoading}
                style={{ flex: 1, background: 'transparent', border: `1px solid ${c.border}`, borderRadius: 12, padding: '12px', color: c.textSub, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={() => handleLeave(leaveConfirm)}
                disabled={leaveLoading}
                style={{ flex: 1, background: '#FF6B6B', border: 'none', borderRadius: 12, padding: '12px', color: '#FFFFFF', fontSize: 14, fontWeight: 700, cursor: leaveLoading ? 'not-allowed' : 'pointer' }}
              >
                {leaveLoading ? 'Leaving…' : 'Leave'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
