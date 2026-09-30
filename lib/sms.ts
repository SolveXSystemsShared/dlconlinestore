/**
 * SMSPortal, the same SMS gateway and account CDASH uses (CDASH's
 * backend/lib/sms.ts). Server-side only: SMSPORTAL_CLIENT_ID and
 * SMSPORTAL_CLIENT_SECRET must never carry a NEXT_PUBLIC_ prefix.
 *
 * In local development with no credentials set, the message is printed to the
 * server console instead of sent, so sign-in can be tested without an SMS.
 */

let cachedToken: { token: string; expiresAt: number } | null = null

export function smsConfigured() {
  return Boolean(process.env.SMSPORTAL_CLIENT_ID && process.env.SMSPORTAL_CLIENT_SECRET)
}

/** SMSPortal wants international digits: 0821234567 → 27821234567. */
export function normalizeMobile(mobile: string) {
  let digits = mobile.replace(/[^\d+]/g, "")
  if (digits.startsWith("+")) digits = digits.slice(1)
  if (digits.startsWith("0") && digits.length === 10) return `27${digits.slice(1)}`
  return digits
}

/** "•••• ••• 612" — enough for the member to recognise their number, no more. */
export function maskMobile(mobile: string) {
  const digits = mobile.replace(/\D/g, "")
  return digits.length >= 3 ? `•••• ••• ${digits.slice(-3)}` : "your mobile number"
}

async function token() {
  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.token
  const credentials = Buffer.from(`${process.env.SMSPORTAL_CLIENT_ID}:${process.env.SMSPORTAL_CLIENT_SECRET}`).toString("base64")
  const response = await fetch("https://rest.smsportal.com/v1/Authentication", {
    headers: { Authorization: `Basic ${credentials}` },
    cache: "no-store",
  })
  if (!response.ok) throw new Error(`SMSPortal authentication failed (${response.status})`)
  const data = (await response.json()) as { token: string; expiresInMinutes?: number }
  // Refreshed a few minutes early so a send never races the expiry.
  const minutes = Math.max(5, (data.expiresInMinutes ?? 60) - 5)
  cachedToken = { token: data.token, expiresAt: Date.now() + minutes * 60_000 }
  return data.token
}

export async function sendSms(to: string, content: string) {
  const destination = normalizeMobile(to)
  if (!smsConfigured()) {
    if (process.env.NODE_ENV !== "production") {
      console.log(`[DEV SMS] to ${maskMobile(destination)}: ${content}`)
      return
    }
    throw new Error("SMSPortal is not configured: set SMSPORTAL_CLIENT_ID and SMSPORTAL_CLIENT_SECRET")
  }
  const send = async (bearer: string) => fetch("https://rest.smsportal.com/v1/BulkMessages", {
    method: "POST",
    headers: { Authorization: `Bearer ${bearer}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messages: [{ destination, content }] }),
    cache: "no-store",
  })
  let response = await send(await token())
  // A token revoked early: fetch a fresh one and try once more.
  if (response.status === 401) {
    cachedToken = null
    response = await send(await token())
  }
  if (!response.ok) throw new Error(`SMSPortal send failed (${response.status})`)
}
