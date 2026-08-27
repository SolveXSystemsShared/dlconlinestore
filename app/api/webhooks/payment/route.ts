import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin"

/**
 * Provider-neutral payment seam. A Yoco/other gateway adapter should verify
 * the provider signature first, then call this endpoint with the order ID.
 */
export async function POST(request: NextRequest) {
  const expected = process.env.PAYMENT_WEBHOOK_SECRET
  const received = request.headers.get("x-dlc-payment-secret")
  if (!expected || received !== expected) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await request.json() as { orderId?: string; paymentReference?: string; paymentDetails?: unknown }
  if (!body.orderId) return NextResponse.json({ error: "orderId is required" }, { status: 400 })
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase.rpc("finalize_online_order", {
    p_order_id: body.orderId,
    p_payment_reference: body.paymentReference || null,
    p_payment_details: body.paymentDetails || [],
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 409 })
  return NextResponse.json({ order: data })
}
