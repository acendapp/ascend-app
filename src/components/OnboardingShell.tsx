interface OnboardingShellProps {
  step: 1 | 2 | 3
  eyebrow: string
  headline: string
  subheadline: string
  children: React.ReactNode
  onContinue: () => void
  continueLabel?: string
  onBack?: () => void
  backLabel?: string
  continueDisabled?: boolean
}

export default function OnboardingShell({
  step,
  eyebrow,
  headline,
  subheadline,
  children,
  onContinue,
  continueLabel = 'Continue',
  onBack,
  backLabel = 'Back',
  continueDisabled = false,
}: OnboardingShellProps) {
  return (
    <div className="app-shell">
      <div className="app-content onboarding-scroll">
        {/* Progress pills */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 28 }}>
          {[1, 2, 3].map(i => (
            <div
              key={i}
              style={{
                flex: 1,
                height: 3,
                borderRadius: 99,
                background: i <= step ? '#4A9EFF' : '#1A2A42',
                transition: 'background 0.3s',
              }}
            />
          ))}
        </div>

        {/* Eyebrow */}
        <p style={{ color: '#4A9EFF', fontSize: 10, letterSpacing: '2px', textTransform: 'uppercase', margin: '0 0 10px' }}>
          {eyebrow}
        </p>

        {/* Headline */}
        <h1 style={{ color: '#FFFFFF', fontSize: 26, fontWeight: 700, margin: '0 0 8px', lineHeight: 1.2 }}>
          {headline}
        </h1>

        {/* Subheadline */}
        <p style={{ color: '#5A7A9A', fontSize: 14, margin: '0 0 28px', lineHeight: 1.5 }}>
          {subheadline}
        </p>

        {/* Option cards */}
        {children}

        {/* Spacer */}
        <div style={{ height: 24 }} />

        {/* Continue button */}
        <button
          onClick={onContinue}
          disabled={continueDisabled}
          style={{
            width: '100%',
            background: continueDisabled ? '#1A2A42' : '#4A9EFF',
            color: '#FFFFFF',
            fontSize: 16,
            fontWeight: 700,
            borderRadius: 14,
            padding: '16px',
            border: 'none',
            cursor: continueDisabled ? 'not-allowed' : 'pointer',
            transition: 'background 0.2s',
          }}
        >
          {continueLabel}
        </button>

        {/* Ghost button */}
        <button
          onClick={onBack}
          style={{
            width: '100%',
            background: 'transparent',
            border: 'none',
            color: '#5A7A9A',
            fontSize: 14,
            padding: '14px',
            cursor: 'pointer',
            marginTop: 4,
          }}
        >
          {backLabel}
        </button>
      </div>
    </div>
  )
}
