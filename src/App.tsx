import { useEffect, useState, useRef } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { supabase } from './lib/supabase'
import { ThemeProvider, useTheme } from './lib/theme'
import AscendBolt from './components/AscendBolt'
import BottomNav from './components/BottomNav'
import Step0 from './pages/onboarding/Step0'
import Step1 from './pages/onboarding/Step1'
import Step2 from './pages/onboarding/Step2'
import Step3 from './pages/onboarding/Step3'
import Step4 from './pages/onboarding/Step4'
import Auth from './pages/Auth'
import Home from './pages/Home'
import Workout from './pages/Workout'
import WorkoutTypeSelector from './pages/WorkoutTypeSelector'
import CustomWorkout from './pages/CustomWorkout'
import ClassWorkout from './pages/ClassWorkout'
import Groups from './pages/Groups'
import Compete from './pages/Compete'
import Profile from './pages/Profile'
import History from './pages/History'
import FriendProfile from './pages/FriendProfile'
import Landing from './pages/Landing'
import FeedPage from './pages/FeedPage'

const TAB_PATHS = new Set(['/home', '/workout', '/workout/ascend', '/workout/custom', '/workout/class', '/groups', '/compete', '/profile'])

const NOTIF_ASKED_KEY = 'ascend_notif_asked_at'
const NOTIF_SNOOZE_DAYS = 7

function shouldShowNotifPrompt(): boolean {
  if (typeof Notification === 'undefined') return false
  if (Notification.permission !== 'default') return false
  const last = Number(localStorage.getItem(NOTIF_ASKED_KEY) ?? 0)
  return Date.now() - last > NOTIF_SNOOZE_DAYS * 86400_000
}

function NotificationPrompt({ onDismiss }: { onDismiss: () => void }) {
  const { colors: c } = useTheme()

  async function handleAllow() {
    localStorage.setItem(NOTIF_ASKED_KEY, String(Date.now()))
    onDismiss()
    await Notification.requestPermission()
  }

  function handleLater() {
    localStorage.setItem(NOTIF_ASKED_KEY, String(Date.now()))
    onDismiss()
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
      onClick={handleLater}
    >
      <div
        style={{ background: c.surface, borderRadius: '24px 24px 0 0', padding: '32px 24px calc(env(safe-area-inset-bottom, 16px) + 32px)', width: '100%', maxWidth: 390 }}
        onClick={e => e.stopPropagation()}
      >
        {/* Bell icon */}
        <div style={{ width: 56, height: 56, borderRadius: '50%', background: c.accentBg, border: `1.5px solid ${c.accentBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" stroke={c.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" stroke={c.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>

        <p style={{ color: c.text, fontSize: 22, fontWeight: 800, margin: '0 0 10px', lineHeight: 1.2 }}>
          Stay in the loop
        </p>
        <p style={{ color: c.textSub, fontSize: 14, margin: '0 0 28px', lineHeight: 1.6 }}>
          Get notified when friends check in, when your streak is at risk, and a weekly recap of your progress. No spam — just the stuff that matters.
        </p>

        <button
          onClick={handleAllow}
          style={{ width: '100%', background: c.accent, color: '#fff', fontSize: 16, fontWeight: 800, borderRadius: 14, padding: '17px', border: 'none', cursor: 'pointer', marginBottom: 10, letterSpacing: '-0.2px' }}
        >
          Enable Notifications
        </button>
        <button
          onClick={handleLater}
          style={{ width: '100%', background: 'none', color: c.textMuted, fontSize: 15, fontWeight: 600, borderRadius: 14, padding: '14px', border: `1px solid ${c.border}`, cursor: 'pointer' }}
        >
          Not now
        </button>
      </div>
    </div>
  )
}

function SplashScreen({ fading }: { fading: boolean }) {
  const { colors: c } = useTheme()
  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
      zIndex: 9999, background: c.bg,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      opacity: fading ? 0 : 1, transition: 'opacity 0.8s ease',
      pointerEvents: fading ? 'none' : 'auto',
    }}>
      <AscendBolt size={120} />
    </div>
  )
}

function AppRoutes() {
  const [authed, setAuthed] = useState(false)
  const [authReady, setAuthReady] = useState(false)
  const [splashFading, setSplashFading] = useState(false)
  const [splashDone, setSplashDone] = useState(false)
  const [showNotifPrompt, setShowNotifPrompt] = useState(false)
  const notifTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const location = useLocation()

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setAuthed(!!session)
      setAuthReady(true)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setAuthed(!!session)
    })
    return () => subscription.unsubscribe()
  }, [])

  // Splash timeline: hold 2.5 s → fade 800 ms → done
  useEffect(() => {
    const t1 = setTimeout(() => setSplashFading(true), 2500)
    const t2 = setTimeout(() => setSplashDone(true), 3300)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [])

  // Notification prompt: show 1.5 s after splash, only if authed + eligible
  useEffect(() => {
    if (!splashDone || !authed) return
    notifTimerRef.current = setTimeout(() => {
      if (shouldShowNotifPrompt()) setShowNotifPrompt(true)
    }, 1500)
    return () => { if (notifTimerRef.current) clearTimeout(notifTimerRef.current) }
  }, [splashDone, authed])

  const showNav = authReady && TAB_PATHS.has(location.pathname)

  return (
    <>
      {/* App content renders underneath the splash overlay */}
      {authReady ? (
        <>
          <Routes>
            <Route path="/" element={authed ? <Navigate to="/home" replace /> : <Navigate to="/welcome" replace />} />
            <Route path="/welcome" element={authed ? <Navigate to="/home" replace /> : <Landing />} />
            <Route path="/onboarding/step0" element={<Step0 />} />
            <Route path="/onboarding/step1" element={<Step1 />} />
            <Route path="/onboarding/step2" element={<Step2 />} />
            <Route path="/onboarding/step3" element={<Step3 />} />
            <Route path="/onboarding/step4" element={<Step4 />} />
            <Route path="/auth" element={authed ? <Navigate to="/home" replace /> : <Auth />} />
            <Route path="/home"    element={authed ? <Home />    : <Navigate to="/auth" replace />} />
            <Route path="/workout" element={authed ? <WorkoutTypeSelector /> : <Navigate to="/auth" replace />} />
            <Route path="/workout/ascend" element={authed ? <Workout /> : <Navigate to="/auth" replace />} />
            <Route path="/workout/custom" element={authed ? <CustomWorkout /> : <Navigate to="/auth" replace />} />
            <Route path="/workout/class" element={authed ? <ClassWorkout /> : <Navigate to="/auth" replace />} />
            <Route path="/groups"  element={authed ? <Groups />  : <Navigate to="/auth" replace />} />
            <Route path="/compete" element={authed ? <Compete /> : <Navigate to="/auth" replace />} />
            <Route path="/profile" element={authed ? <Profile /> : <Navigate to="/auth" replace />} />
            <Route path="/history" element={authed ? <History /> : <Navigate to="/auth" replace />} />
            <Route path="/profile/:userId" element={authed ? <FriendProfile /> : <Navigate to="/auth" replace />} />
            <Route path="/feed" element={authed ? <FeedPage /> : <Navigate to="/auth" replace />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          {showNav && <BottomNav />}
        </>
      ) : (
        <div style={{ minHeight: '100vh', background: 'var(--bg)' }} />
      )}

      {/* Notification permission prompt */}
      {showNotifPrompt && <NotificationPrompt onDismiss={() => setShowNotifPrompt(false)} />}

      {/* Splash overlay — sits above everything, removed from DOM after animation */}
      {!splashDone && <SplashScreen fading={splashFading} />}
    </>
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </ThemeProvider>
  )
}
