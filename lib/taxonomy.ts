/**
 * How the browse UI reads the catalogue: which categories get an animated,
 * grade-aware icon, and how a grade name maps onto a potency tier.
 */

/**
 * Which icons react to grade: buds, pre-rolls and moonsticks, where the grade
 * column really is a cultivation grade and potency varies tier to tier.
 * Everything else is standardised regardless of source and stays static.
 *
 * Decided off the resolved icon key rather than an exact category name, because
 * the same category arrives spelled differently depending on the source —
 * "Buds/Flower" from CDASH, "Flower" elsewhere — and an exact-match list would
 * silently stop animating the moment someone renamed one.
 */
const GRADE_AWARE_ICONS = new Set(["flower", "preroll"])

export function isGradeAware(category: string | null | undefined) {
  return GRADE_AWARE_ICONS.has(iconKeyFor(category))
}

/**
 * Grade -> potency tier, 0 (mildest) to 3 (strongest). Drives how heavy-lidded
 * the product icon looks.
 *
 * CDASH carries two separate vocabularies in the same column: cultivation
 * grades on flower (Outdoor through Indoor) and letter grades elsewhere. Both
 * are ranked here so a mixed catalogue still sorts sensibly. Anything
 * unrecognised — a brand line on a non-flower product, say — falls to tier 0
 * and simply renders the calm icon.
 */
const GRADE_TIERS: Record<string, number> = {
  // Cultivation grades, mildest to strongest.
  outdoor: 0,
  greenhouse: 1,
  "exec. greenhouse": 1,
  "exec greenhouse": 1,
  "executive greenhouse": 1,
  hydroponic: 2,
  hydro: 2,
  indoor: 3,
  // Letter grades, used on some lines instead.
  a: 0,
  aa: 1,
  aaa: 2,
  aaaa: 3,
}

export function gradeTier(grade: string | null | undefined) {
  if (!grade) return 0
  return GRADE_TIERS[grade.trim().toLowerCase()] ?? 0
}

/**
 * Category -> icon key. Matching is on substrings so a renamed or pluralised
 * category ("Vape Carts", "Drinks & Shooters") still lands on the right glyph
 * rather than falling through to the generic mark.
 */
const ICON_MATCHES: Array<[string, string[]]> = [
  ["flower", ["bud", "flower"]],
  ["preroll", ["pre-roll", "preroll", "pre roll", "moonstick", "joint"]],
  ["edible", ["edible", "gumm", "brownie", "sweet"]],
  ["drink", ["drink", "water", "shooter", "shot", "nectar"]],
  ["vape", ["vape", "cart", "battery", "pen"]],
  ["concentrate", ["concentrate", "hash", "diamond", "crumble", "honeycomb", "rosin"]],
  ["tincture", ["tincture", "oil"]],
  ["accessory", ["accessor", "lighter", "paper", "grinder", "ocb", "raw"]],
]

export function iconKeyFor(category: string | null | undefined) {
  const value = (category || "").toLowerCase()
  for (const [key, needles] of ICON_MATCHES) {
    if (needles.some((needle) => value.includes(needle))) return key
  }
  return "generic"
}
