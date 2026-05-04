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
        gap: 14,
        background: selected ? 'rgba(255,92,0,0.05)' : '#FFFFFF',
        border: `2px solid ${selected ? '#FF5C00' : '#E5E7EB'}`,
        borderRadius: 14,
        padding: '15px 16px',
        marginBottom: 10,
        cursor: 'pointer',
        textAlign: 'left',
        transition: 'all 0.15s',
        boxShadow: selected ? '0 2px 8px rgba(255,92,0,0.12)' : '0 1px 3px rgba(0,0,0,0.05)',
      }}
    >
      {/* Icon */}
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: 12,
          background: selected ? 'rgba(255,92,0,0.1)' : '#F5F5F7',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 20,
          flexShrink: 0,
          transition: 'background 0.15s',
        }}
      >
        {emoji}
      </div>

      {/* Text */}
      <div style={{ flex: 1 }}>
        <div style={{ color: '#111827', fontSize: 14, fontWeight: 700, marginBottom: 2 }}>{title}</div>
        <div style={{ color: '#6B7280', fontSize: 12 }}>{subtitle}</div>
      </div>

      {/* Radio */}
      <div
        style={{
          width: 20,
          height: 20,
          borderRadius: '50%',
          border: `2px solid ${selected ? '#FF5C00' : '#D1D5DB'}`,
          background: selected ? '#FF5C00' : 'transparent',
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
