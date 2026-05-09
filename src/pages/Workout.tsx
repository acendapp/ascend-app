import { useEffect, useRef, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import AscendBolt from '../components/AscendBolt'
import BodyDiagram, { MUSCLE_ZONE_LABELS } from '../components/BodyDiagram'
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

type Phase = 'session-picker' | 'recovery' | 'soreness' | 'injury' | 'loading' | 'workout' | 'error' | 'summary' | 'pr-celebration' | 'celebration'

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

// ── Session persistence ───────────────────────────────────────────────────────

const SESSION_KEY = 'ascend_active_workout'
const SESSION_TTL = 2 * 60 * 60 * 1000 // 2 hours

interface WorkoutSession {
  startEpoch: number
  workout: GeneratedWorkout
  completedSets: Record<string, number>
  setWeights: Record<string, number>
  warmupChecked: boolean[]
  finisherExpanded: boolean
  recoveryScore: number
}

function loadSession(): WorkoutSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const s = JSON.parse(raw) as WorkoutSession
    if (Date.now() - s.startEpoch > SESSION_TTL) { localStorage.removeItem(SESSION_KEY); return null }
    return s
  } catch { return null }
}

function saveSession(s: WorkoutSession) {
  try { localStorage.setItem(SESSION_KEY, JSON.stringify(s)) } catch {}
}

function clearSession() {
  try { localStorage.removeItem(SESSION_KEY) } catch {}
}

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
  onDecrementSet,
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
  onDecrementSet: () => void
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
  const [plausibilityWeight, setPlausibilityWeight] = useState<number | null>(null)
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

  function confirmWeight(force = false) {
    if (pendingSetIdx === null) return
    const w = parseFloat(pendingWeight)
    const weight = isNaN(w) || w <= 0 ? null : w
    if (!force && weight !== null && !isBodyweight && exercise.suggested_weight > 20 && weight > exercise.suggested_weight * 2.5) {
      setPlausibilityWeight(weight)
      return
    }
    onCompleteSet(pendingSetIdx, weight)
    setPendingSetIdx(null)
    setPendingWeight('')
    setPlausibilityWeight(null)
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
        {completedSets > 0 && !isPreview && (
          <button
            onClick={e => { e.stopPropagation(); onDecrementSet() }}
            title="Undo last set"
            style={{
              marginLeft: 'auto', marginTop: 4,
              background: 'none', border: '1px solid #1A2A42',
              borderRadius: 6, padding: '2px 8px',
              color: '#5A7A9A', fontSize: 11, cursor: 'pointer',
            }}
          >
            undo
          </button>
        )}
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
            onClick={() => confirmWeight()}
            style={{
              background: '#4A9EFF', border: 'none', borderRadius: 8,
              color: '#FFFFFF', fontSize: 13, fontWeight: 700,
              padding: '6px 14px', cursor: 'pointer',
            }}
          >
            Done
          </button>
          <button
            onClick={() => { setPendingSetIdx(null); setPendingWeight(''); setPlausibilityWeight(null) }}
            style={{ background: 'none', border: 'none', color: '#5A7A9A', fontSize: 11, cursor: 'pointer', padding: 0 }}
          >
            Cancel
          </button>
        </div>
      )}

      {/* Plausibility warning */}
      {plausibilityWeight !== null && (
        <div style={{ background: '#1C1000', border: '1px solid #F5A623', borderRadius: 10, padding: '12px 14px', margin: '6px 0' }}>
          <p style={{ color: '#F5A623', fontSize: 12, fontWeight: 700, margin: '0 0 3px' }}>⚠️ Unusually high weight</p>
          <p style={{ color: '#A07030', fontSize: 11, margin: '0 0 10px', lineHeight: 1.4 }}>
            {plausibilityWeight} lbs is much higher than your typical {exercise.suggested_weight} lbs for this exercise. Double-check before logging.
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => confirmWeight(true)}
              style={{ flex: 1, background: '#F5A623', border: 'none', borderRadius: 8, padding: '7px', color: '#0A0500', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
            >
              Log anyway
            </button>
            <button
              onClick={() => setPlausibilityWeight(null)}
              style={{ flex: 1, background: 'transparent', border: '1px solid #1A2A42', borderRadius: 8, padding: '7px', color: '#5A7A9A', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
            >
              Cancel
            </button>
          </div>
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
    if (loadSession()) return 'workout'
    return localStorage.getItem('ascend_first_session_done') ? 'recovery' : 'session-picker'
  })
  const [recoveryScore, setRecoveryScore] = useState(() => loadSession()?.recoveryScore ?? 5)
  const [workout, setWorkout] = useState<GeneratedWorkout | null>(() => loadSession()?.workout ?? null)
  const [loadingMsgIdx, setLoadingMsgIdx] = useState(0)
  const [errorMsg, setErrorMsg] = useState('')

  const [warmupChecked, setWarmupChecked] = useState<boolean[]>(() => loadSession()?.warmupChecked ?? [])
  const [completedSets, setCompletedSets] = useState<Record<string, number>>(() => loadSession()?.completedSets ?? {})
  const [setWeights, setSetWeights] = useState<Record<string, number>>(() => loadSession()?.setWeights ?? {})
  const [activeRest, setActiveRest] = useState<{ key: string; timeLeft: number; total: number } | null>(null)
  const [swappingKey, setSwappingKey] = useState<string | null>(null)
  const [sessionPRs, setSessionPRs] = useState<string[]>([])

  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [finisherExpanded, setFinisherExpanded] = useState(() => loadSession()?.finisherExpanded ?? true)
  const [showTwoHourModal, setShowTwoHourModal] = useState(false)
  const [currentWorkoutId, setCurrentWorkoutId] = useState<string | null>(null)
  const [feedbackRating, setFeedbackRating] = useState<number | null>(null)
  const [finishing, setFinishing] = useState(false)
  const [finishError, setFinishError] = useState<string | null>(null)
  const [showEndEarly, setShowEndEarly] = useState(false)
  const [soreMuscles, setSoreMuscles] = useState<string[]>([])
  const [injuredMuscles, setInjuredMuscles] = useState<string[]>([])
  const [showMethodIntro, setShowMethodIntro] = useState(() =>
    !isPreview && !loadSession() && !localStorage.getItem('ascend_method_intro_seen')
  )
  const [introSlide, setIntroSlide] = useState(0)
  const [summaryData, setSummaryData] = useState<SummaryData | null>(null)
  const [notifPermState, setNotifPermState] = useState<NotificationPermission | 'unsupported'>(() => notificationPermission())

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const workoutTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startTimeRef = useRef<number>(loadSession()?.startEpoch ?? 0)
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

  // Workout elapsed timer — starts when phase becomes 'workout', restored across app exits
  useEffect(() => {
    if (phase !== 'workout') {
      if (workoutTimerRef.current) { clearInterval(workoutTimerRef.current); workoutTimerRef.current = null }
      return
    }
    if (!startTimeRef.current) startTimeRef.current = Date.now()
    setElapsedSeconds(Math.floor((Date.now() - startTimeRef.current) / 1000))
    workoutTimerRef.current = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startTimeRef.current) / 1000))
    }, 1000)
    return () => {
      if (workoutTimerRef.current) { clearInterval(workoutTimerRef.current); workoutTimerRef.current = null }
    }
  }, [phase])

  // Show 2-hour modal when timer reaches 2 hours
  useEffect(() => {
    if (phase === 'workout' && elapsedSeconds >= 7200 && !showTwoHourModal) {
      setShowTwoHourModal(true)
    }
  }, [phase, elapsedSeconds, showTwoHourModal])

  // Persist workout session to localStorage on every meaningful state change
  useEffect(() => {
    if (phase !== 'workout' || !workout || !startTimeRef.current) return
    saveSession({
      startEpoch: startTimeRef.current,
      workout,
      completedSets,
      setWeights,
      warmupChecked,
      finisherExpanded,
      recoveryScore,
    })
  }, [phase, workout, completedSets, setWeights, warmupChecked, finisherExpanded, recoveryScore])

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

  function handleDecrementSet(key: string) {
    setCompletedSets(prev => {
      const current = prev[key] ?? 0
      if (current <= 0) return prev
      return { ...prev, [key]: current - 1 }
    })
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
      const soreLabels = soreMuscles.map(id => MUSCLE_ZONE_LABELS[id] ?? id)
      const injuredLabels = injuredMuscles.map(id => MUSCLE_ZONE_LABELS[id] ?? id)
      const durationPref = parseInt(localStorage.getItem('onboarding_workout_duration') ?? '60', 10)
      const workoutDuration = isNaN(durationPref) ? 60 : durationPref
      const result = await generateWorkout({
        userId: profile.id,
        goal: profile.goal,
        experience_level: profile.experience_level,
        equipment: profile.equipment,
        recovery_score: score,
        workoutDuration,
        firstSessionType: firstSessionType ?? undefined,
        sore_muscles: soreLabels.length > 0 ? soreLabels : undefined,
        injured_muscles: injuredLabels.length > 0 ? injuredLabels : undefined,
        sex: profile?.sex ?? undefined,
      })
      clearSession()
      startTimeRef.current = Date.now()
      setWorkout(result)
      setWarmupChecked(new Array(result.warmup.length).fill(false))
      setCompletedSets({})
      setSetWeights({})
      setSessionPRs([])
      setFinisherExpanded(true)
      setShowTwoHourModal(false)
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
    if (!workout || finishing) return
    setFinishing(true)
    setFinishError(null)
    try {
      const { data: { user }, error: authErr } = await supabase.auth.getUser()
      if (authErr || !user) { navigate('/auth'); return }

      const duration = Math.max(1, Math.round((Date.now() - startTimeRef.current) / 60000))

      const { data: workoutRecord, error: wErr } = await supabase
        .from('workouts')
        .insert({ user_id: user.id, workout_date: new Date().toISOString(), workout_type: workout.session_label, duration, completed: true })
        .select()
        .single()
      if (workoutRecord) setCurrentWorkoutId(workoutRecord.id as string)
      setFeedbackRating(null)

      if (wErr || !workoutRecord) {
        console.error('Workout save error:', wErr)
        setFinishError('Could not save your workout. Check your connection and try again.')
        return
      }

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

        const { error: logErr } = await supabase.from('exercise_logs').insert({
          workout_id: workoutRecord.id,
          exercise_name: ex.exercise_name,
          sets,
          reps,
          weight: Math.round(weight),
        })
        if (logErr) console.error('Exercise log insert error:', logErr)

        if (!bw && weight > 0) {
          try {
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
          } catch (prErr) {
            console.error('PR check/insert error:', prErr)
          }
        }
      }

      // Recalculate and persist all scores, XP, level, and streak
      let xpGain = 50
      let leveledUp = false
      let newLevel = 1
      let ascendScore = 0
      let previousAscendScore = 0
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

        const monday = new Date()
        monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7))
        monday.setHours(0, 0, 0, 0)
        const { count: weekCount } = await supabase
          .from('workouts').select('id', { count: 'exact', head: true })
          .eq('user_id', user.id).eq('completed', true).gte('workout_date', monday.toISOString())
        const consistencyScore = calculateConsistencyScore(weekCount ?? 0)

        const { data: curScores } = await supabase
          .from('user_scores').select('social_score, streak_days, xp, level, ascend_score').eq('user_id', user.id).maybeSingle()
        const socialScore = curScores?.social_score ?? 0
        const currentXP = curScores?.xp ?? 0
        const currentLevel = curScores?.level ?? 1
        previousAscendScore = curScores?.ascend_score ?? 0

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

        ascendScore = calculateAscendScore(strengthScore, consistencyScore, socialScore, newStreakDays)

        const isFirstWorkout = wids.length <= 1
        xpGain = calculateXPGain(exercisesCompleted, newPRs.length, isFirstWorkout)
        const newXP = currentXP + xpGain
        newLevel = getLevelFromXP(newXP)
        leveledUp = newLevel > currentLevel

        const { error: scoreUpdateErr } = await supabase.from('user_scores')
          .update({
            strength_score: strengthScore,
            consistency_score: consistencyScore,
            ascend_score: ascendScore,
            xp: newXP,
            level: newLevel,
            streak_days: newStreakDays,
          })
          .eq('user_id', user.id)
        if (scoreUpdateErr) console.error('user_scores update error:', scoreUpdateErr)

        try {
          await supabase.from('user_scores').update({ workouts_completed: wids.length }).eq('user_id', user.id)
        } catch { /* column not yet added */ }
      } catch (scoreErr) {
        console.error('Score update error:', scoreErr)
      }

      setSummaryData({
        sessionLabel: workout.session_label,
        exercisesCompleted,
        totalVolume: Math.round(totalVolume),
        newPRs,
        scoreChange: Math.max(0, ascendScore - previousAscendScore),
        xpGain,
        leveledUp,
        newLevel,
      })
      clearSession()
      localStorage.setItem('ascend_home_badge', '1')
      window.dispatchEvent(new CustomEvent('ascend-badge-update'))
      setPhase('summary')
    } catch (err) {
      console.error('Finish workout error:', err)
      setFinishError('Something went wrong. Please try again.')
    } finally {
      setFinishing(false)
    }
  }

  const anySetsDone = Object.values(completedSets).some(v => v > 0)

  async function handleFeedback(rating: number) {
    setFeedbackRating(rating)
    if (!currentWorkoutId) return
    try {
      await supabase.from('workouts').update({ feedback_rating: rating }).eq('id', currentWorkoutId)
    } catch { /* column may not exist yet */ }
  }

  // ── Ascend Method intro ───────────────────────────────────────────────────

  const METHOD_SLIDES = [
    {
      icon: '⚡',
      title: 'Personalized and optimized every session',
      body: 'The Ascend Method generates a unique program based on your history, recovery, and goals — not a generic plan everyone gets.',
    },
    {
      icon: '🎯',
      title: 'Train at the right intensity',
      body: 'Each set has an RPE target (Rate of Perceived Exertion). This keeps you out of junk volume and ensures you\'re actually making progress.',
    },
    {
      icon: '📈',
      title: 'Built to get you stronger',
      body: 'Weights are calibrated from your logged lifts and pushed progressively. The more you train, the smarter it gets.',
    },
  ]

  if (showMethodIntro) {
    const slide = METHOD_SLIDES[introSlide]
    const isLast = introSlide === METHOD_SLIDES.length - 1
    return (
      <div className="app-shell">
        <div className="app-content" style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 32px' }}>
            <button
              onClick={() => navigate('/workout')}
              style={{ background: 'none', border: 'none', color: '#5A7A9A', fontSize: 14, cursor: 'pointer', padding: '0 0 32px', alignSelf: 'flex-start', display: 'block' }}
            >
              ← Back
            </button>
            <span style={{ fontSize: 56, display: 'block', marginBottom: 24 }}>{slide.icon}</span>
            <p style={{ color: '#4A9EFF', fontSize: 11, letterSpacing: '2px', textTransform: 'uppercase', margin: '0 0 10px' }}>
              The Ascend Method
            </p>
            <h2 style={{ color: '#FFFFFF', fontSize: 24, fontWeight: 700, margin: '0 0 14px', lineHeight: 1.25 }}>
              {slide.title}
            </h2>
            <p style={{ color: '#5A7A9A', fontSize: 15, margin: '0 0 40px', lineHeight: 1.65 }}>
              {slide.body}
            </p>
            {/* Dots */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 32 }}>
              {METHOD_SLIDES.map((_, i) => (
                <div key={i} style={{ width: i === introSlide ? 20 : 6, height: 6, borderRadius: 3, background: i === introSlide ? '#4A9EFF' : '#1A2A42', transition: 'all 0.2s' }} />
              ))}
            </div>
          </div>
          <div style={{ padding: '12px 32px 88px', display: 'flex', gap: 12 }}>
            {introSlide > 0 && (
              <button
                onClick={() => setIntroSlide(i => i - 1)}
                style={{ flex: 1, background: '#1A2A42', color: '#FFFFFF', fontSize: 15, fontWeight: 700, borderRadius: 14, padding: '16px', border: 'none', cursor: 'pointer' }}
              >
                ← Back
              </button>
            )}
            <button
              onClick={() => {
                if (isLast) {
                  localStorage.setItem('ascend_method_intro_seen', '1')
                  setShowMethodIntro(false)
                } else {
                  setIntroSlide(i => i + 1)
                }
              }}
              style={{ flex: 2, background: '#4A9EFF', color: '#FFFFFF', fontSize: 15, fontWeight: 700, borderRadius: 14, padding: '16px', border: 'none', cursor: 'pointer' }}
            >
              {isLast ? 'Start Training →' : 'Next →'}
            </button>
          </div>
        </div>
      </div>
    )
  }

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
      { score: 3, emoji: '🪫', label: 'Rough', sub: 'Lighter load · Focus on form' },
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
                  onClick={() => { setRecoveryScore(opt.score); setSoreMuscles([]); setInjuredMuscles([]); setPhase('soreness') }}
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

  // ── Soreness screen ───────────────────────────────────────────────────────

  if (phase === 'soreness') {
    return (
      <div className="app-shell">
        <div className="app-content" style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
          <div style={{ flex: 1, overflow: 'auto', padding: '56px 24px 24px' }}>
            <button
              onClick={() => setPhase('recovery')}
              style={{ background: 'none', border: 'none', color: '#5A7A9A', fontSize: 14, cursor: 'pointer', padding: '0 0 16px', display: 'block' }}
            >
              ← Back
            </button>
            <p style={{ color: '#FBBF24', fontSize: 11, letterSpacing: '2px', textTransform: 'uppercase', margin: '0 0 8px' }}>
              Optional
            </p>
            <h1 style={{ color: '#FFFFFF', fontSize: 26, fontWeight: 700, margin: '0 0 6px', lineHeight: 1.2 }}>
              Any soreness today?
            </h1>
            <p style={{ color: '#5A7A9A', fontSize: 14, margin: '0 0 24px' }}>
              We'll keep these muscles active but reduce the load.
            </p>
            <BodyDiagram
              selected={soreMuscles}
              onToggle={id => setSoreMuscles(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])}
              accentColor="#FBBF24"
              accentBg="rgba(251,191,36,0.15)"
            />
          </div>
          <div style={{ padding: '12px 24px 88px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button
              onClick={() => setPhase('injury')}
              style={{
                width: '100%', background: '#4A9EFF', color: '#FFFFFF',
                fontSize: 16, fontWeight: 700, borderRadius: 14, padding: '16px',
                border: 'none', cursor: 'pointer',
              }}
            >
              Continue →
            </button>
            <button
              onClick={() => { setSoreMuscles([]); setPhase('injury') }}
              style={{ width: '100%', background: 'none', border: 'none', color: '#3A5A7A', fontSize: 14, padding: '12px', cursor: 'pointer' }}
            >
              Skip →
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Injury screen ─────────────────────────────────────────────────────────

  if (phase === 'injury') {
    return (
      <div className="app-shell">
        <div className="app-content" style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
          <div style={{ flex: 1, overflow: 'auto', padding: '56px 24px 24px' }}>
            <button
              onClick={() => setPhase('soreness')}
              style={{ background: 'none', border: 'none', color: '#5A7A9A', fontSize: 14, cursor: 'pointer', padding: '0 0 16px', display: 'block' }}
            >
              ← Back
            </button>
            <p style={{ color: '#EF4444', fontSize: 11, letterSpacing: '2px', textTransform: 'uppercase', margin: '0 0 8px' }}>
              Optional
            </p>
            <h1 style={{ color: '#FFFFFF', fontSize: 26, fontWeight: 700, margin: '0 0 6px', lineHeight: 1.2 }}>
              Any injuries?
            </h1>
            <p style={{ color: '#5A7A9A', fontSize: 14, margin: '0 0 24px' }}>
              We'll work around these completely.
            </p>
            <BodyDiagram
              selected={injuredMuscles}
              onToggle={id => setInjuredMuscles(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])}
              accentColor="#EF4444"
              accentBg="rgba(239,68,68,0.15)"
            />
          </div>
          <div style={{ padding: '12px 24px 88px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button
              onClick={() => handleGenerate()}
              disabled={!profile}
              style={{
                width: '100%', background: '#4A9EFF', color: '#FFFFFF',
                fontSize: 16, fontWeight: 700, borderRadius: 14, padding: '16px',
                border: 'none', cursor: 'pointer',
              }}
            >
              Build My Workout →
            </button>
            <button
              onClick={() => { setInjuredMuscles([]); handleGenerate() }}
              disabled={!profile}
              style={{ width: '100%', background: 'none', border: 'none', color: '#3A5A7A', fontSize: 14, padding: '12px', cursor: 'pointer' }}
            >
              Skip →
            </button>
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
            <div style={{
              background: '#0A2A1A', border: '1px solid #22C55E',
              borderRadius: 20, padding: '5px 14px', marginBottom: 16,
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}>
              <span style={{ color: '#22C55E', fontSize: 11, fontWeight: 700 }}>✓ Saved to your history</span>
            </div>
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
            {/* Workout feedback */}
            {feedbackRating === null ? (
              <div style={{ background: '#0D1728', border: '1px solid #1A2A42', borderRadius: 14, padding: '14px 16px', marginBottom: 12 }}>
                <p style={{ color: '#FFFFFF', fontSize: 13, fontWeight: 700, margin: '0 0 12px', textAlign: 'center' }}>How was today's workout?</p>
                <div style={{ display: 'flex', gap: 8 }}>
                  {([
                    { rating: 1, emoji: '😴', label: 'Too easy' },
                    { rating: 2, emoji: '💪', label: 'Just right' },
                    { rating: 3, emoji: '🔥', label: 'Too hard' },
                  ] as { rating: number; emoji: string; label: string }[]).map(opt => (
                    <button
                      key={opt.rating}
                      onClick={() => handleFeedback(opt.rating)}
                      style={{ flex: 1, background: '#1A2A42', border: 'none', borderRadius: 10, padding: '12px 4px', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}
                    >
                      <span style={{ fontSize: 24 }}>{opt.emoji}</span>
                      <span style={{ color: '#FFFFFF', fontSize: 10, fontWeight: 600 }}>{opt.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div style={{ background: '#0D1728', border: '1px solid #1A2A42', borderRadius: 14, padding: '12px 16px', marginBottom: 12, textAlign: 'center' }}>
                <p style={{ color: '#5A7A9A', fontSize: 12, margin: 0 }}>Thanks for the feedback — we'll adjust your next session.</p>
              </div>
            )}
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

        {/* Fixed workout timer + end early */}
        <div style={{ position: 'fixed', top: 16, right: 20, zIndex: 50, display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={() => setShowEndEarly(true)}
            style={{
              background: '#0D1728', border: '1px solid #1A2A42',
              borderRadius: 8, padding: '4px 10px',
              color: '#5A7A9A', fontSize: 12, fontWeight: 600, cursor: 'pointer',
            }}
          >
            End early
          </button>
          <div style={{
            background: '#0D1728', border: '1px solid #1A2A42',
            borderRadius: 8, padding: '4px 10px',
          }}>
            <span style={{ color: '#4A9EFF', fontSize: 13, fontWeight: 700 }}>{fmtTime(elapsedSeconds)}</span>
          </div>
        </div>

        {/* End early confirmation modal */}
        {showEndEarly && (
          <div style={{
            position: 'fixed', inset: 0, zIndex: 100,
            background: 'rgba(0,0,0,0.7)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
          }}>
            <div style={{ background: '#0D1728', border: '1px solid #1A2A42', borderRadius: 20, padding: 28, width: '100%', maxWidth: 320 }}>
              <p style={{ color: '#FFFFFF', fontSize: 17, fontWeight: 700, margin: '0 0 8px', textAlign: 'center' }}>End workout early?</p>
              <p style={{ color: '#5A7A9A', fontSize: 13, margin: '0 0 24px', textAlign: 'center', lineHeight: 1.5 }}>All completed sets will be saved and counted toward your score.</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <button
                  onClick={() => { setShowEndEarly(false); handleFinish() }}
                  style={{
                    background: '#4A9EFF', border: 'none', borderRadius: 12,
                    padding: '14px', color: '#FFFFFF', fontSize: 15, fontWeight: 700, cursor: 'pointer',
                  }}
                >
                  Save &amp; End
                </button>
                <button
                  onClick={() => setShowEndEarly(false)}
                  style={{
                    background: 'none', border: '1px solid #1A2A42', borderRadius: 12,
                    padding: '14px', color: '#5A7A9A', fontSize: 15, fontWeight: 600, cursor: 'pointer',
                  }}
                >
                  Keep going
                </button>
              </div>
            </div>
          </div>
        )}

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
            {workout.main_work.length + workout.finisher.length} exercises · Est. {parseInt(localStorage.getItem('onboarding_workout_duration') ?? '60', 10) || 60} min
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
            Main Work · {Math.max(5, (parseInt(localStorage.getItem('onboarding_workout_duration') ?? '60', 10) || 60) - 20)} min
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
                onDecrementSet={() => handleDecrementSet(key)}
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
                    onDecrementSet={() => handleDecrementSet(key)}
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
            <>
              {finishError && (
                <p style={{ color: '#E85D24', fontSize: 12, textAlign: 'center', margin: '0 0 8px', lineHeight: 1.4 }}>{finishError}</p>
              )}
              <button
                onClick={handleFinish}
                disabled={!anySetsDone || finishing}
                style={{
                  width: '100%',
                  background: anySetsDone && !finishing ? '#4A9EFF' : '#1A2A42',
                  color: anySetsDone && !finishing ? '#FFFFFF' : '#2E4A6A',
                  fontSize: 15, fontWeight: 700, borderRadius: 14, padding: '16px',
                  border: 'none', cursor: anySetsDone && !finishing ? 'pointer' : 'not-allowed',
                  marginTop: 16, marginBottom: 8, transition: 'background 0.2s',
                }}
              >
                {finishing ? 'Saving…' : 'Finish Workout & Log Progress'}
              </button>
            </>
          )}

        </div>
      </div>

      {/* 2-hour forgotten-workout modal */}
      {showTwoHourModal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 200,
          background: 'rgba(8,14,28,0.92)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '0 24px',
        }}>
          <div style={{ background: '#0D1728', border: '1px solid #1E3D6E', borderRadius: 20, padding: 28, width: '100%', maxWidth: 360, textAlign: 'center' }}>
            <p style={{ fontSize: 40, margin: '0 0 12px' }}>⏱️</p>
            <h2 style={{ color: '#FFFFFF', fontSize: 18, fontWeight: 700, margin: '0 0 8px' }}>Still training?</h2>
            <p style={{ color: '#5A7A9A', fontSize: 14, margin: '0 0 24px', lineHeight: 1.5 }}>
              You've been in this workout for 2 hours. Did you forget to tap Finish Workout?
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button
                onClick={() => setShowTwoHourModal(false)}
                style={{ background: '#4A9EFF', border: 'none', borderRadius: 14, padding: '14px', color: '#FFFFFF', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}
              >
                Still going — dismiss
              </button>
              <button
                onClick={() => { setShowTwoHourModal(false); handleFinish() }}
                disabled={finishing}
                style={{ background: '#1A2A42', border: 'none', borderRadius: 14, padding: '14px', color: '#FFFFFF', fontSize: 15, fontWeight: 700, cursor: finishing ? 'not-allowed' : 'pointer' }}
              >
                {finishing ? 'Saving…' : 'Finish Workout & Log Progress'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
