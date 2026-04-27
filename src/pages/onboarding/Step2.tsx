import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import OnboardingShell from '../../components/OnboardingShell'
import OptionCard from '../../components/OptionCard'
import type { Experience } from '../../types'

const OPTIONS: { value: Experience; emoji: string; title: string; subtitle: string }[] = [
  { value: 'beginner',    emoji: '🌱', title: 'Brand new',   subtitle: 'Never followed a program before' },
  { value: 'some',        emoji: '📈', title: 'On and off',  subtitle: 'Some experience, under a year' },
  { value: 'consistent',  emoji: '💪', title: 'Consistent',  subtitle: 'Training regularly, 1–3 years' },
  { value: 'experienced', emoji: '🏆', title: 'Experienced', subtitle: 'Serious training, 3+ years' },
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
      eyebrow="STEP 2 OF 3"
      headline="How long have you been lifting?"
      subheadline="There's no wrong answer — your program adapts as you improve."
      onContinue={handleContinue}
      continueDisabled={!selected}
      onBack={() => navigate('/onboarding/step1')}
      backLabel="Back"
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
