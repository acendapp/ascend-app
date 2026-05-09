import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import OnboardingShell from '../../components/OnboardingShell'
import OptionCard from '../../components/OptionCard'
import type { Experience } from '../../types'

const OPTIONS: { value: Experience; emoji: string; title: string; subtitle: string }[] = [
  { value: 'beginner',    emoji: '🌱', title: 'Just starting out',  subtitle: 'Never followed a real program' },
  { value: 'some',        emoji: '📈', title: 'Some experience',    subtitle: 'On and off, under a year' },
  { value: 'consistent',  emoji: '💪', title: 'Consistent',         subtitle: 'Training regularly, 1–3 years' },
  { value: 'experienced', emoji: '🏆', title: 'Experienced',        subtitle: 'Serious lifter, 3+ years' },
]

export default function Step2() {
  const navigate = useNavigate()
  const saved = localStorage.getItem('onboarding_experience') as Experience | null
  const [selected, setSelected] = useState<Experience | null>(saved)

  function handleContinue() {
    if (selected) {
      localStorage.setItem('onboarding_experience', selected)
      navigate('/onboarding/step3')
    }
  }

  return (
    <OnboardingShell
      step={2}
      headline="How long have you been lifting?"
      subheadline="No wrong answer — your plan adapts as you improve."
      onContinue={handleContinue}
      continueDisabled={!selected}
      onBack={() => navigate('/onboarding/step1')}
      backLabel="← Back"
    >
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
