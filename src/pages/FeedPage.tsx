import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useTheme } from '../lib/theme'
import RankBadge from '../components/RankBadge'

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
  if (type === 'workout') return wrap(<span style={{ fontSize: 18, lineHeight: 1, display: 'block' }}>💪</span>)
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

      const realItems: FeedDisplayItem[] = []

      if (friendIds.length > 0) {
        const [fwRes, fpRes] = await Promise.all([
          supabase.from('workouts')
            .select('id, user_id, workout_date, workout_type, gym_verified')
            .in('user_id', friendIds).eq('completed', true)
            .order('workout_date', { ascending: false }).limit(30),
          supabase.from('personal_records')
            .select('id, user_id, exercise_name, weight, logged_at')
            .in('user_id', friendIds)
            .order('logged_at', { ascending: false }).limit(30),
        ])

        const allUids = [...new Set([
          ...(fwRes.data ?? []).map(w => w.user_id as string),
          ...(fpRes.data ?? []).map(p => p.user_id as string),
        ])]
        const { data: fps } = await supabase.from('users').select('id, name').in('id', allUids)
        const fpMap = new Map((fps ?? []).map(p => [p.id as string, p.name as string]))

        for (const w of fwRes.data ?? []) {
          const name = fpMap.get(w.user_id as string) ?? 'Someone'
          const wType = (w.workout_type as string) ?? 'workout'
          realItems.push({
            id: `w-${w.id}`,
            name,
            mainText: 'worked out',
            subText: wType,
            timeStr: timeAgo(w.workout_date as string),
            activityType: 'workout',
            isPlaceholder: false,
            userId: w.user_id as string,
          })
        }

        for (const pr of fpRes.data ?? []) {
          const name = fpMap.get(pr.user_id as string) ?? 'Someone'
          const w = pr.weight as number | null
          realItems.push({
            id: `pr-${pr.id}`,
            name,
            mainText: 'hit a new PR',
            subText: w ? `${Math.round(w)} lb ${pr.exercise_name as string}` : pr.exercise_name as string,
            timeStr: timeAgo(pr.logged_at as string),
            activityType: 'pr',
            isPlaceholder: false,
            userId: pr.user_id as string,
          })
        }

        realItems.sort((a, b) => {
          const toMs = (s: string) => {
            if (s === 'just now') return 0
            const m = s.match(/^(\d+)(m|h|d) ago$/)
            if (!m) return 0
            const n = parseInt(m[1])
            if (m[2] === 'm') return n * 60 * 1000
            if (m[2] === 'h') return n * 3600 * 1000
            return n * 86400 * 1000
          }
          return toMs(a.timeStr) - toMs(b.timeStr)
        })
      }

      const demoNeeded = Math.max(0, 10 - realItems.length)
      const combined = [...realItems, ...DEMO_FEED.slice(0, demoNeeded)]
      setItems(combined)
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
                      <div style={{ width: 36, height: 36, borderRadius: '50%', background: c.surfaceHigh, border: `1px solid ${c.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: c.accent, fontSize: 12, fontWeight: 600, flexShrink: 0 }}>
                        {initials(item.name)}
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
