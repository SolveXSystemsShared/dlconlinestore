import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { normalizeMemberId } from "@/lib/format"
import { getMemberAccess } from "@/lib/member-access"
import { lookupMember } from "@/lib/members"

const input = z.object({
  memberId: z.string().min(4).max(40),
  phone: z.string().min(7).max(30),
  deliveryAddress: z.string().min(3).max(500),
  customerNotes: z.string().max(1000).optional().default(""),
  items: z.array(z.object({ productId: z.string().uuid(), quantity: z.number().positive().max(100) })).min(1).max(50),
})

/**
 * The member's own order history.
 *
 * Scoped to the verified member from the signed cookie rather than anything the
 * caller sends, so one member can never read another's orders.
 */
export async function GET() {
  const access = await getMemberAccess()
  if (!access.ageConfirmed || !access.memberId) return NextResponse.json({ error: "Registered DLC member access is required" }, { status: 401 })
  const { data, error } = await getSupabaseAdmin()
    .from("online_orders")
    .select("id, order_number, status, subtotal, delivery_fee, total, created_at, online_order_items(quantity)")
    .eq("member_id", access.memberId)
    .order("created_at", { ascending: false })
    .limit(100)
  if (error) {
    console.error("Order history error", error)
    return NextResponse.json({ error: "Could not load your orders" }, { status: 500 })
  }
  return NextResponse.json({
    orders: (data || []).map((order) => ({
      id: order.id,
      orderNumber: order.order_number,
      status: order.status,
      total: Number(order.total),
      createdAt: order.created_at,
      itemCount: (order.online_order_items || []).reduce((sum: number, line: { quantity: number }) => sum + Number(line.quantity), 0),
    })),
  })
}

export async function POST(request: NextRequest) {
  try {
    const access = await getMemberAccess()
    if (!access.ageConfirmed || !access.memberId) return NextResponse.json({ error: "Registered DLC member access is required" }, { status: 401 })
    const parsed = input.safeParse(await request.json())
    if (!parsed.success) return NextResponse.json({ error: "Please provide valid member, contact, and order details" }, { status: 400 })
    const body = parsed.data
    const supabase = getSupabaseAdmin()
    const memberId = normalizeMemberId(body.memberId)
    if (access.memberId !== memberId) return NextResponse.json({ error: "This Member ID is not the verified store member" }, { status: 403 })

    // Same lookup the gate uses, so "active" means the same thing here as it
    // does at the door — matching is case-insensitive and reads whichever
    // column MEMBER_ID_COLUMN points at.
    const member = await lookupMember(memberId)
    if (!member.found || member.verdict !== "active") return NextResponse.json({ error: "Active DLC member not found" }, { status: 404 })

    const ids = body.items.map((item) => item.productId)
    const { data: products, error: productError } = await supabase.from("online_products").select("id, display_name, product_type, strain_name, grade, price_override, is_published").in("id", ids).eq("is_published", true)
    if (productError) throw productError
    if (!products || products.length !== new Set(ids).size) return NextResponse.json({ error: "One or more products are no longer available" }, { status: 409 })

    const productById = new Map(products.map((product) => [product.id, product]))
    const lines = await Promise.all(body.items.map(async (item) => {
      const product = productById.get(item.productId)!
      let unitPrice = Number(product.price_override || 0)
      if (unitPrice <= 0) {
        let inventoryQuery = supabase.from("inventory_items").select("online_price, exchange_price").eq("product_type", product.product_type).ilike("strain_name", product.strain_name.trim()).eq("is_archived", false).gt("quantity", 0).limit(1)
        if (product.grade) inventoryQuery = inventoryQuery.eq("grade", product.grade)
        if (process.env.DEFAULT_STORE_ID) inventoryQuery = inventoryQuery.or(`store_id.eq.${process.env.DEFAULT_STORE_ID},store_id.is.null`)
        const { data: inventory, error: inventoryError } = await inventoryQuery
        if (inventoryError) throw inventoryError
        unitPrice = Number(inventory?.[0]?.online_price ?? inventory?.[0]?.exchange_price ?? 0)
      }
      return { ...item, product, unitPrice }
    }))

    // Price is resolved again by the database reservation function from the
    // selected online product and live inventory before stock is held.
    const subtotal = lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0)
    if (subtotal <= 0) return NextResponse.json({ error: "The selected products have no valid online price" }, { status: 400 })

    const { data: order, error: orderError } = await supabase.from("online_orders").insert({
      member_id: member.memberId,
      member_name: member.name,
      customer_phone: body.phone,
      delivery_address: body.deliveryAddress,
      customer_notes: body.customerNotes,
      fulfillment_store_id: process.env.DEFAULT_STORE_ID || null,
      channel: "web",
      subtotal,
      delivery_fee: 0,
      total: subtotal,
      status: "draft",
    }).select("id, order_number, status, subtotal, delivery_fee, total, member_name").single()
    if (orderError || !order) throw orderError || new Error("Order could not be created")

    const { error: lineError } = await supabase.from("online_order_items").insert(lines.map((line) => ({
      order_id: order.id,
      online_product_id: line.product.id,
      product_type: line.product.product_type,
      strain_name: line.product.strain_name,
      grade: line.product.grade,
      quantity: line.quantity,
      unit_price: line.unitPrice,
      line_total: line.unitPrice * line.quantity,
    })))
    if (lineError) {
      await supabase.from("online_orders").update({ status: "cancelled", cancellation_reason: "Order line creation failed" }).eq("id", order.id)
      throw lineError
    }

    const { error: reserveError } = await supabase.rpc("reserve_online_order", { p_order_id: order.id })
    if (reserveError) {
      await supabase.from("online_orders").update({ status: "cancelled", cancellation_reason: reserveError.message }).eq("id", order.id)
      return NextResponse.json({ error: reserveError.message.replace(/^ERROR:\s*/i, "") }, { status: 409 })
    }

    return NextResponse.json({ order: { ...order, status: "pending_payment" } }, { status: 201 })
  } catch (error) {
    console.error("Order creation error", error)
    return NextResponse.json({ error: "Could not place your order" }, { status: 500 })
  }
}
