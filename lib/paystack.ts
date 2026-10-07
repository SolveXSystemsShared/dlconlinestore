import { createHmac, timingSafeEqual } from "crypto"

/**
 * Paystack — card settlement for online exchange requests.
 *
 * SERVER ONLY. The secret key charges and refunds the account, so it lives in
 * the backend environment and never reaches a browser. The member is sent to
 * Paystack's own hosted checkout (authorization_url), so the store never sees a
 * card number either.
 *
 * Paystack works in rand cents. Members only ever see credits on our pages; the
 * conversion happens here and nowhere else.
 */

const PAYSTACK_API = "https://api.paystack.co"

/** Read at request time — see the note in lib/supabase-admin.ts. */
function secretKey() {
  const value = process.env.PAYSTACK_SECRET_KEY?.trim()
  if (!value) throw new PaystackError("Paystack is not configured: missing PAYSTACK_SECRET_KEY", 503)
  return value
}

export class PaystackError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
    this.name = "PaystackError"
  }
}

/** Credits to cents. CDASH runs the same rounding when it checks the payment. */
export function toCents(amount: number) {
  return Math.round((Number(amount) || 0) * 100)
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${PAYSTACK_API}${path}`, {
      ...init,
      cache: "no-store",
      headers: { "content-type": "application/json", authorization: `Bearer ${secretKey()}`, ...(init?.headers || {}) },
    })
  } catch (cause) {
    console.error("Paystack is not reachable", cause)
    throw new PaystackError("Paystack is not reachable", 503)
  }
  const body = await response.json().catch(() => null) as { status?: boolean; message?: string; data?: T } | null
  if (!response.ok || !body?.status) {
    throw new PaystackError(body?.message || `Paystack returned ${response.status}`, response.status >= 500 ? 503 : response.status)
  }
  return body.data as T
}

export type PaystackTransaction = {
  reference: string
  status: "success" | "failed" | "abandoned" | "ongoing" | "pending" | "processing" | "queued" | "reversed" | string
  amount: number
  currency: string
  paid_at: string | null
  channel: string | null
}

/**
 * Opens a hosted checkout. `metadata.exchange_id` is not decoration: CDASH
 * refuses to settle an exchange from a payment that does not name it.
 */
export async function initializeTransaction(input: {
  email: string
  amountCents: number
  reference: string
  callbackUrl: string
  metadata: { exchange_id: string; online_order_id: string; member_id: string; order_number: string }
}) {
  return call<{ authorization_url: string; access_code: string; reference: string }>("/transaction/initialize", {
    method: "POST",
    body: JSON.stringify({
      email: input.email,
      amount: input.amountCents,
      currency: "ZAR",
      reference: input.reference,
      callback_url: input.callbackUrl,
      // Card only: CDASH settles a Paystack payment at the card rate (§7 rule 2).
      channels: ["card"],
      metadata: input.metadata,
    }),
  })
}

/** The transaction as Paystack has it — never trust a webhook body or a redirect for this. */
export async function verifyTransaction(reference: string) {
  return call<PaystackTransaction>(`/transaction/verify/${encodeURIComponent(reference)}`)
}

/** Full refund of a transaction back to the card it came from. */
export async function refundTransaction(reference: string, reason: string) {
  return call<{ status: string }>("/refund", {
    method: "POST",
    body: JSON.stringify({ transaction: reference, merchant_note: reason.slice(0, 200) }),
  })
}

/**
 * A webhook is Paystack's only if its x-paystack-signature is the HMAC-SHA512 of
 * the raw body under our secret key. Compared in constant time.
 */
export function isPaystackSignature(rawBody: string, signature: string | null) {
  if (!signature) return false
  const expected = createHmac("sha512", secretKey()).update(rawBody).digest("hex")
  const a = Buffer.from(expected)
  const b = Buffer.from(signature.trim())
  return a.length === b.length && timingSafeEqual(a, b)
}
