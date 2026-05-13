import { useState } from 'react'
import { useTheme } from '../lib/theme'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Zone {
  id: string
  label: string
  d: string
}

interface BodyDiagramProps {
  selected: string[]
  onToggle: (id: string) => void
  accentColor: string
  accentBg: string
  sex?: 'male' | 'female'
}

// ── Zone path data (160 × 370 coordinate space) ───────────────────────────────

const FRONT_ZONES: Zone[] = [
  {
    id: 'shoulders',
    label: 'Shoulders',
    d: 'M22,66 C14,70 8,84 10,100 C12,112 20,118 30,115 C38,110 41,98 38,84 C34,70 28,64 22,66 Z M138,66 C146,70 152,84 150,100 C148,112 140,118 130,115 C122,110 119,98 122,84 C126,70 132,64 138,66 Z',
  },
  {
    id: 'chest',
    label: 'Chest',
    d: 'M36,70 C32,78 32,92 36,104 C40,114 52,120 64,118 C72,116 79,110 80,104 L80,68 C68,62 48,64 36,70 Z M124,70 C128,78 128,92 124,104 C120,114 108,120 96,118 C88,116 81,110 80,104 L80,68 C92,62 112,64 124,70 Z',
  },
  {
    id: 'arms',
    label: 'Arms',
    d: 'M9,112 C5,126 5,162 9,176 C12,184 20,186 27,182 C34,178 36,162 34,136 C31,112 22,104 9,112 Z M151,112 C155,126 155,162 151,176 C148,184 140,186 133,182 C126,178 124,162 126,136 C129,112 138,104 151,112 Z',
  },
  {
    id: 'core',
    label: 'Core',
    d: 'M64,112 C60,120 58,134 60,148 C62,160 68,168 80,168 C92,168 98,160 100,148 C102,134 100,120 96,112 C90,106 84,104 80,104 C76,104 70,106 64,112 Z',
  },
  {
    id: 'quads',
    label: 'Quads',
    d: 'M44,186 C38,200 36,224 38,248 C40,268 46,286 52,294 C58,298 66,298 70,292 C74,282 72,260 70,238 C68,218 62,200 56,188 C52,183 47,181 44,186 Z M116,186 C122,200 124,224 122,248 C120,268 114,286 108,294 C102,298 94,298 90,292 C86,282 88,260 90,238 C92,218 98,200 104,188 C108,183 113,181 116,186 Z',
  },
  {
    id: 'knees',
    label: 'Knees',
    d: 'M44,294 C40,300 40,310 46,314 C52,318 60,318 64,312 C68,306 66,296 60,292 C54,288 48,288 44,294 Z M96,294 C92,300 92,310 98,314 C104,318 112,318 116,312 C120,306 118,296 112,292 C106,288 100,288 96,294 Z',
  },
  {
    id: 'elbows',
    label: 'Elbows',
    d: 'M7,148 C4,154 5,164 11,168 C17,172 25,170 28,164 C31,158 29,148 23,144 C17,140 11,142 7,148 Z M133,148 C130,154 131,164 137,168 C143,172 151,170 154,164 C157,158 155,148 149,144 C143,140 137,142 133,148 Z',
  },
  {
    id: 'wrists',
    label: 'Wrists',
    d: 'M6,238 C3,244 4,254 10,258 C16,262 24,262 28,256 C31,250 29,240 23,236 C17,232 10,232 6,238 Z M132,238 C129,244 130,254 136,258 C142,262 150,262 154,256 C157,250 155,240 149,236 C143,232 136,232 132,238 Z',
  },
  {
    id: 'ankles_feet',
    label: 'Ankles / Feet',
    d: 'M40,358 C36,364 38,372 50,374 L68,374 C74,372 76,366 72,360 C66,354 56,352 48,354 Z M92,358 C88,360 86,366 88,372 L106,372 C118,370 120,362 116,356 C110,350 100,348 94,352 Z',
  },
]

const BACK_ZONES: Zone[] = [
  {
    id: 'neck_traps',
    label: 'Traps',
    d: 'M58,46 C50,54 48,64 52,74 C56,82 66,88 80,88 C94,88 104,82 108,74 C112,64 110,54 102,46 C94,40 66,40 58,46 Z',
  },
  {
    id: 'upper_back',
    label: 'Upper Back',
    d: 'M34,68 C28,82 28,102 32,116 C36,126 46,132 80,132 C114,132 124,126 128,116 C132,102 132,82 126,68 C112,60 96,56 80,56 C64,56 48,60 34,68 Z',
  },
  {
    id: 'lower_back',
    label: 'Lower Back',
    d: 'M46,130 C40,140 40,154 44,164 C50,172 62,176 80,176 C98,176 110,172 116,164 C120,154 120,140 114,130 C104,122 94,120 80,120 C66,120 56,122 46,130 Z',
  },
  {
    id: 'glutes',
    label: 'Glutes',
    d: 'M44,172 C36,182 34,198 38,214 C42,226 54,232 66,230 C74,228 80,220 80,210 C80,198 74,184 64,176 C58,170 50,168 44,172 Z M116,172 C124,182 126,198 122,214 C118,226 106,232 94,230 C86,228 80,220 80,210 C80,198 86,184 96,176 C102,170 110,168 116,172 Z',
  },
  {
    id: 'hamstrings',
    label: 'Hamstrings',
    d: 'M44,232 C38,248 36,268 38,288 C40,302 48,310 58,308 C68,306 74,294 74,276 C74,258 68,240 60,232 C56,226 48,226 44,232 Z M116,232 C122,248 124,268 122,288 C120,302 112,310 102,308 C92,306 86,294 86,276 C86,258 92,240 100,232 C104,226 112,226 116,232 Z',
  },
  {
    id: 'calves',
    label: 'Calves',
    d: 'M44,310 C38,326 38,348 44,362 C48,372 56,374 64,370 C70,366 72,354 70,340 C68,326 62,312 56,304 C50,298 46,300 44,310 Z M116,310 C122,326 122,348 116,362 C112,372 104,374 96,370 C90,366 88,354 90,340 C92,326 98,312 104,304 C110,298 114,300 116,310 Z',
  },
  {
    id: 'knees',
    label: 'Knees',
    d: 'M44,294 C40,300 40,310 46,314 C52,318 60,318 64,312 C68,306 66,296 60,292 C54,288 48,288 44,294 Z M96,294 C92,300 92,310 98,314 C104,318 112,318 116,312 C120,306 118,296 112,292 C106,288 100,288 96,294 Z',
  },
  {
    id: 'elbows',
    label: 'Elbows',
    d: 'M7,148 C4,154 5,164 11,168 C17,172 25,170 28,164 C31,158 29,148 23,144 C17,140 11,142 7,148 Z M133,148 C130,154 131,164 137,168 C143,172 151,170 154,164 C157,158 155,148 149,144 C143,140 137,142 133,148 Z',
  },
  {
    id: 'wrists',
    label: 'Wrists',
    d: 'M6,238 C3,244 4,254 10,258 C16,262 24,262 28,256 C31,250 29,240 23,236 C17,232 10,232 6,238 Z M132,238 C129,244 130,254 136,258 C142,262 150,262 154,256 C157,250 155,240 149,236 C143,232 136,232 132,238 Z',
  },
  {
    id: 'ankles_feet',
    label: 'Ankles / Feet',
    d: 'M40,358 C36,364 38,372 50,374 L68,374 C74,372 76,366 72,360 C66,354 56,352 48,354 Z M92,358 C88,360 86,366 88,372 L106,372 C118,370 120,362 116,356 C110,350 100,348 94,352 Z',
  },
]

// ── Body silhouette (shared with MuscleMap) ────────────────────────────────────

const NECK = 'M74,44 C72,48 72,56 74,60 L86,60 C88,56 88,48 86,44 Z'

const MALE = {
  torso:        'M22,66 C20,82 20,100 24,116 C28,130 36,142 42,152 C46,160 50,168 52,174 C58,180 68,184 80,184 C92,184 102,180 108,174 C110,168 114,160 118,152 C124,142 132,130 136,116 C140,100 140,82 138,66 C126,58 108,54 87,54 L73,54 C52,54 34,58 22,66 Z',
  leftArm:      'M22,66 C16,72 10,90 9,112 C8,128 10,144 13,156 C17,162 23,164 28,160 C34,156 36,144 35,122 C33,102 29,80 26,68 Z',
  rightArm:     'M138,66 C144,72 150,90 151,112 C152,128 150,144 147,156 C143,162 137,164 132,160 C126,156 124,144 125,122 C127,102 131,80 134,68 Z',
  leftForearm:  'M13,156 C9,168 7,184 7,200 C6,216 7,232 9,246 C11,256 16,262 21,260 C28,258 31,250 31,238 C32,222 31,206 29,192 C28,180 28,168 28,160 Z',
  rightForearm: 'M147,156 C151,168 153,184 153,200 C154,216 153,232 151,246 C149,256 144,262 139,260 C132,258 129,250 129,238 C128,222 129,206 131,192 C132,180 132,168 132,160 Z',
  leftLeg:      'M52,174 C46,182 42,200 40,222 C38,244 40,266 42,286 C42,300 42,312 44,322 C44,336 42,350 42,362 C42,366 46,370 54,370 L66,370 C70,368 72,362 70,350 C68,338 66,322 66,308 C66,294 68,280 68,266 C68,250 66,232 62,214 C58,198 54,182 54,176 Z',
  rightLeg:     'M108,174 C114,182 118,200 120,222 C122,244 120,266 118,286 C118,300 118,312 116,322 C116,336 118,350 118,362 C118,366 114,370 106,370 L94,370 C90,368 88,362 90,350 C92,338 94,322 94,308 C94,294 92,280 92,266 C92,250 94,232 98,214 C102,198 106,182 106,176 Z',
}

const FEMALE = {
  torso:        'M30,66 C28,82 28,100 32,116 C36,130 44,142 48,152 C52,160 54,168 54,174 C58,182 68,186 80,186 C92,186 102,182 106,174 C106,168 108,160 112,152 C116,142 124,130 128,116 C132,100 132,82 130,66 C118,58 100,54 87,54 L73,54 C60,54 42,58 30,66 Z',
  bust:         'M44,88 C44,100 52,112 64,116 C72,118 78,116 80,112 C82,116 88,118 96,116 C108,112 116,100 116,88 C108,82 96,78 80,78 C64,78 52,82 44,88 Z',
  leftArm:      'M30,66 C24,72 18,90 17,112 C16,128 18,144 21,156 C25,162 31,164 36,160 C42,156 44,144 43,122 C41,102 37,80 34,68 Z',
  rightArm:     'M130,66 C136,72 142,90 143,112 C144,128 142,144 139,156 C135,162 129,164 124,160 C118,156 116,144 117,122 C119,102 123,80 126,68 Z',
  leftForearm:  'M21,156 C17,168 15,184 15,200 C14,216 15,232 17,246 C19,256 24,262 29,260 C36,258 39,250 39,238 C40,222 39,206 37,192 C36,180 36,168 36,160 Z',
  rightForearm: 'M139,156 C143,168 145,184 145,200 C146,216 145,232 143,246 C141,256 136,262 131,260 C124,258 121,250 121,238 C120,222 121,206 123,192 C124,180 124,168 124,160 Z',
  leftLeg:      'M54,174 C46,184 40,204 38,228 C36,250 38,272 40,292 C40,306 40,318 42,330 C42,344 40,358 40,366 C40,370 44,374 52,374 L64,374 C68,372 70,366 68,354 C66,342 64,326 64,312 C64,298 66,284 66,270 C66,252 64,234 60,216 C56,200 52,184 52,176 Z',
  rightLeg:     'M106,174 C114,184 120,204 122,228 C124,250 122,272 120,292 C120,306 120,318 118,330 C118,344 120,358 120,366 C120,370 116,374 108,374 L96,374 C92,372 90,366 92,354 C94,342 96,326 96,312 C94,298 94,284 94,270 C94,252 96,234 100,216 C104,200 108,184 108,176 Z',
}

function BodyShape({ sex, isDark }: { sex: 'male' | 'female'; isDark: boolean }) {
  const fill   = isDark ? '#1C2D46' : '#D0D8E8'
  const stroke = isDark ? '#263650' : '#B4BFCE'
  const p      = sex === 'female' ? FEMALE : MALE

  return (
    <g fill={fill} stroke={stroke} strokeWidth={0.5}>
      <circle cx={80} cy={26} r={19} />
      <path d={NECK} />
      <path d={p.torso} />
      <path d={p.leftArm} />
      <path d={p.rightArm} />
      <path d={p.leftForearm} />
      <path d={p.rightForearm} />
      <path d={p.leftLeg} />
      <path d={p.rightLeg} />
      {sex === 'female' && (
        <path d={FEMALE.bust} fill="none" stroke={stroke} strokeWidth={0.7} />
      )}
    </g>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

const ALL_ZONES = [...FRONT_ZONES, ...BACK_ZONES]

export default function BodyDiagram({
  selected,
  onToggle,
  accentColor,
  accentBg,
  sex = 'male',
}: BodyDiagramProps) {
  const { colors: c } = useTheme()
  const [view, setView] = useState<'front' | 'back'>('front')

  const zones     = view === 'front' ? FRONT_ZONES : BACK_ZONES
  const svgH      = 358
  const svgW      = 155

  const inactiveF = c.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)'
  const inactiveS = c.isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.12)'

  const uniqueLabels = [...new Set(
    selected
      .map(id => ALL_ZONES.find(z => z.id === id)?.label)
      .filter(Boolean) as string[]
  )]

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
              color: view === v ? c.text : c.textSub,
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
          viewBox="0 0 160 370"
          width={svgW}
          height={svgH}
          style={{ display: 'block', overflow: 'visible' }}
        >
          <BodyShape sex={sex} isDark={c.isDark} />

          {zones.map(zone => {
            const active = selected.includes(zone.id)
            return (
              <path
                key={zone.id}
                d={zone.d}
                fill={active ? accentBg : inactiveF}
                stroke={active ? accentColor : inactiveS}
                strokeWidth={active ? 1.4 : 0.8}
                onClick={() => onToggle(zone.id)}
                style={{ cursor: 'pointer', transition: 'fill 0.15s, stroke 0.15s' }}
              />
            )
          })}
        </svg>
      </div>

      {/* Selected tags */}
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
          <p style={{ color: c.textSub, fontSize: 13, margin: 0, textAlign: 'center' }}>
            Tap any area to select
          </p>
        )}
      </div>
    </div>
  )
}

// Export zone labels for mapping IDs → human-readable names
export const MUSCLE_ZONE_LABELS = Object.fromEntries(
  ALL_ZONES.map(z => [z.id, z.label])
) as Record<string, string>
