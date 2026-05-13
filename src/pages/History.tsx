import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useTheme } from '../lib/theme'

interface LogRow {
  exercise_name: string
  sets: number
  reps: number
  weight: number
}

interface WorkoutRow {
  id: string
  workout_date: string
  workout_type: string | null
  duration: number | null
  logs: LogRow[]
}

type Period = '1M' | '3M' | 'All'

function workoutVolume(logs: LogRow[]): number {
  return logs.reduce((sum, l) => sum + l.sets * l.reps * (l.weight > 0 ? l.weight : 0), 0)
}

function fmtVol(v: number): string {
  return v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(Math.round(v))
}

function VolumeChart({ data, accent, border, textSub }: {
  data: { date: Date; volume: number }[]
  accent: string; border: string; textSub: string
}) {
  if (data.length < 2) return (
    <p style={{ color: textSub, fontSize: 12, textAlign: 'center', margin: '24px 0' }}>
      Log at least 2 weighted workouts to see your volume trend.
    </p>
  )

  const W = 300, H = 110
  const padL = 36, padR = 8, padT = 10, padB = 22
  const chartW = W - padL - padR
  const chartH = H - padT - padB

  const vols = data.map(d => d.volume)
  const maxV = Math.max(...vols)
  const minV = Math.min(...vols)
  const range = maxV - minV || 1

  const xs = (i: number) => padL + (i / (data.length - 1)) * chartW
  const ys = (v: number) => padT + chartH - ((v - minV) / range) * chartH

  const pts = data.map((d, i) => [xs(i), ys(d.volume)] as [number, number])

  const linePath = pts.map(([x, y], i) => {
    if (i === 0) return `M${x},${y}`
    const [px, py] = pts[i - 1]
    const cx = (px + x) / 2
    return `C${cx},${py} ${cx},${y} ${x},${y}`
  }).join(' ')

  const areaPath = `${linePath} L${pts[pts.length - 1][0]},${padT + chartH} L${padL},${padT + chartH} Z`

  const yTicks = [minV, (minV + maxV) / 2, maxV]
  const xTickIdxs = data.length <= 4
    ? data.map((_, i) => i)
    : [0, Math.floor((data.length - 1) / 2), data.length - 1]

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
      <defs>
        <linearGradient id="vg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={accent} stopOpacity={0.25} />
          <stop offset="100%" stopColor={accent} stopOpacity={0.01} />
        </linearGradient>
      </defs>
      {/* Grid lines */}
      {yTicks.map((v, i) => (
        <line key={i} x1={padL} y1={ys(v)} x2={W - padR} y2={ys(v)} stroke={border} strokeWidth={0.5} />
      ))}
      {/* Area */}
      <path d={areaPath} fill="url(#vg)" />
      {/* Line */}
      <path d={linePath} fill="none" stroke={accent} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      {/* Dots */}
      {pts.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={i === pts.length - 1 ? 3.5 : 2.5} fill={accent}
          stroke={i === pts.length - 1 ? accent : 'none'} strokeWidth={i === pts.length - 1 ? 2 : 0}
          fillOpacity={i === pts.length - 1 ? 1 : 0.85} />
      ))}
      {/* Y labels */}
      {yTicks.map((v, i) => (
        <text key={i} x={padL - 5} y={ys(v) + 3} textAnchor="end" fontSize={7} fill={textSub}>{fmtVol(v)}</text>
      ))}
      {/* X labels */}
      {xTickIdxs.map((i, pos) => {
        const anchor = pos === 0 ? 'start' : pos === xTickIdxs.length - 1 ? 'end' : 'middle'
        return (
          <text key={i} x={xs(i)} y={H - 4} textAnchor={anchor} fontSize={7} fill={textSub}>
            {data[i].date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </text>
        )
      })}
    </svg>
  )
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  const weekday = d.toLocaleDateString('en-US', { weekday: 'short' })
  const monthDay = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return `${weekday} · ${monthDay}`
}

function condensedSummary(w: WorkoutRow): string {
  const parts: string[] = []
  if (w.duration) parts.push(`${w.duration} min`)
  if (w.logs.length > 0) {
    const exercises = w.logs.slice(0, 3).map(l => {
      const base = `${l.exercise_name} ${l.sets}×${l.reps}`
      return l.weight > 0 ? `${base} @ ${l.weight}lb` : base
    })
    parts.push(...exercises)
  }
  return parts.join(' · ')
}

export default function History() {
  const navigate = useNavigate()
  const { colors: c } = useTheme()
  const [workouts, setWorkouts] = useState<WorkoutRow[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [prRecords, setPrRecords] = useState<Map<string, number>>(new Map())
  const [period, setPeriod] = useState<Period>('1M')

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { navigate('/auth'); return }

      const { data: workoutData } = await supabase
        .from('workouts')
        .select('id, workout_date, workout_type, duration')
        .eq('user_id', user.id)
        .eq('completed', true)
        .order('workout_date', { ascending: false })
        .limit(50)

      if (!workoutData || workoutData.length === 0) {
        setLoading(false)
        return
      }

      const ids = workoutData.map(w => w.id as string)
      const { data: logData } = await supabase
        .from('exercise_logs')
        .select('workout_id, exercise_name, sets, reps, weight')
        .in('workout_id', ids)

      const { data: prData } = await supabase
        .from('personal_records')
        .select('exercise_name, weight')
        .eq('user_id', user.id)

      const prMap = new Map<string, number>()
      for (const pr of prData ?? []) {
        prMap.set(pr.exercise_name as string, pr.weight as number)
      }

      const logMap = new Map<string, LogRow[]>()
      for (const l of logData ?? []) {
        const arr = logMap.get(l.workout_id as string) ?? []
        arr.push({
          exercise_name: l.exercise_name as string,
          sets: l.sets as number,
          reps: l.reps as number,
          weight: (l.weight as number) ?? 0,
        })
        logMap.set(l.workout_id as string, arr)
      }

      setWorkouts(workoutData.map(w => ({
        id: w.id as string,
        workout_date: w.workout_date as string,
        workout_type: w.workout_type as string | null,
        duration: w.duration as number | null,
        logs: logMap.get(w.id as string) ?? [],
      })))
      setPrRecords(prMap)
      setLoading(false)
    }
    load()
  }, [navigate])

  if (loading) {
    return (
      <div className="app-shell">
        <div className="app-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: c.bg }}>
          <div style={{ color: c.textSub, fontSize: 14 }}>Loading…</div>
        </div>
      </div>
    )
  }

  return (
    <div className="app-shell">
      <div className="app-content page-scroll" style={{ background: c.bg }}>
        <div style={{ padding: '52px 20px 0' }}>

          <button
            onClick={() => navigate('/home')}
            style={{ background: 'none', border: 'none', color: c.accent, fontSize: 14, fontWeight: 600, cursor: 'pointer', padding: '0 0 16px', display: 'flex', alignItems: 'center', gap: 4 }}
          >
            ← Back
          </button>

          <h1 style={{ color: c.text, fontSize: 22, fontWeight: 700, margin: '0 0 20px' }}>Progress</h1>

          {/* ── Volume chart ── */}
          {workouts.length > 0 && (() => {
            const now = Date.now()
            const cutoff = period === '1M' ? 30 : period === '3M' ? 90 : Infinity
            const chartData = [...workouts]
              .reverse()
              .filter(w => (now - new Date(w.workout_date).getTime()) / 86400000 <= cutoff)
              .map(w => ({ date: new Date(w.workout_date), volume: workoutVolume(w.logs) }))
              .filter(d => d.volume > 0)
            return (
              <div style={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 16, padding: '14px 16px', marginBottom: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <p style={{ color: c.textSub, fontSize: 10, letterSpacing: '1.5px', textTransform: 'uppercase', margin: 0 }}>Volume (lbs)</p>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {(['1M', '3M', 'All'] as Period[]).map(p => (
                      <button key={p} onClick={() => setPeriod(p)} style={{
                        background: period === p ? c.accentBg : 'none',
                        border: `1px solid ${period === p ? c.accent : c.border}`,
                        borderRadius: 8, padding: '3px 9px',
                        color: period === p ? c.accent : c.textSub,
                        fontSize: 11, fontWeight: period === p ? 700 : 400, cursor: 'pointer',
                      }}>{p}</button>
                    ))}
                  </div>
                </div>
                <VolumeChart data={chartData} accent={c.accent} border={c.border} textSub={c.textSub} />
              </div>
            )
          })()}

          {/* ── Workout history ── */}
          {workouts.length === 0 ? (
            <div style={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 14, padding: 32, textAlign: 'center' }}>
              <p style={{ color: c.textSub, fontSize: 13, margin: 0 }}>No workouts yet. Complete your first session to see history here.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 32 }}>
              {workouts.map(w => {
                const isExpanded = expandedId === w.id
                const title = w.workout_type ?? 'Workout'
                const preview = condensedSummary(w)

                return (
                  <div
                    key={w.id}
                    onClick={() => setExpandedId(isExpanded ? null : w.id)}
                    style={{
                      background: c.surface,
                      border: `1px solid ${c.border}`,
                      borderRadius: 14,
                      padding: '14px 16px',
                      cursor: 'pointer',
                    }}
                  >
                    {/* Header row */}
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                          <span style={{ fontSize: 14 }}>⚡</span>
                          <p style={{ color: c.text, fontSize: 14, fontWeight: 700, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {title}
                          </p>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <p style={{ color: c.textSub, fontSize: 11, margin: 0 }}>{formatDate(w.workout_date)}</p>
                          {w.duration && (
                            <p style={{ color: c.textSub, fontSize: 11, margin: 0 }}>{w.duration} min</p>
                          )}
                        </div>
                      </div>
                      <span style={{ color: c.textSub, fontSize: 18, flexShrink: 0, lineHeight: 1 }}>
                        {isExpanded ? '∧' : '∨'}
                      </span>
                    </div>

                    {/* Preview when collapsed */}
                    {!isExpanded && preview && (
                      <p style={{ color: c.textSub, fontSize: 11, margin: '8px 0 0', lineHeight: 1.5 }}>
                        {preview}
                      </p>
                    )}

                    {/* Expanded detail */}
                    {isExpanded && (
                      <div style={{ marginTop: 12, borderTop: `1px solid ${c.border}`, paddingTop: 10 }}>
                        {w.logs.length === 0 ? (
                          <p style={{ color: c.textSub, fontSize: 12, margin: 0 }}>No exercise data logged.</p>
                        ) : (
                          w.logs.map((log, i) => (
                            <div
                              key={i}
                              style={{
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                padding: '8px 0',
                                borderTop: i > 0 ? `1px solid ${c.border}` : 'none',
                              }}
                            >
                              <span style={{ color: c.text, fontSize: 13, fontWeight: 600 }}>{log.exercise_name}</span>
                              <span style={{ color: c.textSub, fontSize: 12 }}>
                                {log.sets}×{log.reps}{log.weight > 0 ? ` @ ${log.weight}lb` : ''}
                              </span>
                              {prRecords.get(log.exercise_name) === log.weight && log.weight > 0 && (
                                <span style={{ color: '#F5A623', fontSize: 10, fontWeight: 700, marginLeft: 4 }}>🏆 PR</span>
                              )}
                            </div>
                          ))
                        )}
                      </div>
                    )}
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
