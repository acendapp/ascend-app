import { useEffect, useState, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'

import StreakDots from '../components/StreakDots'
import { supabase } from '../lib/supabase'
import {
  displayGoal, displayExperience, displayEquipment,
  GOAL_OPTIONS, EXPERIENCE_OPTIONS, EQUIPMENT_OPTIONS, SCHOOL_YEAR_OPTIONS,
} from '../lib/display'
import { calculateConsistencyScore } from '../lib/scoring'
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
      <div style={{ background: '#0D1728', border: '1px solid #4A9EFF', borderRadius: 12, padding: '12px 16px', marginBottom: 8 }}>
        <p style={{ color: '#4A9EFF', fontSize: 10, letterSpacing: '1.5px', textTransform: 'uppercase', margin: '0 0 6px' }}>{label}</p>
        {options ? (
          <select value={draft} onChange={e => setDraft(e.target.value)} style={{ background: 'transparent', border: 'none', color: '#FFFFFF', fontSize: 14, width: '100%', outline: 'none', fontFamily: 'inherit', cursor: 'pointer' }}>
            <option value="" style={{ background: '#0D1728' }}>Not set</option>
            {options.map(o => <option key={o.value} value={o.value} style={{ background: '#0D1728' }}>{o.label}</option>)}
          </select>
        ) : (
          <input
            value={draft}
            onChange={e => setDraft(e.target.value)}
            autoFocus
            onKeyDown={e => e.key === 'Enter' && commit()}
            style={{ background: 'transparent', border: 'none', color: '#FFFFFF', fontSize: 14, width: '100%', outline: 'none', fontFamily: 'inherit' }}
          />
        )}
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <button onClick={commit} disabled={saving} style={{ background: '#4A9EFF', color: '#FFF', border: 'none', borderRadius: 8, padding: '5px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button onClick={() => setEditing(false)} style={{ background: 'transparent', color: '#5A7A9A', border: 'none', padding: '5px 6px', fontSize: 12, cursor: 'pointer' }}>Cancel</button>
        </div>
      </div>
    )
  }

  return (
    <button
      onClick={() => { if (!locked) { setDraft(value); setEditing(true) } }}
      style={{ width: '100%', background: '#0D1728', border: '1px solid #1A2A42', borderRadius: 12, padding: '12px 16px', marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: locked ? 'default' : 'pointer', textAlign: 'left' }}
    >
      <div>
        <p style={{ color: '#5A7A9A', fontSize: 10, letterSpacing: '1.5px', textTransform: 'uppercase', margin: '0 0 3px' }}>{label}</p>
        <p style={{ color: (display ?? value) ? '#FFFFFF' : '#5A7A9A', fontSize: 14, margin: 0 }}>{(display ?? value) || 'Tap to set'}</p>
      </div>
      {locked
        ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><rect x="3" y="11" width="18" height="11" rx="2" stroke="#5A7A9A" strokeWidth="2"/><path d="M7 11V7a5 5 0 0110 0v4" stroke="#5A7A9A" strokeWidth="2" strokeLinecap="round"/></svg>
        : <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" stroke="#5A7A9A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" stroke="#5A7A9A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
      }
    </button>
  )
}

// ── Score mini-card ───────────────────────────────────────────────────────────

function ScoreCard({ label, value, unit, accent }: { label: string; value: number; unit?: string; accent?: boolean }) {
  return (
    <div style={{ flex: 1, background: accent ? '#0A1F3A' : '#0D1728', border: `1px solid ${accent ? '#1E3D6E' : '#1A2A42'}`, borderRadius: 14, padding: '12px 10px', textAlign: 'center' }}>
      <p style={{ color: '#5A7A9A', fontSize: 9, letterSpacing: '1.2px', textTransform: 'uppercase', margin: '0 0 6px' }}>{label}</p>
      <p style={{ color: accent ? '#4A9EFF' : '#FFFFFF', fontSize: 24, fontWeight: 700, margin: 0, lineHeight: 1 }}>{value}{unit}</p>
    </div>
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
          overflow: 'hidden', border: '2px solid #4A9EFF',
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
          style={{ width: '100%', accentColor: '#4A9EFF' }}
        />
        <p style={{ color: '#5A7A9A', fontSize: 11, textAlign: 'center', margin: '4px 0 16px' }}>
          Pinch or drag to adjust · slide to zoom
        </p>
      </div>
      <div style={{ display: 'flex', gap: 10, width: CROP_SIZE }}>
        <button onClick={onCancel} style={{ flex: 1, background: 'transparent', border: '1px solid #2A3A52', borderRadius: 12, padding: '12px', color: '#5A7A9A', fontSize: 14, cursor: 'pointer' }}>
          Cancel
        </button>
        <button onClick={cropAndReturn} disabled={!imgDims} style={{ flex: 2, background: '#4A9EFF', border: 'none', borderRadius: 12, padding: '12px', color: '#FFFFFF', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
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

  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [scores, setScores] = useState<UserScores | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [retryKey, setRetryKey] = useState(0)
  const [avatarUploading, setAvatarUploading] = useState(false)
  const [cropSrc, setCropSrc] = useState<string | null>(null)
  const cropUrlRef = useRef<string | null>(null)

  const [weekDays, setWeekDays] = useState<boolean[]>(new Array(7).fill(false))
  const [prs, setPrs] = useState<{ exercise_name: string; weight: number }[]>([])
  const [totalWorkouts, setTotalWorkouts] = useState(0)
  const [totalVolume, setTotalVolume] = useState(0)
  const [workoutsLast30Days, setWorkoutsLast30Days] = useState(0)

  const [campusRank, setCampusRank] = useState(0)

  interface ProfileGroup { group_id: string; role: 'admin' | 'member'; name: string }
  const [myProfileGroups, setMyProfileGroups] = useState<ProfileGroup[]>([])

  interface FriendCard { id: string; name: string; username: string; avatar_url: string | null; ascend_score: number }
  const [friendCards, setFriendCards] = useState<FriendCard[]>([])
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

        console.log('[Profile] session user id:', user.id, '| email:', user.email)

        const thirtyAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

        const [profileRes, scoresRes, allPRsRes, workoutsRes, recentWorkoutsRes] = await Promise.all([
          supabase.from('users').select('*').eq('id', user.id).maybeSingle(),
          supabase.from('user_scores').select('*').eq('user_id', user.id).maybeSingle(),
          supabase.from('personal_records').select('exercise_name, weight').eq('user_id', user.id).order('weight', { ascending: false }),
          supabase.from('workouts').select('id', { count: 'exact' }).eq('user_id', user.id).eq('completed', true),
          supabase.from('workouts').select('id, workout_date').eq('user_id', user.id).eq('completed', true).gte('workout_date', thirtyAgo),
        ])

        console.log('[Profile] users query result — data:', profileRes.data, '| error:', profileRes.error)

        let profileData = profileRes.data
        if (!profileData && user.email) {
          // Fallback: look up by email in case the row id doesn't match auth uid
          const { data: byEmail, error: byEmailErr } = await supabase
            .from('users').select('*').eq('email', user.email).maybeSingle()
          console.log('[Profile] email fallback — data:', byEmail, '| error:', byEmailErr)
          profileData = byEmail
        }

        if (!profileData) {
          console.error('[Profile] no profile row found for uid:', user.id, 'email:', user.email)
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
    await supabase.from('users').update({ avatar_url: publicUrl }).eq('id', profile.id)
    setProfile(prev => prev ? { ...prev, avatar_url: publicUrl } : prev)
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
    await supabase.from('friendships').update({ status: 'accepted' }).eq('id', friendshipId)
    // +5 social points for both users when a friend request is accepted
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
    await supabase.from('friendships').delete().eq('id', friendshipId)
    if (profile) await loadFriends(profile.id)
  }

  async function removeFriend(friendshipId: string) {
    await supabase.from('friendships').delete().eq('id', friendshipId)
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
        <div className="app-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
          <div style={{ color: '#5A7A9A', fontSize: 14 }}>Loading…</div>
        </div>
      </div>
    )
  }

  if (loadError || !profile) {
    return (
      <div className="app-shell">
        <div className="app-content" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', padding: '0 24px', gap: 12 }}>
          <p style={{ color: '#FFFFFF', fontSize: 18, fontWeight: 700, margin: 0 }}>Couldn't load your profile</p>
          <p style={{ color: '#5A7A9A', fontSize: 13, textAlign: 'center', margin: 0 }}>Check your connection and try again.</p>
          <button
            onClick={() => { setLoadError(false); setLoading(true); setProfile(null); setRetryKey(k => k + 1) }}
            style={{ background: '#4A9EFF', color: '#FFF', border: 'none', borderRadius: 12, padding: '12px 28px', fontSize: 14, fontWeight: 700, cursor: 'pointer', marginTop: 8 }}
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  const strengthScore = scores?.strength_score ?? 0
  const consistencyScore = calculateConsistencyScore(workoutsLast30Days)
  const ascendScore = scores?.ascend_score ?? 0
  const weeksActive = Math.max(1, Math.floor((Date.now() - new Date(profile.created_at).getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1)
  const avatarIni = initials(profile.name)

  return (
    <div className="app-shell">
      {cropSrc && <CropModal src={cropSrc} onDone={handleCropDone} onCancel={handleCropCancel} />}
      <div className="app-content page-scroll">
        <div style={{ padding: '48px 20px 0' }}>

          {/* ── Avatar + identity ── */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 24 }}>
            <div style={{ position: 'relative', marginBottom: 14 }}>
              <div
                onClick={() => fileInputRef.current?.click()}
                style={{ width: 88, height: 88, borderRadius: '50%', background: '#1A2A42', border: '3px solid #1E3D6E', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', overflow: 'hidden', position: 'relative' }}
              >
                {profile.avatar_url
                  ? <img src={profile.avatar_url} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : <span style={{ color: '#4A9EFF', fontSize: 28, fontWeight: 700 }}>{avatarIni}</span>}
                {avatarUploading && (
                  <div style={{ position: 'absolute', inset: 0, background: '#080E1C99', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ color: '#4A9EFF', fontSize: 12 }}>…</span>
                  </div>
                )}
              </div>
              <div onClick={() => fileInputRef.current?.click()} style={{ position: 'absolute', bottom: 0, right: 0, width: 26, height: 26, borderRadius: '50%', background: '#4A9EFF', border: '2px solid #080E1C', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" stroke="#FFF" strokeWidth="2"/><circle cx="12" cy="13" r="4" stroke="#FFF" strokeWidth="2"/></svg>
              </div>
              <input ref={fileInputRef} type="file" accept="image/*" onChange={handleAvatarUpload} style={{ display: 'none' }} />
            </div>
            <h1 style={{ color: '#FFFFFF', fontSize: 24, fontWeight: 700, margin: '0 0 3px', textAlign: 'center' }}>{profile.name}</h1>
            <p style={{ color: '#5A7A9A', fontSize: 13, margin: '0 0 3px' }}>@{profile.username}</p>
            {(profile.school_year || profile.affiliation) && (
              <p style={{ color: '#5A7A9A', fontSize: 12, margin: 0 }}>
                {[profile.school_year, profile.affiliation].filter(Boolean).join(' · ')}
              </p>
            )}
          </div>

          {/* ── Score row ── */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <ScoreCard label="Strength" value={strengthScore} />
            <ScoreCard label="Consistency" value={consistencyScore} unit="%" />
            <ScoreCard label="Ascend" value={ascendScore} accent />
          </div>

          {/* ── Campus rank ── */}
          <div style={{ background: '#0A1F3A', border: '1px solid #1E3D6E', borderRadius: 14, padding: '14px 16px', marginBottom: 14 }}>
            <p style={{ color: '#5A7A9A', fontSize: 10, letterSpacing: '1.5px', textTransform: 'uppercase', margin: '0 0 4px' }}>Campus Rank</p>
            {totalWorkouts < 3 ? (
              <>
                <p style={{ color: '#5A7A9A', fontSize: 22, fontWeight: 700, margin: '0 0 2px' }}>🔒 Locked</p>
                <p style={{ color: '#5A7A9A', fontSize: 12, margin: 0 }}>
                  Complete {3 - totalWorkouts} more workout{3 - totalWorkouts !== 1 ? 's' : ''} to unlock your rank
                </p>
              </>
            ) : (
              <>
                <p style={{ color: '#4A9EFF', fontSize: 22, fontWeight: 700, margin: '0 0 2px' }}>
                  Ranked #{campusRank > 0 ? campusRank : '—'} at Penn
                </p>
                <p style={{ color: '#5A7A9A', fontSize: 12, margin: 0 }}>
                  {campusRank > 0
                    ? `Top ${campusRank <= 10 ? '10' : campusRank <= 25 ? '25' : '50'} · Penn Campus`
                    : 'Complete a workout to get ranked'}
                </p>
              </>
            )}
          </div>

          {/* ── Streak ── */}
          <div style={{ background: '#0D1728', border: '1px solid #1A2A42', borderRadius: 14, padding: '12px 16px', marginBottom: 14 }}>
            <p style={{ color: '#5A7A9A', fontSize: 10, letterSpacing: '1.5px', textTransform: 'uppercase', margin: '0 0 10px' }}>Last 7 Days</p>
            <StreakDots days={weekDays} />
          </div>

          {/* ── My Groups ── */}
          {myProfileGroups.length > 0 && (
            <>
              <p style={{ color: '#5A7A9A', fontSize: 10, letterSpacing: '1.5px', textTransform: 'uppercase', margin: '0 0 10px' }}>My Groups</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
                {myProfileGroups.map(m => (
                  <span key={m.group_id} style={{ background: '#0D1728', border: '1px solid #1A2A42', borderRadius: 8, padding: '5px 10px', fontSize: 12, fontWeight: 600 }}>
                    <span style={{ color: '#FFFFFF' }}>{m.name}</span>
                    {m.role === 'admin' && <span style={{ color: '#4A9EFF' }}> (Admin)</span>}
                  </span>
                ))}
              </div>
            </>
          )}

          {/* ── Personal Records ── */}
          {prs.length > 0 && (
            <>
              <p style={{ color: '#5A7A9A', fontSize: 10, letterSpacing: '1.5px', textTransform: 'uppercase', margin: '0 0 10px' }}>Personal Records</p>
              <div style={{ background: '#0D1728', border: '1px solid #1A2A42', borderRadius: 14, padding: '4px 16px', marginBottom: 14 }}>
                {prs.map((pr, i) => (
                  <div key={pr.exercise_name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 0', borderBottom: i < prs.length - 1 ? '1px solid #1A2A42' : 'none' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ color: i === 0 ? '#F5A623' : '#5A7A9A', fontSize: 14 }}>{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '🏅'}</span>
                      <span style={{ color: '#FFFFFF', fontSize: 13, fontWeight: 600 }}>{pr.exercise_name}</span>
                    </div>
                    <span style={{ color: '#4A9EFF', fontSize: 14, fontWeight: 700 }}>{pr.weight} lb</span>
                  </div>
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
              <div key={stat.label} style={{ flex: 1, background: '#0D1728', border: '1px solid #1A2A42', borderRadius: 12, padding: '10px 8px', textAlign: 'center' }}>
                <p style={{ color: '#FFFFFF', fontSize: 16, fontWeight: 700, margin: '0 0 3px' }}>{stat.value}</p>
                <p style={{ color: '#5A7A9A', fontSize: 10, margin: 0 }}>{stat.label}</p>
              </div>
            ))}
          </div>

          {/* ── Friends horizontal scroll ── */}
          <p style={{ color: '#5A7A9A', fontSize: 10, letterSpacing: '1.5px', textTransform: 'uppercase', margin: '0 0 10px' }}>Friends</p>
          {friendCards.length > 0 ? (
            <div className="friend-scroll" style={{ marginBottom: 14 }}>
              {friendCards.map(fc => (
                <div key={fc.id} onClick={() => navigate(`/profile/${fc.id}`)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, flexShrink: 0, cursor: 'pointer' }}>
                  <div style={{ width: 52, height: 52, borderRadius: '50%', background: '#1A2A42', border: '2px solid #1E3D6E', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                    {fc.avatar_url
                      ? <img src={fc.avatar_url} alt={fc.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : <span style={{ color: '#4A9EFF', fontSize: 14, fontWeight: 700 }}>{initials(fc.name)}</span>}
                  </div>
                  <p style={{ color: '#FFFFFF', fontSize: 10, fontWeight: 600, margin: 0, maxWidth: 56, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'center' }}>
                    {fc.name.split(' ')[0]}
                  </p>
                  <p style={{ color: '#4A9EFF', fontSize: 10, fontWeight: 700, margin: 0 }}>{fc.ascend_score}</p>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ color: '#5A7A9A', fontSize: 13, marginBottom: 14 }}>Search below to add friends.</p>
          )}

          {/* Group-based friend suggestions */}
          {groupSuggestions.length > 0 && (
            <>
              <p style={{ color: '#5A7A9A', fontSize: 10, letterSpacing: '1.5px', textTransform: 'uppercase', margin: '0 0 8px' }}>People in your groups</p>
              <div style={{ background: '#0D1728', border: '1px solid #1A2A42', borderRadius: 12, padding: '4px 14px', marginBottom: 12 }}>
                {groupSuggestions.map((u, i) => (
                  <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: i < groupSuggestions.length - 1 ? '1px solid #1A2A42' : 'none' }}>
                    <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#1A2A42', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4A9EFF', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                      {initials(u.name)}
                    </div>
                    <div style={{ flex: 1 }}>
                      <p style={{ color: '#FFFFFF', fontSize: 13, fontWeight: 600, margin: 0 }}>{u.name}</p>
                      <p style={{ color: '#5A7A9A', fontSize: 11, margin: 0 }}>@{u.username}</p>
                    </div>
                    <button
                      onClick={() => sendFriendRequest(u.id)}
                      disabled={sentIds.has(u.id)}
                      style={{ background: sentIds.has(u.id) ? 'transparent' : '#4A9EFF', border: sentIds.has(u.id) ? '1px solid #1A2A42' : 'none', borderRadius: 8, padding: '5px 12px', color: sentIds.has(u.id) ? '#5A7A9A' : '#FFF', fontSize: 12, fontWeight: 700, cursor: sentIds.has(u.id) ? 'default' : 'pointer' }}
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
            style={{ width: '100%', background: '#0D1728', border: '1px solid #1A2A42', borderRadius: 12, padding: '12px 16px', color: '#FFFFFF', fontSize: 14, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box', marginBottom: 8 }}
          />

          {searchResults.length > 0 && (
            <div style={{ background: '#0D1728', border: '1px solid #1A2A42', borderRadius: 12, padding: '4px 14px', marginBottom: 8 }}>
              {searchResults.map(u => (
                <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid #1A2A42' }}>
                  <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#1A2A42', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4A9EFF', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                    {initials(u.name)}
                  </div>
                  <div style={{ flex: 1 }}>
                    <p style={{ color: '#FFFFFF', fontSize: 13, fontWeight: 600, margin: 0 }}>{u.name}</p>
                    <p style={{ color: '#5A7A9A', fontSize: 11, margin: 0 }}>@{u.username}</p>
                  </div>
                  <button onClick={() => sendFriendRequest(u.id)} style={{ background: '#4A9EFF', border: 'none', borderRadius: 8, padding: '5px 12px', color: '#FFF', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Add</button>
                </div>
              ))}
            </div>
          )}

          {/* Pending requests */}
          {pendingReceived.length > 0 && (
            <div style={{ background: '#0D1728', border: '1px solid #1E3D6E', borderRadius: 12, padding: '4px 14px', marginBottom: 8 }}>
              <p style={{ color: '#4A9EFF', fontSize: 11, fontWeight: 700, margin: '10px 0 4px' }}>Friend Requests ({pendingReceived.length})</p>
              {pendingReceived.map(item => (
                <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderTop: '1px solid #1A2A42' }}>
                  <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#1A2A42', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4A9EFF', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{initials(item.friend.name)}</div>
                  <div style={{ flex: 1 }}>
                    <p style={{ color: '#FFFFFF', fontSize: 13, fontWeight: 600, margin: 0 }}>{item.friend.name}</p>
                    <p style={{ color: '#5A7A9A', fontSize: 11, margin: 0 }}>@{item.friend.username}</p>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => acceptFriend(item.id)} style={{ background: '#4A9EFF', border: 'none', borderRadius: 8, padding: '5px 10px', color: '#FFF', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Accept</button>
                    <button onClick={() => declineFriend(item.id)} style={{ background: 'transparent', border: '1px solid #1A2A42', borderRadius: 8, padding: '5px 10px', color: '#5A7A9A', fontSize: 12, cursor: 'pointer' }}>Decline</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Friends list with remove */}
          {friends.length > 0 && (
            <div style={{ background: '#0D1728', border: '1px solid #1A2A42', borderRadius: 12, padding: '4px 14px', marginBottom: 8 }}>
              {friends.map((item, i) => (
                <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: i < friends.length - 1 ? '1px solid #1A2A42' : 'none' }}>
                  <div
                    onClick={() => navigate(`/profile/${item.friend.id}`)}
                    style={{ width: 32, height: 32, borderRadius: '50%', background: '#1A2A42', border: '1.5px solid #1E3D6E', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4A9EFF', fontSize: 11, fontWeight: 700, flexShrink: 0, cursor: 'pointer', overflow: 'hidden' }}
                  >
                    {item.friend.avatar_url
                      ? <img src={item.friend.avatar_url} alt={item.friend.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : initials(item.friend.name)}
                  </div>
                  <div style={{ flex: 1, cursor: 'pointer' }} onClick={() => navigate(`/profile/${item.friend.id}`)}>
                    <p style={{ color: '#FFFFFF', fontSize: 13, fontWeight: 600, margin: 0 }}>{item.friend.name}</p>
                    <p style={{ color: '#5A7A9A', fontSize: 11, margin: 0 }}>@{item.friend.username}</p>
                  </div>
                  <button onClick={() => removeFriend(item.id)} style={{ background: 'transparent', border: 'none', color: '#5A7A9A', fontSize: 11, cursor: 'pointer', padding: '4px 0' }}>Remove</button>
                </div>
              ))}
            </div>
          )}

          {/* ── Editable fields ── */}
          <p style={{ color: '#5A7A9A', fontSize: 10, letterSpacing: '1.5px', textTransform: 'uppercase', margin: '20px 0 10px' }}>Profile Settings</p>

          <EditableField label="Full Name" value={profile.name} onSave={v => updateField('name', v)} />
          <EditableField label="Username" value={profile.username} locked />
          <EditableField label="Goal" value={profile.goal ?? ''} display={displayGoal(profile.goal)} options={GOAL_OPTIONS} onSave={v => updateField('goal', v)} />
          <EditableField label="Experience Level" value={profile.experience_level ?? ''} display={displayExperience(profile.experience_level)} options={EXPERIENCE_OPTIONS} onSave={v => updateField('experience_level', v)} />
          <EditableField label="Equipment" value={profile.equipment ?? ''} display={displayEquipment(profile.equipment)} options={EQUIPMENT_OPTIONS} onSave={v => updateField('equipment', v)} />
          <EditableField label="School Year" value={profile.school_year ?? ''} options={SCHOOL_YEAR_OPTIONS} onSave={v => updateField('school_year', v)} />

          {/* Sign out */}
          <button
            onClick={handleSignOut}
            style={{ width: '100%', background: 'transparent', border: 'none', color: '#5A7A9A', fontSize: 14, padding: '20px 0 8px', cursor: 'pointer' }}
          >
            Sign out
          </button>

        </div>
      </div>
    </div>
  )
}
