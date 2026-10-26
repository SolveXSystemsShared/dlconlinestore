/**
 * SMSPortal, the same SMS gateway and account CDASH uses (CDASH's
 * backend/lib/sms.ts). Server-side only: SMSPORTAL_CLIENT_ID and
 * SMSPORTAL_CLIENT_SECRET must never carry a NEXT_PUBLIC_ prefix.
 *
 * In local development with no credentials set, the message is printed to the
 * server console instead of sent, so sign-in can be tested without an SMS.
 *
 * Every send is logged to `audit_logs` (entity_type "sms", action
 * "online_store.sms") with its purpose and what SMSPortal charged, so CDASH's
 * SMS Costs page adds the store's texts to its own. The purpose keys are
 * CDASH's backend/lib/sms-purposes.ts; keep the two in step.
 */

import { getSupabaseAdmin } from "@/lib/supabase-admin"

export type SmsPurpose = "online_signin_pin" | "online_welcome" | "online_number_changed"

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

/**
 * SMS parts the text costs (1 SMSPortal credit each, to an SA number): plain
 * GSM text is 160 in one part / 153 per part; any emoji or symbol makes it
 * Unicode, 70 / 67. Same rule as CDASH's sms-segments.ts.
 */
const GSM = new Set("@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà")
const GSM_EXT = new Set("^{}\\[~]|€\f")
export function smsParts(text: string): { encoding: "gsm7" | "ucs2"; parts: number } {
  let septets = 0
  for (const ch of text) {
    if (GSM.has(ch)) septets += 1
    else if (GSM_EXT.has(ch)) septets += 2
    else return { encoding: "ucs2", parts: text.length <= 70 ? 1 : Math.ceil(text.length / 67) }
  }
  return { encoding: "gsm7", parts: septets <= 160 ? 1 : Math.ceil(septets / 153) }
}

/** What SMSPortal says a send cost (v1 top level, v3 under sendResponse). */
function readCost(body: unknown) {
  const root = (body && typeof body === "object" ? body : {}) as Record<string, unknown>
  const r = (root.sendResponse && typeof root.sendResponse === "object" ? root.sendResponse : root) as Record<string, unknown>
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null)
  return { credits: num(r.cost), parts: num(r.parts), remainingBalance: num(r.remainingBalance), eventId: num(r.eventId) }
}

/** One audit row per send, never failing the send itself. No phone number beyond a mask, never the text. */
async function logSms(purpose: SmsPurpose, destination: string, content: string, outcome: { success: boolean; error?: string; cost?: ReturnType<typeof readCost> }) {
  try {
    const { encoding, parts } = smsParts(content)
    const { error } = await getSupabaseAdmin().from("audit_logs").insert({
      action: "online_store.sms",
      entity_type: "sms",
      user_name: "Online Store",
      details: {
        purpose,
        source: "online_store",
        destination: destination.length >= 6 ? `${destination.slice(0, 4)}****${destination.slice(-2)}` : "****",
        messageLength: content.length,
        recipientCount: 1,
        encoding,
        estimatedParts: parts,
        success: outcome.success,
        error: outcome.error ?? null,
        parts: outcome.cost?.parts ?? null,
        credits: outcome.cost?.credits ?? null,
        remainingBalance: outcome.cost?.remainingBalance ?? null,
        eventId: outcome.cost?.eventId ?? null,
      },
    })
    if (error) console.error("SMS audit log failed", error.message)
  } catch (error) {
    console.error("SMS audit log failed", error)
  }
}

export async function sendSms(to: string, content: string, purpose: SmsPurpose) {
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
  if (!response.ok) {
    await logSms(purpose, destination, content, { success: false, error: `SMSPortal send failed (${response.status})` })
    throw new Error(`SMSPortal send failed (${response.status})`)
  }
  const cost = readCost(await response.json().catch(() => null))
  await logSms(purpose, destination, content, { success: true, cost })
}
