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

export async function getCatalog(storeId = process.env.DEFAULT_STORE_ID || null): Promise<CatalogProduct[]> {
  const supabase = getSupabaseAdmin()
  let query = supabase.from("online_products").select("*").eq("is_published", true).order("sort_order").order("display_name")
  if (storeId) query = query.or(`store_id.eq.${storeId},store_id.is.null`)

  const { data: rows, error } = await query
  if (error) throw new Error(error.message)

  const products = (rows || []) as CatalogRow[]
  const result: CatalogProduct[] = []

  for (const product of products) {
    let inventoryQuery = supabase
      .from("inventory_items")
      .select("id, quantity, online_price, exchange_price, store_id, date_received")
      .eq("product_type", product.product_type)
      .ilike("strain_name", product.strain_name.trim())
      .eq("is_archived", false)
      .gt("quantity", 0)

    if (product.grade) inventoryQuery = inventoryQuery.eq("grade", product.grade)
    if (storeId) inventoryQuery = inventoryQuery.or(`store_id.eq.${storeId},store_id.is.null`)

    const { data: inventory, error: inventoryError } = await inventoryQuery
    if (inventoryError) throw new Error(inventoryError.message)

    const rowsForProduct = inventory || []
    const inventoryIds = rowsForProduct.map((row) => row.id)
    const { data: reservations, error: reservationError } = inventoryIds.length
      ? await supabase.from("online_inventory_reservations").select("inventory_item_id, quantity").in("inventory_item_id", inventoryIds).eq("status", "active").gt("expires_at", new Date().toISOString())
      : { data: [], error: null }
    if (reservationError) throw new Error(reservationError.message)
    const heldByInventoryId = new Map<string, number>()
    for (const reservation of reservations || []) heldByInventoryId.set(reservation.inventory_item_id, (heldByInventoryId.get(reservation.inventory_item_id) || 0) + Number(reservation.quantity || 0))
    const availableQuantity = rowsForProduct.reduce((total, row) => total + Math.max(Number(row.quantity || 0) - (heldByInventoryId.get(row.id) || 0), 0), 0)
    if (availableQuantity <= 0) continue

    const price = product.price_override ?? Number(rowsForProduct[0]?.online_price ?? rowsForProduct[0]?.exchange_price ?? 0)
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
