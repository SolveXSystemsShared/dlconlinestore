import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { getMemberAccess } from "@/lib/member-access"
import { getCatalog } from "@/lib/catalog"
import type { CartLine } from "@/lib/types"

/**
 * The saved bag.
 *
 * Rows hold only a product and a quantity. Everything the customer sees —
 * name, price, what is left on the shelf — is resolved against the live
 * catalogue on read, so a bag left for a week cannot quote a stale price or
 * offer something that has since sold out. A line whose product is no longer
 * sellable is dropped from the response and reported in `removed`, so the page
 * can say what happened instead of the item vanishing silently.
 */
async function readCart(memberId: string): Promise<{ lines: CartLine[]; removed: number }> {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from("online_cart_items")
    .select("online_product_id, quantity")
    .eq("member_id", memberId)
    .order("created_at")
  if (error) throw new Error(error.message)

  const rows = data || []
  if (!rows.length) return { lines: [], removed: 0 }

  const catalog = await getCatalog()
  const byId = new Map(catalog.map((product) => [product.id, product]))
  const lines: CartLine[] = []
  const stale: string[] = []

  for (const row of rows) {
    const product = byId.get(row.online_product_id)
    if (!product) { stale.push(row.online_product_id); continue }
    // Never offer more than the shelf currently holds.
    const quantity = Math.max(1, Math.min(Number(row.quantity), product.availableQuantity))
    lines.push({ ...product, quantity })
  }

  if (stale.length) {
    await supabase.from("online_cart_items").delete().eq("member_id", memberId).in("online_product_id", stale)
  }
  return { lines, removed: stale.length }
}

export async function GET() {
  const access = await getMemberAccess()
  if (!access.ageConfirmed || !access.memberId) return NextResponse.json({ error: "Member access required" }, { status: 401 })
  try {
    return NextResponse.json(await readCart(access.memberId))
  } catch (error) {
    console.error("Cart load error", error)
    return NextResponse.json({ error: "Could not load your bag" }, { status: 500 })
  }
}

const input = z.object({
  productId: z.string().uuid(),
  // Absolute, not a delta: the page owns the number in the stepper and says
  // what it should be, so a dropped response cannot double an order.
  quantity: z.number().min(0).max(100),
})

export async function POST(request: NextRequest) {
  const access = await getMemberAccess()
  if (!access.ageConfirmed || !access.memberId) return NextResponse.json({ error: "Member access required" }, { status: 401 })
  try {
    const parsed = input.safeParse(await request.json())
    if (!parsed.success) return NextResponse.json({ error: "Please provide a valid product and quantity" }, { status: 400 })
    const { productId, quantity } = parsed.data
    const supabase = getSupabaseAdmin()

    if (quantity <= 0) {
      await supabase.from("online_cart_items").delete().eq("member_id", access.memberId).eq("online_product_id", productId)
      return NextResponse.json(await readCart(access.memberId))
    }

    const catalog = await getCatalog()
    const product = catalog.find((item) => item.id === productId)
    if (!product) return NextResponse.json({ error: "That product is no longer available" }, { status: 409 })

    const capped = Math.min(quantity, product.availableQuantity)
    const { error } = await supabase
      .from("online_cart_items")
      .upsert(
        { member_id: access.memberId, online_product_id: productId, quantity: capped, updated_at: new Date().toISOString() },
        { onConflict: "member_id,online_product_id" },
      )
    if (error) throw error
    return NextResponse.json(await readCart(access.memberId))
  } catch (error) {
    console.error("Cart update error", error)
    return NextResponse.json({ error: "Could not update your bag" }, { status: 500 })
  }
}

export async function DELETE() {
  const access = await getMemberAccess()
  if (!access.ageConfirmed || !access.memberId) return NextResponse.json({ error: "Member access required" }, { status: 401 })
  const { error } = await getSupabaseAdmin().from("online_cart_items").delete().eq("member_id", access.memberId)
  if (error) {
    console.error("Cart clear error", error)
    return NextResponse.json({ error: "Could not empty your bag" }, { status: 500 })
  }
  return NextResponse.json({ lines: [], removed: 0 })
}
