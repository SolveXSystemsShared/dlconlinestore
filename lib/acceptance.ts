import { isIP } from "node:net"
import type { NextRequest } from "next/server"
import { z } from "zod"
import { getSupabaseAdmin } from "./supabase-admin"
import {
  type AcceptanceContext,
  EXCHANGE_REQUEST_STATEMENT,
  PRIVACY_VERSION,
  REGISTRATION_STATEMENT,
  TERMS_VERSION,
} from "./legal"

/**
 * What the browser sends when a member ticks the terms box. The server never
 * trusts the wording from the browser — it stores its own copy of the
 * statement for the version — only that the box was ticked and which version
 * of the terms the page was showing.
 */
export const acceptanceInput = {
  acceptedTerms: z.literal(true, { errorMap: () => ({ message: "Please accept the Terms & Conditions to continue." }) }),
  termsVersion: z.string().max(40),
}

/** Refuses a tick against terms that have since changed, so it is always the current version being accepted. */
export function staleTermsMessage(termsVersion: string) {
  return termsVersion === TERMS_VERSION
    ? null
    : "Our Terms & Conditions have been updated. Please reload the page, review them and accept again."
}

/** First hop in X-Forwarded-For (set by the host), else X-Real-IP; null if it is not a clean address. */
function clientIp(request: NextRequest) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
  const candidate = forwarded || request.headers.get("x-real-ip")?.trim() || ""
  return isIP(candidate) ? candidate : null
}

export class AcceptanceNotRecorded extends Error {}

/**
 * Writes the evidence row. Throws AcceptanceNotRecorded if it cannot — callers
 * must stop there, so no member or exchange request exists without its record.
 */
export async function recordAcceptance(request: NextRequest, { context, memberId }: { context: AcceptanceContext; memberId: string | null }) {
  const { data, error } = await getSupabaseAdmin()
    .from("online_legal_acceptances")
    .insert({
      member_id: memberId,
      context,
      terms_version: TERMS_VERSION,
      privacy_version: PRIVACY_VERSION,
      statement: context === "registration" ? REGISTRATION_STATEMENT : EXCHANGE_REQUEST_STATEMENT,
      ip_address: clientIp(request),
      user_agent: request.headers.get("user-agent")?.slice(0, 500) ?? null,
    })
    .select("id")
    .single()
  if (error || !data) {
    console.error("Legal acceptance could not be recorded", context, memberId, error)
    throw new AcceptanceNotRecorded("Legal acceptance could not be recorded")
  }
  return data.id as string
}

/**
 * Fills in what the acceptance belongs to once it exists. The acceptance is
 * already on record, so a failure here is logged with enough to link it by
 * hand, not raised.
 */
export async function linkAcceptance(id: string, links: { memberId?: string; onlineOrderId?: string; exchangeId?: string }) {
  const update: Record<string, string> = {}
  if (links.memberId) update.member_id = links.memberId
  if (links.onlineOrderId) update.online_order_id = links.onlineOrderId
  if (links.exchangeId) update.exchange_id = links.exchangeId
  if (!Object.keys(update).length) return
  const { error } = await getSupabaseAdmin().from("online_legal_acceptances").update(update).eq("id", id)
  if (error) console.error("Legal acceptance could not be linked — link by hand", id, update, error)
}
