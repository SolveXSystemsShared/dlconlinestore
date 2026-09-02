import { getSupabaseAdmin } from "./supabase-admin"
import type { CatalogProduct } from "./types"

type CatalogRow = {
  id: string
  slug: string
  display_name: string
  product_type: string
  strain_name: string
  grade: string | null
  description: string | null
  image_url: string | null
  price_override: number | null
  store_id: string | null
}

type InventoryRow = {
  id: string
  product_type: string
  strain_name: string
  grade: string | null
  quantity: number | null
  online_price: number | null
  exchange_price: number | null
  store_id: string | null
  date_received: string | null
}

// PostgREST caps an unbounded select at 1000 rows. Ask for more than the shelf
// can hold so a growing catalogue is never silently truncated.
const INVENTORY_PAGE_SIZE = 5000

/** Case- and whitespace-insensitive, matching how CDASH rows are typed by hand. */
function strainKey(productType: string, strainName: string) {
  return `${productType.trim().toLowerCase()}|${strainName.trim().toLowerCase()}`
}

/** Same folding for grade, so "Indoor " on a stock row still matches "Indoor". */
function gradeKey(grade: string | null) {
  return (grade || "").trim().toLowerCase()
}

export async function getCatalog(storeId = process.env.DEFAULT_STORE_ID || null): Promise<CatalogProduct[]> {
  const supabase = getSupabaseAdmin()

  let productQuery = supabase.from("online_products").select("*").eq("is_published", true).order("sort_order").order("display_name")
  if (storeId) productQuery = productQuery.or(`store_id.eq.${storeId},store_id.is.null`)

  // online_sellable_inventory is the single definition of what may be sold: on
  // the shelf, in stock, not archived. reserve_online_order reads the same
  // view, so the catalogue can never advertise something checkout will refuse.
  let inventoryQuery = supabase
    .from("online_sellable_inventory")
    .select("id, product_type, strain_name, grade, quantity, online_price, exchange_price, store_id, date_received")
    .limit(INVENTORY_PAGE_SIZE)
  if (storeId) inventoryQuery = inventoryQuery.or(`store_id.eq.${storeId},store_id.is.null`)

  // Every product used to cost its own inventory and reservation round trip,
  // which is hundreds of sequential queries once the shelf is fully published.
  // Fetch each set once and match them up in memory instead.
  const [products, inventory, reservations] = await Promise.all([
    productQuery.then(({ data, error }) => { if (error) throw new Error(error.message); return (data || []) as CatalogRow[] }),
    inventoryQuery.then(({ data, error }) => { if (error) throw new Error(error.message); return (data || []) as InventoryRow[] }),
    supabase
      .from("online_inventory_reservations")
      .select("inventory_item_id, quantity")
      .eq("status", "active")
      .gt("expires_at", new Date().toISOString())
      .limit(INVENTORY_PAGE_SIZE)
      .then(({ data, error }) => { if (error) throw new Error(error.message); return data || [] }),
  ])

  const heldByInventoryId = new Map<string, number>()
  for (const reservation of reservations) {
    heldByInventoryId.set(reservation.inventory_item_id, (heldByInventoryId.get(reservation.inventory_item_id) || 0) + Number(reservation.quantity || 0))
  }

  const inventoryByStrain = new Map<string, InventoryRow[]>()
  for (const row of inventory) {
    const key = strainKey(row.product_type, row.strain_name || "")
    const bucket = inventoryByStrain.get(key)
    if (bucket) bucket.push(row)
    else inventoryByStrain.set(key, [row])
  }
  // Oldest stock first, so the price shown is the price checkout will draw from.
  for (const bucket of inventoryByStrain.values()) {
    bucket.sort((a, b) => (a.date_received || "").localeCompare(b.date_received || ""))
  }

  const result: CatalogProduct[] = []

  for (const product of products) {
    const candidates = inventoryByStrain.get(strainKey(product.product_type, product.strain_name)) || []
    // A product with no grade is a catch-all across grades — the same rule the
    // per-product query used before this was batched.
    const wanted = gradeKey(product.grade)
    const matches = wanted ? candidates.filter((row) => gradeKey(row.grade) === wanted) : candidates
    if (!matches.length) continue

    const availableQuantity = matches.reduce(
      (total, row) => total + Math.max(Number(row.quantity || 0) - (heldByInventoryId.get(row.id) || 0), 0),
      0,
    )
    if (availableQuantity <= 0) continue

    const price = product.price_override ?? Number(matches[0]?.online_price ?? matches[0]?.exchange_price ?? 0)
    if (price <= 0) continue

    result.push({
      id: product.id,
      slug: product.slug,
      name: product.display_name,
      productType: product.product_type,
      grade: product.grade,
      description: product.description,
      imageUrl: product.image_url,
      price,
      availableQuantity,
      storeId: product.store_id,
    })
  }

  return result
}
