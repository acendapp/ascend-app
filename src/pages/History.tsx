import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

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
  const [workouts, setWorkouts] = useState<WorkoutRow[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [prRecords, setPrRecords] = useState<Map<string, number>>(new Map())

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
        <div className="app-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
          <div style={{ color: '#5A7A9A', fontSize: 14 }}>Loading…</div>
        </div>
      </div>
    )
  }

  return (
    <div className="app-shell">
      <div className="app-content page-scroll">
        <div style={{ padding: '52px 20px 0' }}>

          <button
            onClick={() => navigate('/home')}
            style={{ background: 'none', border: 'none', color: '#4A9EFF', fontSize: 14, fontWeight: 600, cursor: 'pointer', padding: '0 0 16px', display: 'flex', alignItems: 'center', gap: 4 }}
          >
            ← Back
          </button>

          <h1 style={{ color: '#FFFFFF', fontSize: 22, fontWeight: 700, margin: '0 0 20px' }}>Workout History</h1>

          {workouts.length === 0 ? (
            <div style={{ background: '#0D1728', border: '1px solid #1A2A42', borderRadius: 14, padding: 32, textAlign: 'center' }}>
              <p style={{ color: '#5A7A9A', fontSize: 13, margin: 0 }}>No workouts yet. Complete your first session to see history here.</p>
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
                      background: '#0D1728',
                      border: '1px solid #1A2A42',
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
                          <p style={{ color: '#FFFFFF', fontSize: 14, fontWeight: 700, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {title}
                          </p>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <p style={{ color: '#5A7A9A', fontSize: 11, margin: 0 }}>{formatDate(w.workout_date)}</p>
                          {w.duration && (
                            <p style={{ color: '#5A7A9A', fontSize: 11, margin: 0 }}>{w.duration} min</p>
                          )}
                        </div>
                      </div>
                      <span style={{ color: '#5A7A9A', fontSize: 18, flexShrink: 0, lineHeight: 1 }}>
                        {isExpanded ? '∧' : '∨'}
                      </span>
                    </div>

                    {/* Preview when collapsed */}
                    {!isExpanded && preview && (
                      <p style={{ color: '#5A7A9A', fontSize: 11, margin: '8px 0 0', lineHeight: 1.5 }}>
                        {preview}
                      </p>
                    )}

                    {/* Expanded detail */}
                    {isExpanded && (
                      <div style={{ marginTop: 12, borderTop: '1px solid #1A2A42', paddingTop: 10 }}>
                        {w.logs.length === 0 ? (
                          <p style={{ color: '#5A7A9A', fontSize: 12, margin: 0 }}>No exercise data logged.</p>
                        ) : (
                          w.logs.map((log, i) => (
                            <div
                              key={i}
                              style={{
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                padding: '8px 0',
                                borderTop: i > 0 ? '1px solid #1A2A42' : 'none',
                              }}
                            >
                              <span style={{ color: '#FFFFFF', fontSize: 13, fontWeight: 600 }}>{log.exercise_name}</span>
                              <span style={{ color: '#5A7A9A', fontSize: 12 }}>
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
