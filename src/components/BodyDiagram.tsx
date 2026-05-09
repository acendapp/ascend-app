import { useState } from 'react'
import { useTheme } from '../lib/theme'

interface Zone {
  id: string
  label: string
  shapes: Array<{ cx: number; cy: number; rx: number; ry: number }>
}

const FRONT_ZONES: Zone[] = [
  {
    id: 'shoulders',
    label: 'Shoulders',
    shapes: [
      { cx: 24, cy: 77, rx: 18, ry: 24 },
      { cx: 136, cy: 77, rx: 18, ry: 24 },
    ],
  },
  {
    id: 'chest',
    label: 'Chest',
    shapes: [{ cx: 80, cy: 90, rx: 30, ry: 18 }],
  },
  {
    id: 'arms',
    label: 'Arms',
    shapes: [
      { cx: 23, cy: 121, rx: 15, ry: 20 },
      { cx: 137, cy: 121, rx: 15, ry: 20 },
    ],
  },
  {
    id: 'core',
    label: 'Core',
    shapes: [{ cx: 80, cy: 127, rx: 26, ry: 16 }],
  },
  {
    id: 'quads',
    label: 'Quads',
    shapes: [
      { cx: 55, cy: 200, rx: 19, ry: 28 },
      { cx: 105, cy: 200, rx: 19, ry: 28 },
    ],
  },
  {
    id: 'knees',
    label: 'Knees',
    shapes: [
      { cx: 56, cy: 232, rx: 13, ry: 9 },
      { cx: 104, cy: 232, rx: 13, ry: 9 },
    ],
  },
  {
    id: 'elbows',
    label: 'Elbows',
    shapes: [
      { cx: 21, cy: 106, rx: 10, ry: 8 },
      { cx: 139, cy: 106, rx: 10, ry: 8 },
    ],
  },
  {
    id: 'wrists',
    label: 'Wrists',
    shapes: [
      { cx: 22, cy: 146, rx: 9, ry: 7 },
      { cx: 138, cy: 146, rx: 9, ry: 7 },
    ],
  },
  {
    id: 'ankles_feet',
    label: 'Ankles / Feet',
    shapes: [
      { cx: 56, cy: 281, rx: 13, ry: 8 },
      { cx: 104, cy: 281, rx: 13, ry: 8 },
    ],
  },
]

const BACK_ZONES: Zone[] = [
  {
    id: 'neck_traps',
    label: 'Traps',
    shapes: [{ cx: 80, cy: 69, rx: 34, ry: 10 }],
  },
  {
    id: 'upper_back',
    label: 'Upper Back',
    shapes: [{ cx: 80, cy: 92, rx: 30, ry: 15 }],
  },
  {
    id: 'lower_back',
    label: 'Lower Back',
    shapes: [{ cx: 80, cy: 122, rx: 24, ry: 15 }],
  },
  {
    id: 'glutes',
    label: 'Glutes',
    shapes: [
      { cx: 57, cy: 157, rx: 20, ry: 15 },
      { cx: 103, cy: 157, rx: 20, ry: 15 },
    ],
  },
  {
    id: 'hamstrings',
    label: 'Hamstrings',
    shapes: [
      { cx: 55, cy: 200, rx: 19, ry: 28 },
      { cx: 105, cy: 200, rx: 19, ry: 28 },
    ],
  },
  {
    id: 'calves',
    label: 'Calves',
    shapes: [
      { cx: 55, cy: 259, rx: 16, ry: 22 },
      { cx: 105, cy: 259, rx: 16, ry: 22 },
    ],
  },
  {
    id: 'knees',
    label: 'Knees',
    shapes: [
      { cx: 56, cy: 232, rx: 13, ry: 9 },
      { cx: 104, cy: 232, rx: 13, ry: 9 },
    ],
  },
  {
    id: 'elbows',
    label: 'Elbows',
    shapes: [
      { cx: 21, cy: 106, rx: 10, ry: 8 },
      { cx: 139, cy: 106, rx: 10, ry: 8 },
    ],
  },
  {
    id: 'wrists',
    label: 'Wrists',
    shapes: [
      { cx: 22, cy: 146, rx: 9, ry: 7 },
      { cx: 138, cy: 146, rx: 9, ry: 7 },
    ],
  },
  {
    id: 'ankles_feet',
    label: 'Ankles / Feet',
    shapes: [
      { cx: 56, cy: 281, rx: 13, ry: 8 },
      { cx: 104, cy: 281, rx: 13, ry: 8 },
    ],
  },
]

// The same geometric body silhouette used for both front and back views.
// Zones are overlaid on top as interactive ellipses.
function BodySilhouette({ silFill, silStroke }: { silFill: string; silStroke: string }) {
  const sw = 1.5
  return (
    <g>
      <circle cx={80} cy={24} r={18} fill={silFill} stroke={silStroke} strokeWidth={sw} />
      <rect x={73} y={42} width={14} height={12} rx={3} fill={silFill} stroke={silStroke} strokeWidth={sw} />
      <rect x={36} y={54} width={88} height={95} rx={10} fill={silFill} stroke={silStroke} strokeWidth={sw} />
      <rect x={12} y={54} width={24} height={52} rx={8} fill={silFill} stroke={silStroke} strokeWidth={sw} />
      <rect x={124} y={54} width={24} height={52} rx={8} fill={silFill} stroke={silStroke} strokeWidth={sw} />
      <rect x={13} y={106} width={20} height={42} rx={7} fill={silFill} stroke={silStroke} strokeWidth={sw} />
      <rect x={127} y={106} width={20} height={42} rx={7} fill={silFill} stroke={silStroke} strokeWidth={sw} />
      <rect x={38} y={149} width={84} height={20} rx={7} fill={silFill} stroke={silStroke} strokeWidth={sw} />
      <rect x={38} y={169} width={35} height={62} rx={8} fill={silFill} stroke={silStroke} strokeWidth={sw} />
      <rect x={87} y={169} width={35} height={62} rx={8} fill={silFill} stroke={silStroke} strokeWidth={sw} />
      <rect x={41} y={231} width={29} height={57} rx={8} fill={silFill} stroke={silStroke} strokeWidth={sw} />
      <rect x={90} y={231} width={29} height={57} rx={8} fill={silFill} stroke={silStroke} strokeWidth={sw} />
    </g>
  )
}

interface BodyDiagramProps {
  selected: string[]
  onToggle: (id: string) => void
  accentColor: string
  accentBg: string
}

const ALL_ZONES = [...FRONT_ZONES, ...BACK_ZONES]

export default function BodyDiagram({ selected, onToggle, accentColor, accentBg }: BodyDiagramProps) {
  const { colors: c } = useTheme()
  const [view, setView] = useState<'front' | 'back'>('front')
  const zones = view === 'front' ? FRONT_ZONES : BACK_ZONES

  const selectedLabels = selected
    .map(id => ALL_ZONES.find(z => z.id === id)?.label)
    .filter(Boolean) as string[]

  // Deduplicate labels (front/back share same zones)
  const uniqueLabels = [...new Set(selectedLabels)]

  const silFill = c.isDark ? '#0A1525' : '#E8EEF8'
  const silStroke = c.isDark ? '#1E2E44' : '#C8D8E8'
  const ellipseInactiveFill = c.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.05)'
  const ellipseInactiveStroke = c.isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.15)'

  return (
    <div>
      {/* Front / Back toggle */}
      <div style={{
        display: 'flex',
        background: c.bg,
        border: `1px solid ${c.border}`,
        borderRadius: 10,
        padding: 3,
        marginBottom: 20,
      }}>
        {(['front', 'back'] as const).map(v => (
          <button
            key={v}
            onClick={() => setView(v)}
            style={{
              flex: 1,
              background: view === v ? c.surface : 'transparent',
              border: 'none',
              borderRadius: 7,
              padding: '9px',
              color: view === v ? c.text : c.textMuted,
              fontSize: 13,
              fontWeight: view === v ? 700 : 400,
              cursor: 'pointer',
              transition: 'all 0.15s',
              textTransform: 'capitalize',
            }}
          >
            {v}
          </button>
        ))}
      </div>

      {/* Body SVG */}
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 24 }}>
        <svg
          viewBox="0 0 160 300"
          width={170}
          height={318}
          style={{ display: 'block', overflow: 'visible' }}
        >
          <BodySilhouette silFill={silFill} silStroke={silStroke} />

          {zones.map(zone =>
            zone.shapes.map((s, si) => {
              const active = selected.includes(zone.id)
              return (
                <ellipse
                  key={`${zone.id}-${si}`}
                  cx={s.cx}
                  cy={s.cy}
                  rx={s.rx}
                  ry={s.ry}
                  fill={active ? accentBg : ellipseInactiveFill}
                  stroke={active ? accentColor : ellipseInactiveStroke}
                  strokeWidth={active ? 1.8 : 1}
                  onClick={() => onToggle(zone.id)}
                  style={{ cursor: 'pointer', transition: 'fill 0.18s, stroke 0.18s' }}
                />
              )
            })
          )}
        </svg>
      </div>

      {/* Selected muscle tags — or hint when nothing selected */}
      <div style={{ minHeight: 32, display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', alignItems: 'center' }}>
        {uniqueLabels.length > 0 ? uniqueLabels.map(label => (
          <span
            key={label}
            style={{
              background: accentBg,
              border: `1px solid ${accentColor}`,
              borderRadius: 20,
              padding: '5px 12px',
              color: accentColor,
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            {label}
          </span>
        )) : (
          <p style={{ color: c.textFaint, fontSize: 13, margin: 0, textAlign: 'center' }}>
            Tap any area to select
          </p>
        )}
      </div>
    </div>
  )
}

// Export zone metadata for mapping IDs to workout-generator terms
export const MUSCLE_ZONE_LABELS = Object.fromEntries(
  ALL_ZONES.map(z => [z.id, z.label])
) as Record<string, string>
