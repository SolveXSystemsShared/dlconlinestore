/**
 * The storefront's shelf rules, for the React pages (checkout, account).
 *
 * The static storefront in public/ does the same in `public/store.js`; the two
 * run in different places (plain script vs bundled React) so the rules are kept
 * twice. Change them together — a product must link to the same shelf and show
 * the same artwork wherever it appears.
 */
import type { CatalogProduct } from "./types"

type Shelf = { category: "flower" | "prerolls" | "wellness" | "more"; tier: string }

const TIERS: Array<{ slug: string; label: string; grades: string[] }> = [
  { slug: "outdoor", label: "Outdoor", grades: ["outdoor"] },
  { slug: "greenhouse", label: "Greenhouse", grades: ["greenhouse"] },
  { slug: "executive-greenhouse", label: "Executive Greenhouse", grades: ["executive greenhouse", "exec greenhouse"] },
  { slug: "indoor", label: "Indoor", grades: ["indoor"] },
  { slug: "hydro", label: "Hydro", grades: ["hydroponic", "hydro"] },
]

const fold = (value: string | null | undefined) => (value || "").trim().toLowerCase()
export const slugify = (value: string | null | undefined) =>
  fold(value).replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")

const tierForGrade = (grade: string | null) => TIERS.find((tier) => tier.grades.includes(fold(grade)))?.slug ?? null

type Placeable = Pick<CatalogProduct, "productType" | "grade">

export function classify(product: Placeable): Shelf {
  const type = fold(product.productType)
  const tier = tierForGrade(product.grade)
  if (/flower|bud/.test(type) && tier) return { category: "flower", tier }
  if (/^pre-?rolls?$/.test(type) && tier) return { category: "prerolls", tier }
  if (/wellness/.test(type)) return { category: "wellness", tier: "wellness" }
  return { category: "more", tier: slugify(product.productType) }
}

const PREROLL_ART: Record<string, string> = {
  "blue-dream": "/assets/webp/prerolls/blue-dream.webp",
  "lemon-cherry-gelato": "/assets/webp/prerolls/lemon-cherry-gelato.webp",
  "midnight-kush": "/assets/webp/prerolls/midnight-kush.webp",
  "purple-haze": "/assets/webp/prerolls/purple-haze.webp",
}

const WELLNESS_ART: Array<[RegExp, string]> = [
  [/^ecs?-?3-5/, "/assets/webp/wellness/ec-3-5.webp"],
  [/^ecs?-?7-5/, "/assets/webp/wellness/ec-7-5.webp"],
  [/^ecs?-?30($|-)/, "/assets/webp/wellness/ec-30.webp"],
  [/neuro-?2600/, "/assets/webp/wellness/neuro-2600mg.webp"],
  [/neuro/, "/assets/webp/wellness/neuro-plus.webp"],
  [/pain-relax/, "/assets/webp/wellness/pain-relax.webp"],
  [/happy-pet/, "/assets/webp/wellness/happy-pet.webp"],
  [/balance/, "/assets/webp/wellness/natural-balance.webp"],
]

export function imageFor(product: Placeable & Pick<CatalogProduct, "name" | "imageUrl">): string | null {
  if (product.imageUrl) return product.imageUrl
  const { category, tier } = classify(product)
  const key = slugify(product.name)
  if (category === "flower") return `/assets/webp/flower/${tier}.webp`
  if (category === "prerolls") return PREROLL_ART[key] ?? `/assets/webp/preroll-tiers/${tier}.webp`
  if (category === "wellness") return WELLNESS_ART.find(([pattern]) => pattern.test(key))?.[1] ?? null
  return null
}

export function productUrl(product: Placeable & Pick<CatalogProduct, "id">) {
  const { category, tier } = classify(product)
  return `/product.html?category=${encodeURIComponent(category)}&tier=${encodeURIComponent(tier)}&id=${encodeURIComponent(product.id)}`
}

/** "Greenhouse · Buds/Flower" — the line under a product name. */
export function shelfLabel(product: Placeable) {
  const { category, tier } = classify(product)
  if (category === "flower" || category === "prerolls") return `${TIERS.find((t) => t.slug === tier)?.label} · ${category === "flower" ? "Flower" : "Preroll"}`
  return [product.productType, product.grade].filter(Boolean).join(" · ")
}
