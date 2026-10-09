import { receiptEmailFor } from "@/lib/receipt-email"
import { CLOCKED_IN_MESSAGE, isStaffClockedIn } from "@/lib/staff-shift"
import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { normalizeMemberId } from "@/lib/format"
import { getMemberAccess } from "@/lib/member-access"
import { lookupMember } from "@/lib/members"
import { collectionRecord, getCollectionPoint, getFulfillmentStoreId } from "@/lib/store-settings"
import { CdashError, createOnlineOrder, fetchQuote } from "@/lib/cdash"
import { resolveOrderLines } from "@/lib/order-lines"
import { PaystackError } from "@/lib/paystack"
import { SettlementError, settlementReturnUrl, startSettlement } from "@/lib/settlement"
import { AcceptanceNotRecorded, acceptanceInput, linkAcceptance, recordAcceptance, staleTermsMessage } from "@/lib/acceptance"

const input = z.object({
  memberId: z.string().min(4).max(40),
  phone: z.string().min(7).max(30),
  customerNotes: z.string().max(1000).optional().default(""),
  items: z.array(z.object({ productId: z.string().uuid(), quantity: z.number().positive().max(100) })).min(1).max(50),
  ...acceptanceInput,
})

const PERIOD_MONTHS = { "3m": 3, "6m": 6, "12m": 12 } as const
const historyQuery = z.object({
  period: z.enum(["3m", "6m", "12m", "all", "custom"]).default("3m"),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
})

/** Start of a calendar day in South Africa (UTC+2, no daylight saving). */
const saDayStart = (day: string) => new Date(`${day}T00:00:00+02:00`)

/**
 * The member's own exchange history, for a period (default: last 3 months).
 *
 * Scoped to the verified member from the signed cookie — never to anything the
 * caller sends — so one member can never read another's history. Returns only
 * what the history screen shows: number, date, status and the items requested.
 * No credits, totals, addresses or phone numbers leave the server here.
 */
export async function GET(request: NextRequest) {
  const access = await getMemberAccess()
  if (!access.ageConfirmed || !access.memberId) return NextResponse.json({ error: "Registered DLC member access is required" }, { status: 401 })

  const params = Object.fromEntries(new URL(request.url).searchParams)
  const parsed = historyQuery.safeParse(params)
  if (!parsed.success) return NextResponse.json({ error: "Choose a valid period" }, { status: 400 })
  const { period, from, to } = parsed.data

  let since: Date | null = null
  let until: Date | null = null
  if (period === "custom") {
    if (!from || !to) return NextResponse.json({ error: "Choose a start and end date" }, { status: 400 })
    since = saDayStart(from)
    until = new Date(saDayStart(to).getTime() + 24 * 60 * 60 * 1000)
    if (Number.isNaN(since.getTime()) || Number.isNaN(until.getTime()) || since >= until) {
      return NextResponse.json({ error: "The start date must be before the end date" }, { status: 400 })
    }
  } else if (period !== "all") {
    since = new Date()
    since.setMonth(since.getMonth() - PERIOD_MONTHS[period])
  }

  let query = getSupabaseAdmin()
    .from("online_orders")
    .select("id, order_number, status, created_at, online_order_items(product_type, strain_name, grade, quantity)")
    .eq("member_id", access.memberId)
    .order("created_at", { ascending: false })
    .limit(200)
  if (since) query = query.gte("created_at", since.toISOString())
  if (until) query = query.lt("created_at", until.toISOString())

  const { data, error } = await query
  if (error) {
    console.error("Exchange history error", error)
    return NextResponse.json({ error: "Could not load your exchanges" }, { status: 500 })
  }
  type Line = { product_type: string; strain_name: string; grade: string | null; quantity: number }
  return NextResponse.json({
    period,
    orders: (data || []).map((order) => {
      const lines = (order.online_order_items || []) as Line[]
      return {
        id: order.id,
        orderNumber: order.order_number,
        status: order.status,
        createdAt: order.created_at,
        itemCount: lines.reduce((sum, line) => sum + Number(line.quantity), 0),
        items: lines.map((line) => ({ name: line.strain_name, type: line.product_type, grade: line.grade, quantity: Number(line.quantity) })),
      }
    }),
  })
}

/**
 * Places an order and opens its card settlement.
 *
 * The store does not price, settle or move stock. It asks CDASH what the
 * basket costs, creates the order in CDASH — where it lands PENDING, with no
 * stock moved and nothing earned, because §7 step 4 earns on "the net amount
 * actually paid" and an unsettled order has no such amount — keeps its own row
 * as the COLLECTION record, and then opens a Paystack checkout for the amount
 * CDASH says the exchange owes on card. CDASH settles it once the payment is
 * confirmed (lib/settlement.ts).
 */
export async function POST(request: NextRequest) {
  try {
    const access = await getMemberAccess()
    if (!access.ageConfirmed || !access.memberId) return NextResponse.json({ error: "Registered DLC member access is required" }, { status: 401 })
    const parsed = input.safeParse(await request.json())
    if (!parsed.success) {
      const termsIssue = parsed.error.issues.find((issue) => issue.path[0] === "acceptedTerms")
      return NextResponse.json({ error: termsIssue?.message || "Please provide valid member, contact and exchange request details" }, { status: 400 })
    }
    const body = parsed.data
    const stale = staleTermsMessage(body.termsVersion)
    if (stale) return NextResponse.json({ error: stale, termsOutdated: true }, { status: 409 })
    const supabase = getSupabaseAdmin()
    const memberId = normalizeMemberId(body.memberId)
    if (access.memberId !== memberId) return NextResponse.json({ error: "This Member ID is not the verified store member" }, { status: 403 })

    // Same lookup the gate uses, so "active" means the same thing here as it
    // does at the door.
    const member = await lookupMember(memberId)
    if (!member.found || member.verdict !== "active") return NextResponse.json({ error: "Active DLC member not found" }, { status: 404 })

    // Staff shop online like any member, but not while they are on shift.
    if (await isStaffClockedIn(member.memberId)) return NextResponse.json({ error: CLOCKED_IN_MESSAGE, code: "staff_clocked_in" }, { status: 403 })

    const [storeId, collectionPoint] = await Promise.all([getFulfillmentStoreId(), getCollectionPoint()])
    // Online requests are collection only: the member books their own Uber to
    // the store. The note leads with that so staff in CDASH never go looking
    // for a delivery address.
    const collection = collectionRecord(collectionPoint)
    const resolved = await resolveOrderLines(body.items, storeId)
    if ("error" in resolved) return NextResponse.json({ error: resolved.error }, { status: resolved.status })
    const { lines } = resolved

    // No stock is reserved here any more, and that is deliberate. A hold in
    // online_inventory_reservations is invisible to CDASH, so the till sells the
    // same unit regardless — and nothing consumes those holds now that
    // finalize_online_order is gone, so they would leak until they expired. The
    // real guard is CDASH's own atomic deduction at settlement, which rejects
    // the order rather than overselling. See docs/cdash-boundary.md.

    // What it costs is CDASH's answer, not ours. The quote is still a preview —
    // it prices our catalogue — but it is the same waterfall the settlement
    // runs, so the figure the shopper sees is the figure they will be asked for.
    const quote = await fetchQuote({
      memberId: member.memberId,
      // DLC Credits are not spendable on an online settlement — CDASH settles
      // these at the card rate with no redemption — so none are quoted.
      dlcCreditsRequested: 0,
      lines: lines.map((line) => ({ type: line.productType, grade: line.grade, quantity: line.quantity, value: line.lineTotal })),
    })

    // Evidence first. If the acceptance cannot be written, nothing is sent to
    // CDASH — an exchange request must never exist without its record.
    const acceptanceId = await recordAcceptance(request, { context: "exchange_request", memberId: member.memberId })

    // The one write into CDASH. Prices are deliberately not sent: CDASH resolves
    // them itself, so a drifted catalogue fails the settlement rather than
    // charging the wrong amount.
    const exchange = await createOnlineOrder({
      memberId: member.memberId,
      products: lines.map((line) => ({ type: line.productType, name: line.strainName, quantity: line.quantity, grade: line.grade })),
      paymentNotes: [collection, body.customerNotes].filter(Boolean).join(" · "),
    })

    // Our row is the collection record from here on. The money figures are kept
    // for the confirmation screen and marked for what they are — a quote at our
    // catalogue prices — while exchange_id points at the record that is real.
    const { data: order, error: orderError } = await supabase.from("online_orders").insert({
      member_id: member.memberId,
      member_name: member.name,
      customer_phone: body.phone,
      // The column predates collection-only and is NOT NULL; it now says where
      // the member collects.
      delivery_address: collection,
      customer_notes: body.customerNotes,
      fulfillment_store_id: storeId,
      exchange_id: exchange.id,
      channel: "web",
      subtotal: quote.gross,
      delivery_fee: quote.card.deliveryFee,
      total: quote.card.amountDue,
      status: "pending_payment",
    }).select("id, order_number, status, subtotal, delivery_fee, total, member_name").single()

    await linkAcceptance(acceptanceId, { exchangeId: String(exchange.id), onlineOrderId: order?.id })

    if (orderError || !order) {
      // The CDASH order exists and is the record that matters, so this is a
      // broken collection record, not a lost sale. Name the exchange in the log:
      // staff can still settle it from their pending queue, and someone has to
      // be able to match it to the member when they arrive.
      console.error("Collection record could not be written for CDASH exchange", exchange.id, orderError)
      return NextResponse.json({ error: "Your exchange request reached DLC but its collection details could not be saved. Please contact the team before sending another request." }, { status: 500 })
    }

    const { error: lineError } = await supabase.from("online_order_items").insert(lines.map((line) => ({
      order_id: order.id,
      online_product_id: line.productId,
      product_type: line.productType,
      strain_name: line.strainName,
      grade: line.grade,
      quantity: line.quantity,
      unit_price: line.unitPrice,
      line_total: line.lineTotal,
    })))
    // The manifest is a convenience for the collection screen; CDASH holds the
    // authoritative line items on the exchange. Losing it must not fail an
    // order that CDASH has already accepted.
    if (lineError) console.error("Collection manifest could not be written for order", order.id, lineError)

    // Every request is settled by card before the team prepares it. If the
    // checkout cannot be opened now, the request still exists and its page
    // offers settlement again — nothing is lost by failing here.
    let settlement: { authorizationUrl: string; amountDue: number } | null = null
    try {
      settlement = await startSettlement({ ...order, exchange_id: String(exchange.id), member_id: member.memberId }, { email: await receiptEmailFor(member.memberId), callbackUrl: settlementReturnUrl(request.url, order.id) })
    } catch (error) {
      if (!(error instanceof SettlementError || error instanceof PaystackError || error instanceof CdashError)) throw error
      console.error("Settlement could not be opened for order", order.id, error.message)
    }

    return NextResponse.json({
      order: { ...order, exchangeId: exchange.id },
      settlement,
    }, { status: 201 })
  } catch (error) {
    if (error instanceof AcceptanceNotRecorded) {
      return NextResponse.json({ error: "We could not record your acceptance of the terms, so your request was not sent. Please try again shortly." }, { status: 503 })
    }
    if (error instanceof CdashError) {
      console.error("CDASH refused the order", error.status, error.message)
      // A refusal (4xx) is CDASH telling the member why, so it is passed on; a
      // CDASH fault (5xx) may carry internals, so the member gets a plain line.
      if (error.status >= 500) return NextResponse.json({ error: "Could not send your exchange request just now. Please try again shortly." }, { status: 502 })
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error("Order creation error", error)
    return NextResponse.json({ error: "Could not send your exchange request" }, { status: 500 })
  }
}
