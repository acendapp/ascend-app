import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { supabase } from './lib/supabase'
import AscendBolt from './components/AscendBolt'
import BottomNav from './components/BottomNav'
import Step1 from './pages/onboarding/Step1'
import Step2 from './pages/onboarding/Step2'
import Step3 from './pages/onboarding/Step3'
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

const TAB_PATHS = new Set(['/home', '/workout', '/groups', '/compete', '/profile'])

function AppRoutes() {
  const [authed, setAuthed] = useState(false)
  const [authReady, setAuthReady] = useState(false)
  const [splashFading, setSplashFading] = useState(false)
  const [splashDone, setSplashDone] = useState(false)
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

  const showNav = authReady && TAB_PATHS.has(location.pathname)

  return (
    <>
      {/* App content renders underneath the splash overlay */}
      {authReady ? (
        <>
          <Routes>
            <Route path="/" element={authed ? <Navigate to="/home" replace /> : <Navigate to="/onboarding/step1" replace />} />
            <Route path="/onboarding/step1" element={<Step1 />} />
            <Route path="/onboarding/step2" element={<Step2 />} />
            <Route path="/onboarding/step3" element={<Step3 />} />
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
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          {showNav && <BottomNav />}
        </>
      ) : (
        <div style={{ minHeight: '100vh', background: '#080E1C' }} />
      )}

      {/* Splash overlay — sits above everything, removed from DOM after animation */}
      {!splashDone && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            zIndex: 9999,
            background: '#080E1C',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: splashFading ? 0 : 1,
            transition: 'opacity 0.8s ease',
            pointerEvents: splashFading ? 'none' : 'auto',
          }}
        >
          <AscendBolt size={120} />
        </div>
      )}
    </>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  )
}
