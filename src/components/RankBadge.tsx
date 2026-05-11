interface RankBadgeProps {
  tier: number        // 1-12
  size?: number       // px, default 36
  accentColor?: string // theme accent, used for tier 12 Ascendant
}

// Flat-top hex path: center (20,20), outer radius 18
const HEX_PATH = 'M38,20 L29,35.6 L11,35.6 L2,20 L11,4.4 L29,4.4 Z'
// Inner border hex: radius 15
const HEX_INNER = 'M35,20 L26.5,34.5 L13.5,34.5 L5,20 L13.5,5.5 L26.5,5.5 Z'

function getTierColor(tier: number, accentColor: string): string {
  const map: Record<number, string> = {
    1:  '#6B7280',
    2:  '#B45309',
    3:  '#D97706',
    4:  '#9CA3AF',
    5:  '#D1D5DB',
    6:  '#FBBF24',
    7:  '#F59E0B',
    8:  '#FDE68A',
    9:  '#E2E8F0',
    10: '#F472B6',
    11: '#A78BFA',
    12: accentColor,
  }
  return map[tier] ?? '#6B7280'
}

function darkenColor(hex: string): string {
  // Returns a darker shade for gradient start
  const darkMap: Record<string, string> = {
    '#6B7280': '#374151',
    '#B45309': '#78350F',
    '#D97706': '#92400E',
    '#9CA3AF': '#4B5563',
    '#D1D5DB': '#6B7280',
    '#FBBF24': '#92400E',
    '#F59E0B': '#78350F',
    '#FDE68A': '#D97706',
    '#E2E8F0': '#94A3B8',
    '#F472B6': '#9D174D',
    '#A78BFA': '#5B21B6',
  }
  return darkMap[hex] ?? '#1A2432'
}

function getIconColor(tier: number): string {
  // Tiers 7-9 have light backgrounds, use dark icon
  if (tier >= 7 && tier <= 9) return '#1A2432'
  return '#FFFFFF'
}

function TierIcon({ tier, color }: { tier: number; color: string }) {
  // All icons centered at (20,20), fitting ~12px
  switch (tier) {
    case 1: // bench: two horizontals + two short verticals
      return (
        <g stroke={color} strokeWidth="1.8" strokeLinecap="round" fill="none">
          <line x1="13" y1="18" x2="27" y2="18" />
          <line x1="13" y1="22" x2="27" y2="22" />
          <line x1="15" y1="22" x2="15" y2="25" />
          <line x1="25" y1="22" x2="25" y2="25" />
        </g>
      )
    case 2: // upward chevron
      return (
        <g stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none">
          <polyline points="14,23 20,17 26,23" />
        </g>
      )
    case 3: // diamond/rhombus
      return (
        <g stroke={color} strokeWidth="1.8" fill="none">
          <polygon points="20,14 26,20 20,26 14,20" strokeLinejoin="round" />
        </g>
      )
    case 4: // right-pointing triangle (play button)
      return (
        <polygon points="15,14 27,20 15,26" fill={color} />
      )
    case 5: // letter V
      return (
        <g stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none">
          <polyline points="13,14 20,26 27,14" />
        </g>
      )
    case 6: // 5-pointed star outline
      return (
        <polygon
          points="20,13 22.5,18.5 28.5,18.5 23.5,22 25.5,28 20,24.5 14.5,28 16.5,22 11.5,18.5 17.5,18.5"
          fill="none"
          stroke={color}
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
      )
    case 7: // trophy cup outline
      return (
        <g stroke={color} strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round">
          <path d="M15,13 L25,13 L25,20 Q25,26 20,26 Q15,26 15,20 Z" />
          <line x1="20" y1="26" x2="20" y2="28" />
          <line x1="16" y1="28" x2="24" y2="28" />
          <path d="M15,15 Q11,15 11,18 Q11,21 15,21" />
          <path d="M25,15 Q29,15 29,18 Q29,21 25,21" />
        </g>
      )
    case 8: // star with circle ring
      return (
        <g fill="none" strokeLinejoin="round">
          <circle cx="20" cy="20" r="8" stroke={color} strokeWidth="1.4" />
          <polygon
            points="20,15 21.5,18.5 25,18.5 22.5,20.5 23.5,24 20,22 16.5,24 17.5,20.5 15,18.5 18.5,18.5"
            fill={color}
            stroke="none"
          />
        </g>
      )
    case 9: // lightning bolt
      return (
        <g fill={color}>
          <polygon points="22,12 15,21 20,21 18,28 25,19 20,19" />
        </g>
      )
    case 10: // crown (3 points up)
      return (
        <g stroke={color} strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="13,26 13,18 17,22 20,14 23,22 27,18 27,26 13,26" />
        </g>
      )
    case 11: // king's crown with extra prongs
      return (
        <g stroke={color} strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="12,26 12,17 15,21 17.5,14 20,18 22.5,14 25,21 28,17 28,26 12,26" />
          <line x1="12" y1="23" x2="28" y2="23" />
        </g>
      )
    case 12: // Ascend lightning bolt (forward-slash style)
      return (
        <g fill={color}>
          <polygon points="23,12 16,21 21,21 17,28 24,19 19,19" />
        </g>
      )
    default:
      return null
  }
}

export default function RankBadge({ tier, size = 36, accentColor = '#4A9EFF' }: RankBadgeProps) {
  const clampedTier = Math.max(1, Math.min(12, tier))
  const rankColor = getTierColor(clampedTier, accentColor)
  const darkColor = clampedTier === 12 ? darkenColor(accentColor) || '#0A1F3A' : darkenColor(rankColor)
  const iconColor = getIconColor(clampedTier)
  const gradId = `rbg-${clampedTier}`
  const shadowId = `rbs-${clampedTier}`
  const hasGlow = clampedTier >= 8

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: 'block', flexShrink: 0 }}
    >
      <defs>
        <linearGradient id={gradId} x1="20" y1="4.4" x2="20" y2="35.6" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor={darkColor} />
          <stop offset="100%" stopColor={rankColor} />
        </linearGradient>
        {hasGlow && (
          <filter id={shadowId} x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="0" stdDeviation="2.5" floodColor={rankColor} floodOpacity="0.6" />
          </filter>
        )}
      </defs>

      {/* Outer hex fill */}
      <path
        d={HEX_PATH}
        fill={`url(#${gradId})`}
        filter={hasGlow ? `url(#${shadowId})` : undefined}
      />

      {/* Inner border for depth */}
      <path
        d={HEX_INNER}
        fill="none"
        stroke={rankColor}
        strokeWidth="0.8"
        opacity="0.5"
      />

      {/* Icon */}
      <TierIcon tier={clampedTier} color={iconColor} />
    </svg>
  )
}
