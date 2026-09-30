import type { NextRequest } from "next/server"

/**
 * Failed-attempt limiter for the member gate.
 *
 * Signing in takes a Member ID and then a PIN sent by SMS. This counts FAILED
 * attempts (unknown IDs, wrong PINs) per client IP in a sliding window and
 * refuses further tries once the limit is hit; the verify route also counts
 * SMS sends per IP under an "sms:" key so it cannot be used to spam phones.
 *
 * Best effort: it lives in each server instance's memory, so on a serverless
 * host the effective limit is per instance. The hard limits — 5 guesses per
 * PIN, one PIN a minute and 5 an hour per member — are kept in the database
 * (lib/signin-code.ts).
 */
type Window = { failures: number[] }
const windows = new Map<string, Window>()
const WINDOW_MS = 15 * 60 * 1000
const MAX_FAILURES = 8

export function clientKey(request: NextRequest) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip")?.trim() || "unknown"
}

function recent(key: string) {
  const now = Date.now()
  const entry = windows.get(key) ?? { failures: [] }
  entry.failures = entry.failures.filter((at) => now - at < WINDOW_MS)
  windows.set(key, entry)
  return entry
}

/** Minutes until another attempt is allowed, or 0 if the client may try now. */
export function lockedFor(key: string) {
  const entry = recent(key)
  if (entry.failures.length < MAX_FAILURES) return 0
  return Math.max(1, Math.ceil((entry.failures[0] + WINDOW_MS - Date.now()) / 60000))
}

export function recordFailure(key: string) {
  recent(key).failures.push(Date.now())
  // Keep the map from growing without bound under a flood of addresses.
  if (windows.size > 5000) for (const [k, v] of windows) if (!v.failures.length) windows.delete(k)
}

export function clearFailures(key: string) {
  windows.delete(key)
}
