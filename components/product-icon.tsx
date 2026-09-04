import { gradeTier, iconKeyFor, isGradeAware } from "@/lib/taxonomy"

/**
 * Category icons in place of product photography.
 *
 * Buds, pre-rolls and moonsticks get a face that reacts to grade: the higher
 * the tier, the heavier the lids and the thicker the haze, so potency reads at
 * a glance across a row of cards. Everything else is standardised regardless of
 * where it came from, so it gets the same glyph every time and no animation.
 */

// Lid coverage and haze strength per tier. Tier 0 is wide awake; tier 3 is all
// the way gone. Kept as data so the steps stay even across the set.
const FACES = [
  { lid: 0, glow: 0, blush: 0 },
  { lid: 3.4, glow: 0.28, blush: 0.18 },
  { lid: 6.2, glow: 0.5, blush: 0.34 },
  { lid: 8.4, glow: 0.72, blush: 0.5 },
]

function Face({ tier }: { tier: number }) {
  const { lid, blush } = FACES[tier] ?? FACES[0]
  return (
    <g>
      {blush > 0 && (
        <>
          <ellipse cx="25" cy="41" rx="5.4" ry="3" fill="#f2748b" opacity={blush} />
          <ellipse cx="47" cy="41" rx="5.4" ry="3" fill="#f2748b" opacity={blush} />
        </>
      )}
      {/* Whites, then a lid that slides down over them by tier. */}
      <ellipse cx="26" cy="36" rx="5" ry="5.4" fill="#fff" />
      <ellipse cx="46" cy="36" rx="5" ry="5.4" fill="#fff" />
      <circle cx="26" cy="37" r="2.6" fill="#12305c" />
      <circle cx="46" cy="37" r="2.6" fill="#12305c" />
      {lid > 0 && (
        <>
          <rect x="20.6" y="30.6" width="11" height={lid} rx={lid / 2.4} fill="currentColor" />
          <rect x="40.6" y="30.6" width="11" height={lid} rx={lid / 2.4} fill="currentColor" />
        </>
      )}
      <path d="M31 47q5 4 10 0" stroke="#12305c" strokeWidth="2" strokeLinecap="round" fill="none" />
    </g>
  )
}

function Haze({ tier }: { tier: number }) {
  const { glow } = FACES[tier] ?? FACES[0]
  if (glow <= 0) return null
  return (
    <g className="icon-haze" opacity={glow}>
      <circle cx="17" cy="20" r="4.6" fill="#fff" />
      <circle cx="55" cy="17" r="3.4" fill="#fff" />
      <circle cx="60" cy="45" r="4" fill="#fff" />
    </g>
  )
}

const GLYPHS: Record<string, React.ReactNode> = {
  flower: (
    <g fill="currentColor">
      <circle cx="36" cy="34" r="20" />
      <circle cx="22" cy="27" r="11" />
      <circle cx="50" cy="27" r="11" />
      <circle cx="24" cy="44" r="11" />
      <circle cx="48" cy="44" r="11" />
    </g>
  ),
  preroll: (
    <g fill="currentColor">
      <path d="M20 54 L44 16 a7 7 0 0 1 11 8 L31 60 Z" />
      <circle cx="24" cy="57" r="5" opacity=".55" />
    </g>
  ),
  edible: (
    <g fill="currentColor">
      <rect x="16" y="20" width="40" height="34" rx="11" />
      <rect x="24" y="28" width="8" height="8" rx="3" fill="#fff" opacity=".55" />
    </g>
  ),
  drink: (
    <g fill="currentColor">
      <path d="M24 16h24l-3 44a5 5 0 0 1-5 4h-8a5 5 0 0 1-5-4Z" />
      <rect x="22" y="12" width="28" height="7" rx="3.5" opacity=".7" />
    </g>
  ),
  vape: (
    <g fill="currentColor">
      <rect x="29" y="12" width="14" height="48" rx="7" />
      <rect x="32" y="6" width="8" height="8" rx="3" opacity=".7" />
      <rect x="32" y="30" width="8" height="12" rx="3" fill="#fff" opacity=".5" />
    </g>
  ),
  concentrate: (
    <g fill="currentColor">
      <path d="M36 12c8 12 16 19 16 29a16 16 0 0 1-32 0c0-10 8-17 16-29Z" />
      <circle cx="30" cy="44" r="4.5" fill="#fff" opacity=".45" />
    </g>
  ),
  tincture: (
    <g fill="currentColor">
      <rect x="27" y="10" width="18" height="10" rx="4" opacity=".7" />
      <path d="M30 20h12v30a6 6 0 0 1-12 0Z" />
      <circle cx="36" cy="60" r="4" opacity=".55" />
    </g>
  ),
  accessory: (
    <g fill="currentColor">
      <rect x="18" y="22" width="36" height="30" rx="6" transform="rotate(-8 36 37)" />
      <rect x="26" y="30" width="20" height="3.4" rx="1.7" fill="#fff" opacity=".55" transform="rotate(-8 36 37)" />
      <rect x="26" y="38" width="14" height="3.4" rx="1.7" fill="#fff" opacity=".45" transform="rotate(-8 36 37)" />
    </g>
  ),
  generic: <circle cx="36" cy="36" r="21" fill="currentColor" />,
}

export function ProductIcon({
  category,
  grade,
  className = "",
}: {
  category: string | null | undefined
  grade?: string | null
  className?: string
}) {
  const key = iconKeyFor(category)
  const gradeAware = isGradeAware(category)
  const tier = gradeAware ? gradeTier(grade) : 0

  return (
    <svg
      className={`product-icon ${gradeAware ? `is-animated tier-${tier}` : ""} ${className}`}
      viewBox="0 0 72 72"
      role="img"
      aria-label={`${category || "Product"} icon`}
    >
      {GLYPHS[key] ?? GLYPHS.generic}
      {gradeAware && <Face tier={tier} />}
      {gradeAware && <Haze tier={tier} />}
    </svg>
  )
}
