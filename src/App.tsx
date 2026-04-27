import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { supabase } from './lib/supabase'
import Step1 from './pages/onboarding/Step1'
import Step2 from './pages/onboarding/Step2'
import Step3 from './pages/onboarding/Step3'
import Auth from './pages/Auth'
import Home from './pages/Home'
import Workout from './pages/Workout'
import Groups from './pages/Groups'
import Profile from './pages/Profile'

function AppRoutes() {
  const [checking, setChecking] = useState(true)
  const [authed, setAuthed] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setAuthed(!!session)
      setChecking(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setAuthed(!!session)
    })
    return () => subscription.unsubscribe()
  }, [])

  if (checking) {
    return (
      <div style={{ minHeight: '100vh', background: '#080E1C', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: '#5A7A9A', fontSize: 14 }}>Loading…</div>
      </div>
    )
  }

  return (
    <Routes>
      {/* Default: send authed users to /home, new users to onboarding */}
      <Route path="/" element={authed ? <Navigate to="/home" replace /> : <Navigate to="/onboarding/step1" replace />} />

      {/* Onboarding */}
      <Route path="/onboarding/step1" element={<Step1 />} />
      <Route path="/onboarding/step2" element={<Step2 />} />
      <Route path="/onboarding/step3" element={<Step3 />} />

      {/* Auth */}
      <Route path="/auth" element={authed ? <Navigate to="/home" replace /> : <Auth />} />

      {/* App — require auth */}
      <Route path="/home"    element={authed ? <Home />    : <Navigate to="/auth" replace />} />
      <Route path="/workout" element={authed ? <Workout /> : <Navigate to="/auth" replace />} />
      <Route path="/groups"  element={authed ? <Groups />  : <Navigate to="/auth" replace />} />
      <Route path="/profile" element={authed ? <Profile /> : <Navigate to="/auth" replace />} />

      {/* Catch-all */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  )
}
