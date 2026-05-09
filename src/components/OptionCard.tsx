import { useTheme } from '../lib/theme'

interface OptionCardProps {
  emoji: string
  title: string
  subtitle: string
  selected: boolean
  onSelect: () => void
}

export default function OptionCard({ emoji, title, subtitle, selected, onSelect }: OptionCardProps) {
  const { colors: c } = useTheme()

  return (
    <button
      onClick={onSelect}
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        background: selected ? c.accentBg : 'transparent',
        border: `1px solid ${selected ? c.accent : c.border}`,
        borderLeft: `${selected ? 3 : 1}px solid ${selected ? c.accent : c.border}`,
        borderRadius: 14,
        padding: '18px 20px',
        marginBottom: 10,
        cursor: 'pointer',
        textAlign: 'left',
        transition: 'all 0.15s',
      }}
    >
      <span style={{ fontSize: 22, lineHeight: 1, flexShrink: 0 }}>{emoji}</span>

      <div style={{ flex: 1 }}>
        <div style={{ color: c.text, fontSize: 15, fontWeight: 700, marginBottom: 2 }}>{title}</div>
        <div style={{ color: c.textSub, fontSize: 12 }}>{subtitle}</div>
      </div>

      <div
        style={{
          width: 22,
          height: 22,
          borderRadius: '50%',
          border: `2px solid ${selected ? c.accent : c.border}`,
          background: selected ? c.accent : 'transparent',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          transition: 'all 0.15s',
        }}
      >
        {selected && (
          <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
            <path d="M1 4L3.5 6.5L9 1" stroke="#FFFFFF" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </div>
    </button>
  )
}
