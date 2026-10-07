import { NextRequest, NextResponse } from "next/server"
import { isPaystackSignature } from "@/lib/paystack"
import { completeSettlement } from "@/lib/settlement"

/**
 * Paystack's webhook — the reliable path to settlement.
 *
 * The member's return to /exchange/:id usually settles first, but a closed tab
 * or a dropped connection must not leave a paid request unsettled, so this
 * does the same thing. The body is only a hint: `completeSettlement` looks the
 * reference up with Paystack before anything moves, and CDASH checks again.
 *
 * Answers 200 once handled (or for events we ignore) and 5xx for a temporary
 * failure, so Paystack retries it.
 *
 * Point the Paystack dashboard's webhook URL at https://<store>/api/webhooks/paystack.
 */
export async function POST(request: NextRequest) {
  const raw = await request.text()
  let signed = false
  try {
    signed = isPaystackSignature(raw, request.headers.get("x-paystack-signature"))
  } catch (error) {
    console.error("Paystack webhook received but Paystack is not configured", error)
    return NextResponse.json({ error: "Not configured" }, { status: 503 })
  }
  if (!signed) return NextResponse.json({ error: "Invalid signature" }, { status: 401 })

  const event = JSON.parse(raw) as { event?: string; data?: { reference?: string } }
  if (event.event !== "charge.success" || !event.data?.reference) return NextResponse.json({ ok: true, ignored: event.event })

  try {
    const result = await completeSettlement(event.data.reference)
    return NextResponse.json({ ok: true, ...result })
  } catch (error) {
    console.error("Paystack webhook could not settle yet", event.data.reference, error)
    return NextResponse.json({ error: "Settlement pending, retry" }, { status: 503 })
  }
}
