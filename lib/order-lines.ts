import { getSupabaseAdmin } from "./supabase-admin"

/**
 * Turns a cart into priced lines.
 *
 * Shared by the checkout quote and the order itself so the two cannot disagree
 * about what is in the basket or what our catalogue says it costs.
 *
 * These prices are OURS, and they are only ever an input. CDASH resolves prices
 * itself when the order settles; a line total here exists so the quote has
 * something to run the waterfall over, and so the delivery screen has a
 * manifest. It never determines what anyone is charged.
 */

export type OrderLine = {
  productId: string
  /** The CDASH inventory category, e.g. "Bud". */
  productType: string
  /** The strain name as CDASH knows it — what the exchange's product line is matched on. */
  strainName: string
  grade: string | null
  displayName: string
  quantity: number
  unitPrice: number
  lineTotal: number
}

export type ResolvedLines = { lines: OrderLine[] } | { error: string; status: number }

export async function resolveOrderLines(
  items: Array<{ productId: string; quantity: number }>,
  storeId: string | null,
): Promise<ResolvedLines> {
  const supabase = getSupabaseAdmin()
  const ids = items.map((item) => item.productId)

  const { data: products, error: productError } = await supabase
    .from("online_products")
    .select("id, display_name, product_type, strain_name, grade, price_override, is_published")
    .in("id", ids)
    .eq("is_published", true)
  if (productError) throw productError
  if (!products || products.length !== new Set(ids).size) {
    return { error: "One or more products are no longer available", status: 409 }
  }

  const productById = new Map(products.map((product) => [product.id, product]))
  const lines = await Promise.all(items.map(async (item) => {
    const product = productById.get(item.productId)!
    let unitPrice = Number(product.price_override || 0)
    if (unitPrice <= 0) {
      let inventoryQuery = supabase
        .from("inventory_items")
        .select("online_price, exchange_price")
        .eq("product_type", product.product_type)
        .ilike("strain_name", product.strain_name.trim())
        .eq("is_archived", false)
        .gt("quantity", 0)
        .limit(1)
      if (product.grade) inventoryQuery = inventoryQuery.eq("grade", product.grade)
      if (storeId) inventoryQuery = inventoryQuery.or(`store_id.eq.${storeId},store_id.is.null`)
      const { data: inventory, error: inventoryError } = await inventoryQuery
      if (inventoryError) throw inventoryError
      unitPrice = Number(inventory?.[0]?.online_price ?? inventory?.[0]?.exchange_price ?? 0)
    }
    return {
      productId: product.id,
      productType: product.product_type,
      strainName: product.strain_name,
      grade: product.grade,
      displayName: product.display_name,
      quantity: item.quantity,
      unitPrice,
      lineTotal: unitPrice * item.quantity,
    }
  }))

  // A basket that prices to nothing means the catalogue has drifted from
  // inventory. Quoting it would show a free order and then fail at settlement.
  if (lines.reduce((sum, line) => sum + line.lineTotal, 0) <= 0) {
    return { error: "The selected products have no valid credits listed", status: 400 }
  }

  return { lines }
}
