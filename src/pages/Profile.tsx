import React, { useEffect, useState, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'

import { supabase } from '../lib/supabase'
import {
  displayGoal, displayExperience, displayEquipment,
  GOAL_OPTIONS, EXPERIENCE_OPTIONS, EQUIPMENT_OPTIONS, SCHOOL_YEAR_OPTIONS,
} from '../lib/display'
import { calculateConsistencyScore, getRankInfo, getRankProgress, RANKS } from '../lib/scoring'
import RankBadge from '../components/RankBadge'
import { useTheme, ACCENT_COLORS } from '../lib/theme'
import type { UserProfile, UserScores, FriendshipWithProfile, FriendProfile } from '../types'

// ── Helpers ──────────────────────────────────────────────────────────────────

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function initials(name: string | null | undefined) {
  if (!name) return '?'
  return name.split(' ').map(n => n[0] ?? '').filter(Boolean).join('').slice(0, 2).toUpperCase() || '?'
}

function formatVolume(lbs: number): string {
  if (lbs >= 1_000_000) return `${(lbs / 1_000_000).toFixed(1)}M lb`
  if (lbs >= 1000) return `${Math.round(lbs / 1000)}k lb`
  return `${lbs} lb`
}

// ── Editable field ────────────────────────────────────────────────────────────

interface EditableFieldProps {
  label: string
  value: string
  display?: string
  onSave?: (v: string) => Promise<void>
  options?: { value: string; label: string }[]
  locked?: boolean
}

function EditableField({ label, value, display, onSave, options, locked }: EditableFieldProps) {
  const { colors: c } = useTheme()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const [saving, setSaving] = useState(false)

  async function commit() {
    if (draft === value) { setEditing(false); return }
    setSaving(true)
    await onSave?.(draft)
    setSaving(false)
    setEditing(false)
  }

  if (editing && !locked) {
    return (
      <div style={{ background: c.surface, border: `1px solid ${c.accent}`, borderRadius: 12, padding: '12px 16px', marginBottom: 8 }}>
        <p style={{ color: c.accent, fontSize: 10, letterSpacing: '1.5px', textTransform: 'uppercase', margin: '0 0 6px' }}>{label}</p>
        {options ? (
          <select value={draft} onChange={e => setDraft(e.target.value)} style={{ background: 'transparent', border: 'none', color: c.text, fontSize: 14, width: '100%', outline: 'none', fontFamily: 'inherit', cursor: 'pointer' }}>
            <option value="" style={{ background: c.surface }}>Not set</option>
            {options.map(o => <option key={o.value} value={o.value} style={{ background: c.surface }}>{o.label}</option>)}
          </select>
        ) : (
          <input
            value={draft}
            onChange={e => setDraft(e.target.value)}
            autoFocus
            onKeyDown={e => e.key === 'Enter' && commit()}
            style={{ background: 'transparent', border: 'none', color: c.text, fontSize: 14, width: '100%', outline: 'none', fontFamily: 'inherit' }}
          />
        )}
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <button onClick={commit} disabled={saving} style={{ background: c.accent, color: '#FFF', border: 'none', borderRadius: 8, padding: '5px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button onClick={() => setEditing(false)} style={{ background: 'transparent', color: c.textSub, border: 'none', padding: '5px 6px', fontSize: 12, cursor: 'pointer' }}>Cancel</button>
        </div>
      </div>
    )
  }

  return (
    <button
      onClick={() => { if (!locked) { setDraft(value); setEditing(true) } }}
      style={{ width: '100%', background: c.surface, border: `1px solid ${c.border}`, borderRadius: 12, padding: '12px 16px', marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: locked ? 'default' : 'pointer', textAlign: 'left' }}
    >
      <div>
        <p style={{ color: c.textSub, fontSize: 10, letterSpacing: '1.5px', textTransform: 'uppercase', margin: '0 0 3px' }}>{label}</p>
        <p style={{ color: (display ?? value) ? c.text : c.textSub, fontSize: 14, margin: 0 }}>{(display ?? value) || 'Tap to set'}</p>
      </div>
      {locked
        ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><rect x="3" y="11" width="18" height="11" rx="2" stroke={c.textSub} strokeWidth="2"/><path d="M7 11V7a5 5 0 0110 0v4" stroke={c.textSub} strokeWidth="2" strokeLinecap="round"/></svg>
        : <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" stroke={c.textSub} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" stroke={c.textSub} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
      }
    </button>
  )
}

// ── Crop Modal ───────────────────────────────────────────────────────────────

const CROP_SIZE = 260

interface CropModalProps {
  src: string
  onDone: (blob: Blob) => void
  onCancel: () => void
}

function CropModal({ src, onDone, onCancel }: CropModalProps) {
  const { colors: c } = useTheme()
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
    const s = Math.max(CROP_SIZE / img.naturalWidth, CROP_SIZE / img.naturalHeight)
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
    canvas.width = CROP_SIZE
    canvas.height = CROP_SIZE
    ctx.save()
    ctx.beginPath()
    ctx.arc(CROP_SIZE / 2, CROP_SIZE / 2, CROP_SIZE / 2, 0, Math.PI * 2)
    ctx.clip()
    const dw = imgDims.coverW * zoom
    const dh = imgDims.coverH * zoom
    ctx.drawImage(img, CROP_SIZE / 2 + offset.x - dw / 2, CROP_SIZE / 2 + offset.y - dh / 2, dw, dh)
    ctx.restore()
    canvas.toBlob(blob => { if (blob) onDone(blob) }, 'image/jpeg', 0.9)
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', zIndex: 9999,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24,
    }}>
      <p style={{ color: '#FFFFFF', fontSize: 16, fontWeight: 700, margin: '0 0 20px' }}>Move & Scale</p>
      <div
        style={{
          width: CROP_SIZE, height: CROP_SIZE, borderRadius: '50%',
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
      <div style={{ width: CROP_SIZE, marginTop: 16, marginBottom: 4 }}>
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
      <div style={{ display: 'flex', gap: 10, width: CROP_SIZE }}>
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

// ── Main component ────────────────────────────────────────────────────────────

export default function Profile() {
  const navigate = useNavigate()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { colors: c, theme, toggleTheme, accentKey, setAccentColor } = useTheme()

  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [scores, setScores] = useState<UserScores | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [retryKey, setRetryKey] = useState(0)
  const [avatarUploading, setAvatarUploading] = useState(false)
  const [cropSrc, setCropSrc] = useState<string | null>(null)
  const cropUrlRef = useRef<string | null>(null)

  const [_weekDays, setWeekDays] = useState<boolean[]>(new Array(7).fill(false))
  const [prs, setPrs] = useState<{ exercise_name: string; weight: number }[]>([])
  const [totalWorkouts, setTotalWorkouts] = useState(0)
  const [totalVolume, setTotalVolume] = useState(0)
  const [_workoutsLast30Days, setWorkoutsLast30Days] = useState(0)
  const [workoutsThisWeek, setWorkoutsThisWeek] = useState(0)

  const [campusRank, setCampusRank] = useState(0)
  const [shareCopied, setShareCopied] = useState(false)
  const [showScoreInfo, setShowScoreInfo] = useState(false)
  const [showAvatarPreview, setShowAvatarPreview] = useState(false)
  const [showBreakdownInfo, setShowBreakdownInfo] = useState(false)
  const [badgesExpanded, setBadgesExpanded] = useState(false)
  const [prsExpanded, setPrsExpanded] = useState(false)

  interface ProfileGroup { group_id: string; role: 'admin' | 'member'; name: string }
  const [myProfileGroups, setMyProfileGroups] = useState<ProfileGroup[]>([])

  interface FriendCard { id: string; name: string; username: string; avatar_url: string | null; ascend_score: number }
  const [_friendCards, setFriendCards] = useState<FriendCard[]>([])
  const [friends, setFriends] = useState<FriendshipWithProfile[]>([])
  const [pendingReceived, setPendingReceived] = useState<FriendshipWithProfile[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<FriendProfile[]>([])
  const [sentIds, setSentIds] = useState<Set<string>>(new Set())
  const [groupSuggestions, setGroupSuggestions] = useState<FriendProfile[]>([])

  const loadFriends = useCallback(async (userId: string) => {
    const { data: rows } = await supabase
      .from('friendships')
      .select('id, requester_id, recipient_id, status')
      .or(`requester_id.eq.${userId},recipient_id.eq.${userId}`)

    if (!rows || rows.length === 0) return

    const otherIds = rows.map(r => r.requester_id === userId ? r.recipient_id : r.requester_id)
    const [profilesRes, scoresRes] = await Promise.all([
      supabase.from('users').select('id, name, username, avatar_url, affiliation').in('id', otherIds),
      supabase.from('user_scores').select('user_id, ascend_score').in('user_id', otherIds),
    ])

    const profileMap = new Map((profilesRes.data ?? []).map(p => [p.id, p as FriendProfile]))
    const scoreMap = new Map((scoresRes.data ?? []).map(s => [s.user_id, s.ascend_score as number]))

    const accepted: FriendshipWithProfile[] = []
    const incoming: FriendshipWithProfile[] = []
    const cards: FriendCard[] = []

    for (const row of rows) {
      const friendId = row.requester_id === userId ? row.recipient_id : row.requester_id
      const fp = profileMap.get(friendId)
      if (!fp) continue
      const item: FriendshipWithProfile = { id: row.id, status: row.status as 'pending' | 'accepted', isRequester: row.requester_id === userId, friend: fp }
      if (row.status === 'accepted') {
        accepted.push(item)
        cards.push({ id: fp.id, name: fp.name, username: fp.username, avatar_url: fp.avatar_url, ascend_score: scoreMap.get(fp.id) ?? 0 })
      } else if (row.status === 'pending' && row.recipient_id === userId) {
        incoming.push(item)
      }
    }

    setFriends(accepted)
    setPendingReceived(incoming)
    setFriendCards(cards)
  }, [])

  useEffect(() => {
    async function load() {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.user) { navigate('/auth'); return }
        const user = session.user

        const thirtyAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

        const [profileRes, scoresRes, allPRsRes, workoutsRes, recentWorkoutsRes] = await Promise.all([
          supabase.from('users').select('*').eq('id', user.id).maybeSingle(),
          supabase.from('user_scores').select('*').eq('user_id', user.id).maybeSingle(),
          supabase.from('personal_records').select('exercise_name, weight').eq('user_id', user.id).order('weight', { ascending: false }),
          supabase.from('workouts').select('id', { count: 'exact' }).eq('user_id', user.id).eq('completed', true),
          supabase.from('workouts').select('id, workout_date').eq('user_id', user.id).eq('completed', true).gte('workout_date', thirtyAgo),
        ])

        let profileData = profileRes.data
        if (!profileData && user.email) {
          const { data: byEmail } = await supabase
            .from('users').select('*').eq('email', user.email).maybeSingle()
          profileData = byEmail
        }

        if (!profileData) {
          setLoadError(true)
          return
        }

        setProfile(profileData)
        if (scoresRes.data) setScores(scoresRes.data)
        setTotalWorkouts(workoutsRes.count ?? (workoutsRes.data?.length ?? 0))

        // Campus rank
        const { count: higherCount } = await supabase
          .from('user_scores')
          .select('user_id', { count: 'exact', head: true })
          .gt('ascend_score', scoresRes.data?.ascend_score ?? 0)
        setCampusRank((higherCount ?? 0) + 1)

        // Top 5 PRs (best per exercise)
        const prMap = new Map<string, number>()
        for (const pr of allPRsRes.data ?? []) {
          const cur = prMap.get(pr.exercise_name) ?? 0
          if (pr.weight > cur) prMap.set(pr.exercise_name, pr.weight)
        }
        const top5 = Array.from(prMap.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([exercise_name, weight]) => ({ exercise_name, weight }))
        setPrs(top5)

        // Streak dots and 30-day consistency count
        const today = new Date()
        if (recentWorkoutsRes.data) {
          const filled = Array.from({ length: 7 }, (_, i) => {
            const d = new Date(today)
            d.setDate(d.getDate() - 6 + i)
            return recentWorkoutsRes.data!.some(w => isSameDay(new Date(w.workout_date), d))
          })
          setWeekDays(filled)
          setWorkoutsLast30Days(recentWorkoutsRes.data.length)
          const monday = new Date()
          monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7))
          monday.setHours(0, 0, 0, 0)
          setWorkoutsThisWeek(recentWorkoutsRes.data.filter(w => new Date(w.workout_date) >= monday).length)
        }

        // Total volume
        const recentIds = (recentWorkoutsRes.data ?? []).map(w => w.id)
        const allWorkoutIds = (workoutsRes.data ?? []).map((w: { id: string }) => w.id)
        const idsForVolume = [...new Set([...recentIds, ...allWorkoutIds.slice(0, 50)])]
        if (idsForVolume.length > 0) {
          const { data: logs } = await supabase
            .from('exercise_logs')
            .select('weight, reps, sets')
            .in('workout_id', idsForVolume)
          const vol = (logs ?? []).reduce((s, l) => s + ((l.weight ?? 0) * (l.reps ?? 0) * (l.sets ?? 0)), 0)
          setTotalVolume(vol)
        }

        await loadFriends(user.id)

        // My groups
        try {
          const { data: memberRows } = await supabase
            .from('group_members')
            .select('group_id, role')
            .eq('user_id', user.id)
            .eq('status', 'approved')
          if (memberRows && memberRows.length > 0) {
            const groupIds = memberRows.map(m => m.group_id as string)
            const { data: groupData } = await supabase.from('groups').select('id, name').in('id', groupIds)
            const groupMap = new Map((groupData ?? []).map(g => [g.id, g.name as string]))
            setMyProfileGroups(memberRows.map(m => ({
              group_id: m.group_id as string,
              role: m.role as 'admin' | 'member',
              name: groupMap.get(m.group_id) ?? '',
            })))
          }
        } catch {
          // groups section is non-critical
        }

        // Group-based friend suggestions
        try {
          const { data: myGroups } = await supabase
            .from('group_members').select('group_id').eq('user_id', user.id).eq('status', 'approved')
          if (myGroups && myGroups.length > 0) {
            const gids = myGroups.map(m => m.group_id as string)
            const { data: groupmates } = await supabase
              .from('group_members').select('user_id').in('group_id', gids).eq('status', 'approved').neq('user_id', user.id)
            const gmIds = [...new Set((groupmates ?? []).map(m => m.user_id as string))]
            if (gmIds.length > 0) {
              const { data: gmProfiles } = await supabase
                .from('users').select('id, name, username, avatar_url, affiliation').in('id', gmIds).limit(10)
              if (gmProfiles) {
                const { data: existingFriendships } = await supabase
                  .from('friendships').select('requester_id, recipient_id')
                  .or(`requester_id.eq.${user.id},recipient_id.eq.${user.id}`)
                const connectedIds = new Set([
                  user.id,
                  ...(existingFriendships ?? []).map(f =>
                    f.requester_id === user.id ? f.recipient_id as string : f.requester_id as string
                  ),
                ])
                setGroupSuggestions((gmProfiles as FriendProfile[]).filter(p => !connectedIds.has(p.id)).slice(0, 5))
              }
            }
          }
        } catch { /* group suggestions non-critical */ }
      } catch (err) {
        console.error('Profile page load error:', err)
        setLoadError(true)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [navigate, loadFriends, retryKey])

  // Debounced search
  useEffect(() => {
    if (searchQuery.length < 2) { setSearchResults([]); return }
    const t = setTimeout(async () => {
      const excluded = new Set([...friends.map(f => f.friend.id), ...pendingReceived.map(f => f.friend.id), ...sentIds, profile?.id ?? ''])
      const { data } = await supabase.from('users').select('id, name, username, avatar_url, affiliation')
        .or(`username.ilike.%${searchQuery}%,name.ilike.%${searchQuery}%`).limit(8)
      setSearchResults(((data as FriendProfile[]) ?? []).filter(u => !excluded.has(u.id)))
    }, 300)
    return () => clearTimeout(t)
  }, [searchQuery, profile, friends, pendingReceived, sentIds])

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !profile) return
    if (cropUrlRef.current) URL.revokeObjectURL(cropUrlRef.current)
    const url = URL.createObjectURL(file)
    cropUrlRef.current = url
    setCropSrc(url)
    e.target.value = ''
  }

  async function handleCropDone(blob: Blob) {
    if (!profile) return
    setCropSrc(null)
    setAvatarUploading(true)
    const path = `${profile.id}/avatar.jpg`
    const { error: upErr } = await supabase.storage.from('avatars').upload(path, blob, { upsert: true, contentType: 'image/jpeg' })
    if (upErr) { console.error('Avatar upload error:', upErr); setAvatarUploading(false); return }
    const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path)
    const bustUrl = `${publicUrl}?t=${Date.now()}`
    await supabase.from('users').update({ avatar_url: bustUrl }).eq('id', profile.id)
    setProfile(prev => prev ? { ...prev, avatar_url: bustUrl } : prev)
    if (cropUrlRef.current) { URL.revokeObjectURL(cropUrlRef.current); cropUrlRef.current = null }
    setAvatarUploading(false)
  }

  function handleCropCancel() {
    setCropSrc(null)
    if (cropUrlRef.current) { URL.revokeObjectURL(cropUrlRef.current); cropUrlRef.current = null }
  }

  async function updateField(field: string, value: string) {
    if (!profile) return
    const { error } = await supabase.from('users').update({ [field]: value || null }).eq('id', profile.id)
    if (error) { console.error(`Error updating ${field}:`, error); return }
    setProfile(prev => prev ? { ...prev, [field]: value || null } : prev)
  }

  async function sendFriendRequest(recipientId: string) {
    if (!profile) return
    const { error } = await supabase.from('friendships').insert({ requester_id: profile.id, recipient_id: recipientId, status: 'pending' })
    if (error) { console.error('Friend request error:', error); return }
    setSentIds(prev => new Set(prev).add(recipientId))
    setSearchResults(prev => prev.filter(u => u.id !== recipientId))
  }

  async function acceptFriend(friendshipId: string) {
    const { error } = await supabase.from('friendships').update({ status: 'accepted' }).eq('id', friendshipId)
    if (error) return
    if (profile) {
      const row = pendingReceived.find(r => r.id === friendshipId)
      const otherId = row?.friend.id
      const [mySR, theirSR] = await Promise.all([
        supabase.from('user_scores').select('social_score').eq('user_id', profile.id).maybeSingle(),
        otherId ? supabase.from('user_scores').select('social_score').eq('user_id', otherId).maybeSingle() : Promise.resolve({ data: null }),
      ])
      await Promise.all([
        supabase.from('user_scores').update({ social_score: Math.min((mySR.data?.social_score ?? 0) + 5, 100) }).eq('user_id', profile.id),
        otherId ? supabase.from('user_scores').update({ social_score: Math.min(((theirSR as { data: { social_score: number } | null }).data?.social_score ?? 0) + 5, 100) }).eq('user_id', otherId) : Promise.resolve(),
      ])
      await loadFriends(profile.id)
    }
  }

  async function declineFriend(friendshipId: string) {
    const { error } = await supabase.from('friendships').delete().eq('id', friendshipId)
    if (error) return
    if (profile) await loadFriends(profile.id)
  }

  async function removeFriend(friendshipId: string) {
    const { error } = await supabase.from('friendships').delete().eq('id', friendshipId)
    if (error) return
    if (profile) await loadFriends(profile.id)
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
    localStorage.removeItem('onboarding_goal')
    localStorage.removeItem('onboarding_experience')
    localStorage.removeItem('onboarding_equipment')
    navigate('/onboarding/step1')
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

  if (loadError || !profile) {
    return (
      <div className="app-shell">
        <div className="app-content" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', padding: '0 24px', gap: 12, background: c.bg }}>
          <p style={{ color: c.text, fontSize: 18, fontWeight: 700, margin: 0 }}>Couldn't load your profile</p>
          <p style={{ color: c.textSub, fontSize: 13, textAlign: 'center', margin: 0 }}>Check your connection and try again.</p>
          <button
            onClick={() => { setLoadError(false); setLoading(true); setProfile(null); setRetryKey(k => k + 1) }}
            style={{ background: c.accent, color: '#FFF', border: 'none', borderRadius: 12, padding: '12px 28px', fontSize: 14, fontWeight: 700, cursor: 'pointer', marginTop: 8 }}
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  const strengthScore = scores?.strength_score ?? 0
  const consistencyScore = calculateConsistencyScore(workoutsThisWeek)
  const ascendScore = scores?.ascend_score ?? 0
  const weeksActive = Math.max(1, Math.floor((Date.now() - new Date(profile.created_at).getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1)
  const avatarIni = initials(profile.name)

  return (
    <div className="app-shell">
      {cropSrc && <CropModal src={cropSrc} onDone={handleCropDone} onCancel={handleCropCancel} />}
      <div className="app-content page-scroll" style={{ background: c.bg }}>
        <div style={{ padding: '48px 20px 0' }}>

          {/* ── Avatar + identity ── */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ position: 'relative', marginBottom: 7 }}>
              <div
                onClick={() => setShowAvatarPreview(true)}
                style={{ width: 88, height: 88, borderRadius: '50%', background: c.border, border: `3px solid ${c.accentBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', overflow: 'hidden', position: 'relative' }}
              >
                {profile.avatar_url
                  ? <img src={profile.avatar_url} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : <span style={{ color: c.accent, fontSize: 28, fontWeight: 700 }}>{avatarIni}</span>}
                {avatarUploading && (
                  <div style={{ position: 'absolute', inset: 0, background: `${c.bg}99`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ color: c.accent, fontSize: 12 }}>…</span>
                  </div>
                )}
              </div>
              <div
                onClick={e => { e.stopPropagation(); fileInputRef.current?.click() }}
                style={{ position: 'absolute', bottom: 0, right: 0, width: 26, height: 26, borderRadius: '50%', background: c.accent, border: `2px solid ${c.bg}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" stroke="#FFF" strokeWidth="2"/><circle cx="12" cy="13" r="4" stroke="#FFF" strokeWidth="2"/></svg>
              </div>
              <input ref={fileInputRef} type="file" accept="image/*" onChange={handleAvatarUpload} style={{ display: 'none' }} />
            </div>
            <h1 style={{ color: c.text, fontSize: 24, fontWeight: 700, margin: '0 0 1px', textAlign: 'center' }}>{profile.name}</h1>
            <p style={{ color: c.textSub, fontSize: 13, margin: '0 0 1px' }}>@{profile.username}</p>
            {(profile.school_year || profile.affiliation) && (
              <p style={{ color: c.textSub, fontSize: 12, margin: 0 }}>
                {[profile.school_year, profile.affiliation].filter(Boolean).join(' · ')}
              </p>
            )}
          </div>

          {/* ── Score row ── */}
          {(() => {
            const myRank = getRankInfo(ascendScore)
            const streakDays = scores?.streak_days ?? 0
            const cardBase: React.CSSProperties = { flex: 1, background: c.surface, border: `1px solid ${c.border}`, borderRadius: 14, padding: '12px 10px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between' }
            const labelStyle: React.CSSProperties = { color: c.textSub, fontSize: 9, letterSpacing: '1.2px', textTransform: 'uppercase', margin: 0 }
            const contentStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flex: 1, justifyContent: 'space-between', paddingTop: 6 }
            return (
              <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                {/* Rank */}
                <div style={cardBase}>
                  <p style={labelStyle}>Rank</p>
                  <div style={contentStyle}>
                    <RankBadge tier={myRank.tier} size={28} accentColor={c.accent} />
                    <p style={{ color: myRank.color === 'accent' ? c.accent : myRank.color, fontSize: 11, fontWeight: 700, margin: 0, lineHeight: 1 }}>{myRank.name}</p>
                  </div>
                </div>
                {/* Ascend Score */}
                <div style={{ ...cardBase, background: c.accentBg, border: `1px solid ${c.accentBorder}` }}>
                  <p style={{ ...labelStyle, color: c.accent }}>Ascend Score</p>
                  <div style={contentStyle}>
                    <p style={{ color: c.accent, fontSize: 24, fontWeight: 700, margin: 0, lineHeight: 1 }}>{ascendScore}</p>
                    <button
                      onClick={() => setShowScoreInfo(true)}
                      style={{ background: 'none', border: `1px solid ${c.textSub}`, padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 13, height: 13, borderRadius: '50%', flexShrink: 0 }}
                      aria-label="Learn about Ascend Score"
                    >
                      <span style={{ color: c.textSub, fontSize: 7, fontWeight: 700, lineHeight: 1 }}>i</span>
                    </button>
                  </div>
                </div>
                {/* Streak */}
                <div style={cardBase}>
                  <p style={labelStyle}>Streak</p>
                  <div style={contentStyle}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <p style={{ color: c.text, fontSize: 24, fontWeight: 700, margin: 0, lineHeight: 1 }}>{streakDays}</p>
                      <span style={{ fontSize: 24, lineHeight: 1 }}>🔥</span>
                    </div>
                    <p style={{ color: c.textSub, fontSize: 11, margin: 0, lineHeight: 1 }}>days</p>
                  </div>
                </div>
              </div>
            )
          })()}

          {/* ── Ascend Score Breakdown ── */}
          {(() => {
            const socialScore  = scores?.social_score ?? 0
            const streakScore  = Math.min(Math.round((scores?.streak_days ?? 0) * (100 / 30)), 100)
            const strengthPct  = (strengthScore % 15) / 15 * 100
            const factors = [
              [{ label: 'Strength', pct: strengthPct }, { label: 'Consistency', pct: consistencyScore }],
              [{ label: 'Social',   pct: socialScore  }, { label: 'Streak',      pct: streakScore     }],
            ]
            return (
              <div style={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 14, padding: '12px 16px', marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14 }}>
                  <p style={{ color: c.textSub, fontSize: 10, letterSpacing: '1.5px', textTransform: 'uppercase', margin: 0 }}>Ascend Score Breakdown</p>
                  <button
                    onClick={() => setShowBreakdownInfo(true)}
                    style={{ background: 'none', border: `1px solid ${c.textSub}`, padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 13, height: 13, borderRadius: '50%', flexShrink: 0 }}
                  >
                    <span style={{ color: c.textSub, fontSize: 7, fontWeight: 700, lineHeight: 1 }}>i</span>
                  </button>
                </div>
                <div style={{ display: 'flex', gap: 14 }}>
                  {factors.map((col, ci) => (
                    <React.Fragment key={ci}>
                      {ci === 1 && <div style={{ width: 1, background: c.border, alignSelf: 'stretch', flexShrink: 0 }} />}
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 14 }}>
                        {col.map(({ label, pct }) => (
                          <div key={label}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                              <p style={{ color: c.text, fontSize: 12, fontWeight: 600, margin: 0 }}>{label}</p>
                              <p style={{ color: c.textSub, fontSize: 10, margin: 0 }}>{Math.round(pct)}%</p>
                            </div>
                            <div style={{ background: c.border, borderRadius: 3, height: 4, overflow: 'hidden' }}>
                              <div style={{ background: c.accent, height: '100%', width: `${pct}%`, borderRadius: 3, transition: 'width 0.6s ease' }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    </React.Fragment>
                  ))}
                </div>
              </div>
            )
          })()}

          {/* ── Badge Collection ── */}
          {(() => {
            const myRank = getRankInfo(ascendScore)
            return (
              <div style={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 14, padding: '14px 16px', marginBottom: 10 }}>
                <button
                  onClick={() => setBadgesExpanded(v => !v)}
                  style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: badgesExpanded ? 16 : 0 }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <p style={{ color: c.textSub, fontSize: 10, letterSpacing: '1.5px', textTransform: 'uppercase', margin: 0 }}>Badges</p>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" style={{ transform: badgesExpanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease', flexShrink: 0 }}>
                      <path d="M6 9l6 6 6-6" stroke={c.textSub} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <p style={{ color: c.accent, fontSize: 11, fontWeight: 700, margin: 0 }}>{myRank.tier} / 12 unlocked</p>
                </button>
                {badgesExpanded && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '18px 6px' }}>
                  {RANKS.map(rank => {
                    const isUnlocked = myRank.tier >= rank.tier
                    return (
                      <div key={rank.tier} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
                        <div style={{ filter: isUnlocked ? 'none' : 'blur(5px)', opacity: isUnlocked ? 1 : 0.3, transition: 'filter 0.3s, opacity 0.3s' }}>
                          <RankBadge tier={rank.tier} size={40} accentColor={c.accent} />
                        </div>
                        <p style={{ color: isUnlocked ? c.text : c.textFaint, fontSize: 9, fontWeight: isUnlocked ? 700 : 400, margin: 0, textAlign: 'center', letterSpacing: '0.3px' }}>
                          {rank.name}
                        </p>
                      </div>
                    )
                  })}
                </div>}
              </div>
            )
          })()}

          {/* ── Personal Records ── */}
          <div style={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 14, padding: '14px 16px', marginBottom: 10 }}>
            <button
              onClick={() => setPrsExpanded(v => !v)}
              style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: prsExpanded && prs.length > 0 ? 12 : 0 }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <p style={{ color: c.textSub, fontSize: 10, letterSpacing: '1.5px', textTransform: 'uppercase', margin: 0 }}>Personal Records</p>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" style={{ transform: prsExpanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease', flexShrink: 0 }}>
                  <path d="M6 9l6 6 6-6" stroke={c.textSub} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <p style={{ color: c.accent, fontSize: 11, fontWeight: 700, margin: 0 }}>{prs.length} logged</p>
            </button>
            {prsExpanded && (
              prs.length === 0 ? (
                <p style={{ color: c.textSub, fontSize: 13, margin: 0 }}>No PRs logged yet.</p>
              ) : (
                <div style={{ borderTop: `1px solid ${c.border}`, paddingTop: 4 }}>
                  {prs.map((pr, i) => (
                    <div key={pr.exercise_name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 0', borderBottom: i < prs.length - 1 ? `1px solid ${c.border}` : 'none' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontSize: 14 }}>{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '🏅'}</span>
                        <span style={{ color: c.text, fontSize: 13, fontWeight: 600 }}>{pr.exercise_name}</span>
                      </div>
                      <span style={{ color: c.accent, fontSize: 14, fontWeight: 700 }}>{pr.weight} lb</span>
                    </div>
                  ))}
                </div>
              )
            )}
          </div>

          {/* ── Share Ascend Score ── */}
          <button
            onClick={async () => {
              const shareText = `I'm ranked #${campusRank > 0 ? campusRank : '?'} at Penn on Ascend — Score: ${ascendScore}. Train with me: ${window.location.origin}/profile/${profile.id}`
              if (navigator.share) {
                try { await navigator.share({ title: 'Ascend', text: shareText }) } catch { /* dismissed */ }
              } else {
                await navigator.clipboard.writeText(shareText)
                setShareCopied(true)
                setTimeout(() => setShareCopied(false), 2000)
              }
            }}
            style={{
              width: '100%', background: c.surface, border: `1px solid ${c.border}`,
              borderRadius: 14, padding: '14px 16px', marginBottom: 14,
              color: c.accent,
              fontSize: 14, fontWeight: 700, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}
          >
            {shareCopied ? '✓ Link copied' : '↗ Share your Ascend Score'}
          </button>


          {/* ── My Groups ── */}
          {myProfileGroups.length > 0 && (
            <>
              <p style={{ color: c.textSub, fontSize: 10, letterSpacing: '1.5px', textTransform: 'uppercase', margin: '0 0 10px' }}>My Groups</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
                {myProfileGroups.map(m => (
                  <span key={m.group_id} style={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 8, padding: '5px 10px', fontSize: 12, fontWeight: 600 }}>
                    <span style={{ color: c.text }}>{m.name}</span>
                    {m.role === 'admin' && <span style={{ color: c.accent }}> (Admin)</span>}
                  </span>
                ))}
              </div>
            </>
          )}


          {/* ── Stats row ── */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
            {[
              { label: 'Workouts', value: String(totalWorkouts) },
              { label: 'Volume', value: formatVolume(totalVolume) },
              { label: 'Weeks Active', value: String(weeksActive) },
            ].map(stat => (
              <div key={stat.label} style={{ flex: 1, background: c.surface, border: `1px solid ${c.border}`, borderRadius: 12, padding: '10px 8px', textAlign: 'center' }}>
                <p style={{ color: c.text, fontSize: 16, fontWeight: 700, margin: '0 0 3px' }}>{stat.value}</p>
                <p style={{ color: c.textSub, fontSize: 10, margin: 0 }}>{stat.label}</p>
              </div>
            ))}
          </div>

          {/* ── Friends ── */}
          <p style={{ color: c.textSub, fontSize: 10, letterSpacing: '1.5px', textTransform: 'uppercase', margin: '0 0 4px' }}>Friends</p>
          <p style={{ color: c.textSub, fontSize: 11, margin: '0 0 10px', lineHeight: 1.4 }}>
            Each friend you add boosts your Ascend score.
          </p>

          {/* Group-based friend suggestions */}
          {groupSuggestions.length > 0 && (
            <>
              <p style={{ color: c.textSub, fontSize: 10, letterSpacing: '1.5px', textTransform: 'uppercase', margin: '0 0 8px' }}>People in your groups</p>
              <div style={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 12, padding: '4px 14px', marginBottom: 12 }}>
                {groupSuggestions.map((u, i) => (
                  <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: i < groupSuggestions.length - 1 ? `1px solid ${c.border}` : 'none' }}>
                    <div style={{ width: 32, height: 32, borderRadius: '50%', background: c.border, display: 'flex', alignItems: 'center', justifyContent: 'center', color: c.accent, fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                      {initials(u.name)}
                    </div>
                    <div style={{ flex: 1 }}>
                      <p style={{ color: c.text, fontSize: 13, fontWeight: 600, margin: 0 }}>{u.name}</p>
                      <p style={{ color: c.textSub, fontSize: 11, margin: 0 }}>@{u.username}</p>
                    </div>
                    <button
                      onClick={() => sendFriendRequest(u.id)}
                      disabled={sentIds.has(u.id)}
                      style={{ background: sentIds.has(u.id) ? 'transparent' : c.accent, border: sentIds.has(u.id) ? `1px solid ${c.border}` : 'none', borderRadius: 8, padding: '5px 12px', color: sentIds.has(u.id) ? c.textSub : '#FFF', fontSize: 12, fontWeight: 700, cursor: sentIds.has(u.id) ? 'default' : 'pointer' }}
                    >
                      {sentIds.has(u.id) ? 'Sent' : 'Add'}
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Friend search */}
          <input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search by username…"
            style={{ width: '100%', background: c.inputBg, border: `1px solid ${c.border}`, borderRadius: 12, padding: '12px 16px', color: c.text, fontSize: 14, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box', marginBottom: 8 }}
          />

          {searchResults.length > 0 && (
            <div style={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 12, padding: '4px 14px', marginBottom: 8 }}>
              {searchResults.map(u => (
                <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: `1px solid ${c.border}` }}>
                  <div style={{ width: 32, height: 32, borderRadius: '50%', background: c.border, display: 'flex', alignItems: 'center', justifyContent: 'center', color: c.accent, fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                    {initials(u.name)}
                  </div>
                  <div style={{ flex: 1 }}>
                    <p style={{ color: c.text, fontSize: 13, fontWeight: 600, margin: 0 }}>{u.name}</p>
                    <p style={{ color: c.textSub, fontSize: 11, margin: 0 }}>@{u.username}</p>
                  </div>
                  <button onClick={() => sendFriendRequest(u.id)} style={{ background: c.accent, border: 'none', borderRadius: 8, padding: '5px 12px', color: '#FFF', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Add</button>
                </div>
              ))}
            </div>
          )}

          {/* Pending requests */}
          {pendingReceived.length > 0 && (
            <div style={{ background: c.surface, border: `1px solid ${c.accentBorder}`, borderRadius: 12, padding: '4px 14px', marginBottom: 8 }}>
              <p style={{ color: c.accent, fontSize: 11, fontWeight: 700, margin: '10px 0 4px' }}>Friend Requests ({pendingReceived.length})</p>
              {pendingReceived.map(item => (
                <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderTop: `1px solid ${c.border}` }}>
                  <div style={{ width: 32, height: 32, borderRadius: '50%', background: c.border, display: 'flex', alignItems: 'center', justifyContent: 'center', color: c.accent, fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{initials(item.friend.name)}</div>
                  <div style={{ flex: 1 }}>
                    <p style={{ color: c.text, fontSize: 13, fontWeight: 600, margin: 0 }}>{item.friend.name}</p>
                    <p style={{ color: c.textSub, fontSize: 11, margin: 0 }}>@{item.friend.username}</p>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => acceptFriend(item.id)} style={{ background: c.accent, border: 'none', borderRadius: 8, padding: '5px 10px', color: '#FFF', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Accept</button>
                    <button onClick={() => declineFriend(item.id)} style={{ background: 'transparent', border: `1px solid ${c.border}`, borderRadius: 8, padding: '5px 10px', color: c.textSub, fontSize: 12, cursor: 'pointer' }}>Decline</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Friends list with remove */}
          {friends.length > 0 && (
            <div style={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 12, padding: '4px 14px', marginBottom: 8 }}>
              {friends.map((item, i) => (
                <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: i < friends.length - 1 ? `1px solid ${c.border}` : 'none' }}>
                  <div
                    onClick={() => navigate(`/profile/${item.friend.id}`)}
                    style={{ width: 32, height: 32, borderRadius: '50%', background: c.border, border: `1.5px solid ${c.accentBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: c.accent, fontSize: 11, fontWeight: 700, flexShrink: 0, cursor: 'pointer', overflow: 'hidden' }}
                  >
                    {item.friend.avatar_url
                      ? <img src={item.friend.avatar_url} alt={item.friend.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : initials(item.friend.name)}
                  </div>
                  <div style={{ flex: 1, cursor: 'pointer' }} onClick={() => navigate(`/profile/${item.friend.id}`)}>
                    <p style={{ color: c.text, fontSize: 13, fontWeight: 600, margin: 0 }}>{item.friend.name}</p>
                    <p style={{ color: c.textSub, fontSize: 11, margin: 0 }}>@{item.friend.username}</p>
                  </div>
                  <button onClick={() => removeFriend(item.id)} style={{ background: 'transparent', border: 'none', color: c.textSub, fontSize: 11, cursor: 'pointer', padding: '4px 0' }}>Remove</button>
                </div>
              ))}
            </div>
          )}

          {/* ── Editable fields ── */}
          {/* ── Appearance ─────────────────────────────────────────── */}
          <p style={{ color: c.textSub, fontSize: 10, letterSpacing: '1.5px', textTransform: 'uppercase', margin: '20px 0 10px' }}>Appearance</p>

          {/* Theme toggle */}
          <div style={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 12, padding: '12px 16px', marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <p style={{ color: c.textSub, fontSize: 10, letterSpacing: '1.5px', textTransform: 'uppercase', margin: '0 0 3px' }}>Theme</p>
              <p style={{ color: c.text, fontSize: 14, margin: 0 }}>{theme === 'dark' ? 'Dark mode' : 'Light mode'}</p>
            </div>
            <button
              onClick={toggleTheme}
              style={{ background: c.accentBg, border: `1px solid ${c.accentBorder}`, borderRadius: 20, padding: '6px 14px', color: c.accent, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
            >
              {theme === 'dark' ? '☀️ Light' : '🌙 Dark'}
            </button>
          </div>

          {/* Accent color */}
          <div style={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 12, padding: '14px 16px', marginBottom: 8 }}>
            <p style={{ color: c.textSub, fontSize: 10, letterSpacing: '1.5px', textTransform: 'uppercase', margin: '0 0 14px' }}>App Color</p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'nowrap', justifyContent: 'space-between' }}>
              {Object.entries(ACCENT_COLORS).map(([key, def]) => {
                const selected = accentKey === key
                return (
                  <button
                    key={key}
                    onClick={() => setAccentColor(key)}
                    title={def.label}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}
                  >
                    <div style={{
                      width: 28, height: 28, borderRadius: '50%',
                      background: c.isDark ? def.dark : def.light,
                      border: selected ? `3px solid ${c.text}` : '3px solid transparent',
                      boxShadow: selected ? `0 0 0 2px ${c.isDark ? def.dark : def.light}` : 'none',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      transition: 'border 0.1s, box-shadow 0.1s',
                    }}>
                      {selected && (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                          <path d="M5 13l4 4L19 7" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          <p style={{ color: c.textSub, fontSize: 10, letterSpacing: '1.5px', textTransform: 'uppercase', margin: '20px 0 10px' }}>Profile Settings</p>

          <EditableField label="Full Name" value={profile.name} onSave={v => updateField('name', v)} />
          <EditableField label="Username" value={profile.username} locked />
          <EditableField label="Goal" value={profile.goal ?? ''} display={displayGoal(profile.goal)} options={GOAL_OPTIONS} onSave={v => updateField('goal', v)} />
          <EditableField label="Experience Level" value={profile.experience_level ?? ''} display={displayExperience(profile.experience_level)} options={EXPERIENCE_OPTIONS} onSave={v => updateField('experience_level', v)} />
          <EditableField label="Equipment" value={profile.equipment ?? ''} display={displayEquipment(profile.equipment)} options={EQUIPMENT_OPTIONS} onSave={v => updateField('equipment', v)} />
          <EditableField label="School Year" value={profile.school_year ?? ''} options={SCHOOL_YEAR_OPTIONS} onSave={v => updateField('school_year', v)} />

          {/* Sign out */}
          <button
            onClick={handleSignOut}
            style={{ width: '100%', background: 'transparent', border: 'none', color: c.textSub, fontSize: 14, padding: '20px 0 8px', cursor: 'pointer' }}
          >
            Sign out
          </button>

        </div>
      </div>

      {/* ── Breakdown info modal ── */}
      {showBreakdownInfo && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setShowBreakdownInfo(false)}
        >
          <div
            style={{ background: c.surface, border: `0.5px solid ${c.border}`, borderRadius: 18, padding: '20px 22px', width: 'calc(100% - 48px)', maxWidth: 320 }}
            onClick={e => e.stopPropagation()}
          >
            <p style={{ color: c.text, fontSize: 15, fontWeight: 700, margin: '0 0 16px' }}>How it's calculated</p>
            {[
              { name: 'Strength',    desc: 'Based on your heaviest lifts normalized against bodyweight. The bar resets every 15 points as you climb.' },
              { name: 'Consistency', desc: 'Tracks sessions completed this week against a 5-workout target, with 2 free rest days built in.' },
              { name: 'Social',      desc: 'Earned by adding friends and checking into the gym. Reflects how active you are in the Penn community.' },
              { name: 'Streak',      desc: 'Your streak normalized to 30 days. Bonus points unlock at 7 days (+5), 14 days (+10), and 30 days (+20) — these can push your score above 100.' },
            ].map((f, i, arr) => (
              <div key={f.name} style={{ paddingBottom: i < arr.length - 1 ? 12 : 0, marginBottom: i < arr.length - 1 ? 12 : 0, borderBottom: i < arr.length - 1 ? `1px solid ${c.border}` : 'none' }}>
                <p style={{ color: c.text, fontSize: 13, fontWeight: 700, margin: '0 0 3px' }}>{f.name}</p>
                <p style={{ color: c.textSub, fontSize: 12, lineHeight: 1.55, margin: 0 }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Avatar preview ── */}
      {showAvatarPreview && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setShowAvatarPreview(false)}
        >
          <div style={{ width: 240, height: 240, borderRadius: '50%', border: `3px solid ${c.accentBorder}`, overflow: 'hidden', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: c.border }}>
            {profile.avatar_url
              ? <img src={profile.avatar_url} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <span style={{ color: c.accent, fontSize: 72, fontWeight: 700 }}>{avatarIni}</span>}
          </div>
        </div>
      )}

      {/* ── Score info sheet ── */}
      {showScoreInfo && (() => {
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
              <button
                onClick={() => setShowScoreInfo(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 0 20px', display: 'flex', alignItems: 'center', gap: 6, color: c.textSub }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <path d="M15 18l-6-6 6-6" stroke={c.textSub} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span style={{ fontSize: 14, fontWeight: 600 }}>Back</span>
              </button>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, marginBottom: 28 }}>
                <RankBadge tier={currentRank.tier} size={80} accentColor={c.accent} />
                <div style={{ textAlign: 'center' }}>
                  <p style={{ color: rankColor, fontSize: 22, fontWeight: 800, margin: '0 0 2px', letterSpacing: '-0.4px' }}>{currentRank.name}</p>
                  <p style={{ color: c.textSub, fontSize: 12, margin: 0 }}>Tier {currentRank.tier} of {RANKS.length}</p>
                </div>
              </div>
              <div style={{
                background: c.isDark ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.65)',
                backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
                border: `1px solid ${c.isDark ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.9)'}`,
                boxShadow: c.isDark ? 'none' : '0 4px 20px rgba(0,0,0,0.10)',
                borderRadius: 14, padding: '12px 16px', marginBottom: 14,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <span style={{ color: c.textSub, fontSize: 12, fontWeight: 600, letterSpacing: '1px', textTransform: 'uppercase' }}>Ascend Score</span>
                <span style={{ color: c.accent, fontSize: 32, fontWeight: 800, lineHeight: 1 }}>{ascendScore}</span>
              </div>
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
              <p style={{ color: c.textSub, fontSize: 13, lineHeight: 1.6, margin: 0 }}>
                Your Ascend Score reflects how consistently you train, how hard you push, and how you engage with the community. It updates after every logged workout.
              </p>
            </div>
          </div>
        )
      })()}

    </div>
  )
}
