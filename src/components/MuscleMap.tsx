interface MuscleMapProps {
  highlighted: string[]
  sex?: 'male' | 'female'
  accentColor?: string
  isDark?: boolean
  width?: number
}

const FRONT_MAP: Record<string, string[]> = {
  chest: [], shoulders: [], biceps: [], forearms: [],
  core: [], obliques: [], quads: [], legs: [], calves: [],
  back: [], triceps: [], glutes: [], hamstrings: [],
}
const BACK_MAP: Record<string, string[]> = {
  back: [], shoulders: [], triceps: [], glutes: [],
  hamstrings: [], calves: [], legs: [], forearms: [],
  chest: [], biceps: [], core: [], obliques: [], quads: [],
}

function resolveActive(h: string[], map: Record<string, string[]>): Set<string> {
  const s = new Set<string>()
  for (const m of h) for (const r of (map[m] ?? [])) s.add(r)
  return s
}

type Rgn = { key: string; d: string }
const FRONT_REGIONS: Rgn[] = []
const BACK_REGIONS: Rgn[] = []

// ── viewBox "0 0 100 280" ────────────────────────────────────────────────────
// Tall athletic figure. Key landmarks:
//   Head:    y=1–26    center x=50
//   Neck:    y=24–34
//   Torso:   y=34–145  shoulders x=22..78  waist x=32..68  hips x=30..70
//   Arms:    y=40–192  upper-arm 7px wide  forearm 5px wide
//   Legs:    y=145–276 thigh 15px wide at mid  ankle 8px wide

// ── SILHOUETTE PATHS ─────────────────────────────────────────────────────────

const HEAD  = 'M50,1 C58,1 64,7 64,14 C64,21 58,26 50,26 C42,26 36,21 36,14 C36,7 42,1 50,1 Z'
const NECK  = 'M45,25 L55,25 L54,34 L46,34 Z'

// Torso: wide at shoulders, tapers to waist, slight hip flare, ends at crotch
const TORSO = [
  'M46,34',
  'C40,34 28,35 22,39',   // left clavicle
  'C18,42 17,50 20,58',   // left deltoid front
  'C21,63 23,66 25,64',   // left armpit
  'C25,62 25,65 25,68',
  'C25,74 24,84 24,96',   // left oblique
  'C24,108 24,120 25,130',
  'C26,136 28,142 30,145',// left hip
  'L70,145',               // right hip
  'C72,142 74,136 75,130',
  'C76,120 76,108 76,96', // right oblique
  'C76,84 75,74 75,68',
  'C75,65 75,62 75,64',   // right armpit
  'C77,66 79,63 80,58',
  'C83,50 82,42 78,39',   // right deltoid
  'C72,35 60,34 54,34 Z', // right clavicle
].join(' ')

// Arms: long and thin
const L_ARM = [
  'M20,58',
  'C17,65 14,78 12,92',   // outer upper arm
  'C10,104 9,117 9,130',
  'C9,141 10,150 11,159', // outer forearm
  'C12,167 13,174 13,180',// outer wrist
  'C13,185 14,188 17,189',// hand
  'C20,190 22,188 22,183',
  'C22,178 22,172 21,165',// inner wrist
  'C20,157 20,148 20,137',// inner forearm
  'C20,124 21,111 22,98', // inner upper arm
  'C23,86 24,75 25,64',   // armpit
].join(' ')

const R_ARM = [
  'M80,58',
  'C83,65 86,78 88,92',
  'C90,104 91,117 91,130',
  'C91,141 90,150 89,159',
  'C88,167 87,174 87,180',
  'C87,185 86,188 83,189',
  'C80,190 78,188 78,183',
  'C78,178 78,172 79,165',
  'C80,157 80,148 80,137',
  'C80,124 79,111 78,98',
  'C77,86 76,75 75,64',
].join(' ')

// Legs: long, narrower, slight taper
const L_LEG = [
  'M30,145',
  'C25,152 20,165 18,178', // outer upper thigh
  'C16,190 16,203 18,215',
  'C20,226 22,236 23,246',// outer knee
  'C24,255 24,264 25,270',// outer shin
  'L31,276 L42,276',       // foot
  'C44,274 45,270 44,263',// inner ankle
  'C43,255 42,245 42,234',// inner shin
  'C42,223 42,211 43,200',// inner knee
  'C44,189 45,178 47,169',
  'C48,161 50,154 50,153',// inner upper thigh
  'L50,145 Z',
].join(' ')

const R_LEG = [
  'M70,145',
  'C75,152 80,165 82,178',
  'C84,190 84,203 82,215',
  'C80,226 78,236 77,246',
  'C76,255 76,264 75,270',
  'L69,276 L58,276',
  'C56,274 55,270 56,263',
  'C57,255 58,245 58,234',
  'C58,223 58,211 57,200',
  'C56,189 55,178 53,169',
  'C52,161 50,154 50,153',
  'L50,145 Z',
].join(' ')

// ── FRONT MUSCLE DETAIL LINES ─────────────────────────────────────────────────
const FRONT_DETAIL: string[] = [
  // Neck center
  'M50,26 L50,34',
  // Clavicle lines
  'M46,34 C38,35 28,36 22,39',
  'M54,34 C62,35 72,36 78,39',
  // Sternum
  'M50,37 L50,72',
  // Left pec
  'M20,52 C24,48 33,45 42,47 C47,49 50,54 50,62 C50,67 50,72 50,72 C42,72 32,70 24,64 C21,60 19,56 20,52 Z',
  // Right pec
  'M80,52 C76,48 67,45 58,47 C53,49 50,54 50,62 C50,67 50,72 50,72 C58,72 68,70 76,64 C79,60 81,56 80,52 Z',
  // Serratus — left
  'M24,65 C23,69 23,72 24,75',
  'M26,71 C25,75 25,78 26,81',
  'M28,77 C27,81 27,84 28,87',
  // Serratus — right
  'M76,65 C77,69 77,72 76,75',
  'M74,71 C75,75 75,78 74,81',
  'M72,77 C73,81 73,84 72,87',
  // Left oblique
  'M24,65 C23,76 23,88 23,100 C23,112 26,124 31,134 C34,140 38,144 42,145',
  // Right oblique
  'M76,65 C77,76 77,88 77,100 C77,112 74,124 69,134 C66,140 62,144 58,145',
  // Abs box
  'M43,72 L43,120 L57,120 L57,72',
  // Abs horizontal lines
  'M43,84 L57,84',
  'M43,96 L57,96',
  'M43,108 L57,108',
  // Abs center line
  'M50,72 L50,120',
  // Bicep crease — left arm
  'M14,66 C13,74 12,84 11,96 C10,107 11,118 13,128',
  // Bicep crease — right arm
  'M86,66 C87,74 88,84 89,96 C90,107 89,118 87,128',
  // Forearm lines — left
  'M13,128 C13,138 13,148 14,158',
  'M20,128 C20,138 20,148 20,158',
  // Forearm lines — right
  'M87,128 C87,138 87,148 86,158',
  'M80,128 C80,138 80,148 80,158',
  // Left quad outer
  'M24,148 C20,160 17,174 16,188 C15,201 17,213 20,223',
  // Left quad inner
  'M43,146 C42,158 41,171 41,183 C41,195 42,206 44,215',
  // Right quad outer
  'M76,148 C80,160 83,174 84,188 C85,201 83,213 80,223',
  // Right quad inner
  'M57,146 C58,158 59,171 59,183 C59,195 58,206 56,215',
  // Left inner quad teardrop
  'M43,200 C39,209 39,218 43,224 C48,228 53,225 53,217 C53,209 49,201 43,200 Z',
  // Right inner quad teardrop
  'M57,200 C61,209 61,218 57,224 C52,228 47,225 47,217 C47,209 51,201 57,200 Z',
  // Left tibialis (shin line)
  'M23,225 C22,237 22,250 23,260 C24,267 27,272 30,274',
  'M31,225 C31,238 31,250 32,260',
  // Right tibialis
  'M77,225 C78,237 78,250 77,260 C76,267 73,272 70,274',
  'M69,225 C69,238 69,250 68,260',
]

// ── BACK MUSCLE DETAIL LINES ──────────────────────────────────────────────────
const BACK_DETAIL: string[] = [
  // Neck center
  'M50,26 L50,34',
  // Trapezius — large diamond upper back
  'M50,34 C43,36 28,38 20,44 C14,49 13,56 18,64 C22,70 32,74 42,72 C47,70 50,65 50,60 C50,65 53,70 58,72 C68,74 78,70 82,64 C87,56 86,49 80,44 C72,38 57,36 50,34 Z',
  // Spine
  'M50,34 L50,122',
  // Left rear deltoid
  'M20,47 C16,52 14,58 15,65 C17,72 23,75 30,72 C35,70 37,63 35,56 C33,50 27,46 20,47 Z',
  // Right rear deltoid
  'M80,47 C84,52 86,58 85,65 C83,72 77,75 70,72 C65,70 63,63 65,56 C67,50 73,46 80,47 Z',
  // Left tricep outer
  'M20,58 C17,68 14,80 12,94 C10,107 10,120 12,132',
  // Left tricep inner
  'M25,64 C23,74 22,86 22,98 C22,110 23,121 25,130',
  // Right tricep outer
  'M80,58 C83,68 86,80 88,94 C90,107 90,120 88,132',
  // Right tricep inner
  'M75,64 C77,74 78,86 78,98 C78,110 77,121 75,130',
  // Left lat wing
  'M22,54 C20,65 19,78 19,92 C19,105 21,118 24,128 C27,136 32,140 38,140 C44,140 49,136 50,128 C50,118 47,106 43,96 C39,86 33,76 27,68 Z',
  // Right lat wing
  'M78,54 C80,65 81,78 81,92 C81,105 79,118 76,128 C73,136 68,140 62,140 C56,140 51,136 50,128 C50,118 53,106 57,96 C61,86 67,76 73,68 Z',
  // Spinal erectors — left strip
  'M47,36 C46,54 45,74 45,94 C45,110 46,120 47,128',
  // Spinal erectors — right strip
  'M53,36 C54,54 55,74 55,94 C55,110 54,120 53,128',
  // Rear forearm lines
  'M13,128 C13,138 13,148 14,158',
  'M20,128 C20,138 20,148 20,158',
  'M87,128 C87,138 87,148 86,158',
  'M80,128 C80,138 80,148 80,158',
  // Left glute
  'M26,138 C19,147 16,158 18,170 C20,181 29,188 40,188 C48,188 54,182 54,170 C54,158 48,148 38,142 C34,140 29,138 26,138 Z',
  // Right glute
  'M74,138 C81,147 84,158 82,170 C80,181 71,188 60,188 C52,188 46,182 46,170 C46,158 52,148 62,142 C66,140 71,138 74,138 Z',
  // Glute divide
  'M50,145 L50,172',
  // Left hamstring outer
  'M19,182 C16,194 14,207 14,220 C14,232 17,244 21,253',
  // Left hamstring inner
  'M40,188 C39,200 38,212 38,225 C38,237 40,247 42,256',
  // Right hamstring outer
  'M81,182 C84,194 86,207 86,220 C86,232 83,244 79,253',
  // Right hamstring inner
  'M60,188 C61,200 62,212 62,225 C62,237 60,247 58,256',
  // Left calf
  'M19,224 C16,235 15,248 17,259 C18,266 22,271 27,272 C33,274 39,271 41,262 C43,253 41,241 37,231 C33,222 26,218 19,224 Z',
  // Right calf
  'M81,224 C84,235 85,248 83,259 C82,266 78,271 73,272 C67,274 61,271 59,262 C57,253 59,241 63,231 C67,222 74,218 81,224 Z',
]

// ── Component ─────────────────────────────────────────────────────────────────

export default function MuscleMap({
  highlighted,
  accentColor = '#4A9EFF',
  isDark = false,
  width = 268,
}: MuscleMapProps) {
  const scale = width / 268
  const vW = Math.round(130 * scale)
  const vH = Math.round(260 * scale)

  void resolveActive(highlighted, FRONT_MAP)
  void resolveActive(highlighted, BACK_MAP)
  void FRONT_REGIONS
  void BACK_REGIONS
  void accentColor
  void isDark

  return (
    <div style={{ display: 'flex', gap: 8, justifyContent: 'center', alignItems: 'flex-start' }}>
      {([
        { label: 'FRONT', detail: FRONT_DETAIL },
        { label: 'BACK',  detail: BACK_DETAIL  },
      ] as const).map(({ label, detail }) => (
        <div key={label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
          <svg width={vW} height={vH} viewBox="0 0 100 280" style={{ display: 'block', overflow: 'visible' }}>
            {/* Body parts — white fill, black outline */}
            {[HEAD, NECK, TORSO, L_ARM, R_ARM, L_LEG, R_LEG].map((d, i) => (
              <path key={i} d={d} fill="white" stroke="black" strokeWidth={0.9} strokeLinejoin="round" />
            ))}
            {/* Muscle detail lines */}
            {detail.map((d, i) => (
              <path
                key={i}
                d={d}
                fill={d.trimEnd().endsWith('Z') ? 'white' : 'none'}
                stroke="black"
                strokeWidth={0.55}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}
          </svg>
          <span style={{ fontSize: 9, letterSpacing: '1.8px', textTransform: 'uppercase', color: '#5A7A9A', fontWeight: 600, userSelect: 'none' }}>
            {label}
          </span>
        </div>
      ))}
    </div>
  )
}
