interface OnboardingShellProps {
  step: number
  totalSteps?: number
  eyebrow?: string
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
  headline,
  subheadline,
  showPrivacy = false,
  children,
  onContinue,
  continueLabel = 'Continue →',
  onBack,
  backLabel = 'Back',
  continueDisabled = false,
  footer,
}: OnboardingShellProps) {
  return (
    <div className="app-shell">
      <div className="app-content onboarding-scroll">

        {/* Progress segments */}
        <div style={{ display: 'flex', gap: 5, marginBottom: 40, margin: '-16px -20px 36px' }}>
          {Array.from({ length: totalSteps }, (_, i) => i + 1).map(i => (
            <div
              key={i}
              style={{
                flex: 1,
                height: 3,
                background: i <= step ? '#4A9EFF' : '#1A2A42',
                transition: 'background 0.3s',
              }}
            />
          ))}
        </div>

        {/* Step count — minimal */}
        <p style={{ color: '#2E4A6A', fontSize: 11, fontWeight: 600, letterSpacing: '0.5px', margin: '0 0 16px', textTransform: 'uppercase' }}>
          {step} / {totalSteps}
        </p>

        {/* Headline */}
        <h1 style={{ color: '#FFFFFF', fontSize: 30, fontWeight: 800, margin: '0 0 12px', lineHeight: 1.15, letterSpacing: '-0.5px' }}>
          {headline}
        </h1>

        {/* Subheadline */}
        <p style={{ color: '#8895A7', fontSize: 15, margin: '0 0 32px', lineHeight: 1.6 }}>
          {subheadline}
        </p>

        {showPrivacy && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 24 }}>
            <span style={{ fontSize: 11 }}>🔒</span>
            <span style={{ color: '#3A5A7A', fontSize: 11 }}>Private — only used to personalize your program</span>
          </div>
        )}

        {children}

        <div style={{ height: 32 }} />

        <button
          onClick={onContinue}
          disabled={continueDisabled}
          style={{
            width: '100%',
            background: continueDisabled ? '#131F35' : '#4A9EFF',
            color: continueDisabled ? '#2E4A6A' : '#FFFFFF',
            fontSize: 16,
            fontWeight: 700,
            borderRadius: 14,
            padding: '17px',
            border: 'none',
            cursor: continueDisabled ? 'not-allowed' : 'pointer',
            transition: 'all 0.2s',
            letterSpacing: '0.2px',
          }}
        >
          {continueLabel}
        </button>

        {onBack && (
          <button
            onClick={onBack}
            style={{
              width: '100%',
              background: 'transparent',
              border: 'none',
              color: '#3A5A7A',
              fontSize: 14,
              padding: '15px',
              cursor: 'pointer',
              marginTop: 2,
            }}
          >
            {backLabel}
          </button>
        )}

        {footer}
      </div>
    </div>
  )
}
