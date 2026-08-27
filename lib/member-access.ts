import crypto from "node:crypto"
import { cookies } from "next/headers"

export const AGE_COOKIE = "dlc_age_confirmed"
export const MEMBER_COOKIE = "dlc_member_access"

function accessSecret() {
  const secret = process.env.MEMBER_GATE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!secret) throw new Error("MEMBER_GATE_SECRET or SUPABASE_SERVICE_ROLE_KEY is required")
  return secret
}

function signature(memberId: string) {
  return crypto.createHmac("sha256", accessSecret()).update(memberId).digest("hex")
}

export function createMemberAccessToken(memberId: string) {
  return `${memberId}.${signature(memberId)}`
}

export function readMemberAccessToken(token: string | undefined) {
  if (!token) return null
  const separator = token.lastIndexOf(".")
  if (separator < 1) return null
  const memberId = token.slice(0, separator)
  const provided = token.slice(separator + 1)
  const expected = signature(memberId)
  if (provided.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected))) return null
  return memberId
}

export async function getMemberAccess() {
  const store = await cookies()
  const ageConfirmed = store.get(AGE_COOKIE)?.value === "1"
  const memberId = readMemberAccessToken(store.get(MEMBER_COOKIE)?.value)
  return { ageConfirmed, memberId }
}
