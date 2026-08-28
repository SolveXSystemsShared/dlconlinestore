import { getSupabaseAdmin } from "./supabase-admin"
import { normalizeMemberId } from "./format"
import { MEMBER_ID_COLUMN, memberVerdict, type MemberVerdict } from "./members-schema"
import { isPreviewMode, PREVIEW_MEMBER } from "./preview"

export type MemberLookup =
  | { found: false }
  | { found: true; memberId: string; name: string; verdict: MemberVerdict }

/** Customer-facing message for a lookup result. Never leaks whether an ID exists. */
export const MEMBER_LOOKUP_MESSAGE: Record<MemberVerdict | "missing", string> = {
  missing: "We could not find that DLC Member ID. Check the digits and try again.",
  deactivated: "That membership is no longer active. Please speak to the DLC team.",
  pending: "Your registration is still awaiting approval. The team will confirm your Member ID shortly.",
  active: "",
}

/**
 * Looks up a member in the CDASH `members` table.
 *
 * Matching mirrors the CDASH `/api/verify-member` endpoint: `ilike` with no
 * wildcards is an exact but case-insensitive compare, so it also tolerates rows
 * saved with different casing. `normalizeMemberId` trims and upper-cases the
 * input first.
 */
export async function lookupMember(rawMemberId: string): Promise<MemberLookup> {
  const memberId = normalizeMemberId(rawMemberId)

  if (isPreviewMode()) {
    if (memberId !== PREVIEW_MEMBER.memberId) return { found: false }
    return { found: true, memberId: PREVIEW_MEMBER.memberId, name: PREVIEW_MEMBER.name, verdict: "active" }
  }

  const { data, error } = await getSupabaseAdmin()
    .from("members")
    .select(`${MEMBER_ID_COLUMN}, full_name, status`)
    .ilike(MEMBER_ID_COLUMN, memberId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!data) return { found: false }

  // MEMBER_ID_COLUMN is resolved at runtime, so the select string is opaque to
  // supabase-js's literal-type parser.
  const row = data as unknown as Record<string, string | null>
  return {
    found: true,
    memberId: row[MEMBER_ID_COLUMN] ?? memberId,
    name: row.full_name ?? "",
    verdict: memberVerdict(row.status),
  }
}
