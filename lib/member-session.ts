import { lookupMember } from "./members"

/**
 * Who the signed member cookie belongs to, if they may still shop.
 *
 * The CDASH lookup takes 1–2 s, and every page load asks. An ACTIVE result is
 * remembered for a minute; anything else is never cached, so a newly activated
 * member gets straight in and a deactivated one loses access within a minute.
 */
const ACTIVE_CACHE_MS = 60_000
const activeMembers = new Map<string, { at: number; member: SessionMember }>()

export type SessionMember = { memberId: string; name: string }

export async function activeMemberFor(memberId: string): Promise<SessionMember | null> {
  const remembered = activeMembers.get(memberId)
  if (remembered && Date.now() - remembered.at < ACTIVE_CACHE_MS) return remembered.member
  const found = await lookupMember(memberId)
  if (!found.found || found.verdict !== "active") {
    activeMembers.delete(memberId)
    return null
  }
  const member = { memberId: found.memberId, name: found.name }
  activeMembers.set(memberId, { at: Date.now(), member })
  return member
}

/** Forget a member at once — on sign-out, so the next load asks CDASH afresh. */
export function forgetMember(memberId: string) {
  activeMembers.delete(memberId)
}
