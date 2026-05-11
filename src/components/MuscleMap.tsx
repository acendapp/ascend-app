interface MuscleMapProps {
  /** Muscle groups to highlight — values from: chest, back, shoulders, biceps, triceps, quads, hamstrings, glutes, calves, core */
  highlighted: string[]
  /** male or female silhouette; defaults to 'male' */
  sex?: 'male' | 'female'
  /** accent color from theme (e.g. '#4A9EFF') */
  accentColor: string
  /** whether dark mode is active */
  isDark: boolean
  /** overall width of the component (both views side by side); height scales proportionally; default 260 */
  width?: number
}

// Maps highlighted prop values -> front/back region keys
const FRONT_REGION_MAP: Record<string, string[]> = {
  chest: ['chest'],
  shoulders: ['shoulderFront'],
  biceps: ['biceps'],
  core: ['abs'],
  quads: ['quads'],
  calves: ['calvesFront'],
}

const BACK_REGION_MAP: Record<string, string[]> = {
  back: ['back'],
  shoulders: ['shoulderRear'],
  triceps: ['triceps'],
  glutes: ['glutes'],
  hamstrings: ['hamstrings'],
  calves: ['calvesBack'],
}

// ─── Body outline path (front) ────────────────────────────────────────────────
// Single continuous compound path describing the male front silhouette
const FRONT_BODY_PATH = `
  M30,1.5
  C34,1.5 37.5,5 37.5,9 C37.5,13 34,16.5 30,16.5 C26,16.5 22.5,13 22.5,9 C22.5,5 26,1.5 30,1.5 Z
  M26,16.5 L34,16.5 L35.5,22 L24.5,22 Z
  M24.5,22 Q13,22 9,30 L7.5,46 L11,47 L12,33 Q13,25 16,23 L24.5,22 Z
  M35.5,22 Q47,22 51,30 L52.5,46 L49,47 L48,33 Q47,25 44,23 L35.5,22 Z
  M7.5,46 L11,47 L10.5,66 L7,67 Z
  M52.5,46 L49,47 L49.5,66 L53,67 Z
  M16,23 L44,23 Q50,24 51,32 L51,63 Q43,69 30,69 Q17,69 9,63 L9,32 Q10,24 16,23 Z
  M9,63 Q17,69 30,69 Q43,69 51,63 L50,126 Q43,129 30,129 Q17,129 10,126 Z
  M18,69 L26,69 L24,121 L17,121 Z
  M42,69 L34,69 L36,121 L43,121 Z
`.trim()

// Back silhouette — same outer shape, arms flipped slightly
const BACK_BODY_PATH = FRONT_BODY_PATH

// ─── Female torso adjustments ─────────────────────────────────────────────────
// For female variant, shoulder-width paths are shifted inward by 3 units each side
// and hip region is widened.  We achieve this by a separate female body path.
const FRONT_BODY_PATH_F = `
  M30,1.5
  C34,1.5 37.5,5 37.5,9 C37.5,13 34,16.5 30,16.5 C26,16.5 22.5,13 22.5,9 C22.5,5 26,1.5 30,1.5 Z
  M26.5,16.5 L33.5,16.5 L35,22 L25,22 Z
  M25,22 Q14,22 10,30 L8.5,46 L12,47 L13,33 Q14,26 17,24 L25,22 Z
  M35,22 Q46,22 50,30 L51.5,46 L48,47 L47,33 Q46,26 43,24 L35,22 Z
  M8.5,46 L12,47 L11.5,66 L8,67 Z
  M51.5,46 L48,47 L48.5,66 L52,67 Z
  M17,24 L43,24 Q49,25 50,33 L52,63 Q44,71 30,71 Q16,71 8,63 L10,33 Q11,25 17,24 Z
  M8,63 Q16,71 30,71 Q44,71 52,63 L51,126 Q43,129 30,129 Q17,129 9,126 Z
  M17,71 L25,71 L23,121 L16,121 Z
  M43,71 L35,71 L37,121 L44,121 Z
`.trim()

const BACK_BODY_PATH_F = FRONT_BODY_PATH_F

// ─── Front muscle region definitions ─────────────────────────────────────────
type RegionDef = { key: string; paths: string[] }

const FRONT_REGIONS: RegionDef[] = [
  {
    key: 'shoulderFront',
    paths: [
      'M10,23 Q7,27 8,34 Q11,36 15,36 Q13,29 14,22 Z',
      'M50,23 Q53,27 52,34 Q49,36 45,36 Q47,29 46,22 Z',
    ],
  },
  {
    key: 'chest',
    paths: [
      'M14,23 Q13,29 14,36 Q19,38 28,37 L29,23 Z',
      'M46,23 Q47,29 46,36 Q41,38 32,37 L31,23 Z',
    ],
  },
  {
    key: 'biceps',
    paths: [
      'M7.5,33 Q5.5,39 6.5,46 L10.5,45 Q10.5,38 8.5,33 Z',
      'M52.5,33 Q54.5,39 53.5,46 L49.5,45 Q49.5,38 51.5,33 Z',
    ],
  },
  {
    key: 'abs',
    paths: [
      'M27,36 L33,36 L34,57 L26,57 Z',
    ],
  },
  {
    key: 'quads',
    paths: [
      'M18,69 Q15,81 16,96 L26,96 Q26,81 26,69 Z',
      'M42,69 Q45,81 44,96 L34,96 Q34,81 34,69 Z',
    ],
  },
  {
    key: 'calvesFront',
    paths: [
      'M16,96 Q14,109 17,119 L24,119 Q24,109 26,96 Z',
      'M44,96 Q46,109 43,119 L36,119 Q36,109 34,96 Z',
    ],
  },
]

// ─── Back muscle region definitions ──────────────────────────────────────────
const BACK_REGIONS: RegionDef[] = [
  {
    key: 'shoulderRear',
    paths: [
      'M8,23 Q6,28 8,35 Q11,37 15,36 Q13,29 14,22 Z',
      'M52,23 Q54,28 52,35 Q49,37 45,36 Q47,29 46,22 Z',
    ],
  },
  {
    key: 'back',
    paths: [
      'M14,22 Q9,30 9,51 Q18,59 30,61 Q42,59 51,51 Q51,30 46,22 Z',
    ],
  },
  {
    key: 'triceps',
    paths: [
      'M6.5,33 Q4.5,40 6.5,47 L10.5,46 Q9.5,39 8.5,33 Z',
      'M53.5,33 Q55.5,40 53.5,47 L49.5,46 Q50.5,39 51.5,33 Z',
    ],
  },
  {
    key: 'glutes',
    paths: [
      'M16,66 Q13,77 15,83 Q22,86 30,85 L30,66 Z',
      'M44,66 Q47,77 45,83 Q38,86 30,85 L30,66 Z',
    ],
  },
  {
    key: 'hamstrings',
    paths: [
      'M15,83 Q13,91 15,98 L25,98 Q25,91 22,86 Z',
      'M45,83 Q47,91 45,98 L35,98 Q35,91 38,86 Z',
    ],
  },
  {
    key: 'calvesBack',
    paths: [
      'M15,98 Q14,109 16,119 L24,119 Q24,109 25,98 Z',
      'M45,98 Q46,109 44,119 L36,119 Q36,109 35,98 Z',
    ],
  },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function resolveActiveRegions(highlighted: string[], regionMap: Record<string, string[]>): Set<string> {
  const active = new Set<string>()
  for (const muscle of highlighted) {
    const regions = regionMap[muscle]
    if (regions) {
      for (const r of regions) active.add(r)
    }
  }
  return active
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface SilhouetteProps {
  bodyPath: string
  regions: RegionDef[]
  activeRegions: Set<string>
  accentColor: string
  isDark: boolean
}

function Silhouette({ bodyPath, regions, activeRegions, accentColor, isDark }: SilhouetteProps) {
  const bodyFill = isDark ? '#2A3A52' : '#E5EAF0'
  const bodyStroke = isDark ? '#3A4A62' : '#C5CDD8'
  const muscleStroke = isDark ? '#1A2A3A' : '#B0BBC8'

  return (
    <>
      {/* Body outline — rendered first so muscles appear on top */}
      <path
        d={bodyPath}
        fill={bodyFill}
        stroke={bodyStroke}
        strokeWidth={0.5}
        fillRule="evenodd"
      />

      {/* Muscle regions */}
      {regions.map(region =>
        region.paths.map((d, i) => {
          const isActive = activeRegions.has(region.key)
          return (
            <path
              key={`${region.key}-${i}`}
              d={d}
              fill={isActive ? accentColor : 'transparent'}
              fillOpacity={isActive ? 0.85 : 0}
              stroke={isActive ? muscleStroke : 'none'}
              strokeWidth={isActive ? 0.3 : 0}
            />
          )
        })
      )}
    </>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function MuscleMap({
  highlighted,
  sex = 'male',
  accentColor,
  isDark,
  width = 260,
}: MuscleMapProps) {
  const halfW = width / 2 - 8
  const h = halfW * (130 / 60)

  const labelColor = isDark ? '#5A7A9A' : '#9CA3AF'

  const frontActive = resolveActiveRegions(highlighted, FRONT_REGION_MAP)
  const backActive = resolveActiveRegions(highlighted, BACK_REGION_MAP)

  const frontBodyPath = sex === 'female' ? FRONT_BODY_PATH_F : FRONT_BODY_PATH
  const backBodyPath = sex === 'female' ? BACK_BODY_PATH_F : BACK_BODY_PATH

  return (
    <div style={{ display: 'flex', gap: 8, justifyContent: 'center', alignItems: 'flex-start' }}>
      {/* Front view */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
        <svg
          width={halfW}
          height={h}
          viewBox="0 0 60 130"
          style={{ display: 'block', overflow: 'visible' }}
        >
          <Silhouette
            bodyPath={frontBodyPath}
            regions={FRONT_REGIONS}
            activeRegions={frontActive}
            accentColor={accentColor}
            isDark={isDark}
          />
        </svg>
        <span
          style={{
            fontSize: 8,
            letterSpacing: '1.5px',
            color: labelColor,
            userSelect: 'none',
          }}
        >
          FRONT
        </span>
      </div>

      {/* Back view */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
        <svg
          width={halfW}
          height={h}
          viewBox="0 0 60 130"
          style={{ display: 'block', overflow: 'visible' }}
        >
          <Silhouette
            bodyPath={backBodyPath}
            regions={BACK_REGIONS}
            activeRegions={backActive}
            accentColor={accentColor}
            isDark={isDark}
          />
        </svg>
        <span
          style={{
            fontSize: 8,
            letterSpacing: '1.5px',
            color: labelColor,
            userSelect: 'none',
          }}
        >
          BACK
        </span>
      </div>
    </div>
  )
}
