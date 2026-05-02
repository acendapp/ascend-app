import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import OnboardingShell from '../../components/OnboardingShell'
import OptionCard from '../../components/OptionCard'
import type { Equipment } from '../../types'

const OPTIONS: { value: Equipment; emoji: string; title: string; subtitle: string }[] = [
  { value: 'gym',        emoji: '🏋️', title: 'Full gym',    subtitle: 'Barbells, cables, machines — the works' },
  { value: 'bodyweight', emoji: '🏠', title: 'Bodyweight',  subtitle: 'No equipment needed, train anywhere' },
  { value: 'both',       emoji: '🔄', title: 'Both',        subtitle: 'I switch between gym and home' },
]

export default function Step3() {
  const navigate = useNavigate()
  const saved = localStorage.getItem('onboarding_equipment') as Equipment | null
  const [selected, setSelected] = useState<Equipment | null>(saved)

  function handleContinue() {
    if (selected) {
      localStorage.setItem('onboarding_equipment', selected)
      navigate('/onboarding/step4')
    }
  }

  return (
    <OnboardingShell
      step={3}
      eyebrow="STEP 3 OF 4"
      headline="Where do you train?"
      subheadline="We'll build your workouts around what you actually have access to."
      showPrivacy
      onContinue={handleContinue}
      continueLabel="Continue →"
      continueDisabled={!selected}
      onBack={() => navigate('/onboarding/step2')}
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
