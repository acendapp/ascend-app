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
import Groups from './pages/Groups'
import Profile from './pages/Profile'

const TAB_PATHS = new Set(['/home', '/workout', '/groups', '/profile'])

function AppRoutes() {
  const [authed, setAuthed] = useState(false)
  const [authReady, setAuthReady] = useState(false)
  const [splashDone, setSplashDone] = useState(false)
  const [splashFading, setSplashFading] = useState(false)
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

  useEffect(() => {
    const fadeTimer = setTimeout(() => setSplashFading(true), 2000)
    const doneTimer = setTimeout(() => setSplashDone(true), 2400)
    return () => { clearTimeout(fadeTimer); clearTimeout(doneTimer) }
  }, [])

  if (!splashDone || !authReady) {
    return (
      <div style={{
        minHeight: '100vh',
        background: '#080E1C',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: splashFading ? 0 : 1,
        transition: 'opacity 0.4s ease',
      }}>
        <AscendBolt size={120} />
      </div>
    )
  }

  const showNav = TAB_PATHS.has(location.pathname)

  return (
    <>
      <Routes>
        <Route path="/" element={authed ? <Navigate to="/home" replace /> : <Navigate to="/onboarding/step1" replace />} />
        <Route path="/onboarding/step1" element={<Step1 />} />
        <Route path="/onboarding/step2" element={<Step2 />} />
        <Route path="/onboarding/step3" element={<Step3 />} />
        <Route path="/auth" element={authed ? <Navigate to="/home" replace /> : <Auth />} />
        <Route path="/home"    element={authed ? <Home />    : <Navigate to="/auth" replace />} />
        <Route path="/workout" element={authed ? <Workout /> : <Navigate to="/auth" replace />} />
        <Route path="/groups"  element={authed ? <Groups />  : <Navigate to="/auth" replace />} />
        <Route path="/profile" element={authed ? <Profile /> : <Navigate to="/auth" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      {showNav && <BottomNav />}
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
