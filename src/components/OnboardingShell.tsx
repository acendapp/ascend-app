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
    <div className="app-shell">
      <div className="app-content onboarding-scroll">

        {/* Progress pills */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 32 }}>
          {Array.from({ length: totalSteps }, (_, i) => i + 1).map(i => (
            <div
              key={i}
              style={{
                flex: 1,
                height: 4,
                borderRadius: 99,
                background: i <= step ? '#FF5C00' : '#E5E7EB',
                transition: 'background 0.3s',
              }}
            />
          ))}
        </div>

        {/* Eyebrow */}
        <p style={{ color: '#FF5C00', fontSize: 11, letterSpacing: '1.5px', textTransform: 'uppercase', fontWeight: 700, margin: '0 0 10px' }}>
          {eyebrow}
        </p>

        {/* Headline */}
        <h1 style={{ color: '#111827', fontSize: 26, fontWeight: 800, margin: '0 0 8px', lineHeight: 1.2 }}>
          {headline}
        </h1>

        {/* Subheadline */}
        <p style={{ color: '#6B7280', fontSize: 14, margin: '0 0 14px', lineHeight: 1.6 }}>
          {subheadline}
        </p>

        {showPrivacy && (
          <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 10, fontSize: 12, padding: '8px 12px', margin: '0 0 20px', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>🔒</span>
            <span style={{ color: '#15803D', fontWeight: 500 }}>Private — only used to personalize your plan</span>
          </div>
        )}

        {/* Option cards */}
        {children}

        <div style={{ height: 20 }} />

        {/* Continue button */}
        <button
          onClick={onContinue}
          disabled={continueDisabled}
          style={{
            width: '100%',
            background: continueDisabled ? '#E5E7EB' : '#FF5C00',
            color: continueDisabled ? '#9CA3AF' : '#FFFFFF',
            fontSize: 16,
            fontWeight: 700,
            borderRadius: 14,
            padding: '17px',
            border: 'none',
            cursor: continueDisabled ? 'not-allowed' : 'pointer',
            transition: 'all 0.2s',
            boxShadow: continueDisabled ? 'none' : '0 4px 14px rgba(255,92,0,0.3)',
          }}
        >
          {continueLabel}
        </button>

        {/* Back / ghost button */}
        {onBack && (
          <button
            onClick={onBack}
            style={{
              width: '100%',
              background: 'transparent',
              border: 'none',
              color: '#6B7280',
              fontSize: 14,
              fontWeight: 500,
              padding: '14px',
              cursor: 'pointer',
              marginTop: 4,
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
