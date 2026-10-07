/**
 * The CDASH Store API — the store's only line into money, stock and rewards.
 *
 * CDASH owns every write to exchanges, inventory and reward state. The store
 * reads the shared database freely, but it settles nothing itself: it asks
 * CDASH what a basket costs (`quote`), and it creates the order through
 * `createOnlineOrder`. Everything after that happens in the CDASH app.
 *
 * SERVER TO SERVER. The key reads any member's programme standing, so it lives
 * in the backend environment and must never reach a browser — no NEXT_PUBLIC_
 * prefix, no passing it through to a page. Every function here is server-only.
 */

/** Read at request time — see the note in lib/supabase-admin.ts. */
function env(name: string) {
  const value = process.env[name]
  return value && value.trim() ? value.trim() : undefined
}

function config() {
  const baseUrl = env("CDASH_API_URL")
  const apiKey = env("CDASH_STORE_API_KEY")
  if (!baseUrl || !apiKey) {
    const missing = [!baseUrl && "CDASH_API_URL", !apiKey && "CDASH_STORE_API_KEY"].filter(Boolean)
    throw new CdashError(`CDASH store API is not configured: missing ${missing.join(" and ")}`, 503)
  }
  return { baseUrl: baseUrl.replace(/\/+$/, ""), apiKey }
}

/**
 * A CDASH call that did not succeed.
 *
 * `status` is carried so a route can pass a refusal straight through — a 409
 * from a stale catalogue price should reach the shopper as a conflict, not as a
 * generic 500.
 */
export class CdashError extends Error {
  /** CDASH's machine-readable refusal, where it gives one (the settle route does). */
  readonly code: string | null
  constructor(message: string, readonly status: number, code?: string | null) {
    super(message)
    this.name = "CdashError"
    this.code = code ?? null
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const { baseUrl, apiKey } = config()
  let response: Response
  try {
    response = await fetch(`${baseUrl}${path}`, {
      ...init,
      cache: "no-store",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}`, ...(init?.headers || {}) },
    })
  } catch (cause) {
    // A dead CDASH is a 503, not a 500: the store is fine, the thing it depends
    // on is not, and the difference matters when someone is reading logs.
    console.error("CDASH is not reachable", cause)
    throw new CdashError("CDASH is not reachable", 503)
  }

  const body = await response.json().catch(() => null) as { error?: string; code?: string } | null
  if (!response.ok) throw new CdashError(body?.error || `CDASH returned ${response.status}`, response.status, body?.code)
  return body as T
}

// ---------------------------------------------------------------------------
// 1. Member summary — §11 "My DLC"
// ---------------------------------------------------------------------------

export type CdashMemberSummary = {
  memberId: string
  fullName: string
  enrolled: boolean
  accountStatus?: string
  /** null for an enrolled member holding no current pass. */
  tier: { key: string; name: string; status: string; expiresAt: string | null; daysRemaining: number | null; viaSquad: boolean; cardDiscountPercent: number; cashDiscountPercent: number } | null
  points: { balance: number }
  credits: { balance: number; currency: string; pointsPerCredit: number; basketCapPercent: number }
  visits: { completed: number; target: number }
  /** null when they hold no pass. `unlimited` is Cloud Nine, where the minute figures are null. */
  playstation: { allowanceMinutes: number | null; remainingMinutes: number | null; unlimited: boolean; unit: string; resetPeriod: string; inLoungeNow: boolean } | null
  referralCode: string | null
  loyaltyCards: Array<{ track: string; purchased: number; target: number; rewardsAvailable: number }>
}

/**
 * A member's programme standing, or the fact that they have none.
 *
 * Three outcomes, and only one of them is an error:
 *   { found: true, enrolled: true }   a programme member
 *   { found: true, enrolled: false }  a real person with no membership row —
 *                                     a CDASH staff member_number is exactly
 *                                     this case. They can shop; they have no
 *                                     programme standing.
 *   { found: false }                  nobody answers to that id
 *
 * Lifetime spend is deliberately absent: §11 excludes it and the CDASH response
 * is assembled field by field, so it cannot start leaking later.
 */
export async function fetchMemberSummary(memberId: string): Promise<{ found: false } | { found: true; summary: CdashMemberSummary }> {
  try {
    const summary = await call<CdashMemberSummary>(`/api/store/member-summary?memberId=${encodeURIComponent(memberId)}`)
    return { found: true, summary }
  } catch (error) {
    if (error instanceof CdashError && error.status === 404) return { found: false }
    throw error
  }
}

// ---------------------------------------------------------------------------
// 2. Quote — the waterfall, run without creating anything
// ---------------------------------------------------------------------------

export type CdashQuoteLine = {
  /** Inventory category, e.g. "Bud". Used to match Buy-10 tracks. */
  type: string
  grade?: string | null
  quantity: number
  /** The LINE TOTAL at our catalogue price, not a unit price. */
  value: number
  /** True for a bundle or anything already at a promotional price. */
  promotional?: boolean
}

export type CdashQuoteChannel = {
  channel: "card" | "cash"
  goodsTotal: number
  deliveryFee: number
  amountDue: number
  memberDiscountPercent: number
  memberDiscountAmount: number
  creditsApplied: number
  creditCap: number
  pointsEarned: number
  steps: string[]
}

export type CdashQuote = {
  member: { memberId: string; fullName: string } | null
  tier: { key: string; name: string } | null
  gross: number
  credits: { balance: number; maxOnThisBasket: number; basketCapPercent: number }
  card: CdashQuoteChannel
  cash: CdashQuoteChannel
  recommendedDisplay: "card"
  /**
   * Always false. Prices come from OUR catalogue, so a quote is a preview: a
   * stale price produces a wrong quote and then a rejected settlement, never a
   * wrong charge. The binding figure is the one CDASH resolves at settlement.
   */
  authoritative: boolean
}

/**
 * What a basket costs, both ways it can be paid.
 *
 * §7 rule 2 gives ONE discount, matching how the member pays, and online that
 * is only known at the door — so both channels come back and the store shows
 * both. Where only one figure fits, show the card one: it is the smaller
 * discount at every tier, so it can never under-quote.
 */
export async function fetchQuote(input: { memberId?: string; lines: CdashQuoteLine[]; dlcCreditsRequested?: number }): Promise<CdashQuote> {
  return call<CdashQuote>("/api/store/quote", { method: "POST", body: JSON.stringify(input) })
}

// ---------------------------------------------------------------------------
// 3. Orders — the one write
// ---------------------------------------------------------------------------

export type CdashExchange = {
  id: string
  memberId: string
  memberName: string
  storeId: string | null
  totalValue: number
  deliveryFee: number
  paymentStatus: string
  paidAt: string | null
}

/**
 * The staff name CDASH derives the order's store from.
 *
 * This must match a CDASH user with a store_id. If it does not, the exchange
 * lands with a null store and appears in nobody's pending queue — the order
 * looks like it vanished.
 */
export const ONLINE_STORE_STAFF_NAME = "Online Store"

/**
 * Creates the order in CDASH, PENDING.
 *
 * No stock moves and no rewards are awarded here, and that is deliberate: §7
 * step 4 earns points on "the net amount actually paid", and an order that has
 * not been settled has no such amount yet. Stock leaves and points, Buy-10
 * progress, referral and birthday bonuses land when CDASH staff settle it.
 *
 * No prices are sent. CDASH resolves them itself, and anything we sent would be
 * ignored for pricing — so a drifted catalogue fails the settlement rather than
 * charging the wrong amount.
 */
export async function createOnlineOrder(input: {
  memberId: string
  products: Array<{ type: string; name: string; quantity: number; grade?: string | null }>
  paymentNotes?: string
}): Promise<CdashExchange> {
  return call<CdashExchange>("/api/exchanges", {
    method: "POST",
    body: JSON.stringify({
      memberId: input.memberId,
      staffName: ONLINE_STORE_STAFF_NAME,
      paymentType: "none",
      isOnline: true,
      // Empty on purpose: payment is collected by CDASH at settlement, so the
      // order carries no payment detail until then.
      paymentDetails: [],
      products: input.products.map((product) => ({
        type: product.type,
        name: product.name,
        quantity: product.quantity,
        ...(product.grade ? { grade: product.grade } : {}),
      })),
      ...(input.paymentNotes ? { paymentNotes: input.paymentNotes } : {}),
    }),
  })
}

// ---------------------------------------------------------------------------
// 4. Online settlement — Paystack
// ---------------------------------------------------------------------------

/**
 * What this exchange owes on card — BINDING, unlike `fetchQuote`. CDASH runs the
 * settlement computation over the exchange it already priced, the same one
 * `settleExchange` checks the payment against, so the amount Paystack collects
 * is the amount settlement accepts. No DLC Credits on this path.
 */
export type CdashSettleQuote = {
  id: string
  tier: { key: string; name: string } | null
  goodsTotal: number
  deliveryFee: number
  amountDue: number
  memberDiscountPercent: number
  memberDiscountAmount: number
  pointsEarned: number
  rewardsUnavailable: boolean
}

export async function fetchSettleQuote(exchangeId: string): Promise<CdashSettleQuote> {
  return call<CdashSettleQuote>(`/api/store/exchanges/${encodeURIComponent(exchangeId)}/settle`, {
    method: "POST",
    body: JSON.stringify({ action: "quote" }),
  })
}

/**
 * Settles the exchange from a Paystack payment: CDASH verifies the payment with
 * Paystack itself, deducts the stock and awards the rewards. Repeating it with
 * the same reference is a success, not a conflict.
 *
 * A refusal carries `code`, which is what decides whether the member's money
 * goes back: see SETTLEMENT_REFUSALS in lib/settlement.ts.
 */
export async function settleExchange(exchangeId: string, reference: string): Promise<{ id: string; paymentStatus: string; idempotent?: boolean }> {
  return call(`/api/store/exchanges/${encodeURIComponent(exchangeId)}/settle`, {
    method: "POST",
    body: JSON.stringify({ action: "settle", reference }),
  })
}

/** Closes an unsettled exchange unpaid, so it leaves the team's pending queue. */
export async function cancelExchange(exchangeId: string): Promise<{ id: string; paymentStatus: string }> {
  return call(`/api/store/exchanges/${encodeURIComponent(exchangeId)}/settle`, {
    method: "POST",
    body: JSON.stringify({ action: "cancel" }),
  })
}
