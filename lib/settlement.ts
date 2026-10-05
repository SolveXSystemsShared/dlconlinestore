import { randomBytes } from "crypto"
import { getSupabaseAdmin } from "./supabase-admin"
import { CdashError, cancelExchange, fetchSettleQuote, settleExchange } from "./cdash"
import { PaystackError, initializeTransaction, refundTransaction, toCents, verifyTransaction } from "./paystack"

/**
 * Settling an exchange request online, through Paystack.
 *
 * Every online exchange request is settled by card before the team prepares
 * it. The store never decides what is owed and never marks anything settled
 * itself:
 *
 *   1. start     CDASH says what the exchange owes on card (binding); the store
 *                opens a Paystack checkout for exactly that.
 *   2. complete  When Paystack reports the payment — webhook or the member's
 *                return, whichever lands first, both are safe — the store checks
 *                it with Paystack and asks CDASH to settle. CDASH checks it with
 *                Paystack AGAIN, then deducts stock and awards the rewards.
 *   3. refund    If CDASH refuses for a reason that can never come right (stock
 *                gone, order already resolved, the amount moved), the money goes
 *                straight back to the card. A CDASH or Paystack outage is NOT a
 *                refusal: the attempt stays `paid` and the webhook retry, or the
 *                member reloading the page, finishes it.
 */

/** CDASH refusals that mean this payment can never settle this exchange. */
const SETTLEMENT_REFUSALS = new Set(["already_resolved", "insufficient_stock", "payment_invalid", "not_found"])

export class SettlementError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
    this.name = "SettlementError"
  }
}

type OrderForSettlement = { id: string; order_number: string; exchange_id: string | null; member_id: string; status: string }

/**
 * Opens a Paystack checkout for the exchange's binding card amount.
 * Each call is a new attempt with its own reference — Paystack refuses to reuse
 * one — so a member who abandons a checkout can simply start again.
 */
export async function startSettlement(order: OrderForSettlement, input: { email: string; callbackUrl: string }) {
  if (order.status !== "pending_payment") throw new SettlementError("This exchange request is not awaiting settlement.", 409)
  if (!order.exchange_id) throw new SettlementError("This exchange request has not reached the DLC team. Please contact them.", 409)

  const quote = await fetchSettleQuote(order.exchange_id)
  const amountCents = toCents(quote.amountDue)
  if (amountCents <= 0) throw new SettlementError("There is nothing to settle on this exchange request.", 409)

  const reference = `${order.order_number}-${randomBytes(4).toString("hex")}`.replace(/[^A-Za-z0-9.=-]/g, "")

  // Recorded before Paystack hears of it, so a payment can never arrive for a
  // reference we have no row for.
  const supabase = getSupabaseAdmin()
  const { error: insertError } = await supabase.from("online_payment_attempts").insert({
    reference,
    order_id: order.id,
    exchange_id: order.exchange_id,
    member_id: order.member_id,
    amount_cents: amountCents,
  })
  if (insertError) {
    console.error("Payment attempt could not be recorded", order.id, insertError)
    throw new SettlementError("We could not open settlement just now. Please try again.", 503)
  }

  const checkout = await initializeTransaction({
    email: input.email,
    amountCents,
    reference,
    callbackUrl: input.callbackUrl,
    metadata: { exchange_id: order.exchange_id, online_order_id: order.id, member_id: order.member_id, order_number: order.order_number },
  })

  // Keep the member-facing total in step with what is being collected.
  await supabase.from("online_orders").update({ total: quote.amountDue, delivery_fee: quote.deliveryFee }).eq("id", order.id)

  return { authorizationUrl: checkout.authorization_url, reference, amountDue: quote.amountDue }
}

export type SettlementOutcome =
  | { outcome: "settled"; orderId: string }
  | { outcome: "not_paid"; orderId: string; paystackStatus: string }
  | { outcome: "refunded"; orderId: string; reason: string }
  | { outcome: "unknown" }

/**
 * Finishes an attempt. Idempotent and safe to run concurrently: the webhook and
 * the member's return routinely race, and CDASH treats a repeat settlement with
 * the same reference as success.
 *
 * Throws (PaystackError / CdashError / SettlementError) only for a TEMPORARY
 * failure, so the caller can ask to be retried.
 */
export async function completeSettlement(reference: string): Promise<SettlementOutcome> {
  const supabase = getSupabaseAdmin()
  const { data: attempt, error } = await supabase
    .from("online_payment_attempts")
    .select("reference, order_id, exchange_id, amount_cents, currency, status")
    .eq("reference", reference)
    .maybeSingle()
  if (error) throw new SettlementError("Payment attempt could not be read", 503)
  if (!attempt) return { outcome: "unknown" }

  const orderId = attempt.order_id as string
  if (attempt.status === "settled") return { outcome: "settled", orderId }
  if (attempt.status === "refunded" || attempt.status === "refunding") return { outcome: "refunded", orderId, reason: "Already returned" }

  const transaction = await verifyTransaction(reference)
  if (transaction.status !== "success") {
    // Still in progress, or abandoned/failed. Only a final failure is recorded;
    // "ongoing" and friends may yet succeed and fire the webhook.
    if (["failed", "abandoned", "reversed"].includes(transaction.status) && attempt.status === "initialized") {
      await supabase.from("online_payment_attempts").update({ status: "failed", paystack_status: transaction.status }).eq("reference", reference).eq("status", "initialized")
    }
    return { outcome: "not_paid", orderId, paystackStatus: transaction.status }
  }

  await supabase.from("online_payment_attempts")
    .update({ status: "paid", paystack_status: transaction.status, paid_at: transaction.paid_at || new Date().toISOString() })
    .eq("reference", reference)
    .in("status", ["initialized", "failed"])

  // Paystack collected something other than what this attempt asked for. CDASH
  // would refuse it too; return it now rather than make a round trip.
  if (transaction.amount !== attempt.amount_cents || String(transaction.currency).toUpperCase() !== "ZAR") {
    return refund(reference, orderId, attempt.exchange_id, "The amount collected did not match this exchange request.", { cancelOrder: false })
  }

  try {
    await settleExchange(attempt.exchange_id, reference)
  } catch (err) {
    if (err instanceof CdashError && err.code && SETTLEMENT_REFUSALS.has(err.code)) {
      // An amount that moved (tier changed between checkout and settlement)
      // leaves the request open so the member can settle again at the new
      // figure. Stock gone or the order already resolved closes it.
      return refund(reference, orderId, attempt.exchange_id, err.message, { cancelOrder: err.code !== "payment_invalid" })
    }
    const message = err instanceof Error ? err.message : String(err)
    await supabase.from("online_payment_attempts").update({ last_error: message }).eq("reference", reference)
    console.error("Paid but not yet settled — will retry", reference, message)
    throw err
  }

  const amount = attempt.amount_cents / 100
  await supabase.from("online_payment_attempts").update({ status: "settled", settled_at: new Date().toISOString(), last_error: null }).eq("reference", reference)
  const { error: orderError } = await supabase.from("online_orders").update({
    status: "paid",
    paid_at: transaction.paid_at || new Date().toISOString(),
    payment_reference: reference,
    payment_details: [{ provider: "paystack", method: "card", reference, amount }],
    total: amount,
  }).eq("id", orderId).eq("status", "pending_payment")
  // CDASH holds the settlement that matters; a stale collection record only
  // affects what the member's page says, and the next read retries nothing.
  if (orderError) console.error("Settled in CDASH but the collection record was not updated", orderId, reference, orderError)
  return { outcome: "settled", orderId }
}

async function refund(reference: string, orderId: string, exchangeId: string, reason: string, options: { cancelOrder: boolean }): Promise<SettlementOutcome> {
  const supabase = getSupabaseAdmin()
  // Claim the refund so the webhook and the return cannot both send one.
  const { data: claimed } = await supabase.from("online_payment_attempts")
    .update({ status: "refunding", last_error: reason })
    .eq("reference", reference)
    .in("status", ["initialized", "paid", "failed"])
    .select("reference")
    .maybeSingle()
  if (!claimed) return { outcome: "refunded", orderId, reason }

  try {
    await refundTransaction(reference, `DLC ${orderId}: ${reason}`)
  } catch (err) {
    // Hand the claim back so a retry sends it. Money taken with no outcome is
    // the one state that must never be left quietly.
    await supabase.from("online_payment_attempts").update({ status: "paid", last_error: `Refund failed: ${err instanceof Error ? err.message : err}` }).eq("reference", reference)
    console.error("REFUND FAILED — member was charged and the exchange was not settled", reference, err)
    throw err instanceof PaystackError ? err : new SettlementError("Refund failed", 503)
  }
  await supabase.from("online_payment_attempts").update({ status: "refunded", refunded_at: new Date().toISOString() }).eq("reference", reference)

  if (options.cancelOrder) {
    // Only an order still waiting is closed: if it was settled by another
    // payment (a second checkout that also went through), it stays settled.
    const { data: closed } = await supabase.from("online_orders")
      .update({ status: "cancelled", cancellation_reason: `Settlement refused: ${reason}` })
      .eq("id", orderId)
      .eq("status", "pending_payment")
      .select("id")
      .maybeSingle()
    if (closed) await cancelExchange(exchangeId).catch((err) => console.error("CDASH exchange left pending after refund", exchangeId, err))
  }
  return { outcome: "refunded", orderId, reason }
}

/**
 * Where Paystack sends the member back. Paystack appends ?reference=…, which the
 * exchange page uses to finish the settlement without waiting for the webhook.
 */
export function settlementReturnUrl(requestUrl: string, orderId: string) {
  const base = process.env.NEXT_PUBLIC_APP_URL?.trim() || new URL(requestUrl).origin
  return `${base.replace(/\/+$/, "")}/exchange/${orderId}`
}
