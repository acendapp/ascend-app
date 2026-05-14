import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useTheme } from '../lib/theme'
import { supabase } from '../lib/supabase'
import { logCheckin } from '../lib/activity'

function isGymCheckedIn() {
  const ci = localStorage.getItem('ascend_gym_checkin')
  return !!ci && new Date(ci).getTime() > Date.now() - 2 * 60 * 60 * 1000
}

const SESSION_TTL = 10 * 60 * 60 * 1000

function activeWorkoutPath(): string | null {
  try {
    const raw = localStorage.getItem('ascend_active_workout')
    if (raw) {
      const s = JSON.parse(raw)
      if (Date.now() - s.startEpoch < SESSION_TTL) return '/workout/ascend'
    }
  } catch { /* ignore */ }
  try {
    const raw = localStorage.getItem('ascend_custom_workout')
    if (raw) {
      const s = JSON.parse(raw)
      if (Date.now() - s.startEpoch < SESSION_TTL) return '/workout/custom'
    }
  } catch { /* ignore */ }
  return null
}

function hasCompletedWorkoutBefore() {
  return !!localStorage.getItem('ascend_has_workout')
}

function hasCompletedWorkoutToday() {
  return !!localStorage.getItem('ascend_workout_today')
}

const tabs = [
  {
    id: 'home',
    label: 'Home',
    path: '/home',
    icon: (active: boolean, accent: string, inactive: string) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path
          d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H5a1 1 0 01-1-1V9.5z"
          stroke={active ? accent : inactive}
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        <path
          d="M9 21V12h6v9"
          stroke={active ? accent : inactive}
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    id: 'workout',
    label: 'Workout',
    path: '/workout',
    icon: (active: boolean, accent: string, inactive: string) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path
          d="M6 4v16M18 4v16M3 8h3M18 8h3M3 16h3M18 16h3M6 12h12"
          stroke={active ? accent : inactive}
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  {
    id: 'compete',
    label: 'Campus',
    path: '/compete',
    icon: (active: boolean, accent: string, inactive: string) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path
          d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"
          stroke={active ? accent : inactive}
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        <circle cx="12" cy="9" r="2.5" stroke={active ? accent : inactive} strokeWidth="1.8" />
      </svg>
    ),
  },
  {
    id: 'groups',
    label: 'Groups',
    path: '/groups',
    icon: (active: boolean, accent: string, inactive: string) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <circle cx="9" cy="7" r="3" stroke={active ? accent : inactive} strokeWidth="1.8" />
        <circle cx="17" cy="8" r="2.5" stroke={active ? accent : inactive} strokeWidth="1.8" />
        <path d="M3 20c0-3 2.686-5 6-5s6 2 6 5" stroke={active ? accent : inactive} strokeWidth="1.8" strokeLinecap="round" />
        <path d="M17 15c1.8 0 4 1.2 4 4" stroke={active ? accent : inactive} strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: 'profile',
    label: 'Profile',
    path: '/profile',
    icon: (active: boolean, accent: string, inactive: string) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="8" r="4" stroke={active ? accent : inactive} strokeWidth="1.8" />
        <path
          d="M4 20c0-3.314 3.582-6 8-6s8 2.686 8 6"
          stroke={active ? accent : inactive}
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
]

export default function BottomNav() {
  const navigate = useNavigate()
  const location = useLocation()
  const { colors: c } = useTheme()

  const [homeBadge, setHomeBadge] = useState(() => !!localStorage.getItem('ascend_home_badge'))
  const [showCheckinPrompt, setShowCheckinPrompt] = useState(false)

  useEffect(() => {
    const handler = () => setHomeBadge(!!localStorage.getItem('ascend_home_badge'))
    window.addEventListener('ascend-badge-update', handler)
    return () => window.removeEventListener('ascend-badge-update', handler)
  }, [])

  async function handleCheckinAndStart() {
    setShowCheckinPrompt(false)
    navigate('/workout')
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    let profileId = user.id
    const { data: profileRow } = await supabase.from('users').select('id').eq('id', user.id).maybeSingle()
    if (!profileRow && user.email) {
      const { data: byEmail } = await supabase.from('users').select('id').eq('email', user.email).maybeSingle()
      if (byEmail) profileId = byEmail.id as string
    } else if (profileRow) {
      profileId = profileRow.id as string
    }
    const now = new Date().toISOString()
    localStorage.setItem('ascend_gym_checkin', now)
    await supabase.from('users').update({ gym_checkin_at: now }).eq('id', profileId)
    const { data: scoreRow } = await supabase.from('user_scores').select('social_score').eq('user_id', profileId).maybeSingle()
    const newSocial = Math.min((scoreRow?.social_score ?? 0) + 3, 100)
    await supabase.from('user_scores').update({ social_score: newSocial }).eq('user_id', profileId)
    const gymName = localStorage.getItem('ascend_gym_location') ?? 'Pottruck Fitness Center'
    await logCheckin(profileId, gymName)
  }

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 0,
        left: '50%',
        transform: 'translateX(-50%)',
        width: '100%',
        maxWidth: 390,
        background: c.surface,
        borderTop: `1px solid ${c.border}`,
        display: 'flex',
        zIndex: 100,
        paddingBottom: 'calc(env(safe-area-inset-bottom, 16px) + 8px)',
      }}
    >
      {showCheckinPrompt && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
          onClick={() => setShowCheckinPrompt(false)}
        >
          <div
            style={{ background: c.surface, borderRadius: '20px 20px 0 0', padding: '28px 24px 44px', width: '100%', maxWidth: 390 }}
            onClick={e => e.stopPropagation()}
          >
            <p style={{ color: c.text, fontSize: 20, fontWeight: 800, margin: '0 0 6px' }}>Are you at the gym?</p>
            <p style={{ color: c.textSub, fontSize: 14, margin: '0 0 28px', lineHeight: 1.55 }}>
              Check in to let your friends know you're training and earn social points.
            </p>
            <button
              onClick={handleCheckinAndStart}
              style={{ width: '100%', background: c.accent, color: '#FFFFFF', fontSize: 16, fontWeight: 800, borderRadius: 14, padding: '17px', border: 'none', cursor: 'pointer', marginBottom: 10, letterSpacing: '-0.2px' }}
            >
              Check in + Start →
            </button>
            <button
              onClick={() => { setShowCheckinPrompt(false); navigate('/workout') }}
              style={{ width: '100%', background: 'none', color: c.textMuted, fontSize: 15, fontWeight: 600, borderRadius: 14, padding: '14px', border: `1px solid ${c.border}`, cursor: 'pointer' }}
            >
              Skip, just start
            </button>
          </div>
        </div>
      )}
      {tabs.map(tab => {
        const active = tab.id === 'workout'
          ? location.pathname.startsWith('/workout')
          : location.pathname === tab.path
        return (
          <button
            key={tab.id}
            onClick={() => {
              if (tab.id === 'workout') {
                // Already on a workout sub-page — do nothing
                if (location.pathname.startsWith('/workout') && location.pathname !== '/workout') return
                // Resume active session if one exists
                const resumePath = activeWorkoutPath()
                if (resumePath) { navigate(resumePath); return }
                if (hasCompletedWorkoutToday()) {
                  navigate('/workout', { state: { preview: true } })
                  return
                }
                if (hasCompletedWorkoutBefore() && !isGymCheckedIn()) {
                  setShowCheckinPrompt(true)
                  return
                }
              }
              navigate(tab.path)
            }}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 4,
              padding: '10px 0 8px',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              position: 'relative',
            }}
          >
            {tab.icon(active, c.accent, c.textSub)}
            {tab.id === 'home' && homeBadge && (
              <div style={{
                position: 'absolute', top: 6, right: '50%',
                transform: 'translateX(calc(50% + 9px))',
                width: 7, height: 7, borderRadius: '50%',
                background: '#FF4444', border: `1px solid ${c.surface}`,
              }} />
            )}
            <span style={{ color: active ? c.accent : c.textSub, fontSize: 10, fontWeight: active ? 600 : 400 }}>
              {tab.label}
            </span>
          </button>
        )
      })}
    </div>
  )
}
