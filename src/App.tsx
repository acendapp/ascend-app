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
  const [splashBurst, setSplashBurst] = useState(false)
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

  // Splash timeline: hold 4 s → burst 600 ms → fade 400 ms → done
  useEffect(() => {
    const t1 = setTimeout(() => setSplashBurst(true), 4000)
    const t2 = setTimeout(() => setSplashFading(true), 4600)
    const t3 = setTimeout(() => setSplashDone(true), 5000)
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3) }
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
            <Route path="/workout" element={authed ? <Workout /> : <Navigate to="/auth" replace />} />
            <Route path="/groups"  element={authed ? <Groups />  : <Navigate to="/auth" replace />} />
            <Route path="/profile" element={authed ? <Profile /> : <Navigate to="/auth" replace />} />
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
            inset: 0,
            zIndex: 9999,
            background: '#080E1C',
            overflow: 'hidden',
            animation: splashBurst ? 'splashBg 600ms ease-in forwards' : undefined,
            opacity: splashFading ? 0 : 1,
            transition: 'opacity 0.4s ease',
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
            }}
          >
            <div style={{ animation: splashBurst ? 'splashBolt 600ms ease-in forwards' : undefined }}>
              <AscendBolt size={120} />
            </div>
          </div>

          <style>{`
            @keyframes splashBg {
              from { background-color: #080E1C; }
              to   { background-color: #0D2A5A; }
            }
            @keyframes splashBolt {
              from { transform: translate(-50%, -50%) scale(1); }
              to   { transform: translate(-50%, -50%) scale(25); }
            }
          `}</style>
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
