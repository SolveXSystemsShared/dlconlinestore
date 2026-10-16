import { getSupabaseAdmin } from "./supabase-admin"

/**
 * Is there enough stock for this request, by the same rule CDASH settles with?
 *
 * CDASH deducts stock only at settlement, after the card is charged, so without
 * this a sold-out item is found out after the money is taken and has to go back.
 * Reading stock is inside the boundary (docs/cdash-boundary.md): we read the
 * shared inventory and write nothing.
 *
 * The rule mirrors CDASH's deductInventory (backend/lib/inventory-ops.ts) so a
 * request that passes here is one CDASH can fill: same product type, exact
 * strain name ignoring case and outer spaces, grade when there is one, not
 * archived, in stock, the fulfilment store's rows plus store-less ones, and on
 * the shelf unless the product type is one CDASH treats as shelf-ready.
 *
 * This is a check, not a hold. Two members can still pass it for the last unit;
 * whoever settles second is refused by CDASH and their card is returned
 * automatically. Keep SHELF_READY_TYPES in step with CDASH.
 */
const SHELF_READY_TYPES = new Set([
  "Drinks", "Rolling Papers", "Accessories", "Vapes", "Dab", "Dab Hits",
  "Concentrates", "Shooters", "Moonsticks", "Moonstick", "Pre-rolls", "Pre-roll", "Free Mini J's", "Edibles", "Edible",
])

export type StockLine = { productType: string; strainName: string; grade: string | null; quantity: number; displayName?: string }
export type Shortage = { name: string; requested: number; available: number }

const fold = (value: string | null | undefined) => (value ?? "").trim().toLowerCase()

export async function findShortages(lines: StockLine[], storeId: string | null): Promise<Shortage[]> {
  // The same product on two lines draws on the same stock.
  const wanted = new Map<string, StockLine>()
  for (const line of lines) {
    const key = [line.productType, fold(line.strainName), line.grade || ""].join("|")
    const existing = wanted.get(key)
    wanted.set(key, existing ? { ...existing, quantity: existing.quantity + line.quantity } : { ...line })
  }

  const supabase = getSupabaseAdmin()
  const shortages = await Promise.all([...wanted.values()].map(async (line): Promise<Shortage | null> => {
    const escaped = line.strainName.trim().replace(/[\\%_]/g, (c) => "\\" + c)
    let query = supabase
      .from("inventory_items")
      .select("quantity, strain_name")
      .ilike("strain_name", `%${escaped}%`)
      .eq("product_type", line.productType)
      .eq("is_archived", false)
      .gt("quantity", 0)
    if (!SHELF_READY_TYPES.has(line.productType)) query = query.eq("stock_status", "shelf_stock")
    if (storeId) query = query.or(`store_id.eq.${storeId},store_id.is.null`)
    if (line.grade) query = query.eq("grade", line.grade)
    const { data, error } = await query
    if (error) throw error
    const available = (data || [])
      .filter((row) => fold(row.strain_name) === fold(line.strainName))
      .reduce((sum, row) => sum + (Number(row.quantity) || 0), 0)
    return available >= line.quantity ? null : { name: line.displayName || line.strainName, requested: line.quantity, available: Math.max(0, Math.floor(available)) }
  }))
  return shortages.filter((shortage): shortage is Shortage => shortage !== null)
}

/** What the member reads when part of their bag has run out. */
export function shortageMessage(shortages: Shortage[]) {
  const parts = shortages.map((s) => s.available > 0 ? `${s.name} (only ${s.available} left)` : `${s.name} (out of stock)`)
  return `Some of your bag is no longer available: ${parts.join(", ")}. Please update your bag and try again.`
}
