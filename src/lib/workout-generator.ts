// All AI workout generation logic lives here.
// Calls /api/generate-workout which is proxied to the Express server (server.js) to avoid CORS.

import { supabase } from './supabase'

// ── Types ────────────────────────────────────────────────────────────────────

export interface WarmupItem {
  movement: string
  duration: string
}

export interface ExerciseItem {
  exercise_name: string
  muscle_group: string
  sets: number
  reps: string | number
  suggested_weight: number
  rpe_target: number
  rest_seconds: number
  coaching_tip: string
}

export interface GeneratedWorkout {
  session_label: string
  ai_insight: string
  warmup: WarmupItem[]
  main_work: ExerciseItem[]
  finisher: ExerciseItem[]
}

export interface WorkoutInput {
  userId: string
  goal: string | null
  experience_level: string | null
  equipment: string | null
  recovery_score: number
  workoutDuration?: number
  firstSessionType?: string
  sore_muscles?: string[]
  injured_muscles?: string[]
}

// ── Constants ────────────────────────────────────────────────────────────────

const MUSCLE_RECOVERY_HOURS: Record<string, number> = {
  chest: 48, triceps: 48,
  back: 48, biceps: 48, lats: 48,
  legs: 72, quads: 72, hamstrings: 72, glutes: 72, calves: 72,
  shoulders: 48, delts: 48,
  core: 24, abs: 24,
}

const SYSTEM_PROMPT = `You are an elite strength and conditioning coach with expertise in hypertrophy, powerlifting, athletic performance, and fat loss. You design precise, science-based workout programs personalized to each athlete. You understand periodization, progressive overload, and recovery. Always respond with valid JSON only.`

// ── Helpers ──────────────────────────────────────────────────────────────────

function sessionTypeToMuscles(type: string): string[] {
  const t = (type ?? '').toLowerCase()
  if (t.includes('push'))       return ['chest', 'triceps', 'shoulders']
  if (t.includes('pull'))       return ['back', 'biceps', 'lats']
  if (t.includes('leg') || t.includes('lower')) return ['quads', 'hamstrings', 'glutes', 'calves']
  if (t.includes('upper'))      return ['chest', 'back', 'shoulders', 'biceps', 'triceps']
  if (t.includes('full'))       return ['chest', 'back', 'legs', 'shoulders', 'biceps', 'triceps']
  return []
}

function getSplitDescription(experience: string | null): string {
  if (experience === 'beginner' || experience === 'some') return 'Full Body 3x/week (Mon/Wed/Fri pattern)'
  if (experience === 'consistent') return 'Upper/Lower split 4x/week'
  return 'Push/Pull/Legs 5-6x/week'
}

export function parseReps(reps: string | number): number {
  if (typeof reps === 'number') return isNaN(reps) ? 10 : reps
  if (!reps) return 10
  const m = String(reps).match(/\d+/)
  return m ? parseInt(m[0]) : 10
}

// ── Data fetching ────────────────────────────────────────────────────────────

async function getRecentMuscleHoursSince(userId: string): Promise<Record<string, number>> {
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const { data: workouts } = await supabase
      .from('workouts')
      .select('workout_date, workout_type')
      .eq('user_id', userId)
      .gte('workout_date', sevenDaysAgo)
      .order('workout_date', { ascending: false })

    const lastTrained: Record<string, Date> = {}
    for (const w of workouts ?? []) {
      const muscles = sessionTypeToMuscles(w.workout_type ?? '')
      const date = new Date(w.workout_date)
      for (const mg of muscles) {
        if (!lastTrained[mg] || date > lastTrained[mg]) lastTrained[mg] = date
      }
    }

    const now = Date.now()
    const result: Record<string, number> = {}
    for (const [mg, date] of Object.entries(lastTrained)) {
      result[mg] = (now - date.getTime()) / (1000 * 60 * 60)
    }
    return result
  } catch {
    return {}
  }
}

function getMusclesDue(hoursSince: Record<string, number>): string[] {
  const allGroups = ['chest', 'back', 'legs', 'shoulders', 'biceps', 'triceps', 'core']
  return allGroups.filter(mg => {
    const h = hoursSince[mg]
    return h === undefined || h >= (MUSCLE_RECOVERY_HOURS[mg] ?? 48)
  })
}

async function getPreviousWeights(userId: string): Promise<Record<string, number>> {
  try {
    const { data: recentWorkouts } = await supabase
      .from('workouts')
      .select('id, workout_date')
      .eq('user_id', userId)
      .order('workout_date', { ascending: false })
      .limit(30)

    const workoutIds = (recentWorkouts ?? []).map(w => w.id)
    if (workoutIds.length === 0) return {}

    const dateMap = new Map((recentWorkouts ?? []).map(w => [w.id, w.workout_date]))

    const { data: logs } = await supabase
      .from('exercise_logs')
      .select('exercise_name, weight, workout_id')
      .in('workout_id', workoutIds)
      .gt('weight', 0)

    if (!logs) return {}

    const sorted = [...logs].sort((a, b) => {
      const da = dateMap.get(a.workout_id) ?? ''
      const db = dateMap.get(b.workout_id) ?? ''
      return db.localeCompare(da)
    })

    const weights: Record<string, number> = {}
    for (const log of sorted) {
      if (!weights[log.exercise_name] && log.weight > 0) weights[log.exercise_name] = log.weight
    }
    return weights
  } catch {
    return {}
  }
}

async function getDetailedWorkoutHistory(userId: string): Promise<string> {
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const { data: workouts } = await supabase
      .from('workouts')
      .select('id, workout_date, workout_type')
      .eq('user_id', userId)
      .gte('workout_date', sevenDaysAgo)
      .order('workout_date', { ascending: false })

    if (!workouts || workouts.length === 0) return ''

    const workoutIds = workouts.map(w => w.id)
    const { data: logs } = await supabase
      .from('exercise_logs')
      .select('workout_id, exercise_name, sets, reps, weight')
      .in('workout_id', workoutIds)

    const logsByWorkout = new Map<string, Array<{ exercise_name: string; sets: number; reps: number; weight: number }>>()
    for (const log of logs ?? []) {
      const arr = logsByWorkout.get(log.workout_id) ?? []
      arr.push(log)
      logsByWorkout.set(log.workout_id, arr)
    }

    const lines: string[] = ['Last 7 days of training (use this for progressive overload — increase weight by 2.5 lb upper / 5 lb lower on each exercise if recovery >= 4):']
    for (const w of workouts) {
      const date = new Date(w.workout_date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
      lines.push(`${date} — ${w.workout_type ?? 'Workout'}`)
      const wLogs = logsByWorkout.get(w.id) ?? []
      for (const log of wLogs) {
        const weightStr = log.weight > 0 ? ` @ ${log.weight} lb` : ' (bodyweight)'
        lines.push(`  • ${log.exercise_name}: ${log.sets} sets × ${log.reps} reps${weightStr}`)
      }
    }
    return lines.join('\n')
  } catch {
    return ''
  }
}

// ── API call ─────────────────────────────────────────────────────────────────

async function callAnthropic(prompt: string): Promise<string> {
  const res = await fetch('/api/generate-workout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Workout generation failed ${res.status}: ${body.slice(0, 200)}`)
  }

  const data = await res.json()
  return data.content?.[0]?.text ?? ''
}

function parseJSON<T>(raw: string): T {
  try {
    return JSON.parse(raw) as T
  } catch {
    const m = raw.match(/\{[\s\S]*\}/)
    if (!m) throw new Error('No JSON found in AI response')
    return JSON.parse(m[0]) as T
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

const FIRST_SESSION_INSIGHT = "Welcome to your first Ascend workout. We've built this session around your goal and will personalize it further as you log more sessions."

function mainExerciseCount(durationMin: number): number {
  if (durationMin <= 30) return 2
  if (durationMin <= 45) return 3
  if (durationMin >= 75) return 5
  return 4
}

export async function generateWorkout(input: WorkoutInput): Promise<GeneratedWorkout> {
  const { userId, goal, experience_level, equipment, recovery_score, workoutDuration, firstSessionType, sore_muscles, injured_muscles } = input
  const totalMin = workoutDuration ?? 60
  const mainCount = mainExerciseCount(totalMin)

  const [hoursSince, previousWeights, detailedHistory] = await Promise.all([
    getRecentMuscleHoursSince(userId),
    getPreviousWeights(userId),
    getDetailedWorkoutHistory(userId),
  ])

  const isFirstSession = Object.keys(hoursSince).length === 0 && Object.keys(previousWeights).length === 0
  const musclesDue = getMusclesDue(hoursSince)
  const splitType = getSplitDescription(experience_level)

  const avoidMuscles = Object.entries(hoursSince)
    .filter(([mg, hours]) => hours < (MUSCLE_RECOVERY_HOURS[mg] ?? 48))
    .map(([mg]) => mg)

  const sessionFocusLine = isFirstSession && firstSessionType
    ? `\nFirst session focus: ${firstSessionType === 'upper' ? 'Upper Body (chest, back, shoulders, arms) — no leg exercises' : firstSessionType === 'lower' ? 'Lower Body (quads, hamstrings, glutes, calves) — no upper body exercises' : 'Full Body — balanced coverage of all major muscle groups'}`
    : ''

  const historyContext = isFirstSession
    ? `Training history: None — this is the athlete's very first session. Use conservative beginner-friendly weights (e.g. bench press 45–95 lb, squat 45–95 lb, row 45–75 lb). Prioritize form-friendly exercises with moderate weight.${sessionFocusLine}`
    : `${detailedHistory || `Previous weights: ${JSON.stringify(previousWeights)}`}`

  const muscleConstraint = avoidMuscles.length > 0
    ? `STRICTLY AVOID these muscle groups — not yet recovered (upper body needs 48 h, legs need 72 h): ${avoidMuscles.join(', ')}.`
    : 'All muscle groups are fully recovered and available.'

  const soreConstraint = sore_muscles?.length
    ? `\nSORE muscles (keep in workout but cap at 2 sets max, reduce suggested_weight by 15%): ${sore_muscles.join(', ')}`
    : ''
  const injuryConstraint = injured_muscles?.length
    ? `\nINJURED muscles (COMPLETELY EXCLUDE — zero exercises targeting these): ${injured_muscles.join(', ')}`
    : ''

  const prompt = `Design a ${totalMin}-minute workout for this athlete:

Goal: ${goal ?? 'general fitness'}
Experience: ${experience_level ?? 'beginner'}
Equipment: ${equipment ?? 'full gym'}
Weekly split: ${splitType}
Recovery score today: ${recovery_score}/10
Muscle groups available (recovered and due): ${musclesDue.join(', ') || 'all groups'}
RECOVERY CONSTRAINT: ${muscleConstraint}${soreConstraint}${injuryConstraint}
${historyContext}

Goal modifiers:
- lean: rest_seconds 45–60, reps 12–20, supersets
- muscle: 4–5 sets, rest_seconds 60–90, reps 8–12
- strength: heavy compounds, rest_seconds 150–180, reps 3–6
- athletic: power movements, mixed rep ranges

Recovery adjustment already applied in your output:
- Score 1–3: reduce sets by 40%, reduce weight by 20%, session_label ends with "— Recovery Day"
- Score 4–6: standard
- Score 7–10: add 1 set to each compound, increase weight by 5%, session_label ends with "— Performance Day"

Return ONLY valid JSON matching this exact structure:
{
  "session_label": "Full Body — Standard",
  "ai_insight": "Two specific sentences explaining why this exact workout was designed for this athlete today.",
  "warmup": [
    { "movement": "Arm circles", "duration": "30 seconds" },
    { "movement": "Band pull-aparts", "duration": "15 reps" },
    { "movement": "Shoulder rotations", "duration": "30 seconds" }
  ],
  "main_work": [
    {
      "exercise_name": "Barbell Bench Press",
      "muscle_group": "Chest",
      "sets": 3,
      "reps": "10-12",
      "suggested_weight": 75,
      "rpe_target": 7,
      "rest_seconds": 90,
      "coaching_tip": "Drive feet into the floor and maintain an arch in your lower back throughout."
    }
  ],
  "finisher": [
    {
      "exercise_name": "Cable Fly",
      "muscle_group": "Chest",
      "sets": 3,
      "reps": "12-15",
      "suggested_weight": 20,
      "rpe_target": 7,
      "rest_seconds": 60,
      "coaching_tip": "Maintain a slight bend in the elbows and focus on the stretch."
    }
  ]
}

main_work: exactly ${mainCount} exercises. finisher: exactly 2 exercises. warmup: exactly 3 movements.`

  const raw = await callAnthropic(prompt)
  const result = parseJSON<GeneratedWorkout>(raw)

  if (isFirstSession) {
    result.ai_insight = FIRST_SESSION_INSIGHT
  }

  return result
}

export async function suggestSubstitution(
  exerciseName: string,
  muscleGroup: string,
  equipment: string | null,
  goal: string | null,
): Promise<ExerciseItem> {
  const prompt = `Suggest ONE alternative exercise to replace "${exerciseName}" (targets ${muscleGroup}). Equipment: ${equipment ?? 'full gym'}. Goal: ${goal ?? 'muscle'}.

Return ONLY this JSON:
{
  "exercise_name": "...",
  "muscle_group": "${muscleGroup}",
  "sets": 3,
  "reps": "10-12",
  "suggested_weight": 45,
  "rpe_target": 7,
  "rest_seconds": 75,
  "coaching_tip": "One specific coaching cue for this exercise."
}`

  const raw = await callAnthropic(prompt)
  return parseJSON<ExerciseItem>(raw)
}
