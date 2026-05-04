interface StreakDotsProps {
  /** 7 booleans: index 0 = 6 days ago, index 6 = today */
  days: boolean[]
}

export default function StreakDots({ days }: StreakDotsProps) {
  const labels = Array.from({ length: 7 }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() - 6 + i)
    return d.toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 1)
  })

  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end', justifyContent: 'space-between' }}>
      {days.map((filled, i) => {
        const isToday = i === 6
        return (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, flex: 1 }}>
            <div
              style={{
                width: '100%',
                maxWidth: 34,
                height: 34,
                borderRadius: '50%',
                background: filled ? '#FF5C00' : 'transparent',
                border: `2px solid ${filled ? '#FF5C00' : isToday ? 'rgba(255,92,0,0.35)' : '#E5E7EB'}`,
                boxShadow: filled ? '0 2px 8px rgba(255,92,0,0.25)' : 'none',
                transition: 'all 0.2s',
              }}
            />
            <span style={{ color: isToday ? '#FF5C00' : '#9CA3AF', fontSize: 10, fontWeight: isToday ? 700 : 500 }}>
              {labels[i]}
            </span>
          </div>
        )
      })}
    </div>
  )
}
