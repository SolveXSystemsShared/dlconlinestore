import { NextResponse } from "next/server"

/**
 * Reading request bodies with a size cap.
 *
 * The proxy refuses an oversized Content-Length before a route runs, but a
 * request can leave Content-Length out (chunked uploads, HTTP/2), and
 * request.json() would then buffer whatever arrives. These readers count the
 * bytes as they stream in and stop at the limit, so no route ever holds more
 * than its cap in memory.
 */

/** Everything except registration. */
export const MAX_BODY = 64 * 1024
/** Registration carries the drawn signature, so it gets more room. */
export const MAX_REGISTRATION_BODY = 1024 * 1024
/** Paystack's webhook events are small; this leaves plenty of headroom. */
export const MAX_WEBHOOK_BODY = 256 * 1024

export type BodyResult<T> = { ok: true; data: T } | { ok: false; response: NextResponse }

const tooLarge = () => NextResponse.json({ error: "That request is too large" }, { status: 413 })
const unreadable = () => NextResponse.json({ error: "That request could not be read" }, { status: 400 })

async function readCapped(request: Request, limit: number): Promise<BodyResult<string>> {
  const declared = request.headers.get("content-length")
  if (declared !== null && /^\d+$/.test(declared) && Number(declared) > limit) return { ok: false, response: tooLarge() }
  if (!request.body) return { ok: true, data: "" }

  const reader = request.body.getReader()
  const decoder = new TextDecoder()
  let received = 0
  let text = ""
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      received += value.byteLength
      if (received > limit) {
        await reader.cancel().catch(() => {})
        return { ok: false, response: tooLarge() }
      }
      text += decoder.decode(value, { stream: true })
    }
  } catch {
    return { ok: false, response: unreadable() }
  }
  return { ok: true, data: text + decoder.decode() }
}

/** The body as text, for a route that needs the exact bytes (a signed webhook). */
export async function readTextBody(request: Request, limit = MAX_WEBHOOK_BODY): Promise<BodyResult<string>> {
  return readCapped(request, limit)
}

/** The body parsed as JSON: 413 past the limit, 400 when it is empty or not JSON. */
export async function readJsonBody(request: Request, limit = MAX_BODY): Promise<BodyResult<unknown>> {
  const text = await readCapped(request, limit)
  if (!text.ok) return text
  if (!text.data.trim()) return { ok: false, response: unreadable() }
  try {
    return { ok: true, data: JSON.parse(text.data) as unknown }
  } catch {
    return { ok: false, response: unreadable() }
  }
}
