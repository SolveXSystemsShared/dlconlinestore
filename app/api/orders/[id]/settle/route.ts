import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { getMemberAccess } from "@/lib/member-access"
import { CdashError } from "@/lib/cdash"
import { PaystackError } from "@/lib/paystack"
import { receiptEmailFor } from "@/lib/receipt-email"
import { SettlementError, completeSettlement, settlementReturnUrl, startSettlement } from "@/lib/settlement"

const input = z.discriminatedUnion("action", [
  // Open a (new) Paystack checkout for this request.
  z.object({ action: z.literal("start") }),
  // The member is back from Paystack with this reference.
  z.object({ action: z.literal("confirm"), reference: z.string().min(6).max(100) }),
])

/**
 * Settling one of the member's own exchange requests by card.
 *
 * Scoped to the verified member from the signed cookie, like every order route,
 * and a `confirm` only finishes a reference that belongs to this request — so
 * one member can neither start nor finish settlement on another's.
 */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  const access = await getMemberAccess()
  if (!access.ageConfirmed || !access.memberId) return NextResponse.json({ error: "Registered DLC member access is required" }, { status: 401 })
  const parsed = input.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Unsupported settlement request" }, { status: 400 })

  const supabase = getSupabaseAdmin()
  const { data: order } = await supabase
    .from("online_orders")
    .select("id, order_number, exchange_id, member_id, status")
    .eq("id", id)
    .eq("member_id", access.memberId)
    .maybeSingle()
  if (!order) return NextResponse.json({ error: "Exchange request not found" }, { status: 404 })

  try {
    if (parsed.data.action === "start") {
      const started = await startSettlement(order, { email: await receiptEmailFor(order.member_id), callbackUrl: settlementReturnUrl(request.url, order.id) })
      return NextResponse.json({ authorizationUrl: started.authorizationUrl, amountDue: started.amountDue })
    }

    const { data: attempt } = await supabase.from("online_payment_attempts").select("reference").eq("reference", parsed.data.reference).eq("order_id", order.id).maybeSingle()
    if (!attempt) return NextResponse.json({ error: "Settlement not found for this exchange request" }, { status: 404 })
    return NextResponse.json(await completeSettlement(attempt.reference))
  } catch (error) {
    if (error instanceof SettlementError) return NextResponse.json({ error: error.message }, { status: error.status })
    if (error instanceof CdashError || error instanceof PaystackError) {
      console.error("Settlement call failed", id, error.status, error.message)
      const message = parsed.data.action === "start"
        ? "We could not open settlement just now. Please try again in a moment."
        : "Settlement is taking longer than usual. If your card was charged, it will complete on its own. Refresh this page in a minute."
      return NextResponse.json({ error: message }, { status: 503 })
    }
    console.error("Settlement error", id, error)
    return NextResponse.json({ error: "Settlement could not be completed just now. Please try again." }, { status: 500 })
  }
}
