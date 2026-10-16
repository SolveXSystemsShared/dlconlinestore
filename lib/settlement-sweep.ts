import { getSupabaseAdmin } from "./supabase-admin"
import { CdashError, cancelExchange } from "./cdash"
import { PaystackError, refundTransaction, verifyTransaction } from "./paystack"
import { completeSettlement } from "./settlement"
import { notifyStaff } from "./notify-staff"

/**
 * The settlement sweep: everything the webhook and the member's return can
 * leave unfinished, finished without a person.
 *
 *   1. Missed payments    A checkout still `initialized` after a few minutes is
 *                         looked up with Paystack. Paid → settled as usual (the
 *                         webhook may never have arrived, or the tab was closed).
 *   2. Stuck settlements  `paid` means the money is in and CDASH has not settled
 *                         yet, almost always an outage. Retried until CDASH
 *                         settles or refuses (then the card is returned).
 *   3. Stuck refunds      `refunding` means a refund was claimed and the process
 *                         stopped before it was confirmed. Paystack marks a
 *                         refunded transaction `reversed`; if it is not, the
 *                         refund is sent again.
 *   4. Unsettled requests A request not settled within UNSETTLED_AFTER_MS is
 *                         closed in CDASH and here, so it leaves the team's
 *                         pending queue. A payment that lands after that is
 *                         refused by CDASH and returned to the card.
 *
 * Only what is still stuck after ALERT_AFTER_MS of retries reaches the team,
 * once per attempt, through notifyStaff. That is the case a person has to look
 * at: Paystack refusing a refund, or CDASH down for an hour.
 *
 * Safe to run concurrently and as often as you like: every step goes through
 * the same guarded updates as the live path.
 */

const MINUTE = 60 * 1000
/** Give the webhook and the member's return a head start. */
const LOOKUP_AFTER_MS = 5 * MINUTE
/** A request not settled by then is closed. */
export const UNSETTLED_AFTER_MS = 2 * 60 * MINUTE
/** A checkout opened this recently is left alone, even on an old request. */
const RECENT_CHECKOUT_MS = 30 * MINUTE
/** Paystack statuses that may still turn into a payment. */
const IN_PROGRESS = new Set(["ongoing", "pending", "processing", "queued"])
/** Past this, an in-progress checkout is not waited for. */
const GIVE_UP_WAITING_MS = 24 * 60 * MINUTE
/** Retried this long before the team hears about it. */
const ALERT_AFTER_MS = 60 * MINUTE
/** Per step, per run, so one run stays well inside a function's time limit. */
const BATCH = 25

export const UNSETTLED_REASON = "Not settled in time"

export type SweepReport = {
  lookedUp: number
  settled: number
  refunded: number
  closed: number
  alerted: number
  errors: number
}

const ago = (ms: number) => new Date(Date.now() - ms).toISOString()
const describe = (error: unknown) => error instanceof Error ? error.message : String(error)

export async function runSettlementSweep(): Promise<SweepReport> {
  const report: SweepReport = { lookedUp: 0, settled: 0, refunded: 0, closed: 0, alerted: 0, errors: 0 }
  await finishOpenAttempts(report)
  await recoverRefunds(report)
  await closeUnsettled(report)
  await alertStuck(report)
  return report
}

/** Steps 1 and 2: completeSettlement already does the right thing for both. */
async function finishOpenAttempts(report: SweepReport) {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from("online_payment_attempts")
    .select("reference")
    .in("status", ["initialized", "paid"])
    .lt("updated_at", ago(LOOKUP_AFTER_MS))
    .gt("created_at", ago(GIVE_UP_WAITING_MS * 2))
    .order("updated_at", { ascending: true })
    .limit(BATCH)
  if (error) { report.errors++; return console.error("Sweep: open attempts unreadable", error.message) }

  for (const { reference } of data || []) {
    report.lookedUp++
    try {
      const outcome = await completeSettlement(reference)
      if (outcome.outcome === "settled") report.settled++
      if (outcome.outcome === "refunded") report.refunded++
      // Touch the row so the oldest unfinished attempt does not hog every batch.
      if (outcome.outcome === "not_paid") await supabase.from("online_payment_attempts").update({ paystack_status: outcome.paystackStatus }).eq("reference", reference).eq("status", "initialized")
    } catch (err) {
      report.errors++
      console.error("Sweep: settlement still pending", reference, describe(err))
    }
  }
}

/** Step 3. */
async function recoverRefunds(report: SweepReport) {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from("online_payment_attempts")
    .select("reference, order_id, last_error")
    .eq("status", "refunding")
    .lt("updated_at", ago(LOOKUP_AFTER_MS))
    .order("updated_at", { ascending: true })
    .limit(BATCH)
  if (error) { report.errors++; return console.error("Sweep: refunds unreadable", error.message) }

  for (const attempt of data || []) {
    try {
      const transaction = await verifyTransaction(attempt.reference)
      if (transaction.status !== "reversed") {
        await refundTransaction(attempt.reference, `DLC ${attempt.order_id}: ${attempt.last_error || "Settlement refused"}`)
      }
      await supabase.from("online_payment_attempts").update({ status: "refunded", refunded_at: new Date().toISOString() }).eq("reference", attempt.reference).eq("status", "refunding")
      report.refunded++
    } catch (err) {
      report.errors++
      await supabase.from("online_payment_attempts").update({ last_error: `Refund retry failed: ${describe(err)}` }).eq("reference", attempt.reference)
      console.error("Sweep: refund still not confirmed", attempt.reference, describe(err))
    }
  }
}

/** Step 4. */
async function closeUnsettled(report: SweepReport) {
  const supabase = getSupabaseAdmin()
  const { data: orders, error } = await supabase
    .from("online_orders")
    .select("id, exchange_id")
    .eq("status", "pending_payment")
    .lt("created_at", ago(UNSETTLED_AFTER_MS))
    .order("created_at", { ascending: true })
    .limit(BATCH)
  if (error) { report.errors++; return console.error("Sweep: unsettled requests unreadable", error.message) }

  for (const order of orders || []) {
    try {
      if (!(await safeToClose(order.id))) continue

      // CDASH first: if the team settled it at the till in the meantime, it
      // says so and our record is left as it is.
      if (order.exchange_id) {
        try {
          await cancelExchange(order.exchange_id)
        } catch (err) {
          if (err instanceof CdashError && err.code === "already_resolved") {
            console.warn("Sweep: request already settled in CDASH, left open here", order.id, order.exchange_id)
            continue
          }
          throw err
        }
      }

      const { data: closed } = await supabase.from("online_orders")
        .update({ status: "expired", cancellation_reason: UNSETTLED_REASON })
        .eq("id", order.id)
        .eq("status", "pending_payment")
        .select("id")
        .maybeSingle()
      if (closed) report.closed++
    } catch (err) {
      report.errors++
      console.error("Sweep: unsettled request not closed yet", order.id, describe(err))
    }
  }
}

/**
 * A request may be closed only when no payment for it is in or on its way:
 * nothing paid, settled or being returned, no checkout opened in the last half
 * hour, and every older checkout confirmed with Paystack as not paid.
 */
async function safeToClose(orderId: string) {
  const supabase = getSupabaseAdmin()
  const { data: attempts, error } = await supabase
    .from("online_payment_attempts")
    .select("reference, status, created_at")
    .eq("order_id", orderId)
  if (error) throw new Error(error.message)

  for (const attempt of attempts || []) {
    if (["paid", "settled", "refunding"].includes(attempt.status)) return false
    // `failed` is Paystack's "abandoned", and an abandoned checkout page can
    // still be completed, so it is checked like an open one.
    if (attempt.status !== "initialized" && attempt.status !== "failed") continue
    const age = Date.now() - new Date(attempt.created_at).getTime()
    if (age < RECENT_CHECKOUT_MS) return false
    const outcome = await completeSettlement(attempt.reference)
    if (outcome.outcome === "settled" || outcome.outcome === "refunded") return false
    if (outcome.outcome === "not_paid" && IN_PROGRESS.has(outcome.paystackStatus) && age < GIVE_UP_WAITING_MS) return false
  }
  return true
}

/** Money in, no outcome, after an hour of retries: tell the team, once. */
async function alertStuck(report: SweepReport) {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from("online_payment_attempts")
    .select("reference, order_id, exchange_id, member_id, amount_cents, status, last_error, paid_at")
    .in("status", ["paid", "refunding"])
    .is("alerted_at", null)
    .lt("paid_at", ago(ALERT_AFTER_MS))
    .limit(BATCH)
  // Before the migration is applied the column is missing: retries still run.
  if (error) return console.error("Sweep: stuck payments unreadable (is 20261016120000_settlement_sweep applied?)", error.message)

  for (const attempt of data || []) {
    await notifyStaff({
      event: "online_settlement_stuck",
      title: attempt.status === "refunding"
        ? "Online card settlement could not be returned to the member's card"
        : "Online card settlement taken but the exchange is not settled",
      detail: {
        reference: attempt.reference,
        exchangeId: attempt.exchange_id,
        memberId: attempt.member_id,
        amount: attempt.amount_cents / 100,
        status: attempt.status,
        lastError: attempt.last_error,
        paidAt: attempt.paid_at,
      },
    })
    await supabase.from("online_payment_attempts").update({ alerted_at: new Date().toISOString() }).eq("reference", attempt.reference)
    report.alerted++
  }
}

// ---------------------------------------------------------------------------
// Running it
// ---------------------------------------------------------------------------

let lastRun = 0
let running = false
const OPPORTUNISTIC_EVERY_MS = 5 * MINUTE

/**
 * Runs the sweep at most every few minutes per server, off the back of member
 * traffic (pass it to next/server `after()`), so it keeps up whatever the
 * scheduled job's frequency. Never throws.
 */
export async function maybeRunSettlementSweep() {
  if (running || Date.now() - lastRun < OPPORTUNISTIC_EVERY_MS) return
  if (!process.env.PAYSTACK_SECRET_KEY?.trim()) return
  running = true
  lastRun = Date.now()
  try {
    const report = await runSettlementSweep()
    if (report.settled || report.refunded || report.closed || report.alerted || report.errors) console.info("Settlement sweep", report)
  } catch (err) {
    console.error("Settlement sweep failed", err instanceof PaystackError || err instanceof CdashError ? err.message : err)
  } finally {
    running = false
  }
}
