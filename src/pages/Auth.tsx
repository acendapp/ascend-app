import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { Goal, Experience, Equipment } from '../types'

type Mode = 'signup' | 'signin'

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: '#0D1728',
  border: '1px solid #1A2A42',
  borderRadius: 12,
  padding: '14px 16px',
  color: '#FFFFFF',
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
        <label style={{ color: '#5A7A9A', fontSize: 12, display: 'block', marginBottom: 6 }}>
          {label}
        </label>
      )}
      <input
        {...props}
        style={{
          ...inputStyle,
          border: `1px solid ${focused ? '#4A9EFF' : '#1A2A42'}`,
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
  const [mode, setMode] = useState<Mode>('signup')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

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

      // If session is null, Supabase requires email confirmation.
      // RLS policies need auth.uid(), which is only set when a session exists.
      // Fix: disable "Confirm email" in Supabase Dashboard → Authentication → Providers → Email.
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

      navigate('/home')
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
      <div className="app-content" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '40px 24px' }}>
        {/* Wordmark */}
        <p style={{ color: '#4A9EFF', fontSize: 24, fontWeight: 700, letterSpacing: 4, textAlign: 'center', margin: '0 0 32px' }}>
          ASCEND
        </p>

        {/* Headline */}
        <h1 style={{ color: '#FFFFFF', fontSize: 24, fontWeight: 700, margin: '0 0 6px' }}>
          {mode === 'signup' ? 'Create your account' : 'Welcome back'}
        </h1>
        <p style={{ color: '#5A7A9A', fontSize: 14, margin: '0 0 28px', lineHeight: 1.5 }}>
          {mode === 'signup' ? 'Your progress, saved. Your rank, earned.' : 'Sign in to continue your journey.'}
        </p>

        {/* Fields */}
        {mode === 'signup' && (
          <>
            <Field label="Full Name" type="text" placeholder="Jane Smith" value={name} onChange={e => setName(e.target.value)} />
            <Field label="Username" type="text" placeholder="janesmith" value={username} onChange={e => setUsername(e.target.value)} />
          </>
        )}
        <Field label="Email" type="email" placeholder="jane@wharton.upenn.edu" value={email} onChange={e => setEmail(e.target.value)} />
        <Field label="Password" type="password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} />

        {/* Error */}
        {error && (
          <p style={{ color: '#FF6B6B', fontSize: 13, marginBottom: 12, marginTop: 0 }}>{error}</p>
        )}

        {/* Submit */}
        <button
          onClick={mode === 'signup' ? handleSignup : handleSignin}
          disabled={loading}
          style={{
            width: '100%',
            background: loading ? '#1A2A42' : '#4A9EFF',
            color: '#FFFFFF',
            fontSize: 16,
            fontWeight: 700,
            borderRadius: 14,
            padding: '16px',
            border: 'none',
            cursor: loading ? 'not-allowed' : 'pointer',
            marginTop: 4,
            transition: 'background 0.2s',
          }}
        >
          {loading ? 'One moment…' : mode === 'signup' ? "Let's go →" : 'Sign in →'}
        </button>

        {/* Toggle */}
        <p style={{ color: '#5A7A9A', fontSize: 14, textAlign: 'center', marginTop: 20 }}>
          {mode === 'signup' ? 'Already have an account? ' : "Don't have an account? "}
          <button
            onClick={() => { setMode(mode === 'signup' ? 'signin' : 'signup'); setError(null) }}
            style={{ color: '#4A9EFF', background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 600, padding: 0 }}
          >
            {mode === 'signup' ? 'Sign in' : 'Sign up'}
          </button>
        </p>
      </div>
    </div>
  )
}
