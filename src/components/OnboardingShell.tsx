interface OnboardingShellProps {
  step: number
  totalSteps?: number
  eyebrow: string
  headline: string
  subheadline: string
  showPrivacy?: boolean
  children: React.ReactNode
  onContinue: () => void
  continueLabel?: string
  onBack?: () => void
  backLabel?: string
  continueDisabled?: boolean
  footer?: React.ReactNode
}

export default function OnboardingShell({
  step,
  totalSteps = 4,
  eyebrow,
  headline,
  subheadline,
  showPrivacy = false,
  children,
  onContinue,
  continueLabel = 'Continue',
  onBack,
  backLabel = 'Back',
  continueDisabled = false,
  footer,
}: OnboardingShellProps) {
  return (
    <div className="app-shell" style={{ background: '#080E1C' }}>
      <div className="app-content onboarding-scroll" style={{ background: '#080E1C' }}>
        {/* Progress pills */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 28 }}>
          {Array.from({ length: totalSteps }, (_, i) => i + 1).map(i => (
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
        <p style={{ color: '#5A7A9A', fontSize: 14, margin: '0 0 12px', lineHeight: 1.5 }}>
          {subheadline}
        </p>

        {showPrivacy && (
          <p style={{ color: '#3A5A3A', background: '#0A1F0A', border: '1px solid #1A3A1A', borderRadius: 8, fontSize: 11, padding: '6px 10px', margin: '0 0 20px', display: 'flex', alignItems: 'center', gap: 5 }}>
            <span>🔒</span>
            <span style={{ color: '#5A9A5A' }}>Private — only used to personalize your plan</span>
          </p>
        )}

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

        {footer}
      </div>
    </div>
  )
}
