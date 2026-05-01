import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { calculateXPGain, getLevelFromXP } from '../lib/scoring'

// ── Types ──────────────────────────────────────────────────────────────────────

type Phase = 'loading' | 'template-list' | 'builder' | 'workout' | 'summary'

interface TemplateExercise {
  id?: string
  exercise_name: string
  sets: number
  reps: string
  weight: number
  notes: string
  order_index: number
}

interface Template {
  id: string
  name: string
  last_used_at: string | null
  exercises: TemplateExercise[]
}

interface SummaryData {
  templateName: string
  exercisesCompleted: number
  totalSets: number
  totalVolume: number
  xpGain: number
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtTime(totalSecs: number): string {
  const m = Math.floor(totalSecs / 60)
  const s = totalSecs % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function CustomWorkout() {
  const navigate = useNavigate()
  const location = useLocation()
  const directTemplateId = (location.state as { templateId?: string } | null)?.templateId ?? null

  const [phase, setPhase] = useState<Phase>('loading')
  const [userId, setUserId] = useState<string | null>(null)
  const [templates, setTemplates] = useState<Template[]>([])

  // Builder state
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null)
  const [templateName, setTemplateName] = useState('')
  const [exercises, setExercises] = useState<TemplateExercise[]>([])
  const [savingTemplate, setSavingTemplate] = useState(false)

  // Workout state
  const [activeTemplate, setActiveTemplate] = useState<Template | null>(null)
  const [completedSets, setCompletedSets] = useState<Record<number, number>>({})
  const [setWeights, setSetWeights] = useState<Record<string, number>>({})
  const [pendingExIdx, setPendingExIdx] = useState<number | null>(null)
  const [pendingWeight, setPendingWeight] = useState('')
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [finishing, setFinishing] = useState(false)
  const [summaryData, setSummaryData] = useState<SummaryData | null>(null)

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startTimeRef = useRef<number>(0)

  // ── Data loading ─────────────────────────────────────────────────────────────

  const loadTemplates = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { navigate('/auth'); return }
    setUserId(user.id)

    const { data: tmplData } = await supabase
      .from('workout_templates')
      .select('id, name, last_used_at')
      .eq('user_id', user.id)
      .order('last_used_at', { ascending: false, nullsFirst: false })

    if (!tmplData || tmplData.length === 0) {
      setTemplates([])
      setPhase('template-list')
      return
    }

    const tmplIds = tmplData.map(t => t.id as string)
    const { data: exData } = await supabase
      .from('template_exercises')
      .select('*')
      .in('template_id', tmplIds)
      .order('order_index', { ascending: true })

    const exMap = new Map<string, TemplateExercise[]>()
    for (const ex of exData ?? []) {
      const arr = exMap.get(ex.template_id as string) ?? []
      arr.push({
        id: ex.id as string,
        exercise_name: ex.exercise_name as string,
        sets: ex.sets as number,
        reps: ex.reps as string,
        weight: (ex.weight as number) ?? 0,
        notes: (ex.notes as string) ?? '',
        order_index: ex.order_index as number,
      })
      exMap.set(ex.template_id as string, arr)
    }

    const loaded: Template[] = tmplData.map(t => ({
      id: t.id as string,
      name: t.name as string,
      last_used_at: t.last_used_at as string | null,
      exercises: exMap.get(t.id as string) ?? [],
    }))
    setTemplates(loaded)

    if (directTemplateId) {
      const target = loaded.find(t => t.id === directTemplateId)
      if (target) { startWorkout(target); return }
    }

    setPhase('template-list')
  }, [navigate, directTemplateId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadTemplates() }, [loadTemplates])

  // ── Workout timer ─────────────────────────────────────────────────────────────

  useEffect(() => {
    if (phase !== 'workout') {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
      return
    }
    setElapsedSeconds(0)
    startTimeRef.current = Date.now()
    timerRef.current = setInterval(() => setElapsedSeconds(s => s + 1), 1000)
    return () => { if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null } }
  }, [phase])

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current) }, [])

  // ── Actions ──────────────────────────────────────────────────────────────────

  function startWorkout(template: Template) {
    setActiveTemplate(template)
    setCompletedSets({})
    setSetWeights({})
    setPendingExIdx(null)
    setPendingWeight('')
    setPhase('workout')
  }

  function openBuilder(template?: Template) {
    if (template) {
      setEditingTemplate(template)
      setTemplateName(template.name)
      setExercises(template.exercises.map(e => ({ ...e })))
    } else {
      setEditingTemplate(null)
      setTemplateName('')
      setExercises([{ exercise_name: '', sets: 3, reps: '8-10', weight: 0, notes: '', order_index: 0 }])
    }
    setPhase('builder')
  }

  function addExercise() {
    setExercises(prev => [
      ...prev,
      { exercise_name: '', sets: 3, reps: '8-10', weight: 0, notes: '', order_index: prev.length },
    ])
  }

  function removeExercise(idx: number) {
    setExercises(prev => prev.filter((_, i) => i !== idx).map((e, i) => ({ ...e, order_index: i })))
  }

  function updateExercise<K extends keyof TemplateExercise>(idx: number, field: K, value: TemplateExercise[K]) {
    setExercises(prev => prev.map((e, i) => i === idx ? { ...e, [field]: value } : e))
  }

  async function saveAndStart() {
    if (!userId || !templateName.trim()) return
    const validEx = exercises.filter(e => e.exercise_name.trim())
    if (validEx.length === 0) return
    setSavingTemplate(true)
    try {
      let templateId = editingTemplate?.id
      if (templateId) {
        await supabase.from('workout_templates')
          .update({ name: templateName.trim(), updated_at: new Date().toISOString() })
          .eq('id', templateId)
        await supabase.from('template_exercises').delete().eq('template_id', templateId)
      } else {
        const { data: newTmpl } = await supabase.from('workout_templates')
          .insert({ user_id: userId, name: templateName.trim() })
          .select().single()
        templateId = newTmpl?.id as string | undefined
      }
      if (!templateId) return

      await supabase.from('template_exercises').insert(
        validEx.map((e, i) => ({
          template_id: templateId,
          exercise_name: e.exercise_name.trim(),
          sets: e.sets,
          reps: e.reps || '8-10',
          weight: e.weight || 0,
          notes: e.notes || null,
          order_index: i,
        }))
      )

      const template: Template = {
        id: templateId,
        name: templateName.trim(),
        last_used_at: null,
        exercises: validEx.map((e, i) => ({ ...e, order_index: i })),
      }
      startWorkout(template)
    } finally {
      setSavingTemplate(false)
    }
  }

  function handleSetTap(exIdx: number) {
    if (!activeTemplate) return
    const done = completedSets[exIdx] ?? 0
    const ex = activeTemplate.exercises[exIdx]
    if (done >= ex.sets) return

    if (ex.weight === 0) {
      setCompletedSets(prev => ({ ...prev, [exIdx]: done + 1 }))
    } else {
      const lastW = done > 0 ? (setWeights[`${exIdx}_${done - 1}`] ?? ex.weight) : ex.weight
      setPendingWeight(lastW > 0 ? String(lastW) : '')
      setPendingExIdx(exIdx)
    }
  }

  function confirmWeight() {
    if (pendingExIdx === null) return
    const done = completedSets[pendingExIdx] ?? 0
    const w = parseFloat(pendingWeight)
    if (!isNaN(w) && w > 0) {
      setSetWeights(prev => ({ ...prev, [`${pendingExIdx}_${done}`]: w }))
    }
    setCompletedSets(prev => ({ ...prev, [pendingExIdx]: done + 1 }))
    setPendingExIdx(null)
    setPendingWeight('')
  }

  async function handleFinish() {
    if (!activeTemplate || !userId || finishing) return
    setFinishing(true)
    try {
      const duration = Math.max(1, Math.round((Date.now() - startTimeRef.current) / 60000))

      const { data: workoutRecord } = await supabase.from('workouts').insert({
        user_id: userId,
        workout_date: new Date().toISOString(),
        workout_type: activeTemplate.name,
        duration,
        completed: true,
        workout_source: 'custom',
        template_id: activeTemplate.id,
      }).select().single()

      if (!workoutRecord) return

      let totalVolume = 0
      let totalSets = 0
      let exercisesCompleted = 0

      for (let i = 0; i < activeTemplate.exercises.length; i++) {
        const ex = activeTemplate.exercises[i]
        const sets = completedSets[i] ?? 0
        if (sets === 0) continue
        exercisesCompleted++
        totalSets += sets
        const repsNum = parseInt(ex.reps) || 8
        for (let s = 0; s < sets; s++) {
          const w = setWeights[`${i}_${s}`] ?? 0
          if (w > 0) totalVolume += w * repsNum
        }
        const loggedWeight = Math.round(setWeights[`${i}_0`] ?? ex.weight)
        await supabase.from('exercise_logs').insert({
          workout_id: workoutRecord.id,
          exercise_name: ex.exercise_name,
          sets,
          reps: parseInt(ex.reps) || 8,
          weight: loggedWeight,
          completed: true,
        })
      }

      await supabase.from('workout_templates')
        .update({ last_used_at: new Date().toISOString() })
        .eq('id', activeTemplate.id)

      const { data: curScores } = await supabase
        .from('user_scores').select('xp, level, streak_days').eq('user_id', userId).maybeSingle()

      const xp = calculateXPGain(exercisesCompleted, 0, false)
      const newXP = (curScores?.xp ?? 0) + xp
      const newLevel = getLevelFromXP(newXP)

      const todayStr = new Date().toISOString().split('T')[0]
      const yesterdayStr = new Date(Date.now() - 86400000).toISOString().split('T')[0]
      const twoDaysAgoStr = new Date(Date.now() - 2 * 86400000).toISOString().split('T')[0]
      const { data: prevWorkout } = await supabase
        .from('workouts').select('workout_date').eq('user_id', userId).eq('completed', true)
        .neq('id', workoutRecord.id).order('workout_date', { ascending: false }).limit(1).maybeSingle()
      const prevDate = prevWorkout ? (prevWorkout.workout_date as string).split('T')[0] : null
      const newStreak = (prevDate === todayStr || prevDate === yesterdayStr || prevDate === twoDaysAgoStr)
        ? (curScores?.streak_days ?? 0) + 1
        : 1

      await supabase.from('user_scores').update({ xp: newXP, level: newLevel, streak_days: newStreak }).eq('user_id', userId)

      localStorage.setItem('ascend_home_badge', '1')
      window.dispatchEvent(new CustomEvent('ascend-badge-update'))

      setSummaryData({
        templateName: activeTemplate.name,
        exercisesCompleted,
        totalSets,
        totalVolume: Math.round(totalVolume),
        xpGain: xp,
      })
      setPhase('summary')
    } finally {
      setFinishing(false)
    }
  }

  // ── Renders ──────────────────────────────────────────────────────────────────

  if (phase === 'loading') {
    return (
      <div className="app-shell">
        <div className="app-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
          <div style={{ color: '#5A7A9A', fontSize: 14 }}>Loading…</div>
        </div>
      </div>
    )
  }

  // ── Template list ──────────────────────────────────────────────────────────

  if (phase === 'template-list') {
    return (
      <div className="app-shell">
        <div className="app-content" style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
          <div style={{ flex: 1, overflow: 'auto', padding: '56px 24px 24px' }}>

            <button
              onClick={() => navigate('/workout')}
              style={{ background: 'none', border: 'none', color: '#5A7A9A', fontSize: 14, cursor: 'pointer', padding: '0 0 20px', display: 'block' }}
            >
              ← Back
            </button>

            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
              <div>
                <p style={{ color: '#3BF0A0', fontSize: 11, letterSpacing: '2px', textTransform: 'uppercase', margin: '0 0 4px' }}>
                  Custom Workouts
                </p>
                <h1 style={{ color: '#FFFFFF', fontSize: 24, fontWeight: 700, margin: 0 }}>Your Workouts</h1>
              </div>
              <button
                onClick={() => openBuilder()}
                style={{ background: '#3BF0A0', border: 'none', borderRadius: 10, padding: '10px 18px', color: '#000', fontSize: 13, fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}
              >
                + New
              </button>
            </div>

            {templates.length === 0 ? (
              <div style={{ background: '#0D1728', border: '1px solid #1A2A42', borderRadius: 16, padding: '36px 24px', textAlign: 'center' }}>
                <p style={{ fontSize: 36, margin: '0 0 12px' }}>✏️</p>
                <p style={{ color: '#FFFFFF', fontSize: 16, fontWeight: 700, margin: '0 0 8px' }}>No saved workouts yet</p>
                <p style={{ color: '#5A7A9A', fontSize: 13, margin: '0 0 24px', lineHeight: 1.5 }}>
                  Build a custom workout once, repeat it forever.
                </p>
                <button
                  onClick={() => openBuilder()}
                  style={{ background: '#3BF0A0', border: 'none', borderRadius: 12, padding: '12px 28px', color: '#000', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
                >
                  Create My First Workout
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {templates.map(t => (
                  <div
                    key={t.id}
                    style={{ background: '#0D1728', border: '1px solid #1A2A42', borderRadius: 16, padding: '16px' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ color: '#FFFFFF', fontSize: 15, fontWeight: 700, margin: '0 0 3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {t.name}
                        </p>
                        <p style={{ color: '#5A7A9A', fontSize: 12, margin: 0 }}>
                          {t.exercises.length} exercise{t.exercises.length !== 1 ? 's' : ''}
                          {t.last_used_at
                            ? ` · Last: ${new Date(t.last_used_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
                            : ''}
                        </p>
                      </div>
                      <button
                        onClick={() => openBuilder(t)}
                        style={{ background: 'none', border: '1px solid #1A2A42', borderRadius: 8, color: '#5A7A9A', fontSize: 12, cursor: 'pointer', padding: '6px 12px', flexShrink: 0 }}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => startWorkout(t)}
                        style={{ background: '#3BF0A0', border: 'none', borderRadius: 10, padding: '8px 18px', color: '#000', fontSize: 13, fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}
                      >
                        Start →
                      </button>
                    </div>

                    {t.exercises.length > 0 && (
                      <p style={{ color: '#5A7A9A', fontSize: 11, margin: '8px 0 0', lineHeight: 1.4 }}>
                        {t.exercises.slice(0, 3).map(e => e.exercise_name).join(' · ')}
                        {t.exercises.length > 3 ? ` +${t.exercises.length - 3} more` : ''}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ── Builder ──────────────────────────────────────────────────────────────────

  if (phase === 'builder') {
    const canStart = templateName.trim().length > 0 && exercises.some(e => e.exercise_name.trim())
    return (
      <div className="app-shell">
        <div className="app-content" style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
          <div style={{ flex: 1, overflow: 'auto', padding: '56px 24px 24px' }}>

            <button
              onClick={() => setPhase('template-list')}
              style={{ background: 'none', border: 'none', color: '#5A7A9A', fontSize: 14, cursor: 'pointer', padding: '0 0 20px', display: 'block' }}
            >
              ← Back
            </button>

            <h1 style={{ color: '#FFFFFF', fontSize: 22, fontWeight: 700, margin: '0 0 20px' }}>
              {editingTemplate ? 'Edit Workout' : 'New Workout'}
            </h1>

            <input
              type="text"
              value={templateName}
              onChange={e => setTemplateName(e.target.value)}
              placeholder="Workout name (e.g., Push Day)"
              style={{
                width: '100%', background: '#0D1728', border: '1px solid #4A9EFF',
                borderRadius: 12, padding: '14px 16px', color: '#FFFFFF', fontSize: 16, fontWeight: 700,
                outline: 'none', marginBottom: 24, boxSizing: 'border-box',
              }}
            />

            <p style={{ color: '#5A7A9A', fontSize: 10, letterSpacing: '1.5px', textTransform: 'uppercase', margin: '0 0 12px' }}>
              Exercises
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 12 }}>
              {exercises.map((ex, idx) => (
                <div key={idx} style={{ background: '#0D1728', border: '1px solid #1A2A42', borderRadius: 14, padding: '14px' }}>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <input
                      type="text"
                      value={ex.exercise_name}
                      onChange={e => updateExercise(idx, 'exercise_name', e.target.value)}
                      placeholder={`Exercise ${idx + 1}`}
                      style={{
                        flex: 1, background: '#0A1828', border: '1px solid #1A2A42',
                        borderRadius: 8, padding: '8px 12px', color: '#FFFFFF', fontSize: 14, outline: 'none',
                      }}
                    />
                    <button
                      onClick={() => removeExercise(idx)}
                      style={{ background: 'none', border: 'none', color: '#5A7A9A', fontSize: 20, cursor: 'pointer', padding: '2px 6px', lineHeight: 1, flexShrink: 0 }}
                    >
                      ×
                    </button>
                  </div>

                  <div style={{ display: 'flex', gap: 8 }}>
                    <div>
                      <p style={{ color: '#5A7A9A', fontSize: 10, margin: '0 0 4px' }}>Sets</p>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <button
                          onClick={() => updateExercise(idx, 'sets', Math.max(1, ex.sets - 1))}
                          style={{ width: 28, height: 28, borderRadius: 6, background: '#1A2A42', border: 'none', color: '#FFFFFF', fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        >−</button>
                        <span style={{ color: '#FFFFFF', fontSize: 14, fontWeight: 700, minWidth: 22, textAlign: 'center' }}>{ex.sets}</span>
                        <button
                          onClick={() => updateExercise(idx, 'sets', Math.min(10, ex.sets + 1))}
                          style={{ width: 28, height: 28, borderRadius: 6, background: '#1A2A42', border: 'none', color: '#FFFFFF', fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        >+</button>
                      </div>
                    </div>
                    <div style={{ flex: 1 }}>
                      <p style={{ color: '#5A7A9A', fontSize: 10, margin: '0 0 4px' }}>Reps</p>
                      <input
                        type="text"
                        value={ex.reps}
                        onChange={e => updateExercise(idx, 'reps', e.target.value)}
                        placeholder="8-10"
                        style={{ width: '100%', background: '#0A1828', border: '1px solid #1A2A42', borderRadius: 8, padding: '6px 8px', color: '#FFFFFF', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
                      />
                    </div>
                    <div style={{ flex: 1 }}>
                      <p style={{ color: '#5A7A9A', fontSize: 10, margin: '0 0 4px' }}>Weight (lb)</p>
                      <input
                        type="number"
                        inputMode="decimal"
                        value={ex.weight || ''}
                        onChange={e => updateExercise(idx, 'weight', parseFloat(e.target.value) || 0)}
                        placeholder="0 = BW"
                        style={{ width: '100%', background: '#0A1828', border: '1px solid #1A2A42', borderRadius: 8, padding: '6px 8px', color: '#FFFFFF', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={addExercise}
              style={{
                background: 'none', border: '1px dashed #1A2A42', borderRadius: 12, padding: '12px',
                width: '100%', color: '#5A7A9A', fontSize: 13, cursor: 'pointer', marginBottom: 24,
              }}
            >
              + Add Exercise
            </button>

          </div>

          <div style={{ padding: '12px 24px 88px' }}>
            <button
              onClick={saveAndStart}
              disabled={!canStart || savingTemplate}
              style={{
                width: '100%',
                background: canStart ? '#3BF0A0' : '#1A2A42',
                color: canStart ? '#000000' : '#5A7A9A',
                fontSize: 16, fontWeight: 700, borderRadius: 14, padding: '16px',
                border: 'none', cursor: canStart ? 'pointer' : 'not-allowed',
              }}
            >
              {savingTemplate ? 'Saving…' : 'Save & Start Workout →'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Workout execution ────────────────────────────────────────────────────────

  if (phase === 'workout' && activeTemplate) {
    const anyDone = Object.values(completedSets).some(v => v > 0)
    return (
      <div className="app-shell">
        <div className="app-content page-scroll">

          <div style={{ position: 'fixed', top: 16, right: 20, zIndex: 50, background: '#0D1728', border: '1px solid #1A2A42', borderRadius: 8, padding: '4px 10px' }}>
            <span style={{ color: '#3BF0A0', fontSize: 13, fontWeight: 700 }}>{fmtTime(elapsedSeconds)}</span>
          </div>

          <div style={{ padding: '52px 20px 0' }}>

            <p style={{ color: '#3BF0A0', fontSize: 11, letterSpacing: '2px', textTransform: 'uppercase', margin: '0 0 4px' }}>
              Custom Workout
            </p>
            <h1 style={{ color: '#FFFFFF', fontSize: 22, fontWeight: 700, margin: '0 0 20px', lineHeight: 1.2 }}>
              {activeTemplate.name}
            </h1>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
              {activeTemplate.exercises.map((ex, exIdx) => {
                const done = completedSets[exIdx] ?? 0
                const allDone = done >= ex.sets
                const isPending = pendingExIdx === exIdx

                return (
                  <div
                    key={exIdx}
                    style={{
                      background: allDone ? '#0A1F3A' : '#0D1728',
                      border: `1px solid ${allDone ? '#1E3D6E' : '#1A2A42'}`,
                      borderRadius: 14, padding: '14px 16px',
                      opacity: allDone ? 0.75 : 1, transition: 'opacity 0.2s',
                    }}
                  >
                    <div style={{ marginBottom: 10 }}>
                      <p style={{ color: allDone ? '#4A9EFF' : '#FFFFFF', fontSize: 14, fontWeight: 700, margin: '0 0 2px', textDecoration: allDone ? 'line-through' : 'none' }}>
                        {ex.exercise_name}
                      </p>
                      <p style={{ color: '#5A7A9A', fontSize: 11, margin: 0 }}>
                        {ex.sets} × {ex.reps}{ex.weight > 0 ? ` · ${ex.weight} lb` : ''}
                      </p>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {Array.from({ length: ex.sets }, (_, si) => {
                        const isCurrent = si === done
                        const isDone = si < done
                        return (
                          <button
                            key={si}
                            onClick={isCurrent && !allDone ? () => handleSetTap(exIdx) : undefined}
                            disabled={!isCurrent || allDone}
                            style={{
                              width: 30, height: 30, borderRadius: '50%',
                              background: isDone ? '#3BF0A0' : isCurrent ? '#0D2E1A' : 'transparent',
                              border: `2px solid ${isDone ? '#3BF0A0' : isCurrent ? '#3BF0A0' : '#1A2A42'}`,
                              color: isDone ? '#000' : isCurrent ? '#3BF0A0' : '#5A7A9A',
                              fontSize: 11, fontWeight: 700,
                              cursor: isCurrent && !allDone ? 'pointer' : 'default',
                              transition: 'all 0.15s',
                            }}
                          >
                            {isDone ? '✓' : si + 1}
                          </button>
                        )
                      })}
                      <span style={{ color: '#5A7A9A', fontSize: 11, marginLeft: 4 }}>
                        {done}/{ex.sets}
                      </span>
                    </div>

                    {isPending && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 0 0', borderTop: '1px solid #1A2A42', marginTop: 10 }}>
                        <input
                          type="number"
                          inputMode="decimal"
                          value={pendingWeight}
                          onChange={e => setPendingWeight(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && confirmWeight()}
                          autoFocus
                          placeholder={ex.weight > 0 ? String(ex.weight) : 'Weight'}
                          style={{
                            width: 80, background: '#0A1F3A', border: '1px solid #3BF0A0',
                            borderRadius: 8, color: '#FFFFFF', fontSize: 16, fontWeight: 700,
                            padding: '6px 10px', outline: 'none',
                          }}
                        />
                        <span style={{ color: '#5A7A9A', fontSize: 12 }}>lb</span>
                        <button
                          onClick={confirmWeight}
                          style={{ background: '#3BF0A0', border: 'none', borderRadius: 8, color: '#000', fontSize: 13, fontWeight: 700, padding: '6px 14px', cursor: 'pointer' }}
                        >
                          Done
                        </button>
                        <button
                          onClick={() => { setPendingExIdx(null); setPendingWeight('') }}
                          style={{ background: 'none', border: 'none', color: '#5A7A9A', fontSize: 11, cursor: 'pointer', padding: 0 }}
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            <button
              onClick={handleFinish}
              disabled={!anyDone || finishing}
              style={{
                width: '100%',
                background: anyDone ? '#3BF0A0' : '#1A2A42',
                color: anyDone ? '#000000' : '#5A7A9A',
                fontSize: 15, fontWeight: 700, borderRadius: 14, padding: '16px',
                border: 'none', cursor: anyDone ? 'pointer' : 'not-allowed',
                marginBottom: 8, transition: 'background 0.2s',
              }}
            >
              {finishing ? 'Saving…' : 'Finish Workout ✓'}
            </button>

          </div>
        </div>
      </div>
    )
  }

  // ── Summary ──────────────────────────────────────────────────────────────────

  if (phase === 'summary' && summaryData) {
    return (
      <div className="app-shell">
        <div className="app-content" style={{ display: 'flex', flexDirection: 'column', height: '100vh', alignItems: 'center', justifyContent: 'center', padding: '0 24px' }}>
          <div style={{ textAlign: 'center', width: '100%' }}>
            <p style={{ color: '#3BF0A0', fontSize: 11, letterSpacing: '2px', textTransform: 'uppercase', margin: '0 0 8px' }}>
              Workout Complete
            </p>
            <h1 style={{ color: '#FFFFFF', fontSize: 22, fontWeight: 700, margin: '0 0 24px', lineHeight: 1.2 }}>
              {summaryData.templateName}
            </h1>

            <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
              <div style={{ flex: 1, background: '#0D1728', border: '1px solid #1A2A42', borderRadius: 14, padding: 16 }}>
                <p style={{ color: '#3BF0A0', fontSize: 26, fontWeight: 700, margin: '0 0 4px' }}>{summaryData.totalSets}</p>
                <p style={{ color: '#5A7A9A', fontSize: 11, margin: 0 }}>Total Sets</p>
              </div>
              <div style={{ flex: 1, background: '#0D1728', border: '1px solid #1A2A42', borderRadius: 14, padding: 16 }}>
                <p style={{ color: '#3BF0A0', fontSize: 26, fontWeight: 700, margin: '0 0 4px' }}>{summaryData.totalVolume.toLocaleString()}</p>
                <p style={{ color: '#5A7A9A', fontSize: 11, margin: 0 }}>Total lbs</p>
              </div>
            </div>

            <div style={{ background: '#0A1F3A', border: '1px solid #1E3D6E', borderRadius: 14, padding: 16, marginBottom: 24 }}>
              <p style={{ color: '#5A7A9A', fontSize: 12, margin: '0 0 4px' }}>XP Earned</p>
              <p style={{ color: '#4A9EFF', fontSize: 26, fontWeight: 700, margin: 0 }}>+{summaryData.xpGain} XP</p>
            </div>

            <button
              onClick={() => navigate('/home')}
              style={{ width: '100%', background: '#3BF0A0', border: 'none', borderRadius: 14, padding: '16px', color: '#000', fontSize: 16, fontWeight: 700, cursor: 'pointer' }}
            >
              Done 💪
            </button>
          </div>
        </div>
      </div>
    )
  }

  return null
}
