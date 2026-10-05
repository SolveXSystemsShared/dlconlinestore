import { getSupabaseAdmin } from "./supabase-admin"
import { getFulfillmentStoreId } from "./store-settings"

/**
 * In-store specials, read from CDASH's `specials` and `special_items`.
 *
 * They are run by the till, not the online bag: a bundle is rung up at the
 * counter, and a percentage special applies when the exchange is settled
 * there. So the page only shows them; nothing here can be added to a bag.
 *
 * Only active specials for the lounge's store (or every store) are shown.
 * `created_by` / `updated_by` are staff names and never leave the server.
 */
export type SpecialLine = { productType: string; grade: string | null; name: string | null; quantity: number; percentOff: number | null }

export type Special = {
  id: string
  name: string
  description: string | null
  kind: "bundle" | "single"
  /** Fixed credits for the whole special, or null when it is a percentage off. */
  credits: number | null
  percentOff: number | null
  cashOnly: boolean
  lines: SpecialLine[]
}

let cache: { at: number; storeId: string; value: Special[] } | null = null
const CACHE_MS = 60_000

export async function getSpecials(): Promise<Special[]> {
  // Goes into a PostgREST filter string, so only a plain id is accepted.
  const configured = await getFulfillmentStoreId()
  const storeId = configured && /^[\w-]+$/.test(configured) ? configured : null
  if (cache && cache.storeId === (storeId || "") && Date.now() - cache.at < CACHE_MS) return cache.value

  const supabase = getSupabaseAdmin()
  let query = supabase
    .from("specials")
    .select("id, name, description, special_type, price, pricing_mode, discount_percent, store_id, updated_at, special_items(product_type, grade, strain_name, quantity, discount_percent)")
    .eq("is_active", true)
    .order("updated_at", { ascending: false })
  query = storeId ? query.or(`store_id.is.null,store_id.eq.${storeId}`) : query.is("store_id", null)
  const { data, error } = await query
  if (error) throw new Error(error.message)

  const value: Special[] = (data || []).map((row) => {
    const lines: SpecialLine[] = (row.special_items || []).map((item: Record<string, any>) => ({
      productType: String(item.product_type || ""),
      grade: item.grade || null,
      // "__ANY__" is CDASH's wildcard: any strain of that type and grade.
      name: item.strain_name && item.strain_name !== "__ANY__" ? String(item.strain_name) : null,
      quantity: Math.max(1, Number(item.quantity) || 1),
      percentOff: item.discount_percent == null ? null : Number(item.discount_percent),
    }))
    const percentOff = row.discount_percent != null ? Number(row.discount_percent) : lines.find((l) => l.percentOff != null)?.percentOff ?? null
    const fixed = row.pricing_mode === "fixed" && Number(row.price) > 0
    const text = `${row.name} ${row.description || ""}`
    return {
      id: row.id,
      // The cash-only rule is written into the name today ("… (CASH ONLY)");
      // say it once, as a tag, instead of shouting it in the title.
      name: String(row.name).replace(/\s*\(cash only\)\s*/i, " ").trim(),
      description: row.description?.trim() || null,
      kind: row.special_type === "bundle" ? "bundle" : "single",
      credits: fixed ? Number(row.price) : null,
      percentOff: fixed ? null : percentOff,
      cashOnly: /cash only/i.test(text),
      lines,
    }
  })
  cache = { at: Date.now(), storeId: storeId || "", value }
  return value
}
