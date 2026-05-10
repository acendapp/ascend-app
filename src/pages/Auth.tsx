import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useTheme } from '../lib/theme'
import type { Goal, Experience, Equipment } from '../types'

type Mode = 'signup' | 'signin' | 'forgot' | 'reset'

function Field({
  label,
  colors,
  ...props
}: { label: string; colors: ReturnType<typeof useTheme>['colors'] } & React.InputHTMLAttributes<HTMLInputElement>) {
  const [focused, setFocused] = useState(false)
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ color: colors.textSub, fontSize: 11, fontWeight: 600, letterSpacing: '0.5px', textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>
        {label}
      </label>
      <input
        {...props}
        style={{
          width: '100%',
          background: 'transparent',
          border: `1px solid ${focused ? colors.accent : colors.border}`,
          borderRadius: 12,
          padding: '14px 16px',
          color: colors.text,
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

function PasswordField({
  label,
  value,
  onChange,
  placeholder,
  autoFocus,
  colors,
}: { label: string; value: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; placeholder?: string; autoFocus?: boolean; colors: ReturnType<typeof useTheme>['colors'] }) {
  const [focused, setFocused] = useState(false)
  const [show, setShow] = useState(false)
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ color: colors.textSub, fontSize: 11, fontWeight: 600, letterSpacing: '0.5px', textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>
        {label}
      </label>
      <div style={{ position: 'relative' }}>
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          autoFocus={autoFocus}
          style={{
            width: '100%',
            background: 'transparent',
            border: `1px solid ${focused ? colors.accent : colors.border}`,
            borderRadius: 12,
            padding: '14px 44px 14px 16px',
            color: colors.text,
            fontSize: 15,
            outline: 'none',
            fontFamily: 'inherit',
            boxSizing: 'border-box',
            transition: 'border-color 0.15s',
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
        />
        <button
          type="button"
          onClick={() => setShow(s => !s)}
          style={{
            position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
            background: 'none', border: 'none', cursor: 'pointer', padding: 4,
            color: colors.textSub, lineHeight: 1, display: 'flex', alignItems: 'center',
          }}
          tabIndex={-1}
        >
          {show ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <line x1="1" y1="1" x2="23" y2="23" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          )}
        </button>
      </div>
    </div>
  )
}

export default function Auth() {
  const navigate = useNavigate()
  const location = useLocation()
  const { colors: c } = useTheme()
  const [mode, setMode] = useState<Mode>((location.state as { mode?: Mode } | null)?.mode ?? 'signup')
  const [signupStep, setSignupStep] = useState<1 | 2>(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [emailError, setEmailError] = useState<string | null>(null)
  const [forgotSent, setForgotSent] = useState(false)
  const [newPassword, setNewPassword] = useState('')

  // Detect Supabase PASSWORD_RECOVERY event (user arrived via reset link)
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setMode('reset')
    })
    return () => subscription.unsubscribe()
  }, [])

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

  async function handleForgotPassword() {
    setError(null)
    if (!email) { setError('Enter your email address.'); return }
    setLoading(true)
    try {
      const { error: resetErr } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + '/auth',
      })
      if (resetErr) throw resetErr
      setForgotSent(true)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setLoading(false)
    }
  }

  async function handleResetPassword() {
    setError(null)
    if (!newPassword || newPassword.length < 6) { setError('Password must be at least 6 characters.'); return }
    setLoading(true)
    try {
      const { error: updateErr } = await supabase.auth.updateUser({ password: newPassword })
      if (updateErr) throw updateErr
      navigate('/home')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setLoading(false)
    }
  }

  const isSignup = mode === 'signup'

  // ── Forgot password view ──────────────────────────────────────────
  if (mode === 'forgot') {
    return (
      <div className="app-shell">
        <div className="app-content" style={{ display: 'flex', flexDirection: 'column', padding: '0 24px', minHeight: '100vh', background: c.bg }}>
          <div style={{ paddingTop: 64, paddingBottom: 48 }}>
            <p style={{ color: c.accent, fontSize: 22, fontWeight: 800, letterSpacing: 5, margin: '0 0 6px' }}>ASCEND</p>
            <p style={{ color: c.textFaint, fontSize: 14, margin: 0 }}>Password reset</p>
          </div>

          {forgotSent ? (
            <>
              <div style={{ background: c.accentBg, border: `1px solid ${c.accentBorder}`, borderRadius: 14, padding: '20px', marginBottom: 28 }}>
                <p style={{ color: c.accent, fontSize: 16, fontWeight: 700, margin: '0 0 6px' }}>Check your inbox</p>
                <p style={{ color: c.textSub, fontSize: 14, margin: 0, lineHeight: 1.5 }}>
                  We sent a password reset link to <strong>{email}</strong>. Click the link in that email to set a new password.
                </p>
              </div>
              <button
                onClick={() => { setMode('signin'); setForgotSent(false); setError(null) }}
                style={{ width: '100%', background: 'none', border: `1px solid ${c.border}`, color: c.textSub, fontSize: 15, fontWeight: 600, borderRadius: 14, padding: '15px', cursor: 'pointer' }}
              >
                ← Back to sign in
              </button>
            </>
          ) : (
            <>
              <h1 style={{ color: c.text, fontSize: 28, fontWeight: 800, margin: '0 0 8px', lineHeight: 1.15, letterSpacing: '-0.5px' }}>Forgot your password?</h1>
              <p style={{ color: c.textSub, fontSize: 14, margin: '0 0 32px', lineHeight: 1.5 }}>Enter your email and we'll send you a reset link.</p>

              <Field label="Email" type="email" placeholder="jane@wharton.upenn.edu" value={email} onChange={e => setEmail(e.target.value)} autoFocus colors={c} />

              {error && <p style={{ color: '#E85D24', fontSize: 13, margin: '-4px 0 16px', lineHeight: 1.4 }}>{error}</p>}

              <button
                onClick={handleForgotPassword}
                disabled={loading}
                style={{ width: '100%', background: loading ? c.surface : c.accent, color: loading ? c.textMuted : '#FFFFFF', fontSize: 16, fontWeight: 700, borderRadius: 14, padding: '17px', border: 'none', cursor: loading ? 'not-allowed' : 'pointer', marginTop: 8 }}
              >
                {loading ? 'Sending…' : 'Send reset email →'}
              </button>
              <button
                onClick={() => { setMode('signin'); setError(null) }}
                style={{ width: '100%', background: 'none', border: 'none', color: c.textMuted, fontSize: 14, padding: '15px', cursor: 'pointer', marginTop: 4 }}
              >
                ← Back to sign in
              </button>
            </>
          )}
        </div>
      </div>
    )
  }

  // ── Reset password view (arrived via email link) ───────────────────
  if (mode === 'reset') {
    return (
      <div className="app-shell">
        <div className="app-content" style={{ display: 'flex', flexDirection: 'column', padding: '0 24px', minHeight: '100vh', background: c.bg }}>
          <div style={{ paddingTop: 64, paddingBottom: 48 }}>
            <p style={{ color: c.accent, fontSize: 22, fontWeight: 800, letterSpacing: 5, margin: '0 0 6px' }}>ASCEND</p>
            <p style={{ color: c.textFaint, fontSize: 14, margin: 0 }}>Set new password</p>
          </div>
          <h1 style={{ color: c.text, fontSize: 28, fontWeight: 800, margin: '0 0 8px', lineHeight: 1.15, letterSpacing: '-0.5px' }}>Choose a new password</h1>
          <p style={{ color: c.textSub, fontSize: 14, margin: '0 0 32px', lineHeight: 1.5 }}>Must be at least 6 characters.</p>

          <PasswordField label="New Password" placeholder="••••••••" value={newPassword} onChange={e => setNewPassword(e.target.value)} autoFocus colors={c} />

          {error && <p style={{ color: '#E85D24', fontSize: 13, margin: '-4px 0 16px', lineHeight: 1.4 }}>{error}</p>}

          <button
            onClick={handleResetPassword}
            disabled={loading}
            style={{ width: '100%', background: loading ? c.surface : c.accent, color: loading ? c.textMuted : '#FFFFFF', fontSize: 16, fontWeight: 700, borderRadius: 14, padding: '17px', border: 'none', cursor: loading ? 'not-allowed' : 'pointer', marginTop: 8 }}
          >
            {loading ? 'Saving…' : 'Set new password →'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="app-shell">
      <div className="app-content" style={{ display: 'flex', flexDirection: 'column', padding: '0 24px', minHeight: '100vh', background: c.bg }}>

        {/* Brand header */}
        <div style={{ paddingTop: 64, paddingBottom: 48 }}>
          <p style={{ color: c.accent, fontSize: 22, fontWeight: 800, letterSpacing: 5, margin: '0 0 6px' }}>
            ASCEND
          </p>
          <p style={{ color: c.textFaint, fontSize: 14, margin: 0, letterSpacing: '0.3px' }}>
            {isSignup ? 'Your gym. Your rank. Your community.' : 'Welcome back.'}
          </p>
        </div>

        {/* Headline */}
        <h1 style={{ color: c.text, fontSize: 28, fontWeight: 800, margin: '0 0 8px', lineHeight: 1.15, letterSpacing: '-0.5px' }}>
          {isSignup
            ? (signupStep === 1 ? 'Create your account' : 'Almost there')
            : 'Sign in'}
        </h1>
        <p style={{ color: c.textSub, fontSize: 14, margin: '0 0 32px', lineHeight: 1.5 }}>
          {isSignup
            ? (signupStep === 1 ? 'Your progress. Your rank. Saved.' : 'Use your Penn email to join.')
            : 'Continue your journey.'}
        </p>

        {/* Form */}
        {isSignup ? (
          signupStep === 1 ? (
            <>
              <Field label="Full Name" type="text" placeholder="Jane Smith" value={name} onChange={e => setName(e.target.value)} autoFocus colors={c} />
              <Field label="Username" type="text" placeholder="janesmith" value={username} onChange={e => setUsername(e.target.value)} colors={c} />
            </>
          ) : (
            <>
              <Field label="Penn Email" type="email" placeholder="jane@wharton.upenn.edu" value={email} onChange={e => { setEmail(e.target.value); setEmailError(null) }} autoFocus colors={c} />
              {emailError && (
                <p style={{ color: '#E85D24', fontSize: 12, margin: '-6px 0 14px', lineHeight: 1.4 }}>{emailError}</p>
              )}
              <PasswordField label="Password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} colors={c} />
            </>
          )
        ) : (
          <>
            <Field label="Email" type="email" placeholder="jane@wharton.upenn.edu" value={email} onChange={e => setEmail(e.target.value)} autoFocus colors={c} />
            <PasswordField label="Password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} colors={c} />
            <div style={{ textAlign: 'right', marginTop: -6, marginBottom: 14 }}>
              <button
                onClick={() => { setMode('forgot'); setError(null) }}
                style={{ background: 'none', border: 'none', color: c.accent, fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: 0 }}
              >
                Forgot password?
              </button>
            </div>
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
            background: loading ? c.surface : c.accent,
            color: loading ? c.textMuted : '#FFFFFF',
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
            style={{ width: '100%', background: 'none', border: 'none', color: c.textMuted, fontSize: 14, padding: '15px', cursor: 'pointer', marginTop: 2 }}
          >
            ← Back
          </button>
        )}

        {/* Toggle mode */}
        <p style={{ color: c.textMuted, fontSize: 14, textAlign: 'center', marginTop: 28 }}>
          {isSignup ? 'Already have an account?' : "Don't have an account?"}{' '}
          <button
            onClick={() => {
              if (isSignup) {
                setMode('signin'); setSignupStep(1); setError(null); setEmailError(null)
              } else {
                navigate('/onboarding/step0')
              }
            }}
            style={{ color: c.accent, background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 600, padding: 0 }}
          >
            {isSignup ? 'Sign in →' : 'Sign up →'}
          </button>
        </p>

      </div>
    </div>
  )
}
