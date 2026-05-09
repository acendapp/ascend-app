import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { Goal, Experience, Equipment } from '../types'

type Mode = 'signup' | 'signin'

function Field({
  label,
  ...props
}: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  const [focused, setFocused] = useState(false)
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ color: '#8895A7', fontSize: 11, fontWeight: 600, letterSpacing: '0.5px', textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>
        {label}
      </label>
      <input
        {...props}
        style={{
          width: '100%',
          background: 'transparent',
          border: `1px solid ${focused ? '#4A9EFF' : '#1E2E44'}`,
          borderRadius: 12,
          padding: '14px 16px',
          color: '#FFFFFF',
          fontSize: 15,
          outline: 'none',
          fontFamily: 'inherit',
          boxSizing: 'border-box',
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
        console.error('[Auth] public.user_scores insert failed:', scoresError.message)
        throw new Error(`Scores save failed: ${scoresError.message}`)
      }

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

  const isSignup = mode === 'signup'

  return (
    <div className="app-shell">
      <div className="app-content" style={{ display: 'flex', flexDirection: 'column', padding: '0 24px', minHeight: '100vh' }}>

        {/* Brand header */}
        <div style={{ paddingTop: 64, paddingBottom: 48 }}>
          <p style={{ color: '#4A9EFF', fontSize: 22, fontWeight: 800, letterSpacing: 5, margin: '0 0 6px' }}>
            ASCEND
          </p>
          <p style={{ color: '#2E4A6A', fontSize: 14, margin: 0, letterSpacing: '0.3px' }}>
            {isSignup ? 'Your gym. Your rank. Your community.' : 'Welcome back.'}
          </p>
        </div>

        {/* Headline */}
        <h1 style={{ color: '#FFFFFF', fontSize: 28, fontWeight: 800, margin: '0 0 8px', lineHeight: 1.15, letterSpacing: '-0.5px' }}>
          {isSignup
            ? (signupStep === 1 ? 'Create your account' : 'Almost there')
            : 'Sign in'}
        </h1>
        <p style={{ color: '#8895A7', fontSize: 14, margin: '0 0 32px', lineHeight: 1.5 }}>
          {isSignup
            ? (signupStep === 1 ? 'Your progress. Your rank. Saved.' : 'Use your Penn email to join.')
            : 'Continue your journey.'}
        </p>

        {/* Form */}
        {isSignup ? (
          signupStep === 1 ? (
            <>
              <Field label="Full Name" type="text" placeholder="Jane Smith" value={name} onChange={e => setName(e.target.value)} autoFocus />
              <Field label="Username" type="text" placeholder="janesmith" value={username} onChange={e => setUsername(e.target.value)} />
            </>
          ) : (
            <>
              <Field label="Penn Email" type="email" placeholder="jane@wharton.upenn.edu" value={email} onChange={e => { setEmail(e.target.value); setEmailError(null) }} autoFocus />
              {emailError && (
                <p style={{ color: '#E85D24', fontSize: 12, margin: '-6px 0 14px', lineHeight: 1.4 }}>{emailError}</p>
              )}
              <Field label="Password" type="password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} />
            </>
          )
        ) : (
          <>
            <Field label="Email" type="email" placeholder="jane@wharton.upenn.edu" value={email} onChange={e => setEmail(e.target.value)} autoFocus />
            <Field label="Password" type="password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} />
          </>
        )}

        {error && (
          <p style={{ color: '#E85D24', fontSize: 13, margin: '-4px 0 16px', lineHeight: 1.4 }}>{error}</p>
        )}

        {/* CTA */}
        <button
          onClick={() => {
            if (isSignup && signupStep === 1) {
              setError(null)
              if (!name.trim() || !username.trim()) { setError('Name and username are required.'); return }
              setSignupStep(2)
            } else if (isSignup) {
              setEmailError(null)
              if (!email.endsWith('upenn.edu')) {
                setEmailError('Ascend is currently in beta for Penn students only. Please use your Penn email.')
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
            background: loading ? '#131F35' : '#4A9EFF',
            color: loading ? '#2E4A6A' : '#FFFFFF',
            fontSize: 16,
            fontWeight: 700,
            borderRadius: 14,
            padding: '17px',
            border: 'none',
            cursor: loading ? 'not-allowed' : 'pointer',
            marginTop: 8,
            transition: 'all 0.2s',
            letterSpacing: '0.2px',
          }}
        >
          {loading
            ? 'One moment…'
            : isSignup
              ? (signupStep === 1 ? 'Continue →' : 'Join Ascend →')
              : 'Sign in →'}
        </button>

        {/* Back on step 2 of signup */}
        {isSignup && signupStep === 2 && (
          <button
            onClick={() => { setSignupStep(1); setError(null) }}
            style={{ width: '100%', background: 'none', border: 'none', color: '#3A5A7A', fontSize: 14, padding: '15px', cursor: 'pointer', marginTop: 2 }}
          >
            ← Back
          </button>
        )}

        {/* Toggle mode */}
        <p style={{ color: '#3A5A7A', fontSize: 14, textAlign: 'center', marginTop: 28 }}>
          {isSignup ? 'Already have an account?' : "Don't have an account?"}{' '}
          <button
            onClick={() => {
              if (isSignup) {
                setMode('signin'); setSignupStep(1); setError(null); setEmailError(null)
              } else {
                navigate('/onboarding/step1')
              }
            }}
            style={{ color: '#4A9EFF', background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 600, padding: 0 }}
          >
            {isSignup ? 'Sign in →' : 'Sign up →'}
          </button>
        </p>

      </div>
    </div>
  )
}
