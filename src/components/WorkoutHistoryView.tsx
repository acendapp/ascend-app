import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useTheme } from '../lib/theme'
import MuscleMap from './MuscleMap'
import exerciseDB from '../data/exercises.json'

// ── Types ─────────────────────────────────────────────────────────────────────

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

interface WeekVolume {
  weekStart: Date
  volume: number
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getExerciseMuscles(exerciseName: string): string[] {
  const entry = (exerciseDB as Array<{ name: string; primary: string[]; secondary: string[] }>)
    .find(e => e.name.toLowerCase() === exerciseName.toLowerCase())
  if (!entry) return []
  return entry.primary
}

function getMusclesFromWorkoutType(workoutType: string): string[] {
  const t = workoutType.toLowerCase()
  if (t.includes('push')) return ['chest', 'triceps', 'shoulders']
  if (t.includes('pull')) return ['back', 'biceps']
  if (t.includes('leg') || t.includes('lower')) return ['quads', 'hamstrings', 'glutes']
  if (t.includes('upper')) return ['chest', 'back', 'shoulders', 'biceps', 'triceps']
  if (t.includes('full')) return ['chest', 'back', 'shoulders', 'biceps', 'triceps', 'quads', 'hamstrings', 'glutes']
  return []
}

function getMusclesForWorkout(w: WorkoutRow): string[] {
  if (w.logs.length > 0) {
    const muscles = new Set<string>()
    for (const log of w.logs) {
      for (const m of getExerciseMuscles(log.exercise_name)) {
        muscles.add(m)
      }
    }
    if (muscles.size > 0) return Array.from(muscles)
  }
  if (w.workout_type) {
    return getMusclesFromWorkoutType(w.workout_type)
  }
  return []
}

function getISOWeekStart(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay()
  const diff = (day + 6) % 7
  d.setDate(d.getDate() - diff)
  d.setHours(0, 0, 0, 0)
  return d
}

function formatWeekLabel(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

// ── Volume Chart ──────────────────────────────────────────────────────────────

function VolumeChart({ weeks, accentColor, textSubColor, isDark }: {
  weeks: WeekVolume[]
  accentColor: string
  textSubColor: string
  isDark: boolean
}) {
  const W = 320
  const H = 120
  const padL = 8
  const padR = 8
  const padT = 10
  const padB = 28
  const chartW = W - padL - padR
  const chartH = H - padT - padB

  if (weeks.length === 0) return null

  const maxVol = Math.max(...weeks.map(w => w.volume), 1)
  const gridLines = 3

  // Compute x/y positions
  const pts = weeks.map((w, i) => ({
    x: padL + (i / Math.max(weeks.length - 1, 1)) * chartW,
    y: padT + chartH - (w.volume / maxVol) * chartH,
    volume: w.volume,
    label: formatWeekLabel(w.weekStart),
  }))

  // SVG line path
  const linePath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')

  // SVG area fill path (close below the line)
  const areaPath = [
    ...pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`),
    `L${pts[pts.length - 1].x.toFixed(1)},${(padT + chartH).toFixed(1)}`,
    `L${pts[0].x.toFixed(1)},${(padT + chartH).toFixed(1)}`,
    'Z',
  ].join(' ')

  const gridY = Array.from({ length: gridLines }, (_, i) =>
    padT + (i / (gridLines - 1)) * chartH
  )

  const fillId = 'vol-fill'
  const gridStroke = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'

  return (
    <svg width={W} height={H} style={{ display: 'block', overflow: 'visible' }}>
      <defs>
        <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={accentColor} stopOpacity={0.18} />
          <stop offset="100%" stopColor={accentColor} stopOpacity={0.02} />
        </linearGradient>
      </defs>

      {/* Horizontal grid lines */}
      {gridY.map((y, i) => (
        <line key={i} x1={padL} y1={y} x2={padL + chartW} y2={y} stroke={gridStroke} strokeWidth={1} />
      ))}

      {/* Area fill */}
      <path d={areaPath} fill={`url(#${fillId})`} />

      {/* Line */}
      <path d={linePath} fill="none" stroke={accentColor} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

      {/* Dots */}
      {pts.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={3} fill={accentColor} />
      ))}

      {/* X-axis labels — show first, middle, last */}
      {pts.filter((_, i) => i === 0 || i === Math.floor((pts.length - 1) / 2) || i === pts.length - 1).map((p, i) => (
        <text
          key={i}
          x={p.x}
          y={H - 4}
          textAnchor="middle"
          fontSize={8}
          fill={textSubColor}
          style={{ userSelect: 'none' }}
        >
          {p.label}
        </text>
      ))}
    </svg>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function WorkoutHistoryView() {
  const { colors: c } = useTheme()
  const [workouts, setWorkouts] = useState<WorkoutRow[]>([])
  const [weeklyVolume, setWeeklyVolume] = useState<WeekVolume[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Fetch last 20 workouts for the list
      const { data: workoutData } = await supabase
        .from('workouts')
        .select('id, workout_date, workout_type, duration')
        .eq('user_id', user.id)
        .eq('completed', true)
        .order('workout_date', { ascending: false })
        .limit(20)

      // Fetch older workouts for chart (8 weeks back)
      const eightWeeksAgo = new Date()
      eightWeeksAgo.setDate(eightWeeksAgo.getDate() - 56)

      const { data: chartWorkoutData } = await supabase
        .from('workouts')
        .select('id, workout_date')
        .eq('user_id', user.id)
        .eq('completed', true)
        .gte('workout_date', eightWeeksAgo.toISOString())
        .order('workout_date', { ascending: true })

      const allIds = Array.from(new Set([
        ...(workoutData ?? []).map(w => w.id as string),
        ...(chartWorkoutData ?? []).map(w => w.id as string),
      ]))

      if (allIds.length === 0) {
        setLoading(false)
        return
      }

      const { data: logData } = await supabase
        .from('exercise_logs')
        .select('workout_id, exercise_name, sets, reps, weight')
        .in('workout_id', allIds)

      // Build log map
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

      // Build workouts list
      if (workoutData) {
        setWorkouts(workoutData.map(w => ({
          id: w.id as string,
          workout_date: w.workout_date as string,
          workout_type: w.workout_type as string | null,
          duration: w.duration as number | null,
          logs: logMap.get(w.id as string) ?? [],
        })))
      }

      // Build weekly volume for chart
      const weekMap = new Map<string, { weekStart: Date; volume: number }>()

      // Initialize 8 weeks
      const now = new Date()
      for (let i = 7; i >= 0; i--) {
        const d = new Date(now)
        d.setDate(d.getDate() - i * 7)
        const ws = getISOWeekStart(d)
        const key = ws.toISOString()
        if (!weekMap.has(key)) {
          weekMap.set(key, { weekStart: ws, volume: 0 })
        }
      }

      for (const cw of chartWorkoutData ?? []) {
        const ws = getISOWeekStart(new Date(cw.workout_date as string))
        const key = ws.toISOString()
        if (!weekMap.has(key)) continue
        const logs = logMap.get(cw.id as string) ?? []
        for (const l of logs) {
          if (l.weight > 0) {
            weekMap.get(key)!.volume += l.weight * l.reps * l.sets
          }
        }
      }

      const sortedWeeks = Array.from(weekMap.values()).sort((a, b) => a.weekStart.getTime() - b.weekStart.getTime())
      setWeeklyVolume(sortedWeeks)
      setLoading(false)
    }

    load()
  }, [])

  if (loading) {
    return (
      <div style={{ padding: '20px 0', textAlign: 'center', color: c.textSub, fontSize: 13 }}>
        Loading history…
      </div>
    )
  }

  if (workouts.length === 0) {
    return (
      <div style={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 14, padding: 32, textAlign: 'center' }}>
        <p style={{ color: c.textSub, fontSize: 13, margin: 0 }}>No workouts yet. Complete your first session to see history here.</p>
      </div>
    )
  }

  return (
    <div>
      {/* Volume chart */}
      {weeklyVolume.length > 0 && (
        <div style={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 14, padding: '14px 16px', marginBottom: 16 }}>
          <p style={{ color: c.textSub, fontSize: 10, letterSpacing: '1.5px', textTransform: 'uppercase', margin: '0 0 12px' }}>
            Weekly Volume (last 8 weeks)
          </p>
          <VolumeChart
            weeks={weeklyVolume}
            accentColor={c.accent}
            textSubColor={c.textSub}
            isDark={c.isDark}
          />
        </div>
      )}

      {/* Workout list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {workouts.map(w => {
          const isExpanded = expandedId === w.id
          const muscles = getMusclesForWorkout(w)
          const title = w.workout_type ?? 'Workout'

          return (
            <div
              key={w.id}
              onClick={() => setExpandedId(isExpanded ? null : w.id)}
              style={{
                background: c.surface,
                border: `1px solid ${c.border}`,
                borderRadius: 14,
                padding: '12px 14px',
                cursor: 'pointer',
              }}
            >
              {/* Row: date + title on left, small muscle map on right */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ color: c.text, fontSize: 13, fontWeight: 700, margin: '0 0 3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {title}
                  </p>
                  <p style={{ color: c.textSub, fontSize: 11, margin: 0 }}>
                    {formatDate(w.workout_date)}
                    {w.duration ? ` · ${w.duration} min` : ''}
                  </p>
                </div>
                {muscles.length > 0 && (
                  <div style={{ flexShrink: 0 }}>
                    <MuscleMap
                      highlighted={muscles}
                      accentColor={c.accent}
                      isDark={c.isDark}
                      width={100}
                    />
                  </div>
                )}
                <span style={{ color: c.textSub, fontSize: 16, flexShrink: 0 }}>
                  {isExpanded ? '∧' : '∨'}
                </span>
              </div>

              {/* Expanded exercise list */}
              {isExpanded && (
                <div style={{ marginTop: 10, borderTop: `1px solid ${c.border}`, paddingTop: 10 }}>
                  {w.logs.length === 0 ? (
                    <p style={{ color: c.textSub, fontSize: 12, margin: 0 }}>No exercise data logged.</p>
                  ) : (
                    w.logs.map((log, i) => (
                      <div
                        key={i}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '7px 0',
                          borderTop: i > 0 ? `1px solid ${c.border}` : 'none',
                        }}
                      >
                        <span style={{ color: c.text, fontSize: 12, fontWeight: 600 }}>{log.exercise_name}</span>
                        <span style={{ color: c.textSub, fontSize: 11 }}>
                          {log.sets}×{log.reps}{log.weight > 0 ? ` @ ${log.weight}lb` : ''}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
