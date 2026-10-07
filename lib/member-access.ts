import crypto from "node:crypto"
import { cookies } from "next/headers"

export const AGE_COOKIE = "dlc_age_confirmed"
export const MEMBER_COOKIE = "dlc_member_access"

function accessSecret() {
  const secret = process.env.MEMBER_GATE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!secret) throw new Error("MEMBER_GATE_SECRET or SUPABASE_SERVICE_ROLE_KEY is required")
  return secret
}

/** How long a sign-in lasts. The cookie's maxAge matches it. */
export const MEMBER_SESSION_SECONDS = 60 * 60 * 24 * 7

function signature(payload: string) {
  return crypto.createHmac("sha256", accessSecret()).update(payload).digest("hex")
}

/**
 * `<memberId>.<expires>.<signature>`. The expiry is inside the signature, so a
 * copied cookie stops working after a week even if the browser never drops
 * it; the cookie's own maxAge is only a hint to the browser.
 */
export function createMemberAccessToken(memberId: string) {
  const expires = Math.floor(Date.now() / 1000) + MEMBER_SESSION_SECONDS
  const payload = `${memberId}.${expires}`
  return `${payload}.${signature(payload)}`
}

export function readMemberAccessToken(token: string | undefined) {
  if (!token || token.length > 200) return null
  const sigAt = token.lastIndexOf(".")
  const expAt = token.lastIndexOf(".", sigAt - 1)
  if (expAt < 1) return null
  const payload = token.slice(0, sigAt)
  const provided = token.slice(sigAt + 1)
  const expected = signature(payload)
  if (provided.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected))) return null
  const expires = Number(token.slice(expAt + 1, sigAt))
  if (!Number.isInteger(expires) || expires * 1000 < Date.now()) return null
  return token.slice(0, expAt)
}

export async function getMemberAccess() {
  const store = await cookies()
  const ageConfirmed = store.get(AGE_COOKIE)?.value === "1"
  const memberId = readMemberAccessToken(store.get(MEMBER_COOKIE)?.value)
  return { ageConfirmed, memberId }
}
