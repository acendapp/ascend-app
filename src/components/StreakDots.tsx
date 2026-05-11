import { useTheme } from '../lib/theme'

interface StreakDotsProps {
  /** 7 booleans: index 0 = 6 days ago, index 6 = today */
  days: boolean[]
}

export default function StreakDots({ days }: StreakDotsProps) {
  const { colors: c } = useTheme()

  const labels = Array.from({ length: 7 }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() - 6 + i)
    return d.toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 1)
  })

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
      {days.map((filled, i) => {
        const isToday = i === 6
        return (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
            <div
              style={{
                width: 30,
                height: 30,
                borderRadius: '50%',
                background: filled ? c.accent : 'transparent',
                border: `2px solid ${filled ? c.accent : isToday ? c.accentBorder : c.border}`,
                boxShadow: filled ? `0 0 8px ${c.accent}44` : 'none',
                transition: 'all 0.2s',
              }}
            />
            <span style={{ color: isToday ? c.accent : c.textSub, fontSize: 9, fontWeight: isToday ? 700 : 400 }}>
              {labels[i]}
            </span>
          </div>
        )
      })}
    </div>
  )
}
