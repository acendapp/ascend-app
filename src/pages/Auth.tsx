import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { Goal, Experience, Equipment } from '../types'

type Mode = 'signup' | 'signin'

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: '#FFFFFF',
  border: '1.5px solid #E5E7EB',
  borderRadius: 12,
  padding: '14px 16px',
  color: '#111827',
  fontSize: 14,
  outline: 'none',
  fontFamily: 'inherit',
  boxSizing: 'border-box',
}

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
}

function Field({ label, ...props }: InputProps) {
  const [focused, setFocused] = useState(false)
  return (
    <div style={{ marginBottom: 12 }}>
      {label && (
        <label style={{ color: '#111827', fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 6 }}>
          {label}
        </label>
      )}
      <input
        {...props}
        style={{
          ...inputStyle,
          border: `1.5px solid ${focused ? '#FF5C00' : '#E5E7EB'}`,
          transition: 'border-color 0.15s',
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
    </div>
  )
}

export default function Auth() {
  const navigate = useNavigate()
  const location = useLocation()
  const [mode, setMode] = useState<Mode>((location.state as { mode?: Mode } | null)?.mode ?? 'signup')
  const [signupStep, setSignupStep] = useState<1 | 2>(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [emailError, setEmailError] = useState<string | null>(null)

  async function handleSignup() {
    setError(null)
    if (!name || !username || !email || !password) {
      setError('All fields are required.')
      return
    }
    setLoading(true)
    try {
      const { data, error: signupError } = await supabase.auth.signUp({ email, password })

      if (signupError) {
        console.error('[Auth] signUp error:', signupError)
        throw signupError
      }

      const user = data.user
      const session = data.session

      console.log('[Auth] signUp response — user:', user?.id, '| session:', session ? 'present' : 'null (email confirmation required)')

      if (!user) throw new Error('Signup succeeded but no user was returned.')

      if (!session) {
        setError('Check your email and click the confirmation link, then sign in.')
        setLoading(false)
        return
      }

      const goal = localStorage.getItem('onboarding_goal') as Goal | null
      const experience_level = localStorage.getItem('onboarding_experience') as Experience | null
      const equipment = localStorage.getItem('onboarding_equipment') as Equipment | null

      console.log('[Auth] Inserting into public.users — id:', user.id)
      const { error: profileError } = await supabase.from('users').insert({
        id: user.id,
        email,
        name,
        username: username.toLowerCase().trim(),
        school: 'Penn',
        goal,
        experience_level,
        equipment,
      })
      if (profileError) {
        console.error('[Auth] public.users insert failed:', profileError.message, profileError.details, profileError.hint, profileError.code)
        throw new Error(`Profile save failed: ${profileError.message}`)
      }
      console.log('[Auth] public.users insert — OK')

      console.log('[Auth] Inserting into public.user_scores — user_id:', user.id)
      const { error: scoresError } = await supabase.from('user_scores').insert({
        user_id: user.id,
        ascend_score: 0,
        strength_score: 0,
        consistency_score: 0,
        social_score: 0,
        xp: 0,
        level: 1,
        streak_days: 0,
      })
      if (scoresError) {
        console.error('[Auth] public.user_scores insert failed:', scoresError.message, scoresError.details, scoresError.hint, scoresError.code)
        throw new Error(`Scores save failed: ${scoresError.message}`)
      }
      console.log('[Auth] public.user_scores insert — OK')

      const hasOnboarding = goal && experience_level && equipment
      navigate(hasOnboarding ? '/workout' : '/onboarding/step1')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Something went wrong.'
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  async function handleSignin() {
    setError(null)
    if (!email || !password) {
      setError('Email and password are required.')
      return
    }
    setLoading(true)
    try {
      const { error: signinError } = await supabase.auth.signInWithPassword({ email, password })
      if (signinError) throw signinError
      navigate('/home')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Something went wrong.'
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="app-shell">
      <div className="app-content" style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>

        {/* Top brand area */}
        <div style={{ background: '#FF5C00', padding: '52px 24px 32px', flexShrink: 0 }}>
          <p style={{ color: 'rgba(255,255,255,0.85)', fontSize: 13, fontWeight: 700, letterSpacing: '3px', margin: '0 0 10px' }}>
            ASCEND
          </p>
          <h1 style={{ color: '#FFFFFF', fontSize: 26, fontWeight: 800, margin: '0 0 6px', lineHeight: 1.2 }}>
            {mode === 'signup' ? 'Create your account' : 'Welcome back'}
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: 14, margin: 0, lineHeight: 1.5 }}>
            {mode === 'signup' ? 'Your progress, saved. Your rank, earned.' : 'Sign in to continue your journey.'}
          </p>
        </div>

        {/* Form area */}
        <div style={{ background: '#FFFFFF', flex: 1, padding: '28px 24px 40px', borderRadius: '20px 20px 0 0', marginTop: -16, position: 'relative' }}>

          {mode === 'signup' && signupStep === 1 && (
            <>
              {/* Step indicator */}
              <div style={{ display: 'flex', gap: 4, marginBottom: 24 }}>
                <div style={{ height: 3, flex: 1, borderRadius: 99, background: '#FF5C00' }} />
                <div style={{ height: 3, flex: 1, borderRadius: 99, background: '#E5E7EB' }} />
              </div>
              <Field label="Full Name" type="text" placeholder="Jane Smith" value={name} onChange={e => setName(e.target.value)} />
              <Field label="Username" type="text" placeholder="janesmith" value={username} onChange={e => setUsername(e.target.value)} />
            </>
          )}

          {mode === 'signup' && signupStep === 2 && (
            <>
              {/* Step indicator */}
              <div style={{ display: 'flex', gap: 4, marginBottom: 24 }}>
                <div style={{ height: 3, flex: 1, borderRadius: 99, background: '#FF5C00' }} />
                <div style={{ height: 3, flex: 1, borderRadius: 99, background: '#FF5C00' }} />
              </div>
              <Field label="Penn Email" type="email" placeholder="jane@wharton.upenn.edu" value={email} onChange={e => { setEmail(e.target.value); setEmailError(null) }} />
              {emailError && (
                <p style={{ color: '#DC2626', fontSize: 13, marginBottom: 10, marginTop: -4, lineHeight: 1.5 }}>{emailError}</p>
              )}
              <Field label="Password" type="password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} />
            </>
          )}

          {mode === 'signin' && (
            <>
              <Field label="Email" type="email" placeholder="jane@wharton.upenn.edu" value={email} onChange={e => setEmail(e.target.value)} />
              <Field label="Password" type="password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} />
            </>
          )}

          {error && (
            <p style={{ color: '#DC2626', fontSize: 13, marginBottom: 12, marginTop: 0, lineHeight: 1.5 }}>{error}</p>
          )}

          {/* Submit */}
          <button
            onClick={() => {
              if (mode === 'signup' && signupStep === 1) {
                setError(null)
                if (!name.trim() || !username.trim()) { setError('Name and username are required.'); return }
                setSignupStep(2)
              } else if (mode === 'signup') {
                setEmailError(null)
                const isPennEmail = email.endsWith('upenn.edu')
                if (!isPennEmail) {
                  setEmailError('Ascend is currently in beta for Penn students only. Please use your Penn email to join.')
                  return
                }
                handleSignup()
              } else {
                handleSignin()
              }
            }}
            disabled={loading}
            style={{
              width: '100%',
              background: loading ? '#E5E7EB' : '#FF5C00',
              color: loading ? '#9CA3AF' : '#FFFFFF',
              fontSize: 16,
              fontWeight: 700,
              borderRadius: 14,
              padding: '17px',
              border: 'none',
              cursor: loading ? 'not-allowed' : 'pointer',
              marginTop: 4,
              transition: 'all 0.2s',
              boxShadow: loading ? 'none' : '0 4px 14px rgba(255,92,0,0.3)',
            }}
          >
            {loading ? 'One moment…' : mode === 'signup' ? (signupStep === 1 ? 'Continue →' : "Let's go →") : 'Sign in →'}
          </button>

          {/* Back on step 2 */}
          {mode === 'signup' && signupStep === 2 && (
            <button
              onClick={() => { setSignupStep(1); setError(null) }}
              style={{ width: '100%', background: 'none', border: 'none', color: '#6B7280', fontSize: 14, fontWeight: 500, padding: '14px', cursor: 'pointer', marginTop: 4 }}
            >
              ← Back
            </button>
          )}

          {/* Toggle */}
          <p style={{ color: '#9CA3AF', fontSize: 14, textAlign: 'center', marginTop: 20, marginBottom: 0 }}>
            {mode === 'signup' ? 'Already have an account? ' : "Don't have an account? "}
            <button
              onClick={() => {
                if (mode === 'signup') {
                  setMode('signin'); setSignupStep(1); setError(null); setEmailError(null)
                } else {
                  navigate('/onboarding/step1')
                }
              }}
              style={{ color: '#FF5C00', background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 700, padding: 0 }}
            >
              {mode === 'signup' ? 'Sign in' : 'Sign up'}
            </button>
          </p>
        </div>
      </div>
    </div>
  )
}
