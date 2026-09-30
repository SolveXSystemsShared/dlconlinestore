import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { getMemberAccess } from "@/lib/member-access"

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
  const { data: order } = await supabase.from("online_orders").select("id").eq("id", id).eq("member_id", access.memberId).maybeSingle()
  if (!order) return NextResponse.json({ error: "Exchange request not found" }, { status: 404 })
  const { error } = await supabase.rpc("cancel_online_order", { p_order_id: id, p_reason: "Cancelled by customer" })
  if (error) return NextResponse.json({ error: error.message }, { status: 409 })
  return NextResponse.json({ ok: true, status: "cancelled" })
}
