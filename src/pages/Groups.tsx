import { useEffect, useState, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useTheme } from '../lib/theme'
import { getRankInfo } from '../lib/scoring'
import RankBadge from '../components/RankBadge'

// ── Notifications (shared with Compete) ───────────────────────────────────────

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

// ── Types ─────────────────────────────────────────────────────────────────────

type Tab = 'browse' | 'my-groups'

const BROWSE_TABS = ['Club', 'Club Sport', 'Frat', 'Sorority', 'Other'] as const
type BrowseTab = typeof BROWSE_TABS[number]

const KNOWN_CATEGORIES = new Set(['Club', 'Club Sport', 'Fraternity', 'Sorority'])
function matchesBrowseTab(category: string, tab: BrowseTab): boolean {
  if (tab === 'Frat') return category === 'Fraternity'
  if (tab === 'Other') return !KNOWN_CATEGORIES.has(category)
  return category === tab
}

interface Group {
  id: string
  name: string
  formal_name: string | null
  category: string
  member_count: number
  avatar_url: string | null
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
  avatar_url: string | null
  score: number
  streak: number
}

interface MemberPreview {
  userId: string
  name: string
  avatarUrl: string | null
}

interface MyMembership {
  membershipId: string
  group: Group
  role: 'admin' | 'member'
  avgScore: number
  activeCount: number
  campusRank: number
  memberAvatars: MemberPreview[]
}

interface GroupWithStats {
  group: Group
  avgScore: number
  activeCount: number
  campusRank: number
  memberAvatars: MemberPreview[]
  myStatus: 'admin' | 'member' | 'pending' | 'none'
}

interface GroupActivityItem {
  id: string
  userId: string
  userName: string
  avatarUrl: string | null
  title: string
  subtitle: string | null
  createdAt: string
}

interface ManageMember {
  membershipId: string
  userId: string
  name: string
  username: string
  avatarUrl: string | null
  role: 'admin' | 'member'
  score: number
  streak: number
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

function groupInitials(name: string) {
  return name.split(' ').map(n => n[0] ?? '').filter(Boolean).join('').slice(0, 2).toUpperCase() || '?'
}

// ── Square crop modal for group avatars ──────────────────────────────────────

const GROUP_CROP_SIZE = 280

function GroupCropModal({ src, onDone, onCancel, c }: {
  src: string
  onDone: (blob: Blob) => void
  onCancel: () => void
  c: ThemeColors
}) {
  const [zoom, setZoom] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [imgDims, setImgDims] = useState<{ coverW: number; coverH: number } | null>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const dragRef = useRef<{ startX: number; startY: number; offX: number; offY: number } | null>(null)
  const pinchRef = useRef<number | null>(null)

  function onImgLoad() {
    const img = imgRef.current
    if (!img) return
    const s = Math.max(GROUP_CROP_SIZE / img.naturalWidth, GROUP_CROP_SIZE / img.naturalHeight)
    setImgDims({ coverW: img.naturalWidth * s, coverH: img.naturalHeight * s })
  }
  function dragStart(x: number, y: number) {
    dragRef.current = { startX: x, startY: y, offX: offset.x, offY: offset.y }
  }
  function dragMove(x: number, y: number) {
    if (!dragRef.current) return
    setOffset({
      x: dragRef.current.offX + (x - dragRef.current.startX),
      y: dragRef.current.offY + (y - dragRef.current.startY),
    })
  }
  function dragEnd() { dragRef.current = null }

  function onTouchStart(e: React.TouchEvent) {
    if (e.touches.length === 1) {
      dragStart(e.touches[0].clientX, e.touches[0].clientY)
    } else if (e.touches.length === 2) {
      dragRef.current = null
      const dx = e.touches[0].clientX - e.touches[1].clientX
      const dy = e.touches[0].clientY - e.touches[1].clientY
      pinchRef.current = Math.sqrt(dx * dx + dy * dy)
    }
  }
  function onTouchMove(e: React.TouchEvent) {
    e.preventDefault()
    if (e.touches.length === 1) {
      dragMove(e.touches[0].clientX, e.touches[0].clientY)
    } else if (e.touches.length === 2 && pinchRef.current !== null) {
      const dx = e.touches[0].clientX - e.touches[1].clientX
      const dy = e.touches[0].clientY - e.touches[1].clientY
      const dist = Math.sqrt(dx * dx + dy * dy)
      setZoom(prev => Math.max(0.5, Math.min(4, prev * (dist / pinchRef.current!))))
      pinchRef.current = dist
    }
  }
  function onTouchEnd() { dragEnd(); pinchRef.current = null }

  function cropAndReturn() {
    const img = imgRef.current
    const canvas = canvasRef.current
    if (!img || !canvas || !imgDims) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    canvas.width = GROUP_CROP_SIZE
    canvas.height = GROUP_CROP_SIZE
    const dw = imgDims.coverW * zoom
    const dh = imgDims.coverH * zoom
    ctx.drawImage(img, GROUP_CROP_SIZE / 2 + offset.x - dw / 2, GROUP_CROP_SIZE / 2 + offset.y - dh / 2, dw, dh)
    canvas.toBlob(blob => { if (blob) onDone(blob) }, 'image/jpeg', 0.9)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', zIndex: 9999, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <p style={{ color: '#FFFFFF', fontSize: 16, fontWeight: 700, margin: '0 0 20px' }}>Move & Scale</p>
      <div
        style={{
          width: GROUP_CROP_SIZE, height: GROUP_CROP_SIZE, borderRadius: 24,
          overflow: 'hidden', border: `2px solid ${c.accent}`,
          position: 'relative', flexShrink: 0, cursor: 'grab', touchAction: 'none',
        }}
        onMouseDown={e => { e.preventDefault(); dragStart(e.clientX, e.clientY) }}
        onMouseMove={e => dragMove(e.clientX, e.clientY)}
        onMouseUp={dragEnd}
        onMouseLeave={dragEnd}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <img
          ref={imgRef}
          src={src}
          onLoad={onImgLoad}
          draggable={false}
          alt=""
          style={{
            position: 'absolute', top: '50%', left: '50%',
            transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px)) scale(${zoom})`,
            transformOrigin: 'center center',
            ...(imgDims
              ? { width: imgDims.coverW, height: imgDims.coverH }
              : { minWidth: '100%', minHeight: '100%', width: 'auto', height: 'auto' }),
            maxWidth: 'none', pointerEvents: 'none', userSelect: 'none', display: 'block',
          }}
        />
      </div>
      <div style={{ width: GROUP_CROP_SIZE, marginTop: 16, marginBottom: 4 }}>
        <input
          type="range" min={50} max={300} step={1}
          value={Math.round(zoom * 100)}
          onChange={e => setZoom(parseInt(e.target.value) / 100)}
          style={{ width: '100%', accentColor: c.accent }}
        />
        <p style={{ color: c.textSub, fontSize: 11, textAlign: 'center', margin: '4px 0 16px' }}>
          Pinch or drag to adjust · slide to zoom
        </p>
      </div>
      <div style={{ display: 'flex', gap: 10, width: GROUP_CROP_SIZE }}>
        <button onClick={onCancel} style={{ flex: 1, background: 'transparent', border: `1px solid ${c.border}`, borderRadius: 12, padding: '12px', color: c.textSub, fontSize: 14, cursor: 'pointer' }}>
          Cancel
        </button>
        <button onClick={cropAndReturn} disabled={!imgDims} style={{ flex: 2, background: c.accent, border: 'none', borderRadius: 12, padding: '12px', color: '#FFFFFF', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
          Use Photo
        </button>
      </div>
      <canvas ref={canvasRef} style={{ display: 'none' }} />
    </div>
  )
}

function groupActivityTimeAgo(iso: string) {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

function VerifiedCheck() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }} aria-label="Verified">
      <path
        fill="#0095F6"
        d="M22.5,12.5c0-1.58-0.875-2.95-2.148-3.6c0.154-0.435,0.238-0.905,0.238-1.4c0-2.21-1.71-3.998-3.818-3.998 c-0.47,0-0.92,0.084-1.336,0.25C14.818,2.415,13.51,1.5,12,1.5c-1.51,0-2.818,0.915-3.436,2.252c-0.416-0.166-0.866-0.25-1.336-0.25 c-2.108,0-3.818,1.788-3.818,3.998c0,0.495,0.084,0.965,0.238,1.4C2.375,9.55,1.5,10.92,1.5,12.5s0.875,2.95,2.148,3.6 c-0.154,0.435-0.238,0.905-0.238,1.4c0,2.21,1.71,3.998,3.818,3.998c0.47,0,0.92-0.084,1.336-0.25c0.618,1.337,1.926,2.252,3.436,2.252 c1.51,0,2.818-0.915,3.436-2.252c0.416,0.166,0.866,0.25,1.336,0.25c2.108,0,3.818-1.788,3.818-3.998c0-0.495-0.084-0.965-0.238-1.4 C21.625,15.45,22.5,14.08,22.5,12.5z"
      />
      <polygon
        fill="#FFFFFF"
        points="15.226,9 16.5,10.349 10.5,16.5 6.5,12.349 7.774,11 10.5,13.802"
      />
    </svg>
  )
}

type CardStatus = 'admin' | 'member' | 'pending' | 'none'

function CompactGroupCard({
  group, avgScore, activeCount, campusRank, memberAvatars,
  status, onOpen, onManage, onJoin, joining, c,
}: {
  group: Group
  avgScore: number
  activeCount: number
  campusRank: number
  memberAvatars: MemberPreview[]
  status: CardStatus
  onOpen: () => void
  onManage?: () => void
  onJoin?: () => void
  joining?: boolean
  c: ThemeColors
}) {
  const rank = getRankInfo(avgScore)
  const extraMembers = Math.max(0, group.member_count - memberAvatars.length)
  const roleLabel = status === 'admin' ? 'ADMIN' : status === 'member' ? 'MEMBER' : null
  return (
    <div
      onClick={onOpen}
      style={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 14, padding: '14px 16px', cursor: 'pointer', position: 'relative' }}
    >
      {/* ── Top row: avatar + identity, role label / action button on the right ── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
        <div style={{ position: 'relative', width: 72, height: 72, borderRadius: 14, background: c.border, display: 'flex', alignItems: 'center', justifyContent: 'center', color: c.accent, fontSize: 22, fontWeight: 700, flexShrink: 0, overflow: 'hidden', marginTop: 4 }}>
          <span>{groupInitials(group.name)}</span>
          {group.avatar_url && (
            <img
              src={group.avatar_url}
              alt={group.name}
              onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
            />
          )}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ color: c.text, fontSize: 15, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{group.name}</span>
            <VerifiedCheck />
          </div>
          {/* Rank badge + campus rank, in grey */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
            <RankBadge tier={rank.tier} size={16} accentColor={c.accent} />
            <span style={{ color: c.textSub, fontSize: 11 }}>
              {campusRank > 0 ? `#${campusRank} Campus Group` : 'Unranked'}
            </span>
          </div>
          <p style={{ color: c.textSub, fontSize: 12, margin: '2px 0 0' }}>
            {group.member_count} {group.member_count === 1 ? 'member' : 'members'} · {activeCount} active
          </p>

          {/* Mini member avatars — aligned with the member count above */}
          {memberAvatars.length > 0 && (
            <div
              onClick={e => { e.stopPropagation(); onOpen() }}
              style={{ display: 'flex', alignItems: 'center', marginTop: 6, cursor: 'pointer' }}
            >
              {memberAvatars.map((mem, i) => (
                <div
                  key={mem.userId}
                  title={mem.name}
                  style={{ width: 22, height: 22, borderRadius: '50%', background: c.border, border: `1.5px solid ${c.surface}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: c.accent, fontSize: 9, fontWeight: 700, overflow: 'hidden', marginLeft: i === 0 ? 0 : -6, flexShrink: 0 }}
                >
                  {mem.avatarUrl
                    ? <img src={mem.avatarUrl} alt={mem.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : initials(mem.name)}
                </div>
              ))}
              {extraMembers > 0 && (
                <span style={{ color: c.textSub, fontSize: 11, fontWeight: 600, marginLeft: 8 }}>
                  +{extraMembers}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Role label pinned to the top-right (admin/member/pending only) */}
        {roleLabel && (
          <span style={{ color: c.textSub, fontSize: 10, fontWeight: 700, letterSpacing: '1px', flexShrink: 0 }}>
            {roleLabel}
          </span>
        )}
      </div>

      {/* Action button — vertically centered on the card's right edge */}
      {status === 'admin' && onManage && (
        <button
          onClick={e => { e.stopPropagation(); onManage() }}
          style={{ position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)', background: c.accentBg, border: `1px solid ${c.accentBorder}`, borderRadius: 8, padding: '5px 11px', color: c.accent, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
        >
          Manage
        </button>
      )}
      {(status === 'none' || status === 'pending') && onJoin && (
        <button
          onClick={e => { e.stopPropagation(); onJoin() }}
          disabled={joining}
          style={{
            position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)',
            background: status === 'pending' ? 'transparent' : c.accent,
            border: status === 'pending' ? `1px solid ${c.border}` : 'none',
            borderRadius: 8, padding: '6px 14px',
            color: status === 'pending' ? c.textSub : '#FFF',
            fontSize: 12, fontWeight: 700,
            cursor: joining ? 'not-allowed' : 'pointer',
            opacity: joining ? 0.7 : 1,
          }}
        >
          {joining ? '…' : status === 'pending' ? 'Requested' : (group.member_count === 0 ? 'Join' : 'Request')}
        </button>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function Groups() {
  const navigate = useNavigate()
  const { colors: c, toggleTheme } = useTheme()
  const [notifications, setNotifications] = useState<AppNotification[]>(() => loadNotifs())
  const [showNotifDropdown, setShowNotifDropdown] = useState(false)
  const [notifPos, setNotifPos] = useState({ top: 0, right: 0 })
  const notifBtnRef = useRef<HTMLButtonElement>(null)
  const openNotifDropdown = () => {
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
  const hasUnread = notifications.some(n => !n.read)
  const [tab, setTab] = useState<Tab>('my-groups')
  const [userId, setUserId] = useState<string | null>(null)
  const [selectedBrowseTab, setSelectedBrowseTab] = useState<BrowseTab>('Club')
  const [searchQuery, setSearchQuery] = useState('')

  // Translate vertical mouse-wheel ticks into horizontal scroll on the browse-by-category row.
  // Touch swipe and trackpad gestures already work natively; this only kicks in for mouse wheels.
  const browseScrollRef = useCallback((el: HTMLDivElement | null) => {
    if (!el) return
    const handler = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return  // already a horizontal gesture
      e.preventDefault()
      el.scrollLeft += e.deltaY
    }
    el.addEventListener('wheel', handler, { passive: false })
  }, [])

  // Screen: null = main, set = overlay
  const [detailGroup, setDetailGroup] = useState<Group | null>(null)
  const [manageGroup, setManageGroup] = useState<Group | null>(null)

  // Detail screen
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailMembers, setDetailMembers] = useState<DetailMember[]>([])
  const [detailAvgScore, setDetailAvgScore] = useState(0)
  const [detailAvgStreak, setDetailAvgStreak] = useState(0)
  const [myMembership, setMyMembership] = useState<GroupMember | null>(null)
  const [joinLoading, setJoinLoading] = useState(false)

  // My groups tab
  const [myGroups, setMyGroups] = useState<MyMembership[]>([])
  const [myGroupsLoading, setMyGroupsLoading] = useState(false)

  // Manage screen
  const [pendingRequests, setPendingRequests] = useState<PendingRequest[]>([])
  const [manageLoading, setManageLoading] = useState(false)
  const [managingId, setManagingId] = useState<string | null>(null)
  const [manageMembers, setManageMembers] = useState<ManageMember[]>([])
  const [avatarUploading, setAvatarUploading] = useState(false)
  const [avatarError, setAvatarError] = useState<string | null>(null)
  const [cropSrc, setCropSrc] = useState<string | null>(null)
  const groupAvatarInputRef = useRef<HTMLInputElement>(null)

  // Leave group
  const [leaveConfirm, setLeaveConfirm] = useState<MyMembership | null>(null)
  const [leaveLoading, setLeaveLoading] = useState(false)
  const [showAllMyGroups, setShowAllMyGroups] = useState(false)
  const [adminPending, setAdminPending] = useState<{ groupId: string; count: number }[]>([])
  const [groupActivity, setGroupActivity] = useState<GroupActivityItem[]>([])
  const [groupActivityLoading, setGroupActivityLoading] = useState(false)

  // Discover / Top Groups
  const [discoverGroups, setDiscoverGroups] = useState<GroupWithStats[]>([])
  const [discoverLoading, setDiscoverLoading] = useState(false)
  const [showAllTopGroups, setShowAllTopGroups] = useState(false)
  const [joiningGroupId, setJoiningGroupId] = useState<string | null>(null)

  // ── Init: get user + all groups ───────────────────────────────────────────

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) setUserId(user.id)
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
        setDetailAvgStreak(0)
        return
      }

      const [scoresRes, profilesRes] = await Promise.all([
        supabase.from('user_scores').select('user_id, ascend_score, streak_days').in('user_id', memberUserIds),
        supabase.from('users').select('id, name, username, avatar_url').in('id', memberUserIds),
      ])

      const scoreMap = new Map((scoresRes.data ?? []).map(s => [s.user_id, s.ascend_score as number]))
      const streakMap = new Map((scoresRes.data ?? []).map(s => [s.user_id, (s.streak_days as number | null) ?? 0]))
      const profileMap = new Map((profilesRes.data ?? []).map(p => [p.id, p as { id: string; name: string; username: string; avatar_url: string | null }]))

      const rows: DetailMember[] = memberUserIds
        .map(id => {
          const p = profileMap.get(id)
          return {
            user_id: id,
            name: p?.name ?? 'Unknown',
            username: p?.username ?? '',
            avatar_url: p?.avatar_url ?? null,
            score: scoreMap.get(id) ?? 0,
            streak: streakMap.get(id) ?? 0,
          }
        })
        .sort((a, b) => b.score - a.score)

      setDetailMembers(rows)
      setDetailAvgScore(rows.length > 0 ? Math.round(rows.reduce((s, r) => s + r.score, 0) / rows.length) : 0)
      setDetailAvgStreak(rows.length > 0 ? Math.round(rows.reduce((s, r) => s + r.streak, 0) / rows.length) : 0)
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

      // Fetch ALL campus groups and ALL approved memberships so we can compute
      // each group's campus rank (by avg ascend score across its members).
      const [groupsResFirst, allCampusMembersRes] = await Promise.all([
        supabase.from('groups').select('id, name, formal_name, category, member_count, avatar_url'),
        supabase.from('group_members').select('group_id, user_id').eq('status', 'approved'),
      ])
      let groupsResData: unknown[] | null = groupsResFirst.data
      if (groupsResFirst.error) {
        const fallback = await supabase.from('groups').select('id, name, formal_name, category, member_count')
        groupsResData = (fallback.data ?? []).map(g => ({ ...g, avatar_url: null }))
      }
      const groupMap = new Map(((groupsResData ?? []) as Group[]).map(g => [g.id, g]))
      const allCampusMemberRows = allCampusMembersRes.data ?? []
      const myGroupSet = new Set(groupIds)
      const allMemberRows = allCampusMemberRows.filter(m => myGroupSet.has(m.group_id as string))

      const allCampusUserIds = [...new Set(allCampusMemberRows.map(m => m.user_id as string))]
      const myGroupUserIds = [...new Set(allMemberRows.map(m => m.user_id as string))]
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
      const [scoresRes, profilesRes, checkinRes, recentWorkoutsRes] = await Promise.all([
        allCampusUserIds.length > 0
          ? supabase.from('user_scores').select('user_id, ascend_score').in('user_id', allCampusUserIds)
          : Promise.resolve({ data: [] }),
        myGroupUserIds.length > 0
          ? supabase.from('users').select('id, name, avatar_url').in('id', myGroupUserIds)
          : Promise.resolve({ data: [] }),
        myGroupUserIds.length > 0
          ? supabase.from('users').select('id').in('id', myGroupUserIds).gte('gym_checkin_at', twoHoursAgo)
          : Promise.resolve({ data: [] }),
        myGroupUserIds.length > 0
          ? supabase.from('workouts').select('user_id').in('user_id', myGroupUserIds).eq('completed', true).gte('workout_date', weekAgo)
          : Promise.resolve({ data: [] }),
      ])
      const scoreMap = new Map((scoresRes.data ?? []).map(s => [s.user_id as string, s.ascend_score as number]))
      const profileMap = new Map(
        (profilesRes.data ?? []).map(p => [p.id as string, p as { id: string; name: string; avatar_url: string | null }])
      )
      const activeSet = new Set<string>([
        ...(checkinRes.data ?? []).map(u => u.id as string),
        ...(recentWorkoutsRes.data ?? []).map(w => w.user_id as string),
        uid,  // current user counts as active — they're on the app
      ])

      // Per-group rollups for ALL campus groups (needed for campus rank)
      const avgPerGroup = new Map<string, number>()
      const memberIdsPerGroup = new Map<string, string[]>()
      for (const g of (groupsResData ?? []) as Group[]) {
        const ids = allCampusMemberRows.filter(m => m.group_id === g.id).map(m => m.user_id as string)
        memberIdsPerGroup.set(g.id, ids)
        const scores = ids.map(id => scoreMap.get(id) ?? 0)
        avgPerGroup.set(g.id, scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0)
      }

      // Campus rank: groups ordered by avg score desc (ties broken by id for stability).
      // Groups with no members are still ranked but at the bottom.
      const campusRankMap = new Map<string, number>(
        [...avgPerGroup.entries()]
          .sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0]))
          .map(([gid], i) => [gid, i + 1])
      )

      setMyGroups(memberships.map(m => {
        const gid = m.group_id as string
        const base = groupMap.get(gid) ?? { id: gid, name: '', formal_name: null, category: '', member_count: 0, avatar_url: null }
        const memberIds = memberIdsPerGroup.get(gid) ?? []
        // Top 5 members by score for the avatar preview
        const memberAvatars: MemberPreview[] = memberIds
          .map(id => ({ id, score: scoreMap.get(id) ?? 0, prof: profileMap.get(id) }))
          .sort((a, b) => b.score - a.score)
          .slice(0, 5)
          .map(x => ({ userId: x.id, name: x.prof?.name ?? '', avatarUrl: x.prof?.avatar_url ?? null }))
        return {
          membershipId: m.id as string,
          group: { ...base, member_count: memberIds.length },
          role: m.role as 'admin' | 'member',
          avgScore: avgPerGroup.get(gid) ?? 0,
          activeCount: memberIds.filter(id => activeSet.has(id)).length,
          campusRank: campusRankMap.get(gid) ?? 0,
          memberAvatars,
        }
      }))

      // Pending requests across all admin groups
      const adminGroupIds = memberships
        .filter(m => m.role === 'admin')
        .map(m => m.group_id as string)
      if (adminGroupIds.length > 0) {
        const { data: pending } = await supabase
          .from('group_members')
          .select('group_id')
          .in('group_id', adminGroupIds)
          .eq('status', 'pending')
        const countByGroup = new Map<string, number>()
        for (const row of pending ?? []) {
          const gid = row.group_id as string
          countByGroup.set(gid, (countByGroup.get(gid) ?? 0) + 1)
        }
        setAdminPending([...countByGroup.entries()].map(([groupId, count]) => ({ groupId, count })))
      } else {
        setAdminPending([])
      }

      // Group activity feed — events from anyone in any of my groups
      setGroupActivityLoading(true)
      const peerIds = myGroupUserIds.filter(id => id !== uid)
      if (peerIds.length > 0) {
        const { data: events } = await supabase
          .from('activity_events')
          .select('id, user_id, title, subtitle, created_at')
          .in('user_id', peerIds)
          .order('created_at', { ascending: false })
          .limit(10)
        const eventUserIds = [...new Set((events ?? []).map(e => e.user_id as string))]
        const { data: profiles } = eventUserIds.length > 0
          ? await supabase.from('users').select('id, name, avatar_url').in('id', eventUserIds)
          : { data: [] }
        const profMap = new Map((profiles ?? []).map(p => [p.id as string, p as { name: string; avatar_url: string | null }]))
        setGroupActivity((events ?? []).map(ev => {
          const prof = profMap.get(ev.user_id as string)
          return {
            id: ev.id as string,
            userId: ev.user_id as string,
            userName: prof?.name ?? 'Someone',
            avatarUrl: prof?.avatar_url ?? null,
            title: ev.title as string,
            subtitle: (ev.subtitle as string | null) ?? null,
            createdAt: ev.created_at as string,
          }
        }))
      } else {
        setGroupActivity([])
      }
      setGroupActivityLoading(false)
    } finally {
      setMyGroupsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (tab === 'my-groups' && userId) loadMyGroups(userId)
  }, [tab, userId, loadMyGroups])

  // ── Discover / Top Groups ─────────────────────────────────────────────────

  const loadDiscoverGroups = useCallback(async (uid: string | null) => {
    setDiscoverLoading(true)
    try {
      // Fetch ALL groups
      const groupsFirst = await supabase
        .from('groups')
        .select('id, name, formal_name, category, member_count, avatar_url')
      let groupsList: Group[] = []
      if (groupsFirst.error) {
        const fb = await supabase.from('groups').select('id, name, formal_name, category, member_count')
        groupsList = ((fb.data ?? []) as Omit<Group, 'avatar_url'>[]).map(g => ({ ...g, avatar_url: null }))
      } else {
        groupsList = (groupsFirst.data ?? []) as Group[]
      }

      // All memberships (need both approved + pending so we can derive myStatus)
      const { data: allMembers } = await supabase
        .from('group_members')
        .select('group_id, user_id, role, status')

      const approvedRows = (allMembers ?? []).filter(m => m.status === 'approved')
      const allUserIds = [...new Set(approvedRows.map(m => m.user_id as string))]

      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
      const [scoresRes, profilesRes, checkinRes, workoutsRes] = await Promise.all([
        allUserIds.length > 0
          ? supabase.from('user_scores').select('user_id, ascend_score').in('user_id', allUserIds)
          : Promise.resolve({ data: [] }),
        allUserIds.length > 0
          ? supabase.from('users').select('id, name, avatar_url').in('id', allUserIds)
          : Promise.resolve({ data: [] }),
        allUserIds.length > 0
          ? supabase.from('users').select('id').in('id', allUserIds).gte('gym_checkin_at', twoHoursAgo)
          : Promise.resolve({ data: [] }),
        allUserIds.length > 0
          ? supabase.from('workouts').select('user_id').in('user_id', allUserIds).eq('completed', true).gte('workout_date', weekAgo)
          : Promise.resolve({ data: [] }),
      ])
      const scoreMap = new Map((scoresRes.data ?? []).map(s => [s.user_id as string, s.ascend_score as number]))
      const profileMap = new Map(
        (profilesRes.data ?? []).map(p => [p.id as string, p as { id: string; name: string; avatar_url: string | null }])
      )
      const activeSet = new Set<string>([
        ...(checkinRes.data ?? []).map(u => u.id as string),
        ...(workoutsRes.data ?? []).map(w => w.user_id as string),
        ...(uid ? [uid] : []),
      ])

      const avgPerGroup = new Map<string, number>()
      const memberIdsPerGroup = new Map<string, string[]>()
      for (const g of groupsList) {
        const ids = approvedRows.filter(m => m.group_id === g.id).map(m => m.user_id as string)
        memberIdsPerGroup.set(g.id, ids)
        const scores = ids.map(id => scoreMap.get(id) ?? 0)
        avgPerGroup.set(g.id, scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0)
      }
      const campusRankMap = new Map<string, number>(
        [...avgPerGroup.entries()]
          .sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0]))
          .map(([gid], i) => [gid, i + 1])
      )

      // My status per group (admin / member / pending / none)
      const myStatusMap = new Map<string, 'admin' | 'member' | 'pending'>()
      if (uid) {
        for (const m of (allMembers ?? [])) {
          if (m.user_id !== uid) continue
          const gid = m.group_id as string
          if (m.status === 'pending') myStatusMap.set(gid, 'pending')
          else if (m.status === 'approved') myStatusMap.set(gid, m.role === 'admin' ? 'admin' : 'member')
        }
      }

      const stats: GroupWithStats[] = groupsList.map(g => {
        const memberIds = memberIdsPerGroup.get(g.id) ?? []
        const memberAvatars: MemberPreview[] = memberIds
          .map(id => ({ id, score: scoreMap.get(id) ?? 0, prof: profileMap.get(id) }))
          .sort((a, b) => b.score - a.score)
          .slice(0, 5)
          .map(x => ({ userId: x.id, name: x.prof?.name ?? '', avatarUrl: x.prof?.avatar_url ?? null }))
        return {
          group: { ...g, member_count: memberIds.length },
          avgScore: avgPerGroup.get(g.id) ?? 0,
          activeCount: memberIds.filter(id => activeSet.has(id)).length,
          campusRank: campusRankMap.get(g.id) ?? 0,
          memberAvatars,
          myStatus: myStatusMap.get(g.id) ?? 'none',
        }
      })
      setDiscoverGroups(stats)
    } finally {
      setDiscoverLoading(false)
    }
  }, [])

  useEffect(() => {
    if (tab === 'browse') loadDiscoverGroups(userId)
  }, [tab, userId, loadDiscoverGroups])

  // ── Manage screen ─────────────────────────────────────────────────────────

  const loadManageData = useCallback(async (groupId: string) => {
    setManageLoading(true)
    try {
      const { data: rows } = await supabase
        .from('group_members')
        .select('id, user_id, role, status')
        .eq('group_id', groupId)

      const pending = (rows ?? []).filter(r => r.status === 'pending')
      const members = (rows ?? []).filter(r => r.status === 'approved')
      const allUserIds = [...new Set([...pending, ...members].map(r => r.user_id as string))]
      const approvedUserIds = members.map(r => r.user_id as string)

      const [profilesRes, scoresRes] = await Promise.all([
        allUserIds.length > 0
          ? supabase.from('users').select('id, name, username, avatar_url').in('id', allUserIds)
          : Promise.resolve({ data: [] }),
        approvedUserIds.length > 0
          ? supabase.from('user_scores').select('user_id, ascend_score, streak_days').in('user_id', approvedUserIds)
          : Promise.resolve({ data: [] }),
      ])
      const profileMap = new Map(
        (profilesRes.data ?? []).map(p => [p.id as string, p as { id: string; name: string; username: string; avatar_url: string | null }])
      )
      const scoreMap = new Map((scoresRes.data ?? []).map(s => [s.user_id as string, (s.ascend_score as number | null) ?? 0]))
      const streakMap = new Map((scoresRes.data ?? []).map(s => [s.user_id as string, (s.streak_days as number | null) ?? 0]))

      setPendingRequests(pending.map(p => {
        const prof = profileMap.get(p.user_id as string)
        return { membershipId: p.id as string, user_id: p.user_id as string, name: prof?.name ?? 'Unknown', username: prof?.username ?? '' }
      }))
      setManageMembers(
        members
          .map(m => {
            const prof = profileMap.get(m.user_id as string)
            return {
              membershipId: m.id as string,
              userId: m.user_id as string,
              name: prof?.name ?? 'Unknown',
              username: prof?.username ?? '',
              avatarUrl: prof?.avatar_url ?? null,
              role: m.role as 'admin' | 'member',
              score: scoreMap.get(m.user_id as string) ?? 0,
              streak: streakMap.get(m.user_id as string) ?? 0,
            }
          })
          .sort((a, b) => b.score - a.score)
      )
    } finally {
      setManageLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!manageGroup) return
    loadManageData(manageGroup.id)
  }, [manageGroup, loadManageData])

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
      }
      if (!error) {
        setDiscoverGroups(prev => prev.map(t => t.group.id === detailGroup.id
          ? { ...t, myStatus: isFirst ? 'admin' : 'pending', group: { ...t.group, member_count: isFirst ? t.group.member_count + 1 : t.group.member_count } }
          : t))
      }

      if (!error) await loadGroupDetail(detailGroup.id, userId)
    } finally {
      setJoinLoading(false)
    }
  }

  async function handleToggleRequest(t: GroupWithStats) {
    if (!userId || joiningGroupId) return
    setJoiningGroupId(t.group.id)
    try {
      // Cancel an outstanding request
      if (t.myStatus === 'pending') {
        await supabase
          .from('group_members')
          .delete()
          .eq('group_id', t.group.id)
          .eq('user_id', userId)
          .eq('status', 'pending')
        setDiscoverGroups(prev => prev.map(x => x.group.id === t.group.id
          ? { ...x, myStatus: 'none' }
          : x))
        return
      }

      // Otherwise: submit a new request (auto-approves first member as admin)
      const { count, error: countError } = await supabase
        .from('group_members')
        .select('id', { count: 'exact', head: true })
        .eq('group_id', t.group.id)
        .eq('status', 'approved')
      if (countError) throw countError
      const isFirst = count === 0
      const now = new Date().toISOString()

      const { error } = await supabase.from('group_members').insert({
        group_id: t.group.id,
        user_id: userId,
        role: isFirst ? 'admin' : 'member',
        status: isFirst ? 'approved' : 'pending',
        approved_at: isFirst ? now : null,
      })
      if (error) return

      if (isFirst) {
        const newCount = t.group.member_count + 1
        await supabase.from('groups').update({ member_count: newCount }).eq('id', t.group.id)
      }
      setDiscoverGroups(prev => prev.map(x => x.group.id === t.group.id
        ? {
            ...x,
            myStatus: isFirst ? 'admin' : 'pending',
            group: { ...x.group, member_count: isFirst ? x.group.member_count + 1 : x.group.member_count },
          }
        : x))
    } finally {
      setJoiningGroupId(null)
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
      setDiscoverGroups(prev => prev.map(t => t.group.id === manageGroup.id
        ? { ...t, group: { ...t.group, member_count: newCount } } : t))
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

  async function handleKick(member: ManageMember) {
    if (!manageGroup || managingId || !userId) return
    if (member.userId === userId) return  // can't kick self via this path
    setManagingId(member.membershipId)
    try {
      const { error } = await supabase.from('group_members').delete().eq('id', member.membershipId)
      if (error) throw error
      const newCount = Math.max(0, manageGroup.member_count - 1)
      await supabase.from('groups').update({ member_count: newCount }).eq('id', manageGroup.id)
      setManageMembers(prev => prev.filter(m => m.membershipId !== member.membershipId))
      setManageGroup(prev => prev ? { ...prev, member_count: newCount } : prev)
      setMyGroups(prev => prev.map(m => m.group.id === manageGroup.id
        ? { ...m, group: { ...m.group, member_count: newCount } } : m))
      setDiscoverGroups(prev => prev.map(t => t.group.id === manageGroup.id
        ? { ...t, group: { ...t.group, member_count: newCount } } : t))
    } catch (err) {
      console.error('[Groups] kick error:', err)
    } finally {
      setManagingId(null)
    }
  }

  async function uploadGroupAvatar(blob: Blob, ext = 'jpg') {
    if (!manageGroup || !userId || avatarUploading) return
    setAvatarUploading(true)
    setAvatarError(null)
    try {
      const path = `${userId}/group_${manageGroup.id}_${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage.from('avatars').upload(path, blob, { upsert: true, contentType: blob.type || 'image/jpeg' })
      if (upErr) throw new Error(`Storage upload failed: ${upErr.message}`)
      const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path)
      const url = `${pub.publicUrl}?t=${Date.now()}`  // cache-bust so the new image shows immediately
      const { data: updData, error: updErr } = await supabase.from('groups').update({ avatar_url: url }).eq('id', manageGroup.id).select('avatar_url')
      if (updErr) throw new Error(`DB update failed: ${updErr.message} (did you run migrations_v8.sql?)`)
      if (!updData || updData.length === 0) throw new Error('Update returned 0 rows — likely RLS blocked it. Run migrations_v8.sql.')
      setManageGroup(prev => prev ? { ...prev, avatar_url: url } : prev)
      setMyGroups(prev => prev.map(m => m.group.id === manageGroup.id
        ? { ...m, group: { ...m.group, avatar_url: url } } : m))
      setDiscoverGroups(prev => prev.map(t => t.group.id === manageGroup.id
        ? { ...t, group: { ...t.group, avatar_url: url } } : t))
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[Groups] avatar upload error:', msg)
      setAvatarError(msg)
    } finally {
      setAvatarUploading(false)
    }
  }

  function openCropForFile(file: File) {
    const url = URL.createObjectURL(file)
    setCropSrc(url)
  }

  async function handleCropDone(blob: Blob) {
    if (cropSrc) URL.revokeObjectURL(cropSrc)
    setCropSrc(null)
    await uploadGroupAvatar(blob, 'jpg')
  }

  function handleCropCancel() {
    if (cropSrc) URL.revokeObjectURL(cropSrc)
    setCropSrc(null)
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
      setDiscoverGroups(prev => prev.map(t => t.group.id === groupId
        ? { ...t, myStatus: 'none', group: { ...t.group, member_count: newCount } }
        : t))
      // If we left from the detail or manage screen, close it.
      setDetailGroup(prev => prev && prev.id === groupId ? null : prev)
      setMyMembership(prev => prev && prev.group_id === groupId ? null : prev)
      setManageGroup(prev => prev && prev.id === groupId ? null : prev)
      setLeaveConfirm(null)
    } finally {
      setLeaveLoading(false)
    }
  }

  // ── Manage screen ─────────────────────────────────────────────────────────

  if (manageGroup) {
    const manageAvgScore = manageMembers.length > 0
      ? Math.round(manageMembers.reduce((s, m) => s + m.score, 0) / manageMembers.length)
      : 0
    const manageAvgStreak = manageMembers.length > 0
      ? Math.round(manageMembers.reduce((s, m) => s + m.streak, 0) / manageMembers.length)
      : 0
    const manageAvgRank = getRankInfo(manageAvgScore)

    return (
      <div className="app-shell">
        <div className="app-content page-scroll" style={{ background: c.bg }}>
          <div style={{ padding: '48px 20px 60px' }}>
            <button
              onClick={() => setManageGroup(null)}
              style={{ background: 'none', border: 'none', color: c.accent, fontSize: 13, cursor: 'pointer', padding: '0 0 16px', display: 'block' }}
            >
              ← Back
            </button>

            {/* ── Avatar + identity (mirrors detail view, with admin photo control) ── */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 16 }}>
              <div
                onClick={() => groupAvatarInputRef.current?.click()}
                style={{ position: 'relative', width: 96, height: 96, borderRadius: 22, background: c.border, border: `3px solid ${c.accentBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', color: c.accent, fontSize: 30, fontWeight: 700, marginBottom: 12, cursor: avatarUploading ? 'wait' : 'pointer' }}
              >
                <span>{groupInitials(manageGroup.name)}</span>
                {manageGroup.avatar_url && (
                  <img
                    src={manageGroup.avatar_url}
                    alt={manageGroup.name}
                    onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
                    style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                )}
                {avatarUploading && (
                  <div style={{ position: 'absolute', inset: 0, background: `${c.bg}99`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ color: c.accent, fontSize: 12 }}>…</span>
                  </div>
                )}
              </div>
              <input
                ref={groupAvatarInputRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={e => { const f = e.target.files?.[0]; if (f) openCropForFile(f); e.target.value = '' }}
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <h1 style={{ color: c.text, fontSize: 24, fontWeight: 700, margin: 0, textAlign: 'center' }}>{manageGroup.name}</h1>
                <VerifiedCheck />
              </div>
              {manageGroup.formal_name && (
                <p style={{ color: c.textSub, fontSize: 13, margin: '2px 0 0', textAlign: 'center' }}>{manageGroup.formal_name}</p>
              )}
              <p style={{ color: c.textSub, fontSize: 11, letterSpacing: '1.5px', textTransform: 'uppercase', margin: '6px 0 0' }}>
                {manageGroup.category}
              </p>
              <button
                onClick={() => groupAvatarInputRef.current?.click()}
                disabled={avatarUploading}
                style={{ marginTop: 10, background: 'none', border: 'none', color: c.accent, fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: 0 }}
              >
                {avatarUploading ? 'Uploading…' : manageGroup.avatar_url ? 'Change photo' : 'Add photo'}
              </button>
              {avatarError && (
                <p style={{ color: '#FF6B6B', fontSize: 11, margin: '8px 16px 0', textAlign: 'center', lineHeight: 1.4 }}>{avatarError}</p>
              )}
            </div>

            {/* ── Stat row (mirrors detail view) ── */}
            {(() => {
              const cardBase: React.CSSProperties = { flex: 1, background: c.surface, border: `1px solid ${c.border}`, borderRadius: 14, padding: '12px 10px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between' }
              const labelStyle: React.CSSProperties = { color: c.textSub, fontSize: 9, letterSpacing: '1.2px', textTransform: 'uppercase', margin: 0 }
              const contentStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flex: 1, justifyContent: 'space-between', paddingTop: 6 }
              return (
                <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                  <div style={cardBase}>
                    <p style={labelStyle}>Avg Rank</p>
                    <div style={contentStyle}>
                      <RankBadge tier={manageAvgRank.tier} size={28} accentColor={c.accent} />
                      <p style={{ color: manageAvgRank.color === 'accent' ? c.accent : manageAvgRank.color, fontSize: 11, fontWeight: 700, margin: 0, lineHeight: 1 }}>
                        {manageLoading || manageMembers.length === 0 ? '—' : manageAvgRank.name}
                      </p>
                    </div>
                  </div>
                  <div style={{ ...cardBase, background: c.accentBg, border: `1px solid ${c.accentBorder}` }}>
                    <p style={{ ...labelStyle, color: c.accent }}>Avg Score</p>
                    <div style={contentStyle}>
                      <p style={{ color: c.accent, fontSize: 24, fontWeight: 700, margin: 0, lineHeight: 1 }}>
                        {manageLoading ? '…' : (manageMembers.length === 0 ? '—' : manageAvgScore)}
                      </p>
                      <p style={{ color: c.accent, fontSize: 11, margin: 0, lineHeight: 1, opacity: 0.7 }}>group</p>
                    </div>
                  </div>
                  <div style={cardBase}>
                    <p style={labelStyle}>Avg Streak</p>
                    <div style={contentStyle}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <p style={{ color: c.text, fontSize: 24, fontWeight: 700, margin: 0, lineHeight: 1 }}>
                          {manageLoading ? '…' : (manageMembers.length === 0 ? '—' : manageAvgStreak)}
                        </p>
                        <span style={{ fontSize: 22, lineHeight: 1 }}>🔥</span>
                      </div>
                      <p style={{ color: c.textSub, fontSize: 11, margin: 0, lineHeight: 1 }}>days</p>
                    </div>
                  </div>
                </div>
              )
            })()}

            {/* ── Admin context pill (replaces join button) ── */}
            <div style={{ width: '100%', background: c.accentBg, border: `1px solid ${c.accentBorder}`, borderRadius: 14, padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ color: c.accent, fontSize: 13, fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase' }}>Admin Tools</span>
              <AdminBadge c={c} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', margin: '12px 0 24px' }}>
              <button
                onClick={() => {
                  const own = manageMembers.find(mem => mem.userId === userId)
                  if (!own) return
                  setLeaveConfirm({
                    membershipId: own.membershipId,
                    group: manageGroup,
                    role: own.role,
                    avgScore: manageAvgScore,
                    activeCount: 0,
                    campusRank: 0,
                    memberAvatars: [],
                  })
                }}
                style={{ background: 'none', border: 'none', color: '#FF6B6B', fontSize: 14, fontWeight: 600, cursor: 'pointer', padding: '4px 8px' }}
              >
                Leave group
              </button>
            </div>

            {/* ── Pending requests (surfaced above members for admin attention) ── */}
            {pendingRequests.length > 0 && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <span style={{ color: c.textSub, fontSize: 10, letterSpacing: '1.5px', textTransform: 'uppercase' }}>Pending Requests</span>
                  <span style={{ color: c.accent, fontSize: 11, fontWeight: 700 }}>{pendingRequests.length}</span>
                </div>
                <div style={{ background: c.surface, border: `1px solid ${c.accentBorder}`, borderRadius: 14, padding: '4px 14px', marginBottom: 20 }}>
                  {pendingRequests.map((req, i) => (
                    <div
                      key={req.membershipId}
                      style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: i < pendingRequests.length - 1 ? `1px solid ${c.border}` : 'none' }}
                    >
                      <div style={{ width: 36, height: 36, borderRadius: '50%', background: c.border, border: `1.5px solid ${c.accentBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: c.accent, fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
                        {initials(req.name)}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ color: c.text, fontSize: 13, fontWeight: 700, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{req.name}</p>
                        <p style={{ color: c.textSub, fontSize: 11, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>@{req.username}</p>
                      </div>
                      <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
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
              </>
            )}

            {/* ── Members list with kick (mirrors detail view) ── */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ color: c.textSub, fontSize: 10, letterSpacing: '1.5px', textTransform: 'uppercase' }}>Members</span>
              <span style={{ color: c.textSub, fontSize: 11 }}>{manageMembers.length}</span>
            </div>
            {manageLoading ? (
              <div style={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 14, padding: 28, textAlign: 'center' }}>
                <p style={{ color: c.textSub, fontSize: 13, margin: 0 }}>Loading…</p>
              </div>
            ) : manageMembers.length === 0 ? (
              <div style={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 14, padding: 28, textAlign: 'center' }}>
                <p style={{ color: c.textSub, fontSize: 13, margin: 0 }}>No members yet</p>
              </div>
            ) : (
              <div style={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 14, padding: '4px 14px' }}>
                {manageMembers.map((mem, i) => {
                  const isSelf = mem.userId === userId
                  return (
                    <div
                      key={mem.membershipId}
                      style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: i < manageMembers.length - 1 ? `1px solid ${c.border}` : 'none' }}
                    >
                      <span style={{ color: RANK_COLORS[i + 1] ?? c.textSub, fontSize: 13, fontWeight: 700, width: 18, textAlign: 'center', flexShrink: 0 }}>
                        {i + 1}
                      </span>
                      <div
                        onClick={() => navigate(`/profile/${mem.userId}`)}
                        style={{ width: 36, height: 36, borderRadius: '50%', background: c.border, border: isSelf ? `1.5px solid ${c.accent}` : `1.5px solid ${c.accentBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: c.accent, fontSize: 12, fontWeight: 700, flexShrink: 0, overflow: 'hidden', cursor: 'pointer' }}
                      >
                        {mem.avatarUrl
                          ? <img src={mem.avatarUrl} alt={mem.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          : initials(mem.name)}
                      </div>
                      <div
                        onClick={() => navigate(`/profile/${mem.userId}`)}
                        style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <p style={{ color: isSelf ? c.accent : c.text, fontSize: 13, fontWeight: 700, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{mem.name}</p>
                          {mem.role === 'admin' && <AdminBadge c={c} />}
                        </div>
                        <p style={{ color: c.textSub, fontSize: 11, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>@{mem.username}</p>
                      </div>
                      {isSelf ? (
                        <span style={{ color: c.textSub, fontSize: 12, flexShrink: 0 }}>You</span>
                      ) : (
                        <button
                          onClick={() => handleKick(mem)}
                          disabled={managingId === mem.membershipId}
                          style={{ background: 'transparent', border: `1px solid ${c.border}`, borderRadius: 8, padding: '6px 12px', color: c.textSub, fontSize: 12, cursor: 'pointer', flexShrink: 0 }}
                        >
                          {managingId === mem.membershipId ? 'Kicking…' : 'Kick'}
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
        {cropSrc && <GroupCropModal src={cropSrc} onDone={handleCropDone} onCancel={handleCropCancel} c={c} />}
      </div>
    )
  }

  // ── Group detail screen ───────────────────────────────────────────────────

  if (detailGroup) {
    const memberStatus = myMembership?.status
    const memberRole = myMembership?.role
    const avgRank = getRankInfo(detailAvgScore)

    return (
      <div className="app-shell">
        <div className="app-content page-scroll" style={{ background: c.bg }}>
          <div style={{ padding: '48px 20px 0' }}>
            <button
              onClick={() => { setDetailGroup(null); setMyMembership(null); setDetailMembers([]); setDetailAvgScore(0); setDetailAvgStreak(0) }}
              style={{ background: 'none', border: 'none', color: c.accent, fontSize: 13, cursor: 'pointer', padding: '0 0 16px', display: 'block' }}
            >
              ← Back
            </button>

            {/* ── Avatar + identity (mirrors Profile) ── */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ position: 'relative', width: 96, height: 96, borderRadius: 22, background: c.border, border: `3px solid ${c.accentBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', color: c.accent, fontSize: 30, fontWeight: 700, marginBottom: 12 }}>
                <span>{groupInitials(detailGroup.name)}</span>
                {detailGroup.avatar_url && (
                  <img
                    src={detailGroup.avatar_url}
                    alt={detailGroup.name}
                    onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
                    style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <h1 style={{ color: c.text, fontSize: 24, fontWeight: 700, margin: 0, textAlign: 'center' }}>{detailGroup.name}</h1>
                <VerifiedCheck />
              </div>
              {detailGroup.formal_name && (
                <p style={{ color: c.textSub, fontSize: 13, margin: '2px 0 0', textAlign: 'center' }}>{detailGroup.formal_name}</p>
              )}
              <p style={{ color: c.textSub, fontSize: 11, letterSpacing: '1.5px', textTransform: 'uppercase', margin: '6px 0 0' }}>
                {detailGroup.category}
              </p>
            </div>

            {/* ── Stat row (mirrors Profile: Rank · Ascend Score · Streak) ── */}
            {(() => {
              const cardBase: React.CSSProperties = { flex: 1, background: c.surface, border: `1px solid ${c.border}`, borderRadius: 14, padding: '12px 10px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between' }
              const labelStyle: React.CSSProperties = { color: c.textSub, fontSize: 9, letterSpacing: '1.2px', textTransform: 'uppercase', margin: 0 }
              const contentStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flex: 1, justifyContent: 'space-between', paddingTop: 6 }
              return (
                <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                  {/* Avg Rank */}
                  <div style={cardBase}>
                    <p style={labelStyle}>Avg Rank</p>
                    <div style={contentStyle}>
                      <RankBadge tier={avgRank.tier} size={28} accentColor={c.accent} />
                      <p style={{ color: avgRank.color === 'accent' ? c.accent : avgRank.color, fontSize: 11, fontWeight: 700, margin: 0, lineHeight: 1 }}>
                        {detailLoading || detailMembers.length === 0 ? '—' : avgRank.name}
                      </p>
                    </div>
                  </div>
                  {/* Avg Ascend Score */}
                  <div style={{ ...cardBase, background: c.accentBg, border: `1px solid ${c.accentBorder}` }}>
                    <p style={{ ...labelStyle, color: c.accent }}>Avg Score</p>
                    <div style={contentStyle}>
                      <p style={{ color: c.accent, fontSize: 24, fontWeight: 700, margin: 0, lineHeight: 1 }}>
                        {detailLoading ? '…' : (detailMembers.length === 0 ? '—' : detailAvgScore)}
                      </p>
                      <p style={{ color: c.accent, fontSize: 11, margin: 0, lineHeight: 1, opacity: 0.7 }}>group</p>
                    </div>
                  </div>
                  {/* Avg Streak */}
                  <div style={cardBase}>
                    <p style={labelStyle}>Avg Streak</p>
                    <div style={contentStyle}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <p style={{ color: c.text, fontSize: 24, fontWeight: 700, margin: 0, lineHeight: 1 }}>
                          {detailLoading ? '…' : (detailMembers.length === 0 ? '—' : detailAvgStreak)}
                        </p>
                        <span style={{ fontSize: 22, lineHeight: 1 }}>🔥</span>
                      </div>
                      <p style={{ color: c.textSub, fontSize: 11, margin: 0, lineHeight: 1 }}>days</p>
                    </div>
                  </div>
                </div>
              )
            })()}

            {/* Join / Pending / Member */}
            <div style={{ marginBottom: 24 }}>
              {!myMembership ? (
                <button
                  onClick={handleJoin}
                  disabled={joinLoading}
                  style={{ width: '100%', background: joinLoading ? c.border : c.accent, color: '#FFF', fontSize: 16, fontWeight: 700, borderRadius: 14, padding: '16px', border: 'none', cursor: joinLoading ? 'not-allowed' : 'pointer' }}
                >
                  {joinLoading
                    ? (detailGroup.member_count === 0 ? 'Joining…' : 'Requesting…')
                    : (detailGroup.member_count === 0 ? 'Join' : 'Request to Join')}
                </button>
              ) : memberStatus === 'pending' ? (
                <div style={{ width: '100%', background: c.surface, border: `1px solid ${c.border}`, borderRadius: 14, padding: '16px', textAlign: 'center' }}>
                  <span style={{ color: c.textSub, fontSize: 16, fontWeight: 600 }}>Request Pending</span>
                </div>
              ) : (
                <>
                  <div style={{ width: '100%', background: c.accentBg, border: `1px solid ${c.accentBorder}`, borderRadius: 14, padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ color: '#10B981', fontSize: 16, fontWeight: 700 }}>Member ✓</span>
                    {memberRole === 'admin' && <AdminBadge c={c} />}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'center', marginTop: 12 }}>
                    <button
                      onClick={() => myMembership && setLeaveConfirm({
                        membershipId: myMembership.id,
                        group: detailGroup,
                        role: myMembership.role,
                        avgScore: detailAvgScore,
                        activeCount: 0,
                        campusRank: 0,
                        memberAvatars: [],
                      })}
                      style={{ background: 'none', border: 'none', color: '#FF6B6B', fontSize: 14, fontWeight: 600, cursor: 'pointer', padding: '4px 8px' }}
                    >
                      Leave group
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* Members list */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ color: c.textSub, fontSize: 10, letterSpacing: '1.5px', textTransform: 'uppercase' }}>Members</span>
              <span style={{ color: c.textSub, fontSize: 11 }}>{detailMembers.length}</span>
            </div>
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
                      onClick={() => navigate(`/profile/${member.user_id}`)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0',
                        borderBottom: i < detailMembers.length - 1 ? `1px solid ${c.border}` : 'none',
                        cursor: 'pointer',
                      }}
                    >
                      <span style={{ color: RANK_COLORS[i + 1] ?? c.textSub, fontSize: 13, fontWeight: 700, width: 18, textAlign: 'center', flexShrink: 0 }}>
                        {i + 1}
                      </span>
                      <div style={{ width: 36, height: 36, borderRadius: '50%', background: c.border, border: isMe ? `1.5px solid ${c.accent}` : `1.5px solid ${c.accentBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: c.accent, fontSize: 12, fontWeight: 700, flexShrink: 0, overflow: 'hidden' }}>
                        {member.avatar_url
                          ? <img src={member.avatar_url} alt={member.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          : initials(member.name)}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ color: isMe ? c.accent : c.text, fontSize: 13, fontWeight: 700, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{member.name}</p>
                        <p style={{ color: c.textSub, fontSize: 11, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>@{member.username}</p>
                      </div>
                      <span style={{ color: c.accent, fontSize: 14, fontWeight: 700, flexShrink: 0 }}>{member.score}</span>
                    </div>
                  )
                })}
              </div>
            )}
            <div style={{ height: 40 }} />
          </div>
        </div>
      </div>
    )
  }

  // ── Main screen ───────────────────────────────────────────────────────────

  return (
    <div className="app-shell">
      <div
        className="app-content page-scroll"
        style={{ background: c.bg }}
        onClick={() => { if (showNotifDropdown) setShowNotifDropdown(false) }}
      >
        <div style={{ padding: '52px 20px 0' }}>
          {/* Header — matches Campus layout */}
          <div style={{ height: 44, display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
            <h1 style={{ color: c.text, fontSize: 24, fontWeight: 700, margin: 0 }}>Groups</h1>
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

          {/* Tab toggle */}
          <div style={{ display: 'flex', justifyContent: 'space-evenly', marginBottom: 20, borderBottom: `1px solid ${c.border}` }}>
            {(['my-groups', 'browse'] as const).map(t => {
              const active = tab === t
              return (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  style={{
                    background: 'none', border: 'none', padding: '8px 0',
                    color: active ? c.accent : c.textSub,
                    fontSize: 14, fontWeight: 700, cursor: 'pointer',
                    borderBottom: `2px solid ${active ? c.accent : 'transparent'}`,
                    marginBottom: -1, transition: 'color 0.15s',
                  }}
                >
                  {t === 'my-groups' ? 'My Groups' : 'Discover'}
                </button>
              )
            })}
          </div>

          {/* ── Browse ── */}
          {tab === 'browse' && (
            <>
              {/* ── Top Groups (campus-ranked; falls back to alphabetical if no group has members yet) ── */}
              {(() => {
                const hasAnyMembers = discoverGroups.some(t => t.group.member_count > 0)
                const sorted = hasAnyMembers
                  ? [...discoverGroups].sort((a, b) => a.campusRank - b.campusRank)
                  : [...discoverGroups].sort((a, b) => a.group.name.localeCompare(b.group.name))
                const preview = sorted.slice(0, 4)
                return (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                      <span style={{ color: c.text, fontSize: 13, fontWeight: 700 }}>Top Groups</span>
                      {sorted.length > 0 && (
                        <button
                          onClick={() => setShowAllTopGroups(true)}
                          style={{ background: 'none', border: 'none', color: c.accent, fontSize: 12, cursor: 'pointer', padding: 0 }}
                        >
                          See all →
                        </button>
                      )}
                    </div>
                    {discoverLoading && preview.length === 0 ? (
                      <p style={{ color: c.textSub, fontSize: 14, marginBottom: 20 }}>Loading…</p>
                    ) : preview.length === 0 ? (
                      <div style={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 14, padding: 20, textAlign: 'center', marginBottom: 20 }}>
                        <p style={{ color: c.textSub, fontSize: 13, margin: 0 }}>No groups yet.</p>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
                        {preview.map(t => (
                          <CompactGroupCard
                            key={t.group.id}
                            group={t.group}
                            avgScore={t.avgScore}
                            activeCount={t.activeCount}
                            campusRank={t.campusRank}
                            memberAvatars={t.memberAvatars}
                            status={t.myStatus}
                            onOpen={() => setDetailGroup(t.group)}
                            onJoin={() => handleToggleRequest(t)}
                            joining={joiningGroupId === t.group.id}
                            c={c}
                          />
                        ))}
                      </div>
                    )}
                  </>
                )
              })()}

              {/* ── Browse by Category ── */}
              <span style={{ color: c.text, fontSize: 13, fontWeight: 700, display: 'block', marginBottom: 2 }}>Browse by Category</span>

              {/* Tabs — slight inset on both ends so Club/Other aren't flush with the page edge */}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 10px', marginBottom: 14, borderBottom: `1px solid ${c.border}` }}>
                {BROWSE_TABS.map(bt => {
                  const active = selectedBrowseTab === bt
                  return (
                    <button
                      key={bt}
                      onClick={() => setSelectedBrowseTab(bt)}
                      style={{
                        background: 'none', border: 'none', padding: '8px 0',
                        color: active ? c.accent : c.textSub,
                        fontSize: 13, fontWeight: 700, cursor: 'pointer',
                        borderBottom: `2px solid ${active ? c.accent : 'transparent'}`,
                        marginBottom: -1, transition: 'color 0.15s',
                      }}
                    >
                      {bt}
                    </button>
                  )
                })}
              </div>

              {/* Horizontally-scrollable cards for the selected tab */}
              {(() => {
                const tabGroups = discoverGroups.filter(t => matchesBrowseTab(t.group.category, selectedBrowseTab))
                if (discoverLoading && tabGroups.length === 0) {
                  return <p style={{ color: c.textSub, fontSize: 13, padding: '12px 0' }}>Loading…</p>
                }
                if (tabGroups.length === 0) {
                  return (
                    <div style={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 14, padding: 20, textAlign: 'center' }}>
                      <p style={{ color: c.textSub, fontSize: 13, margin: 0 }}>No groups in this category yet.</p>
                    </div>
                  )
                }
                return (
                  <div
                    ref={browseScrollRef}
                    className="no-scrollbar"
                    style={{
                      display: 'flex', gap: 10, overflowX: 'auto', overflowY: 'hidden',
                      paddingBottom: 8,
                      scrollSnapType: 'x mandatory', WebkitOverflowScrolling: 'touch',
                    }}
                  >
                    {tabGroups.map(t => (
                      <div
                        key={t.group.id}
                        onClick={() => setDetailGroup(t.group)}
                        style={{
                          flexShrink: 0, width: 116, height: 116, scrollSnapAlign: 'start',
                          background: c.surface, border: `1px solid ${c.border}`, borderRadius: 12,
                          padding: '8px 6px',
                          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4,
                          cursor: 'pointer', boxSizing: 'border-box',
                        }}
                      >
                        {/* Avatar */}
                        <div style={{ position: 'relative', width: 56, height: 56, borderRadius: 12, background: c.border, display: 'flex', alignItems: 'center', justifyContent: 'center', color: c.accent, fontSize: 16, fontWeight: 700, overflow: 'hidden', flexShrink: 0 }}>
                          <span>{groupInitials(t.group.name)}</span>
                          {t.group.avatar_url && (
                            <img
                              src={t.group.avatar_url}
                              alt={t.group.name}
                              onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
                              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                            />
                          )}
                        </div>
                        {/* Name (wraps up to 2 lines) */}
                        <p style={{
                          color: c.text, fontSize: 11, fontWeight: 700, margin: 0,
                          textAlign: 'center', maxWidth: '100%',
                          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                          overflow: 'hidden', lineHeight: 1.15, wordBreak: 'break-word',
                        }}>
                          {t.group.name}
                        </p>
                        {/* Member count, smaller grey */}
                        <p style={{ color: c.textSub, fontSize: 9, margin: 0, lineHeight: 1.2 }}>
                          {t.group.member_count} {t.group.member_count === 1 ? 'member' : 'members'}
                        </p>
                      </div>
                    ))}
                  </div>
                )
              })()}

              {/* ── Search For Groups ── */}
              <span style={{ color: c.text, fontSize: 13, fontWeight: 700, display: 'block', margin: '12px 0 8px' }}>Search For Groups</span>
              <input
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search groups…"
                style={{ width: '100%', background: c.inputBg, border: `1px solid ${c.border}`, borderRadius: 12, padding: '12px 16px', color: c.text, fontSize: 14, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }}
              />
              {searchQuery.trim() !== '' && (() => {
                const q = searchQuery.trim().toLowerCase()
                const results = discoverGroups.filter(t =>
                  t.group.name.toLowerCase().includes(q) ||
                  (t.group.formal_name ?? '').toLowerCase().includes(q)
                )
                if (results.length === 0) {
                  return <p style={{ color: c.textSub, fontSize: 13, textAlign: 'center', padding: '14px 0 0' }}>No matches</p>
                }
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
                    {results.map(t => (
                      <CompactGroupCard
                        key={t.group.id}
                        group={t.group}
                        avgScore={t.avgScore}
                        activeCount={t.activeCount}
                        campusRank={t.campusRank}
                        memberAvatars={t.memberAvatars}
                        status={t.myStatus}
                        onOpen={() => setDetailGroup(t.group)}
                        onJoin={() => handleToggleRequest(t)}
                        joining={joiningGroupId === t.group.id}
                        c={c}
                      />
                    ))}
                  </div>
                )
              })()}
            </>
          )}

          {/* ── My Groups ── */}
          {tab === 'my-groups' && (
            <>
              {/* Pending requests banner — admins only */}
              {(() => {
                const total = adminPending.reduce((s, p) => s + p.count, 0)
                if (total === 0) return null
                const first = adminPending[0]
                const firstGroup = myGroups.find(m => m.group.id === first.groupId)?.group
                return (
                  <button
                    onClick={() => firstGroup && setManageGroup(firstGroup)}
                    style={{ width: '100%', background: c.accentBg, border: `1px solid ${c.accentBorder}`, borderRadius: 12, padding: '10px 14px', marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, cursor: 'pointer' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                      <span style={{ background: c.accent, color: c.bg, width: 22, height: 22, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
                        {total}
                      </span>
                      <span style={{ color: c.text, fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {total === 1 ? 'Pending request' : 'Pending requests'} to review
                      </span>
                    </div>
                    <span style={{ color: c.accent, fontSize: 12, fontWeight: 700, flexShrink: 0 }}>Review →</span>
                  </button>
                )
              })()}

              {/* Section header */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <span style={{ color: c.text, fontSize: 13, fontWeight: 700 }}>My Groups</span>
                {myGroups.length > 0 && (
                  <button
                    onClick={() => setShowAllMyGroups(true)}
                    style={{ background: 'none', border: 'none', color: c.accent, fontSize: 12, cursor: 'pointer', padding: 0 }}
                  >
                    See all →
                  </button>
                )}
              </div>

              {myGroupsLoading ? (
                <p style={{ color: c.textSub, fontSize: 14 }}>Loading…</p>
              ) : myGroups.length === 0 ? (
                <div style={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 14, padding: 28, textAlign: 'center' }}>
                  <p style={{ color: c.textSub, fontSize: 13, margin: '0 0 10px' }}>You haven't joined any groups yet.</p>
                  <button
                    onClick={() => setTab('browse')}
                    style={{ background: 'none', border: 'none', color: c.accent, fontSize: 13, cursor: 'pointer', padding: 0 }}
                  >
                    Discover groups →
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {myGroups.slice(0, 3).map(m => (
                    <CompactGroupCard
                      key={m.membershipId}
                      group={m.group}
                      avgScore={m.avgScore}
                      activeCount={m.activeCount}
                      campusRank={m.campusRank}
                      memberAvatars={m.memberAvatars}
                      status={m.role === 'admin' ? 'admin' : 'member'}
                      onManage={() => setManageGroup(m.group)}
                      onOpen={() => setDetailGroup(m.group)}
                      c={c}
                    />
                  ))}
                </div>
              )}

              {/* Group activity feed */}
              {myGroups.length > 0 && (
                <div style={{ marginTop: 24 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <span style={{ color: c.text, fontSize: 13, fontWeight: 700 }}>Group Activity</span>
                  </div>
                  {groupActivityLoading ? (
                    <p style={{ color: c.textSub, fontSize: 13, margin: 0 }}>Loading…</p>
                  ) : groupActivity.length === 0 ? (
                    <div style={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 14, padding: 20, textAlign: 'center' }}>
                      <p style={{ color: c.textSub, fontSize: 12, margin: 0 }}>No activity from your groups yet.</p>
                    </div>
                  ) : (
                    <div style={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 14, overflow: 'hidden' }}>
                      {groupActivity.map((ev, i) => (
                        <div
                          key={ev.id}
                          onClick={() => navigate(`/profile/${ev.userId}`)}
                          style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: i < groupActivity.length - 1 ? `1px solid ${c.border}` : 'none', cursor: 'pointer' }}
                        >
                          <div style={{ width: 32, height: 32, borderRadius: '50%', background: c.border, display: 'flex', alignItems: 'center', justifyContent: 'center', color: c.accent, fontSize: 11, fontWeight: 700, flexShrink: 0, overflow: 'hidden' }}>
                            {ev.avatarUrl
                              ? <img src={ev.avatarUrl} alt={ev.userName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                              : groupInitials(ev.userName)}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ margin: 0, fontSize: 12, lineHeight: '16px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              <span style={{ color: c.text, fontWeight: 600 }}>{ev.userName} </span>
                              <span style={{ color: c.text, fontWeight: 400 }}>{ev.title}</span>
                            </p>
                            {ev.subtitle && (
                              <p style={{ margin: '2px 0 0', color: c.textSub, fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {ev.subtitle}
                              </p>
                            )}
                          </div>
                          <span style={{ color: c.textSub, fontSize: 10, flexShrink: 0 }}>{groupActivityTimeAgo(ev.createdAt)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Find your group CTA */}
              {myGroups.length > 0 && (
                <div style={{ marginTop: 20, textAlign: 'center' }}>
                  <button
                    onClick={() => setTab('browse')}
                    style={{ background: 'none', border: 'none', color: c.accent, fontSize: 13, fontWeight: 400, padding: 0, cursor: 'pointer' }}
                  >
                    Find your group →
                  </button>
                </div>
              )}
            </>
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

      {/* See all my groups modal */}
      {showAllMyGroups && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 300, background: c.bg, display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '52px 20px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: `1px solid ${c.border}`, flexShrink: 0 }}>
            <h2 style={{ color: c.text, fontSize: 18, fontWeight: 700, margin: 0 }}>My Groups</h2>
            <button
              onClick={() => setShowAllMyGroups(false)}
              style={{ background: 'none', border: 'none', color: c.accent, fontSize: 14, fontWeight: 600, cursor: 'pointer', padding: 0 }}
            >
              Done
            </button>
          </div>
          <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px 100px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {myGroups.map(m => (
                <CompactGroupCard
                  key={m.membershipId}
                  group={m.group}
                  avgScore={m.avgScore}
                  activeCount={m.activeCount}
                  campusRank={m.campusRank}
                  memberAvatars={m.memberAvatars}
                  status={m.role === 'admin' ? 'admin' : 'member'}
                  onManage={() => { setShowAllMyGroups(false); setManageGroup(m.group) }}
                  onOpen={() => { setShowAllMyGroups(false); setDetailGroup(m.group) }}
                  c={c}
                />
              ))}
            </div>
            <button
              onClick={() => { setShowAllMyGroups(false); setTab('browse') }}
              style={{ marginTop: 16, background: 'none', border: 'none', color: c.accent, fontSize: 13, cursor: 'pointer', padding: 0 }}
            >
              Discover more groups →
            </button>
          </div>
        </div>
      )}

      {/* See all top groups modal */}
      {showAllTopGroups && (() => {
        const hasAnyMembers = discoverGroups.some(t => t.group.member_count > 0)
        const sorted = hasAnyMembers
          ? [...discoverGroups].sort((a, b) => a.campusRank - b.campusRank)
          : [...discoverGroups].sort((a, b) => a.group.name.localeCompare(b.group.name))
        return (
          <div style={{ position: 'fixed', inset: 0, zIndex: 300, background: c.bg, display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '52px 20px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: `1px solid ${c.border}`, flexShrink: 0 }}>
              <h2 style={{ color: c.text, fontSize: 18, fontWeight: 700, margin: 0 }}>Top Groups</h2>
              <button
                onClick={() => setShowAllTopGroups(false)}
                style={{ background: 'none', border: 'none', color: c.accent, fontSize: 14, fontWeight: 600, cursor: 'pointer', padding: 0 }}
              >
                Done
              </button>
            </div>
            <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px 100px' }}>
              {sorted.length === 0 ? (
                <p style={{ color: c.textSub, fontSize: 13, textAlign: 'center', padding: '20px 0' }}>No groups yet.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {sorted.map(t => (
                    <CompactGroupCard
                      key={t.group.id}
                      group={t.group}
                      avgScore={t.avgScore}
                      activeCount={t.activeCount}
                      campusRank={t.campusRank}
                      memberAvatars={t.memberAvatars}
                      status={t.myStatus}
                      onOpen={() => { setShowAllTopGroups(false); setDetailGroup(t.group) }}
                      onJoin={() => handleToggleRequest(t)}
                      joining={joiningGroupId === t.group.id}
                      c={c}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        )
      })()}

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
