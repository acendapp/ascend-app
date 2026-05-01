import { useEffect, useRef, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import AscendBolt from '../components/AscendBolt'
import { supabase } from '../lib/supabase'
import { generateWorkout, suggestSubstitution, parseReps } from '../lib/workout-generator'
import type { GeneratedWorkout, ExerciseItem } from '../lib/workout-generator'
import type { UserProfile } from '../types'
import {
  calculateAscendScore,
  calculateConsistencyScore,
  calculateStrengthScoreFromLogs,
  calculateXPGain,
  getLevelFromXP,
} from '../lib/scoring'
import { notificationPermission, requestPushPermission } from '../lib/notifications'

// ── Types ─────────────────────────────────────────────────────────────────────

type Phase = 'session-picker' | 'recovery' | 'loading' | 'workout' | 'error' | 'summary' | 'pr-celebration' | 'celebration'

interface SummaryData {
  sessionLabel: string
  exercisesCompleted: number
  totalVolume: number
  newPRs: string[]
  scoreChange: number
  xpGain: number
  leveledUp: boolean
  newLevel: number
}

// ── Constants ─────────────────────────────────────────────────────────────────

const LOADING_MESSAGES = [
  'Analyzing your training history…',
  'Checking your recovery…',
  'Building your program…',
  'Almost ready…',
]

const BODYWEIGHT_TERMS = [
  'push-up', 'push up', 'pushup',
  'pull-up', 'pull up', 'pullup',
  'chin-up', 'chin up', 'chinup',
  'dip', 'plank', 'mountain climber',
  'burpee', 'inverted row', 'ring row',
]

// ── Helpers ───────────────────────────────────────────────────────────────────


function getGoalRestSeconds(goal: string | null): number {
  switch (goal) {
    case 'strength': return 180
    case 'lean': return 60
    case 'muscle': return 90
    case 'athletic': return 90
    default: return 90
  }
}

function isBodyweightExercise(ex: ExerciseItem): boolean {
  const n = ex.exercise_name.toLowerCase()
  if (BODYWEIGHT_TERMS.some(t => n.includes(t))) return true
  const w: unknown = ex.suggested_weight
  if (w === 0) return true
  if (typeof w === 'string' && w.toLowerCase().includes('bodyweight')) return true
  return false
}

function getWeightForKey(
  key: string,
  setsCompleted: number,
  savedWeights: Record<string, number>,
  fallback: number,
): number {
  for (let i = setsCompleted - 1; i >= 0; i--) {
    const w = savedWeights[`${key}_${i}`]
    if (w !== undefined && w > 0) return w
  }
  return fallback
}

function fmtTime(totalSecs: number): string {
  const m = Math.floor(totalSecs / 60)
  const s = totalSecs % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

// ── RestTimerRing ─────────────────────────────────────────────────────────────

function RestTimerRing({
  timeLeft,
  total,
  onSkip,
}: {
  timeLeft: number
  total: number
  onSkip: () => void
}) {
  const r = 18
  const circumference = 2 * Math.PI * r
  const progress = total > 0 ? timeLeft / total : 0
  const dashOffset = circumference * (1 - progress)
  const minutes = Math.floor(timeLeft / 60)
  const secs = timeLeft % 60
  const display = minutes > 0 ? `${minutes}:${String(secs).padStart(2, '0')}` : String(secs)

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0' }}>
      <div style={{ position: 'relative', width: 44, height: 44, flexShrink: 0 }}>
        <svg width="44" height="44" style={{ transform: 'rotate(-90deg)' }}>
          <circle cx="22" cy="22" r={r} fill="none" stroke="#1A2A42" strokeWidth="4" />
          <circle
            cx="22" cy="22" r={r}
            fill="none" stroke="#4A9EFF" strokeWidth="4"
            strokeDasharray={`${circumference}`}
            strokeDashoffset={`${dashOffset}`}
            strokeLinecap="round"
          />
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ color: '#4A9EFF', fontSize: 10, fontWeight: 700 }}>{display}</span>
        </div>
      </div>
      <div>
        <p style={{ color: '#7AAAD4', fontSize: 12, margin: '0 0 2px', fontWeight: 600 }}>Rest</p>
        <button
          onClick={onSkip}
          style={{ color: '#5A7A9A', fontSize: 11, background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
        >
          Skip →
        </button>
      </div>
    </div>
  )
}

// ── ExerciseCard ──────────────────────────────────────────────────────────────

function ExerciseCard({
  exercise,
  exerciseKey,
  completedSets,
  activeRestKey,
  activeRestTimeLeft,
  activeRestTotal,
  swapping,
  isBodyweight,
  savedWeights,
  isPreview,
  onCompleteSet,
  onSkipRest,
  onSwap,
  onEditSet,
}: {
  exercise: ExerciseItem
  exerciseKey: string
  completedSets: number
  activeRestKey: string | null
  activeRestTimeLeft: number
  activeRestTotal: number
  swapping: boolean
  isBodyweight: boolean
  savedWeights: Record<string, number>
  isPreview?: boolean
  onCompleteSet: (setIdx: number, weight: number | null) => void
  onSkipRest: () => void
  onSwap: () => void
  onEditSet: (setIdx: number, weight: number) => void
}) {
  const done = completedSets >= exercise.sets
  const isResting = activeRestKey === exerciseKey

  const [pendingSetIdx, setPendingSetIdx] = useState<number | null>(null)
  const [pendingWeight, setPendingWeight] = useState('')
  const [editingSetIdx, setEditingSetIdx] = useState<number | null>(null)
  const [editWeight, setEditWeight] = useState('')
  const [showRpeTooltip, setShowRpeTooltip] = useState(false)
  const rpeRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!showRpeTooltip) return
    function dismiss(e: Event) {
      if (rpeRef.current && !rpeRef.current.contains(e.target as Node)) {
        setShowRpeTooltip(false)
      }
    }
    document.addEventListener('mousedown', dismiss)
    document.addEventListener('touchstart', dismiss)
    return () => {
      document.removeEventListener('mousedown', dismiss)
      document.removeEventListener('touchstart', dismiss)
    }
  }, [showRpeTooltip])

  const currentWeight = getWeightForKey(exerciseKey, completedSets, savedWeights, exercise.suggested_weight)

  function handleSetTap(i: number) {
    if (isBodyweight) {
      onCompleteSet(i, null)
      return
    }
    setEditingSetIdx(null)
    setEditWeight('')
    const prefill = getWeightForKey(exerciseKey, i, savedWeights, exercise.suggested_weight)
    setPendingWeight(prefill > 0 ? String(prefill) : '')
    setPendingSetIdx(i)
  }

  function confirmWeight() {
    if (pendingSetIdx === null) return
    const w = parseFloat(pendingWeight)
    onCompleteSet(pendingSetIdx, isNaN(w) || w <= 0 ? null : w)
    setPendingSetIdx(null)
    setPendingWeight('')
  }

  function openEdit(i: number) {
    setPendingSetIdx(null)
    setPendingWeight('')
    const w = savedWeights[`${exerciseKey}_${i}`] ?? exercise.suggested_weight
    setEditWeight(w > 0 ? String(w) : '')
    setEditingSetIdx(i)
  }

  function confirmEdit() {
    if (editingSetIdx === null) return
    const w = parseFloat(editWeight)
    if (!isNaN(w) && w > 0) onEditSet(editingSetIdx, w)
    setEditingSetIdx(null)
    setEditWeight('')
  }

  return (
    <div
      style={{
        background: done ? '#0A1F3A' : '#0D1728',
        border: `1px solid ${done ? '#1E3D6E' : '#1A2A42'}`,
        borderRadius: 14,
        padding: '14px 16px',
        marginBottom: 8,
        opacity: done ? 0.75 : 1,
        transition: 'all 0.2s',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ flex: 1 }}>
          <p style={{ color: done ? '#4A9EFF' : '#FFFFFF', fontSize: 14, fontWeight: 700, margin: '0 0 2px', textDecoration: done ? 'line-through' : 'none' }}>
            {swapping ? 'Finding substitute…' : exercise.exercise_name}
          </p>
          <p style={{ color: '#5A7A9A', fontSize: 11, margin: 0 }}>{exercise.muscle_group}</p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <div style={{ background: '#1A2A42', borderRadius: 6, padding: '4px 10px', color: '#FFFFFF', fontSize: 11, fontWeight: 700 }}>
              {exercise.sets} × {exercise.reps}
            </div>
            {/* RPE badge + tooltip */}
            <div ref={rpeRef} style={{ position: 'relative' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                <div style={{ background: '#1A2A42', borderRadius: 6, padding: '4px 10px', color: '#5A7A9A', fontSize: 11 }}>
                  RPE {exercise.rpe_target}
                </div>
                <button
                  onClick={e => { e.stopPropagation(); setShowRpeTooltip(v => !v) }}
                  style={{
                    width: 16, height: 16, borderRadius: '50%',
                    background: '#1A2A42', border: 'none',
                    color: '#5A7A9A', fontSize: 9, fontWeight: 700,
                    cursor: 'pointer', display: 'flex',
                    alignItems: 'center', justifyContent: 'center',
                    padding: 0, flexShrink: 0,
                  }}
                >
                  ?
                </button>
              </div>
              {showRpeTooltip && (
                <div style={{
                  position: 'absolute', top: '100%', right: 0, marginTop: 4,
                  zIndex: 100, background: '#0D1728', border: '1px solid #1A2A42',
                  borderRadius: 10, padding: '10px 12px', width: 200,
                  boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
                }}>
                  <p style={{ color: '#7AAAD4', fontSize: 11, lineHeight: 1.5, margin: 0 }}>
                    RPE measures effort. 6 = comfortable, 7 = moderate, 8 = challenging, 9 = very hard, 10 = max.
                  </p>
                </div>
              )}
            </div>
          </div>
          <p style={{ color: '#5A7A9A', fontSize: 11, margin: 0 }}>
            {isBodyweight ? 'Bodyweight' : `${currentWeight} lb`}
          </p>
        </div>
      </div>

      {/* Coaching tip */}
      <p style={{ color: '#5A7A9A', fontSize: 11, lineHeight: 1.4, margin: '0 0 10px', fontStyle: 'italic' }}>
        {exercise.coaching_tip}
      </p>

      {/* Set dots + weight input — disabled in preview */}
      <div style={{ opacity: isPreview ? 0.4 : 1, pointerEvents: isPreview ? 'none' : undefined }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginBottom: pendingSetIdx !== null || editingSetIdx !== null || isResting ? 8 : 0 }}>
        {Array.from({ length: exercise.sets }, (_, i) => {
          const isNext = i === completedSets
          const isDone = i < completedSets
          return (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
              <button
                onClick={isNext && !done ? () => handleSetTap(i) : undefined}
                disabled={!isNext || done}
                style={{
                  width: 30, height: 30, borderRadius: '50%',
                  background: isDone ? '#4A9EFF' : isNext ? '#0D2E5A' : 'transparent',
                  border: `2px solid ${isDone ? '#4A9EFF' : isNext ? '#4A9EFF' : '#1A2A42'}`,
                  color: isDone ? '#FFF' : isNext ? '#4A9EFF' : '#5A7A9A',
                  fontSize: 11, fontWeight: 700,
                  cursor: isNext && !done ? 'pointer' : 'default',
                  transition: 'all 0.15s',
                }}
              >
                {isDone ? '✓' : i + 1}
              </button>
              {isDone && !isBodyweight && (
                <button
                  onClick={e => { e.stopPropagation(); openEdit(i) }}
                  title="Edit weight"
                  style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', lineHeight: 1 }}
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
                    <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" stroke="#5A7A9A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" stroke="#5A7A9A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              )}
            </div>
          )
        })}
        <span style={{ color: '#5A7A9A', fontSize: 11, marginLeft: 4, marginTop: 8 }}>
          {completedSets}/{exercise.sets} sets
        </span>
        <span style={{ color: '#5A7A9A', fontSize: 10, marginLeft: 4, marginTop: 8 }}>
          · {Math.round(exercise.rest_seconds / 60)}m rest
        </span>
      </div>

      {/* Inline weight input — new set */}
      {pendingSetIdx !== null && !isBodyweight && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderTop: '1px solid #1A2A42' }}>
          <input
            type="number"
            inputMode="decimal"
            value={pendingWeight}
            onChange={e => setPendingWeight(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && confirmWeight()}
            autoFocus
            placeholder={String(exercise.suggested_weight)}
            style={{
              width: 80,
              background: '#0A1F3A',
              border: '1px solid #4A9EFF',
              borderRadius: 8,
              color: '#FFFFFF',
              fontSize: 16,
              fontWeight: 700,
              padding: '6px 10px',
              outline: 'none',
            }}
          />
          <span style={{ color: '#5A7A9A', fontSize: 12 }}>lb</span>
          <button
            onClick={confirmWeight}
            style={{
              background: '#4A9EFF', border: 'none', borderRadius: 8,
              color: '#FFFFFF', fontSize: 13, fontWeight: 700,
              padding: '6px 14px', cursor: 'pointer',
            }}
          >
            Done
          </button>
          <button
            onClick={() => { setPendingSetIdx(null); setPendingWeight('') }}
            style={{ background: 'none', border: 'none', color: '#5A7A9A', fontSize: 11, cursor: 'pointer', padding: 0 }}
          >
            Cancel
          </button>
        </div>
      )}

      {/* Inline weight input — edit done set */}
      {editingSetIdx !== null && !isBodyweight && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderTop: '1px solid #1A2A42' }}>
          <span style={{ color: '#5A7A9A', fontSize: 11, flexShrink: 0 }}>Set {editingSetIdx + 1}:</span>
          <input
            type="number"
            inputMode="decimal"
            value={editWeight}
            onChange={e => setEditWeight(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && confirmEdit()}
            autoFocus
            style={{
              width: 80,
              background: '#0A1F3A',
              border: '1px solid #4A9EFF',
              borderRadius: 8,
              color: '#FFFFFF',
              fontSize: 16,
              fontWeight: 700,
              padding: '6px 10px',
              outline: 'none',
            }}
          />
          <span style={{ color: '#5A7A9A', fontSize: 12 }}>lb</span>
          <button
            onClick={confirmEdit}
            style={{
              background: '#4A9EFF', border: 'none', borderRadius: 8,
              color: '#FFFFFF', fontSize: 13, fontWeight: 700,
              padding: '6px 14px', cursor: 'pointer',
            }}
          >
            Save
          </button>
          <button
            onClick={() => { setEditingSetIdx(null); setEditWeight('') }}
            style={{ background: 'none', border: 'none', color: '#5A7A9A', fontSize: 11, cursor: 'pointer', padding: 0 }}
          >
            Cancel
          </button>
        </div>
      )}

      {/* Rest timer */}
      {isResting && (
        <RestTimerRing
          timeLeft={activeRestTimeLeft}
          total={activeRestTotal}
          onSkip={onSkipRest}
        />
      )}
      </div>{/* end preview-disabled wrapper */}

      {/* Swap */}
      {!isPreview && !done && (
        <button
          onClick={onSwap}
          disabled={swapping}
          style={{
            background: 'none', border: 'none', color: '#5A7A9A',
            fontSize: 11, cursor: swapping ? 'default' : 'pointer',
            padding: '6px 0 0', display: 'block',
          }}
        >
          {swapping ? 'Swapping…' : 'Swap exercise →'}
        </button>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function Workout() {
  const navigate = useNavigate()
  const location = useLocation()
  const isPreview = !!(location.state as { preview?: boolean } | null)?.preview

  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [firstSessionType, setFirstSessionType] = useState<string | null>(null)
  const [phase, setPhase] = useState<Phase>(() => {
    if (isPreview) return 'loading'
    return localStorage.getItem('ascend_first_session_done') ? 'recovery' : 'session-picker'
  })
  const [recoveryScore, setRecoveryScore] = useState(5)
  const [workout, setWorkout] = useState<GeneratedWorkout | null>(null)
  const [loadingMsgIdx, setLoadingMsgIdx] = useState(0)
  const [errorMsg, setErrorMsg] = useState('')

  const [warmupChecked, setWarmupChecked] = useState<boolean[]>([])
  const [completedSets, setCompletedSets] = useState<Record<string, number>>({})
  const [setWeights, setSetWeights] = useState<Record<string, number>>({})
  const [activeRest, setActiveRest] = useState<{ key: string; timeLeft: number; total: number } | null>(null)
  const [swappingKey, setSwappingKey] = useState<string | null>(null)
  const [sessionPRs, setSessionPRs] = useState<string[]>([])

  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [finisherExpanded, setFinisherExpanded] = useState(true)
  const [summaryData, setSummaryData] = useState<SummaryData | null>(null)
  const [notifPermState, setNotifPermState] = useState<NotificationPermission | 'unsupported'>(() => notificationPermission())

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const workoutTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startTimeRef = useRef<number>(0)
  const previewStarted = useRef(false)

  // Load profile
  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { navigate('/auth'); return }
      const { data } = await supabase.from('users').select('*').eq('id', user.id).maybeSingle()
      if (data) setProfile(data)
    }
    load()
  }, [navigate])

  // Skip first-session picker if user already has completed workouts in Supabase
  useEffect(() => {
    if (isPreview) return
    async function checkHistory() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { count } = await supabase
        .from('workouts')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('completed', true)
      if (count && count > 0) {
        setPhase(p => p === 'session-picker' ? 'recovery' : p)
      }
    }
    checkHistory()
  }, [isPreview])

  // Loading message rotation
  useEffect(() => {
    if (phase !== 'loading') return
    const id = setInterval(() => setLoadingMsgIdx(p => (p + 1) % LOADING_MESSAGES.length), 2000)
    return () => clearInterval(id)
  }, [phase])

  // Workout elapsed timer — starts when phase becomes 'workout'
  useEffect(() => {
    if (phase !== 'workout') {
      if (workoutTimerRef.current) { clearInterval(workoutTimerRef.current); workoutTimerRef.current = null }
      return
    }
    setElapsedSeconds(0)
    workoutTimerRef.current = setInterval(() => setElapsedSeconds(s => s + 1), 1000)
    return () => {
      if (workoutTimerRef.current) { clearInterval(workoutTimerRef.current); workoutTimerRef.current = null }
    }
  }, [phase])

  // Cleanup on unmount
  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current)
    if (workoutTimerRef.current) clearInterval(workoutTimerRef.current)
  }, [])

  // Auto-generate for preview mode once profile is available
  useEffect(() => {
    if (!isPreview || !profile || previewStarted.current) return
    previewStarted.current = true
    handleGenerate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPreview, profile])

  // Navigate home after celebration
  useEffect(() => {
    if (phase !== 'celebration' || !summaryData) return
    const t = setTimeout(() => navigate('/home', { state: { prs: summaryData.newPRs } }), 1500)
    return () => clearTimeout(t)
  }, [phase, summaryData, navigate])

  function startRestTimer(key: string, seconds: number) {
    if (timerRef.current) clearInterval(timerRef.current)
    setActiveRest({ key, timeLeft: seconds, total: seconds })
    timerRef.current = setInterval(() => {
      setActiveRest(prev => {
        if (!prev || prev.timeLeft <= 1) {
          clearInterval(timerRef.current!)
          timerRef.current = null
          return null
        }
        return { ...prev, timeLeft: prev.timeLeft - 1 }
      })
    }, 1000)
  }

  function handleCompleteSet(key: string, setIdx: number, weight: number | null, totalSets: number) {
    if (weight !== null) {
      setSetWeights(prev => ({ ...prev, [`${key}_${setIdx}`]: weight }))
    }
    const current = completedSets[key] ?? 0
    if (current >= totalSets) return
    const next = current + 1
    setCompletedSets(prev => ({ ...prev, [key]: next }))
    if (next < totalSets) {
      startRestTimer(key, getGoalRestSeconds(profile?.goal ?? null))
    }
  }

  function handleEditSet(key: string, setIdx: number, weight: number) {
    setSetWeights(prev => ({ ...prev, [`${key}_${setIdx}`]: weight }))
  }

  async function handleGenerate(scoreOverride?: number) {
    if (!profile) return
    const score = scoreOverride ?? recoveryScore
    if (scoreOverride !== undefined) setRecoveryScore(scoreOverride)
    setPhase('loading')
    setLoadingMsgIdx(0)
    try {
      const result = await generateWorkout({
        userId: profile.id,
        goal: profile.goal,
        experience_level: profile.experience_level,
        equipment: profile.equipment,
        recovery_score: score,
        firstSessionType: firstSessionType ?? undefined,
      })
      setWorkout(result)
      setWarmupChecked(new Array(result.warmup.length).fill(false))
      setCompletedSets({})
      setSetWeights({})
      setSessionPRs([])
      setFinisherExpanded(true)
      startTimeRef.current = Date.now()
      setPhase('workout')
    } catch (err) {
      console.error('Workout generation error:', err)
      setErrorMsg(err instanceof Error ? err.message : 'Unknown error')
      setPhase('error')
    }
  }

  async function handleSwap(key: string, exercise: ExerciseItem) {
    if (!profile) return
    setSwappingKey(key)
    try {
      const sub = await suggestSubstitution(exercise.exercise_name, exercise.muscle_group, profile.equipment, profile.goal)
      setWorkout(prev => {
        if (!prev) return prev
        const [section, idxStr] = key.split('_')
        const idx = parseInt(idxStr)
        if (section === 'main') {
          const arr = [...prev.main_work]
          arr[idx] = sub
          return { ...prev, main_work: arr }
        }
        const arr = [...prev.finisher]
        arr[idx] = sub
        return { ...prev, finisher: arr }
      })
    } catch (err) {
      console.error('Swap error:', err)
    } finally {
      setSwappingKey(null)
    }
  }

  async function handleFinish() {
    if (!workout || !profile) return
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const duration = Math.max(1, Math.round((Date.now() - startTimeRef.current) / 60000))

    const { data: workoutRecord, error: wErr } = await supabase
      .from('workouts')
      .insert({ user_id: user.id, workout_date: new Date().toISOString(), workout_type: workout.session_label, duration, completed: true })
      .select()
      .single()

    if (wErr || !workoutRecord) { console.error('Workout save error:', wErr); navigate('/home'); return }

    const allExercises = [
      ...workout.main_work.map((ex, i) => ({ ex, key: `main_${i}` })),
      ...workout.finisher.map((ex, i) => ({ ex, key: `finisher_${i}` })),
    ]

    const newPRs: string[] = []
    let exercisesCompleted = 0
    let totalVolume = 0

    for (const { ex, key } of allExercises) {
      const sets = completedSets[key] ?? 0
      if (sets === 0) continue
      exercisesCompleted++

      const bw = isBodyweightExercise(ex)
      const weight = bw ? 0 : getWeightForKey(key, sets, setWeights, ex.suggested_weight)
      const reps = parseReps(ex.reps)
      if (!bw && weight > 0) totalVolume += weight * reps * sets

      await supabase.from('exercise_logs').insert({
        workout_id: workoutRecord.id,
        exercise_name: ex.exercise_name,
        sets,
        reps,
        weight: Math.round(weight),
        completed: true,
      })

      if (!bw && weight > 0) {
        const { data: best } = await supabase
          .from('personal_records')
          .select('weight')
          .eq('user_id', user.id)
          .eq('exercise_name', ex.exercise_name)
          .order('weight', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (!best || Math.round(weight) > best.weight) {
          await supabase.from('personal_records').insert({
            user_id: user.id,
            exercise_name: ex.exercise_name,
            weight: Math.round(weight),
          })
          newPRs.push(ex.exercise_name)
        }
      }
    }

    // Recalculate and persist all scores, XP, level, and streak
    let xpGain = 50
    let leveledUp = false
    let newLevel = 1
    try {
      const DEFAULT_BODYWEIGHT_KG = 80

      const { data: allWorkoutIds } = await supabase
        .from('workouts').select('id').eq('user_id', user.id).eq('completed', true)
      const wids = (allWorkoutIds ?? []).map(w => w.id as string)
      let strengthScore = 0
      if (wids.length > 0) {
        const { data: allLogs } = await supabase
          .from('exercise_logs').select('exercise_name, weight').in('workout_id', wids).gt('weight', 0)
        if (allLogs && allLogs.length > 0) {
          const bestMap = new Map<string, number>()
          for (const l of allLogs) {
            const cur = bestMap.get(l.exercise_name as string) ?? 0
            if ((l.weight as number) > cur) bestMap.set(l.exercise_name as string, l.weight as number)
          }
          strengthScore = calculateStrengthScoreFromLogs(
            Array.from(bestMap.values()).map(w => ({ weight: w })),
            DEFAULT_BODYWEIGHT_KG
          )
        }
      }

      const thirtyAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
      const { count: count30 } = await supabase
        .from('workouts').select('id', { count: 'exact', head: true })
        .eq('user_id', user.id).eq('completed', true).gte('workout_date', thirtyAgo)
      const consistencyScore = calculateConsistencyScore(count30 ?? 0)

      const { data: curScores } = await supabase
        .from('user_scores').select('social_score, streak_days, xp, level').eq('user_id', user.id).maybeSingle()
      const socialScore = curScores?.social_score ?? 0
      const currentXP = curScores?.xp ?? 0
      const currentLevel = curScores?.level ?? 1

      // Streak with 2-day buffer — miss up to 2 days before losing your streak
      const todayStr = new Date().toISOString().split('T')[0]
      const yesterdayStr = new Date(Date.now() - 86400000).toISOString().split('T')[0]
      const twoDaysAgoStr = new Date(Date.now() - 2 * 86400000).toISOString().split('T')[0]
      const { data: prevWorkout } = await supabase
        .from('workouts').select('workout_date').eq('user_id', user.id).eq('completed', true)
        .neq('id', workoutRecord.id).order('workout_date', { ascending: false }).limit(1).maybeSingle()
      let newStreakDays = 1
      if (prevWorkout) {
        const prevDate = (prevWorkout.workout_date as string).split('T')[0]
        if (prevDate === todayStr || prevDate === yesterdayStr || prevDate === twoDaysAgoStr) {
          newStreakDays = (curScores?.streak_days ?? 0) + 1
        }
      }

      const ascendScore = calculateAscendScore(strengthScore, consistencyScore, socialScore, newStreakDays)

      // XP and level
      const isFirstWorkout = wids.length <= 1
      xpGain = calculateXPGain(exercisesCompleted, newPRs.length, isFirstWorkout)
      const newXP = currentXP + xpGain
      newLevel = getLevelFromXP(newXP)
      leveledUp = newLevel > currentLevel

      await supabase.from('user_scores').update({
        strength_score: strengthScore,
        consistency_score: consistencyScore,
        ascend_score: ascendScore,
        xp: newXP,
        level: newLevel,
        streak_days: newStreakDays,
      }).eq('user_id', user.id)
    } catch (scoreErr) {
      console.error('Score update error:', scoreErr)
    }

    setSummaryData({
      sessionLabel: workout.session_label,
      exercisesCompleted,
      totalVolume: Math.round(totalVolume),
      newPRs,
      scoreChange: 5 + newPRs.length * 3,
      xpGain,
      leveledUp,
      newLevel,
    })
    localStorage.setItem('ascend_home_badge', '1')
    window.dispatchEvent(new CustomEvent('ascend-badge-update'))
    setPhase('summary')
  }

  const anySetsDone = Object.values(completedSets).some(v => v > 0)

  // ── Session picker screen ─────────────────────────────────────────────────

  if (phase === 'session-picker') {
    const sessionOptions = [
      { label: 'Upper Body', emoji: '💪', value: 'upper' },
      { label: 'Lower Body', emoji: '🦵', value: 'lower' },
      { label: 'Full Body', emoji: '🔥', value: 'full' },
    ]
    return (
      <div className="app-shell">
        <div className="app-content" style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
          <div style={{ flex: 1, overflow: 'auto', padding: '56px 24px 16px' }}>
            <button
              onClick={() => navigate('/workout')}
              style={{ background: 'none', border: 'none', color: '#5A7A9A', fontSize: 14, cursor: 'pointer', padding: '0 0 16px', display: 'block' }}
            >
              ← Back
            </button>
            <p style={{ color: '#4A9EFF', fontSize: 11, letterSpacing: '2px', textTransform: 'uppercase', margin: '0 0 8px' }}>
              Welcome to Ascend
            </p>
            <h1 style={{ color: '#FFFFFF', fontSize: 26, fontWeight: 700, margin: '0 0 8px', lineHeight: 1.2 }}>
              How do you want to start?
            </h1>
            <p style={{ color: '#5A7A9A', fontSize: 14, margin: '0 0 32px' }}>
              We'll build your first session around this focus.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {sessionOptions.map(opt => {
                const selected = firstSessionType === opt.value
                return (
                  <button
                    key={opt.value}
                    onClick={() => setFirstSessionType(opt.value)}
                    style={{
                      background: selected ? '#0D1F3A' : '#0D1728',
                      border: `2px solid ${selected ? '#4A9EFF' : '#1A2A42'}`,
                      borderRadius: 16,
                      padding: '20px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 16,
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                      textAlign: 'left',
                    }}
                  >
                    <span style={{ fontSize: 32 }}>{opt.emoji}</span>
                    <span style={{ color: selected ? '#FFFFFF' : '#BBCDE0', fontSize: 18, fontWeight: 700 }}>
                      {opt.label}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
          <div style={{ padding: '12px 24px 88px' }}>
            <button
              onClick={() => {
                localStorage.setItem('ascend_first_session_done', '1')
                setPhase('recovery')
              }}
              disabled={!firstSessionType}
              style={{
                width: '100%',
                background: firstSessionType ? '#4A9EFF' : '#1A2A42',
                color: '#FFFFFF',
                fontSize: 16, fontWeight: 700, borderRadius: 14, padding: '16px',
                border: 'none',
                cursor: firstSessionType ? 'pointer' : 'not-allowed',
                transition: 'background 0.2s',
              }}
            >
              Let's go →
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Recovery screen ───────────────────────────────────────────────────────

  if (phase === 'recovery') {
    const recoveryOptions = [
      { score: 3, emoji: '😴', label: 'Rough', sub: 'Lighter load · Focus on form' },
      { score: 5, emoji: '💪', label: 'Decent', sub: 'Standard training today' },
      { score: 8, emoji: '🔥', label: 'Feeling great', sub: 'Extra sets · Push harder' },
    ]
    return (
      <div className="app-shell">
        <div className="app-content" style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
          <div style={{ flex: 1, overflow: 'auto', padding: '56px 24px 24px' }}>
            <button
              onClick={() => navigate('/workout')}
              style={{ background: 'none', border: 'none', color: '#5A7A9A', fontSize: 14, cursor: 'pointer', padding: '0 0 16px', display: 'block' }}
            >
              ← Back
            </button>
            <p style={{ color: '#4A9EFF', fontSize: 11, letterSpacing: '2px', textTransform: 'uppercase', margin: '0 0 8px' }}>
              Quick check
            </p>
            <h1 style={{ color: '#FFFFFF', fontSize: 26, fontWeight: 700, margin: '0 0 6px', lineHeight: 1.2 }}>
              How are you feeling?
            </h1>
            <p style={{ color: '#5A7A9A', fontSize: 14, margin: '0 0 36px' }}>
              Your workout adapts in real time.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {recoveryOptions.map(opt => (
                <button
                  key={opt.score}
                  onClick={() => handleGenerate(opt.score)}
                  disabled={!profile}
                  style={{
                    background: '#0D1728', border: '1px solid #1A2A42',
                    borderRadius: 16, padding: '18px 20px',
                    display: 'flex', alignItems: 'center', gap: 16,
                    cursor: 'pointer', textAlign: 'left', width: '100%',
                    transition: 'border-color 0.15s',
                  }}
                >
                  <span style={{ fontSize: 32, lineHeight: 1 }}>{opt.emoji}</span>
                  <div>
                    <p style={{ color: '#FFFFFF', fontSize: 16, fontWeight: 700, margin: '0 0 2px' }}>{opt.label}</p>
                    <p style={{ color: '#5A7A9A', fontSize: 12, margin: 0 }}>{opt.sub}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── Loading screen ────────────────────────────────────────────────────────

  if (phase === 'loading') {
    return (
      <div className="app-shell">
        <div className="app-content" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', gap: 24 }}>
          <p style={{ color: '#4A9EFF', fontSize: 24, fontWeight: 700, letterSpacing: 4 }}>ASCEND</p>
          <div style={{ display: 'flex', gap: 6 }}>
            {[0, 1, 2].map(i => (
              <div
                key={i}
                style={{
                  width: 8, height: 8, borderRadius: '50%', background: '#4A9EFF',
                  animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite`, opacity: 0.3,
                }}
              />
            ))}
          </div>
          <p style={{ color: '#5A7A9A', fontSize: 14, textAlign: 'center', margin: 0 }}>
            {LOADING_MESSAGES[loadingMsgIdx]}
          </p>
          <style>{`@keyframes pulse { 0%,100%{opacity:0.3;transform:scale(1)} 50%{opacity:1;transform:scale(1.3)} }`}</style>
        </div>
      </div>
    )
  }

  // ── Error screen ──────────────────────────────────────────────────────────

  if (phase === 'error') {
    return (
      <div className="app-shell">
        <div className="app-content" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', padding: '0 24px' }}>
          <p style={{ color: '#FFFFFF', fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Couldn't build your program</p>
          <p style={{ color: '#5A7A9A', fontSize: 13, textAlign: 'center', marginBottom: 24 }}>{errorMsg}</p>
          <button
            onClick={() => setPhase('recovery')}
            style={{ background: '#4A9EFF', color: '#FFF', border: 'none', borderRadius: 12, padding: '14px 32px', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}
          >
            Try again
          </button>
        </div>
      </div>
    )
  }

  // ── PR Celebration screen ─────────────────────────────────────────────────

  if (phase === 'pr-celebration' && summaryData) {
    return (
      <div style={{
        minHeight: '100vh', background: '#080E1C',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: '0 32px', gap: 0,
      }}>
        <div style={{ animation: 'prBounce 0.7s cubic-bezier(0.175,0.885,0.32,1.275) forwards', fontSize: 72, marginBottom: 16 }}>
          🏆
        </div>
        <p style={{ color: '#F5A623', fontSize: 13, fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', margin: '0 0 8px' }}>
          New Personal Record{summaryData.newPRs.length > 1 ? 's' : ''}
        </p>
        <p style={{ color: '#5A7A9A', fontSize: 13, margin: '0 0 28px', textAlign: 'center' }}>
          You're stronger than ever.
        </p>
        <div style={{ width: '100%', marginBottom: 32 }}>
          {summaryData.newPRs.map(pr => (
            <div key={pr} style={{ background: '#0A1F3A', border: '1px solid #4A9EFF', borderRadius: 12, padding: '14px 18px', marginBottom: 8, textAlign: 'center' }}>
              <span style={{ color: '#FFFFFF', fontSize: 16, fontWeight: 700 }}>{pr}</span>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%' }}>
          {typeof navigator !== 'undefined' && typeof (navigator as { share?: unknown }).share === 'function' && (
            <button
              onClick={async () => {
                try {
                  await (navigator as unknown as { share: (o: object) => Promise<void> }).share({
                    title: 'New PR — Ascend',
                    text: `Just hit a new personal record in ${summaryData.newPRs.join(' & ')} at Penn! 💪`,
                  })
                } catch { /* cancelled */ }
              }}
              style={{ background: '#1A2A42', border: 'none', borderRadius: 14, padding: '14px', color: '#FFFFFF', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}
            >
              Share Your PR 📤
            </button>
          )}
          <button
            onClick={() => setPhase('celebration')}
            style={{ background: '#4A9EFF', border: 'none', borderRadius: 14, padding: '14px', color: '#FFFFFF', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}
          >
            Continue →
          </button>
        </div>
        <style>{`
          @keyframes prBounce {
            from { transform: scale(0) rotate(-20deg); opacity: 0; }
            to   { transform: scale(1) rotate(0deg);  opacity: 1; }
          }
        `}</style>
      </div>
    )
  }

  // ── Celebration screen ────────────────────────────────────────────────────

  if (phase === 'celebration' && summaryData) {
    return (
      <div style={{
        minHeight: '100vh', background: '#080E1C',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 20,
      }}>
        <div style={{ animation: 'celebScale 0.6s cubic-bezier(0.175,0.885,0.32,1.275) forwards' }}>
          <AscendBolt size={120} />
        </div>
        <p style={{ color: '#4A9EFF', fontSize: 26, fontWeight: 700, margin: 0, animation: 'celebFade 0.5s ease 0.3s both' }}>
          +{summaryData.scoreChange} Ascend points
        </p>
        <style>{`
          @keyframes celebScale {
            from { transform: scale(0.5); opacity: 0; }
            to   { transform: scale(1);   opacity: 1; }
          }
          @keyframes celebFade {
            from { transform: translateY(10px); opacity: 0; }
            to   { transform: translateY(0);    opacity: 1; }
          }
        `}</style>
      </div>
    )
  }

  // ── Summary screen ────────────────────────────────────────────────────────

  if (phase === 'summary' && summaryData) {
    return (
      <div className="app-shell">
        <div className="app-content" style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
          <div style={{ flex: 1, overflow: 'auto', padding: '60px 24px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ marginBottom: 12 }}><AscendBolt size={72} /></div>
            <p style={{ color: '#4A9EFF', fontSize: 11, letterSpacing: '2px', textTransform: 'uppercase', margin: '0 0 8px' }}>
              Workout Complete
            </p>
            <h1 style={{ color: '#FFFFFF', fontSize: 20, fontWeight: 700, margin: '0 0 28px', textAlign: 'center', lineHeight: 1.3 }}>
              {summaryData.sessionLabel}
            </h1>

            <div style={{ display: 'flex', gap: 12, width: '100%', marginBottom: 14 }}>
              <div style={{ flex: 1, background: '#0D1728', border: '1px solid #1A2A42', borderRadius: 14, padding: 16, textAlign: 'center' }}>
                <p style={{ color: '#4A9EFF', fontSize: 28, fontWeight: 700, margin: '0 0 4px' }}>{summaryData.exercisesCompleted}</p>
                <p style={{ color: '#5A7A9A', fontSize: 11, margin: 0 }}>Exercises</p>
              </div>
              <div style={{ flex: 1, background: '#0D1728', border: '1px solid #1A2A42', borderRadius: 14, padding: 16, textAlign: 'center' }}>
                <p style={{ color: '#4A9EFF', fontSize: 28, fontWeight: 700, margin: '0 0 4px' }}>{summaryData.totalVolume.toLocaleString()}</p>
                <p style={{ color: '#5A7A9A', fontSize: 11, margin: 0 }}>Total lbs</p>
              </div>
            </div>

            <div style={{ width: '100%', background: '#0A1F3A', border: '1px solid #1E3D6E', borderRadius: 14, padding: 16, marginBottom: 14, textAlign: 'center' }}>
              <p style={{ color: '#5A7A9A', fontSize: 12, margin: '0 0 6px' }}>Ascend Score</p>
              <p style={{ color: '#4A9EFF', fontSize: 32, fontWeight: 700, margin: 0 }}>+{summaryData.scoreChange} pts</p>
            </div>

            {/* XP gain + level-up */}
            <div style={{ width: '100%', background: '#0D1728', border: `1px solid ${summaryData.leveledUp ? '#4A9EFF' : '#1A2A42'}`, borderRadius: 14, padding: 16, marginBottom: 14, textAlign: 'center' }}>
              {summaryData.leveledUp ? (
                <>
                  <p style={{ color: '#F5A623', fontSize: 16, fontWeight: 700, margin: '0 0 4px' }}>Level Up! 🎉</p>
                  <p style={{ color: '#4A9EFF', fontSize: 22, fontWeight: 700, margin: '0 0 4px' }}>Level {summaryData.newLevel}</p>
                </>
              ) : null}
              <p style={{ color: '#5A7A9A', fontSize: 12, margin: 0 }}>+{summaryData.xpGain} XP earned</p>
            </div>

            {summaryData.newPRs.length > 0 && (
              <div style={{ width: '100%', marginBottom: 14 }}>
                <p style={{ color: '#FFFFFF', fontSize: 13, fontWeight: 700, margin: '0 0 8px' }}>🏆 New Personal Records</p>
                {summaryData.newPRs.map(pr => (
                  <div key={pr} style={{ background: '#0A1F3A', border: '1px solid #4A9EFF', borderRadius: 10, padding: '8px 12px', marginBottom: 6 }}>
                    <span style={{ color: '#4A9EFF', fontSize: 13, fontWeight: 600 }}>{pr}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ padding: '12px 24px 88px' }}>
            {/* Notification opt-in — shown once, at the highest motivation moment */}
            {notifPermState === 'default' && (
              <div style={{ background: '#0D1728', border: '1px solid #1A2A42', borderRadius: 14, padding: '14px 16px', marginBottom: 12 }}>
                <p style={{ color: '#FFFFFF', fontSize: 13, fontWeight: 700, margin: '0 0 4px' }}>
                  Never miss a workout
                </p>
                <p style={{ color: '#5A7A9A', fontSize: 12, margin: '0 0 12px' }}>
                  Get a nudge when your next session is ready and when friends train.
                </p>
                <button
                  onClick={async () => {
                    if (!profile) return
                    await requestPushPermission(profile.id)
                    setNotifPermState(notificationPermission())
                  }}
                  style={{ background: '#4A9EFF', border: 'none', borderRadius: 10, padding: '8px 18px', color: '#FFF', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
                >
                  Enable notifications →
                </button>
              </div>
            )}
            <button
              onClick={() => setPhase(summaryData.newPRs.length > 0 ? 'pr-celebration' : 'celebration')}
              style={{
                width: '100%', background: '#4A9EFF', color: '#FFFFFF',
                fontSize: 16, fontWeight: 700, borderRadius: 14, padding: '16px',
                border: 'none', cursor: 'pointer',
              }}
            >
              Done 💪
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Workout screen ────────────────────────────────────────────────────────

  if (phase !== 'workout' || !workout) return null

  const goalRestSecs = getGoalRestSeconds(profile?.goal ?? null)

  return (
    <div className="app-shell">
      <div className="app-content page-scroll">

        {/* Fixed workout timer */}
        <div style={{
          position: 'fixed', top: 16, right: 20, zIndex: 50,
          background: '#0D1728', border: '1px solid #1A2A42',
          borderRadius: 8, padding: '4px 10px',
        }}>
          <span style={{ color: '#4A9EFF', fontSize: 13, fontWeight: 700 }}>{fmtTime(elapsedSeconds)}</span>
        </div>

        <div style={{ padding: '52px 20px 0' }}>

          {/* Preview mode banner */}
          {isPreview && (
            <div style={{ background: '#0A1F3A', border: '1px solid #1E3D6E', borderRadius: 12, padding: '12px 16px', marginBottom: 16, textAlign: 'center' }}>
              <p style={{ color: '#4A9EFF', fontSize: 13, fontWeight: 600, margin: 0 }}>
                Preview mode — come back tomorrow to train
              </p>
            </div>
          )}

          {sessionPRs.map(name => (
            <div
              key={name}
              style={{ background: '#0A1F3A', border: '1px solid #4A9EFF', borderRadius: 14, padding: '12px 16px', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 10 }}
            >
              <span style={{ fontSize: 20 }}>🏆</span>
              <p style={{ color: '#FFFFFF', fontSize: 13, fontWeight: 700, margin: 0 }}>New PR — {name}</p>
            </div>
          ))}

          <p style={{ color: '#4A9EFF', fontSize: 11, letterSpacing: '2px', textTransform: 'uppercase', margin: '0 0 6px' }}>
            Today's session
          </p>
          <h1 style={{ color: '#FFFFFF', fontSize: 22, fontWeight: 700, margin: '0 0 6px', lineHeight: 1.2 }}>
            {workout.session_label}
          </h1>
          <p style={{ color: '#5A7A9A', fontSize: 13, margin: '0 0 16px' }}>
            {workout.main_work.length + workout.finisher.length} exercises · Est. 60 min
          </p>

          <div style={{ background: '#0A1F3A', border: '1px solid #1E3D6E', borderRadius: 12, padding: '12px 14px', display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 24 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#4A9EFF', flexShrink: 0, marginTop: 4 }} />
            <p style={{ color: '#7AAAD4', fontSize: 12, lineHeight: 1.5, margin: 0 }}>{workout.ai_insight}</p>
          </div>

          {/* Warm-up */}
          <p style={{ color: '#5A7A9A', fontSize: 10, letterSpacing: '1.5px', textTransform: 'uppercase', margin: '0 0 10px' }}>
            Warm-up · 5 min
          </p>
          <div style={{ background: '#0D1728', border: '1px solid #1A2A42', borderRadius: 14, padding: '4px 16px', marginBottom: 24 }}>
            {workout.warmup.map((item, i) => (
              <div
                key={i}
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 0', borderBottom: i < workout.warmup.length - 1 ? '1px solid #1A2A42' : 'none', cursor: 'pointer' }}
                onClick={() => setWarmupChecked(prev => { const n = [...prev]; n[i] = !n[i]; return n })}
              >
                <div style={{ width: 20, height: 20, borderRadius: 6, border: `2px solid ${warmupChecked[i] ? '#4A9EFF' : '#1A2A42'}`, background: warmupChecked[i] ? '#4A9EFF' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all 0.15s' }}>
                  {warmupChecked[i] && <span style={{ color: '#FFF', fontSize: 10, fontWeight: 700 }}>✓</span>}
                </div>
                <span style={{ flex: 1, color: warmupChecked[i] ? '#5A7A9A' : '#FFFFFF', fontSize: 13, textDecoration: warmupChecked[i] ? 'line-through' : 'none' }}>{item.movement}</span>
                <span style={{ color: '#5A7A9A', fontSize: 11 }}>{item.duration}</span>
              </div>
            ))}
          </div>

          {/* Main work */}
          <p style={{ color: '#5A7A9A', fontSize: 10, letterSpacing: '1.5px', textTransform: 'uppercase', margin: '0 0 10px' }}>
            Main Work · 40 min
          </p>
          {workout.main_work.map((ex, i) => {
            const key = `main_${i}`
            return (
              <ExerciseCard
                key={key}
                exercise={ex}
                exerciseKey={key}
                completedSets={completedSets[key] ?? 0}
                activeRestKey={activeRest?.key ?? null}
                activeRestTimeLeft={activeRest?.key === key ? activeRest.timeLeft : 0}
                activeRestTotal={activeRest?.key === key ? activeRest.total : goalRestSecs}
                swapping={swappingKey === key}
                isBodyweight={isBodyweightExercise(ex)}
                savedWeights={setWeights}
                isPreview={isPreview}
                onCompleteSet={(setIdx, weight) => handleCompleteSet(key, setIdx, weight, ex.sets)}
                onSkipRest={() => { if (timerRef.current) clearInterval(timerRef.current); setActiveRest(null) }}
                onSwap={() => handleSwap(key, ex)}
                onEditSet={(setIdx, weight) => handleEditSet(key, setIdx, weight)}
              />
            )
          })}

          {/* Finisher */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '20px 0 6px' }}>
            <p style={{ color: '#5A7A9A', fontSize: 10, letterSpacing: '1.5px', textTransform: 'uppercase', margin: 0 }}>
              Finisher · 15 min
            </p>
            <button
              onClick={() => setFinisherExpanded(v => !v)}
              style={{ background: 'none', border: 'none', color: '#5A7A9A', fontSize: 11, cursor: 'pointer', padding: 0 }}
            >
              {finisherExpanded ? 'Skip finisher' : 'Add finisher'}
            </button>
          </div>

          {finisherExpanded && (
            <>
              <p style={{ color: '#4A9EFF', fontSize: 11, margin: '0 0 10px' }}>Optional — but worth it.</p>
              {workout.finisher.map((ex, i) => {
                const key = `finisher_${i}`
                return (
                  <ExerciseCard
                    key={key}
                    exercise={ex}
                    exerciseKey={key}
                    completedSets={completedSets[key] ?? 0}
                    activeRestKey={activeRest?.key ?? null}
                    activeRestTimeLeft={activeRest?.key === key ? activeRest.timeLeft : 0}
                    activeRestTotal={activeRest?.key === key ? activeRest.total : goalRestSecs}
                    swapping={swappingKey === key}
                    isBodyweight={isBodyweightExercise(ex)}
                    savedWeights={setWeights}
                    isPreview={isPreview}
                    onCompleteSet={(setIdx, weight) => handleCompleteSet(key, setIdx, weight, ex.sets)}
                    onSkipRest={() => { if (timerRef.current) clearInterval(timerRef.current); setActiveRest(null) }}
                    onSwap={() => handleSwap(key, ex)}
                    onEditSet={(setIdx, weight) => handleEditSet(key, setIdx, weight)}
                  />
                )
              })}
            </>
          )}

          {isPreview ? (
            <button
              onClick={() => navigate('/home')}
              style={{
                width: '100%', background: '#1A2A42', color: '#5A7A9A',
                fontSize: 15, fontWeight: 700, borderRadius: 14, padding: '16px',
                border: 'none', cursor: 'pointer',
                marginTop: 16, marginBottom: 8,
              }}
            >
              See you tomorrow 💪
            </button>
          ) : (
            <button
              onClick={handleFinish}
              disabled={!anySetsDone}
              style={{
                width: '100%',
                background: anySetsDone ? '#4A9EFF' : '#1A2A42',
                color: '#FFFFFF',
                fontSize: 15, fontWeight: 700, borderRadius: 14, padding: '16px',
                border: 'none', cursor: anySetsDone ? 'pointer' : 'not-allowed',
                marginTop: 16, marginBottom: 8, transition: 'background 0.2s',
              }}
            >
              Finish Workout & Log Progress
            </button>
          )}

        </div>
      </div>
    </div>
  )
}
