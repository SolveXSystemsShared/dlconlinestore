import crypto from "node:crypto"
import { getSupabaseAdmin } from "./supabase-admin"
import { isPreviewMode } from "./preview"

/**
 * The SMS sign-in PIN: issued to the mobile number CDASH holds for a member,
 * checked before the member cookie is set. Only an HMAC of the PIN is stored
 * (online_signin_codes), keyed with the store's server secret.
 */
export const CODE_TTL_MINUTES = 10
export const RESEND_AFTER_SECONDS = 60
const MAX_ATTEMPTS = 5
const MAX_CODES_PER_HOUR = 5

function secret() {
  const value = process.env.MEMBER_GATE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!value) throw new Error("MEMBER_GATE_SECRET or SUPABASE_SERVICE_ROLE_KEY is required")
  return value
}

// The member ID is part of the hash, so a PIN can only ever open its own member.
const hashCode = (memberId: string, code: string) =>
  crypto.createHmac("sha256", secret()).update(`signin:${memberId}:${code}`).digest("hex")

// Design preview has no database: PINs live in memory for the dev server's life.
const previewCodes = new Map<string, string>()

const sameHash = (a: string, b: string) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b))

export type IssueResult =
  | { ok: true; code: string }
  | { ok: false; reason: "cooldown"; retryAfter: number }
  | { ok: false; reason: "too-many" }

/** Creates a new PIN for the member, unless one was sent too recently. */
export async function issueSigninCode(memberId: string, ip: string | null): Promise<IssueResult> {
  if (isPreviewMode()) {
    const code = crypto.randomInt(0, 1_000_000).toString().padStart(6, "0")
    previewCodes.set(memberId, hashCode(memberId, code))
    return { ok: true, code }
  }
  const supabase = getSupabaseAdmin()
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const { data: recent, error } = await supabase
    .from("online_signin_codes")
    .select("created_at")
    .eq("member_id", memberId)
    .gte("created_at", hourAgo)
    .order("created_at", { ascending: false })
  if (error) throw new Error(error.message)

  if (recent?.length) {
    const seconds = (Date.now() - new Date(recent[0].created_at).getTime()) / 1000
    if (seconds < RESEND_AFTER_SECONDS) return { ok: false, reason: "cooldown", retryAfter: Math.ceil(RESEND_AFTER_SECONDS - seconds) }
    if (recent.length >= MAX_CODES_PER_HOUR) return { ok: false, reason: "too-many" }
  }

  const code = crypto.randomInt(0, 1_000_000).toString().padStart(6, "0")
  // A new PIN replaces any older one still waiting.
  await supabase.from("online_signin_codes").update({ consumed_at: new Date().toISOString() }).eq("member_id", memberId).is("consumed_at", null)
  const { error: insertError } = await supabase.from("online_signin_codes").insert({
    member_id: memberId,
    code_hash: hashCode(memberId, code),
    expires_at: new Date(Date.now() + CODE_TTL_MINUTES * 60_000).toISOString(),
    ip_address: ip && ip !== "unknown" ? ip : null,
  })
  if (insertError) throw new Error(insertError.message)
  return { ok: true, code }
}

export type CheckResult = { ok: true } | { ok: false; reason: "missing" | "expired" | "wrong" | "locked"; attemptsLeft?: number }

/** Checks a PIN against the member's latest one and uses it up on success. */
export async function checkSigninCode(memberId: string, code: string): Promise<CheckResult> {
  if (isPreviewMode()) {
    const expected = previewCodes.get(memberId)
    if (!expected) return { ok: false, reason: "missing" }
    if (!sameHash(expected, hashCode(memberId, code))) return { ok: false, reason: "wrong", attemptsLeft: MAX_ATTEMPTS - 1 }
    previewCodes.delete(memberId)
    return { ok: true }
  }
  const supabase = getSupabaseAdmin()
  const { data: row, error } = await supabase
    .from("online_signin_codes")
    .select("id, code_hash, attempts, expires_at")
    .eq("member_id", memberId)
    .is("consumed_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!row) return { ok: false, reason: "missing" }
  if (new Date(row.expires_at).getTime() < Date.now()) return { ok: false, reason: "expired" }
  if (row.attempts >= MAX_ATTEMPTS) return { ok: false, reason: "locked" }

  if (!sameHash(row.code_hash, hashCode(memberId, code))) {
    const attempts = row.attempts + 1
    await supabase.from("online_signin_codes").update({ attempts }).eq("id", row.id)
    return attempts >= MAX_ATTEMPTS ? { ok: false, reason: "locked" } : { ok: false, reason: "wrong", attemptsLeft: MAX_ATTEMPTS - attempts }
  }

  // Consumed only if still unconsumed, so two requests racing with the same
  // PIN cannot both sign in.
  const { data: used, error: useError } = await supabase
    .from("online_signin_codes")
    .update({ consumed_at: new Date().toISOString() })
    .eq("id", row.id)
    .is("consumed_at", null)
    .select("id")
  if (useError) throw new Error(useError.message)
  return used?.length ? { ok: true } : { ok: false, reason: "missing" }
}

export function checkMessage(result: Exclude<CheckResult, { ok: true }>) {
  switch (result.reason) {
    case "wrong": return `That PIN is not right. ${result.attemptsLeft} ${result.attemptsLeft === 1 ? "try" : "tries"} left.`
    case "expired": return "That PIN has expired. Send a new one."
    case "locked": return "Too many wrong tries for that PIN. Send a new one."
    default: return "Send a PIN to your phone first."
  }
}
