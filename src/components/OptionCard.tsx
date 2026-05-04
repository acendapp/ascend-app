interface OptionCardProps {
  emoji: string
  title: string
  subtitle: string
  selected: boolean
  onSelect: () => void
}

export default function OptionCard({ emoji, title, subtitle, selected, onSelect }: OptionCardProps) {
  return (
    <button
      onClick={onSelect}
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        background: selected ? '#0D1F3A' : '#0D1728',
        border: `1px solid ${selected ? '#4A9EFF' : '#1A2A42'}`,
        borderRadius: 14,
        padding: '16px 18px',
        marginBottom: 10,
        cursor: 'pointer',
        textAlign: 'left',
        transition: 'all 0.15s',
      }}
    >
      {/* Icon container */}
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: 10,
          background: selected ? '#0D2E5A' : '#1A2A42',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 18,
          flexShrink: 0,
          transition: 'background 0.15s',
        }}
      >
        {emoji}
      </div>

      {/* Text */}
      <div style={{ flex: 1 }}>
        <div style={{ color: '#FFFFFF', fontSize: 14, fontWeight: 700, marginBottom: 2 }}>{title}</div>
        <div style={{ color: '#5A7A9A', fontSize: 12 }}>{subtitle}</div>
      </div>

      {/* Radio */}
      <div
        style={{
          width: 20,
          height: 20,
          borderRadius: '50%',
          border: `1.5px solid ${selected ? '#4A9EFF' : '#1A2A42'}`,
          background: selected ? '#4A9EFF' : 'transparent',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          transition: 'all 0.15s',
        }}
      >
        {selected && (
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#FFFFFF' }} />
        )}
      </div>
    </button>
  )
}
