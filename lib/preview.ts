/**
 * Local design-preview mode.
 *
 * Serves sample members and a sample catalogue so the storefront can be viewed
 * without a live CDASH Supabase connection. It is double-guarded: it never
 * activates in a production build, and it stays off unless STORE_PREVIEW=1 is
 * set explicitly. Delete this file and the three `isPreviewMode()` branches
 * (members/verify, members/session, catalog) once real credentials are wired up.
 */
import type { CatalogProduct } from "./types"

export function isPreviewMode() {
  return process.env.NODE_ENV !== "production" && process.env.STORE_PREVIEW === "1"
}

export const PREVIEW_MEMBER = { memberId: "DLC-0000-01", name: "Preview Member" }

export function previewCatalog(): CatalogProduct[] {
  const items: Array<[string, string, string, string | null, number, number]> = [
    ["blue-dream", "Blue Dream", "Flower", "AAA", 240, 12],
    ["cloud-nine-gummies", "Cloud Nine Gummies", "Edibles", null, 120, 30],
    ["sky-line-prerolls", "Sky Line Pre-Rolls", "Pre-Rolls", "AA", 90, 48],
    ["high-tide-hash", "High Tide Hash", "Concentrates", "AAA", 380, 6],
    ["daybreak-vape", "Daybreak Vape Cart", "Vapes", null, 310, 15],
    ["low-key-tincture", "Low Key Tincture", "Tinctures", null, 260, 9],
    ["altocumulus-og", "Altocumulus OG", "Flower", "AA", 210, 21],
    ["nimbus-brownie", "Nimbus Brownie", "Edibles", null, 75, 40],
  ]

  return items.map(([slug, name, productType, grade, price, availableQuantity]) => ({
    id: `preview-${slug}`,
    slug,
    name,
    productType,
    grade,
    description: null,
    imageUrl: null,
    price,
    availableQuantity,
    storeId: null,
  }))
}
