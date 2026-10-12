import { NextResponse } from "next/server"
import { getMemberAccess, MEMBER_COOKIE } from "./member-access"
import { lookupMember } from "./members"

/**
 * Who the signed member cookie belongs to, if they may still shop.
 *
 * The signed cookie only proves who signed in; whether they may still use the
 * store is CDASH's answer, asked on every request. A member banned, suspended
 * or otherwise stopped in CDASH loses access on their next click, on every
 * device, without waiting for their cookie to expire.
 *
 * An ACTIVE answer is remembered for a few seconds, only so the handful of
 * requests one page load makes share a lookup. Anything else is never
 * remembered. Writes and anything involving settlement ask `fresh`, so they
 * never act on a remembered answer at all.
 */
const ACTIVE_CACHE_MS = 5_000
const activeMembers = new Map<string, { at: number; member: SessionMember }>()

export type SessionMember = { memberId: string; name: string }

export async function activeMemberFor(memberId: string, options: { fresh?: boolean } = {}): Promise<SessionMember | null> {
  const remembered = activeMembers.get(memberId)
  if (!options.fresh && remembered && Date.now() - remembered.at < ACTIVE_CACHE_MS) return remembered.member
  const found = await lookupMember(memberId)
  if (!found.found || found.verdict !== "active") {
    activeMembers.delete(memberId)
    return null
  }
  const member = { memberId: found.memberId, name: found.name }
  activeMembers.set(memberId, { at: Date.now(), member })
  if (activeMembers.size > 5000) for (const [key, value] of activeMembers) if (Date.now() - value.at >= ACTIVE_CACHE_MS) activeMembers.delete(key)
  return member
}

/** Forget a member at once — on sign-out, so the next load asks CDASH afresh. */
export function forgetMember(memberId: string) {
  activeMembers.delete(memberId)
}

/** Drops the member cookie, so a stopped membership is asked to sign in again. */
export function clearMemberCookie(response: NextResponse) {
  response.cookies.set({ name: MEMBER_COOKIE, value: "", path: "/", maxAge: 0, httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" })
  return response
}

export type MemberGate =
  | { ok: true; memberId: string; member: SessionMember }
  | { ok: false; response: NextResponse }

/**
 * The door every member API route goes through: a valid signed cookie, the 18+
 * confirmation, AND a membership CDASH still calls active. A stopped
 * membership is answered 401 with its cookie cleared, so the page falls back
 * to the gate, which explains why they cannot sign in.
 */
export async function requireActiveMember(options: { fresh?: boolean } = {}): Promise<MemberGate> {
  const access = await getMemberAccess()
  if (!access.ageConfirmed || !access.memberId) {
    return { ok: false, response: NextResponse.json({ error: "Registered DLC member access is required" }, { status: 401 }) }
  }
  let member: SessionMember | null
  try {
    member = await activeMemberFor(access.memberId, options)
  } catch (error) {
    // Fail closed: if CDASH cannot say the membership is active, nothing proceeds.
    console.error("Membership check failed", access.memberId, error)
    return { ok: false, response: NextResponse.json({ error: "We could not check your membership just now. Please try again in a moment." }, { status: 503 }) }
  }
  if (!member) {
    return {
      ok: false,
      response: clearMemberCookie(NextResponse.json(
        { error: "This membership can no longer use the online store. Please speak to the DLC team.", code: "membership_inactive" },
        { status: 401 },
      )),
    }
  }
  return { ok: true, memberId: access.memberId, member }
}
