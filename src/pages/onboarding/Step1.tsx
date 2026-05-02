import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import OnboardingShell from '../../components/OnboardingShell'
import OptionCard from '../../components/OptionCard'
import type { Goal } from '../../types'

const OPTIONS: { value: Goal; emoji: string; title: string; subtitle: string }[] = [
  { value: 'muscle',   emoji: '🔥', title: 'Build muscle & size',  subtitle: 'Pack on mass, look bigger' },
  { value: 'strength', emoji: '⚡', title: 'Get stronger',          subtitle: 'Move more weight, hit new PRs' },
  { value: 'lean',     emoji: '🎯', title: 'Get lean',              subtitle: 'Drop body fat, keep the muscle' },
  { value: 'athletic', emoji: '🏃', title: 'Build athleticism',     subtitle: 'Speed, conditioning, and functional strength' },
]

export default function Step1() {
  const navigate = useNavigate()
  const saved = localStorage.getItem('onboarding_goal') as Goal | null
  const [selected, setSelected] = useState<Goal | null>(saved)

  function handleContinue() {
    if (selected) {
      localStorage.setItem('onboarding_goal', selected)
      navigate('/onboarding/step2')
    }
  }

  function handleSkip() {
    localStorage.removeItem('onboarding_goal')
    navigate('/onboarding/step2')
  }

  return (
    <OnboardingShell
      step={1}
      eyebrow="STEP 1 OF 4"
      headline="What's the goal?"
      subheadline="We build your program around this. You can change it anytime."
      showPrivacy
      onContinue={handleContinue}
      continueDisabled={!selected}
      onBack={handleSkip}
      backLabel="Not sure yet — build me something"
      footer={
        <p style={{ color: '#5A7A9A', fontSize: 13, textAlign: 'center', margin: '4px 0 0' }}>
          Already have an account?{' '}
          <button
            onClick={() => navigate('/auth', { state: { mode: 'signin' } })}
            style={{ background: 'none', border: 'none', color: '#5A7A9A', fontSize: 13, cursor: 'pointer', padding: 0, textDecoration: 'underline' }}
          >
            Sign in →
          </button>
        </p>
      }
    >
      <p style={{ color: '#5A7A9A', fontSize: 11, margin: '-12px 0 20px', textAlign: 'center', letterSpacing: '0.5px' }}>
        Takes less than 60 seconds
      </p>
      {OPTIONS.map(opt => (
        <OptionCard
          key={opt.value}
          emoji={opt.emoji}
          title={opt.title}
          subtitle={opt.subtitle}
          selected={selected === opt.value}
          onSelect={() => setSelected(opt.value)}
        />
      ))}
    </OnboardingShell>
  )
}
