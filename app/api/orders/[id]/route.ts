import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { getMemberAccess } from "@/lib/member-access"
import { CdashError, cancelExchange } from "@/lib/cdash"

const actionInput = z.object({ action: z.literal("cancel") })

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  const access = await getMemberAccess()
  if (!access.ageConfirmed || !access.memberId) return NextResponse.json({ error: "Registered DLC member access is required" }, { status: 401 })
  const supabase = getSupabaseAdmin()
  const { data: order, error } = await supabase.from("online_orders").select("id, order_number, status, created_at, online_order_items(product_type, strain_name, grade, quantity)").eq("id", id).eq("member_id", access.memberId).maybeSingle()
  if (error) return NextResponse.json({ error: "Could not load this exchange request" }, { status: 500 })
  if (!order) return NextResponse.json({ error: "Exchange request not found" }, { status: 404 })
  return NextResponse.json({ order })
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  const access = await getMemberAccess()
  if (!access.ageConfirmed || !access.memberId) return NextResponse.json({ error: "Registered DLC member access is required" }, { status: 401 })
  const parsed = actionInput.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: "Unsupported exchange request action" }, { status: 400 })
  const supabase = getSupabaseAdmin()
  const { data: order } = await supabase.from("online_orders").select("id, status, exchange_id").eq("id", id).eq("member_id", access.memberId).maybeSingle()
  if (!order) return NextResponse.json({ error: "Exchange request not found" }, { status: 404 })
  if (order.status !== "pending_payment") return NextResponse.json({ error: "This exchange request is already settled. Please contact the DLC team to cancel it." }, { status: 409 })
  // Close it in CDASH first, so it leaves the team's pending queue. CDASH
  // refuses if a settlement got there first — then it is settled, not cancelled.
  if (order.exchange_id) {
    try {
      await cancelExchange(String(order.exchange_id))
    } catch (error) {
      if (error instanceof CdashError && error.code === "already_resolved") return NextResponse.json({ error: "This exchange request was just settled. Please contact the DLC team to cancel it." }, { status: 409 })
      if (!(error instanceof CdashError && error.code === "not_found")) {
        console.error("CDASH exchange could not be cancelled", order.exchange_id, error)
        return NextResponse.json({ error: "Could not cancel just now. Please try again." }, { status: 503 })
      }
    }
  }
  const { error } = await supabase.rpc("cancel_online_order", { p_order_id: id, p_reason: "Cancelled by customer" })
  if (error) {
    console.error("Exchange request cancel failed", id, error)
    return NextResponse.json({ error: "This exchange request can no longer be cancelled. Ask the team at the lounge if you need help." }, { status: 409 })
  }
  return NextResponse.json({ ok: true, status: "cancelled" })
}
