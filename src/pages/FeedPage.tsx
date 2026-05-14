import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useTheme } from '../lib/theme'

// ── Types ─────────────────────────────────────────────────────────────────────

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
  userId?: string
  avatarUrl?: string | null
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

const DEMO_FEED: FeedDisplayItem[] = [
  { id: 'df1', name: 'Jake Morrison',  mainText: 'hit a new PR',            subText: '315 lb Squat',            timeStr: '12m ago', activityType: 'pr',          isPlaceholder: true },
  { id: 'df2', name: 'Sarah Chen',     mainText: 'kept their streak',       subText: '14 day streak',           timeStr: '1h ago',  activityType: 'streak',      isPlaceholder: true },
  { id: 'df3', name: 'Marcus Lee',     mainText: 'checked in',              subText: 'Pottruck Fitness Center', timeStr: '2h ago',  activityType: 'checkin',     isPlaceholder: true },
  { id: 'df4', name: 'Priya Patel',    mainText: 'moved up',                subText: 'Now ranked #2 at Penn',   timeStr: '3h ago',  activityType: 'leaderboard', leaderboardDelta: 4, isPlaceholder: true },
  { id: 'df5', name: 'Tyler Ross',     mainText: 'hit a new PR',            subText: '225 lb Bench Press',      timeStr: '5h ago',  activityType: 'pr',          isPlaceholder: true },
  { id: 'df6', name: 'Alex Kim',       mainText: 'reached Contender',       subText: 'New rank achieved',       timeStr: '6h ago',  activityType: 'rank',        rankTier: 3, isPlaceholder: true },
  { id: 'df7', name: 'Jordan Wu',      mainText: 'worked out',              subText: 'Upper Body',              timeStr: '8h ago',  activityType: 'workout',     isPlaceholder: true },
  { id: 'df8', name: 'Emma Liu',       mainText: 'checked in',              subText: 'Fox Fitness Center',      timeStr: '10h ago', activityType: 'checkin',     isPlaceholder: true },
  { id: 'df9', name: 'Kai Nguyen',     mainText: 'hit a new PR',            subText: '185 lb Deadlift',         timeStr: '1d ago',  activityType: 'pr',          isPlaceholder: true },
  { id: 'df10', name: 'Zara Ahmed',    mainText: 'kept their streak',       subText: '7 day streak',            timeStr: '1d ago',  activityType: 'streak',      isPlaceholder: true },
]

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

// ── Component ─────────────────────────────────────────────────────────────────

export default function FeedPage() {
  const navigate = useNavigate()
  const { colors: c } = useTheme()
  const [items, setItems] = useState<FeedDisplayItem[]>([])
  const [loading, setLoading] = useState(true)
  const [feedReactions, setFeedReactions] = useState<Record<string, { counts: Reactions; mine: { clap: boolean } }>>({})

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

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { navigate('/auth'); return }

      const { data: friendships } = await supabase
        .from('friendships')
        .select('requester_id, recipient_id')
        .or(`requester_id.eq.${user.id},recipient_id.eq.${user.id}`)
        .eq('status', 'accepted')
      const friendIds = (friendships ?? []).map(f =>
        f.requester_id === user.id ? f.recipient_id : f.requester_id
      )

      // Fetch activity events for self + friends
      const visibleIds = [user.id, ...friendIds]
      const { data: events } = await supabase
        .from('activity_events')
        .select('id, user_id, event_type, title, subtitle, created_at')
        .in('user_id', visibleIds)
        .order('created_at', { ascending: false })
        .limit(15)

      // Resolve names + avatars for everyone visible (self + friends)
      const nameMap = new Map<string, string>()
      const avatarMap = new Map<string, string | null>()
      const { data: profiles } = await supabase
        .from('users').select('id, name, avatar_url').in('id', visibleIds)
      for (const p of profiles ?? []) {
        nameMap.set(p.id as string, p.name as string)
        avatarMap.set(p.id as string, (p.avatar_url as string | null) ?? null)
      }

      const realItems: FeedDisplayItem[] = (events ?? []).map(ev => ({
        id: ev.id as string,
        name: ev.user_id === user.id ? 'You' : (nameMap.get(ev.user_id as string) ?? 'Someone'),
        mainText: ev.title as string,
        subText: (ev.subtitle as string) ?? '',
        timeStr: timeAgo(ev.created_at as string),
        activityType: ev.event_type as FeedDisplayItem['activityType'],
        isPlaceholder: false,
        avatarUrl: avatarMap.get(ev.user_id as string) ?? null,
        userId: ev.user_id === user.id ? undefined : ev.user_id as string,
      }))

      const MAX_FEED = 15
      const placeholdersNeeded = Math.max(0, MAX_FEED - realItems.length)
      setItems([...realItems, ...DEMO_FEED.slice(0, placeholdersNeeded)])
      setLoading(false)
    }
    load()
  }, [navigate])

  return (
    <div className="app-shell">
      <div className="app-content page-scroll" style={{ background: c.bg }}>
        <div style={{ padding: '52px 16px 100px' }}>

          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
            <button
              onClick={() => navigate(-1)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center' }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M15 18l-6-6 6-6" stroke={c.text} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <span style={{ color: c.text, fontSize: 20, fontWeight: 700 }}>Activity Feed</span>
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', color: c.textSub, fontSize: 14, padding: '40px 0' }}>Loading…</div>
          ) : (
            <div style={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 16, overflow: 'hidden' }}>
              {items.map((item, i) => {
                const rx = getItemReactions(item.id)
                return (
                  <div
                    key={item.id}
                    style={{
                      padding: '10px 14px',
                      borderBottom: i < items.length - 1 ? `1px solid ${c.border}` : 'none',
                    }}
                  >
                    <div
                      onClick={() => !item.isPlaceholder && item.userId ? navigate(`/profile/${item.userId}`) : undefined}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: item.isPlaceholder ? 'default' : 'pointer' }}
                    >
                      <div style={{ width: 36, height: 36, borderRadius: '50%', background: c.surfaceHigh, border: `1px solid ${c.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: c.accent, fontSize: 12, fontWeight: 600, flexShrink: 0, overflow: 'hidden' }}>
                        {item.avatarUrl
                          ? <img src={item.avatarUrl} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          : initials(item.name)}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ margin: '0 0 3px', fontSize: 13, lineHeight: '17px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          <span style={{ color: c.text, fontWeight: 600 }}>{item.name} </span>
                          <span style={{ color: c.text, fontWeight: 400 }}>{item.mainText}</span>
                        </p>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <p style={{ margin: 0, color: c.textSub, fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{item.subText}</p>
                          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                            {REACTION_KEYS.map(key => {
                              const active = rx.mine[key]
                              return (
                                <button
                                  key={key}
                                  onClick={e => { e.stopPropagation(); handleReaction(item.id, key) }}
                                  style={{ display: 'flex', alignItems: 'center', gap: 3, background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
                                >
                                  <span style={{ fontSize: 11, lineHeight: 1 }}>{REACTION_EMOJIS[key]}</span>
                                  <span style={{ color: active ? c.accent : c.textSub, fontSize: 10, fontWeight: active ? 700 : 400, lineHeight: 1 }}>
                                    {rx.counts[key]}
                                  </span>
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      </div>
                      <span style={{ color: c.textSub, fontSize: 10, lineHeight: 1, flexShrink: 0 }}>{item.timeStr}</span>
                    </div>
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
