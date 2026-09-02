import { getSupabaseAdmin } from "./supabase-admin"
import { normalizeMemberId } from "./format"
import {
  MEMBER_ID_COLUMN,
  memberVerdict,
  STAFF_ID_COLUMN,
  STAFF_TABLE,
  type MemberVerdict,
} from "./members-schema"
import { isPreviewMode, PREVIEW_MEMBER } from "./preview"

/** Where the ID was recognised: the membership roll, or the CDASH staff directory. */
export type MemberSource = "member" | "staff"

export type MemberLookup =
  | { found: false }
  | {
      found: true
      memberId: string
      name: string
      verdict: MemberVerdict
      source: MemberSource
      /** CDASH role for a staff match — director, manager, staff, auditor. */
      role?: string | null
      /** The raw CDASH status, so a refusal can say what is actually going on. */
      status?: string | null
    }

/**
 * What to tell someone whose ID did not get them in.
 *
 * A refusal names the state rather than being vague about it: someone holding
 * a live Member ID that stops working needs to know whether the problem is a
 * typo, an approval still pending, or a membership the team has stopped.
 */
export function memberLookupMessage(lookup: Extract<MemberLookup, { found: true }> | { found: false }) {
  if (!lookup.found) return "We could not find that DLC Member ID. Check the digits and try again."
  if (lookup.verdict === "pending") {
    return "Your membership is still awaiting approval. The DLC team will confirm it shortly."
  }
  if (lookup.verdict === "deactivated") {
    const state = (lookup.status || "").trim().toLowerCase()
    if (lookup.source === "staff") {
      return "That staff account is no longer active at DLC. Please speak to the team."
    }
    return state
      ? `That membership is currently ${state} and cannot be used to shop. Please speak to the DLC team.`
      : "That membership is no longer active. Please speak to the DLC team."
  }
  return ""
}

/**
 * Looks up a DLC Member ID.
 *
 * `members` is the membership roll and is checked first. CDASH staff —
 * directors, managers, staff, auditors — are members of the club too, but they
 * live in `users` under `member_number`, and most (though not all) also have a
 * `members` row. The staff table is therefore a fallback, not an override: a
 * membership that CDASH has stopped stays stopped even for someone who still
 * works here, and conversely a staff account that has been closed does not
 * revoke a membership that is still good.
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
    return { found: true, memberId: PREVIEW_MEMBER.memberId, name: PREVIEW_MEMBER.name, verdict: "active", source: "member" }
  }

  const supabase = getSupabaseAdmin()

  const { data: memberRow, error } = await supabase
    .from("members")
    .select(`${MEMBER_ID_COLUMN}, full_name, status`)
    .ilike(MEMBER_ID_COLUMN, memberId)
    .maybeSingle()
  if (error) throw new Error(error.message)

  if (memberRow) {
    // MEMBER_ID_COLUMN is resolved at runtime, so the select string is opaque to
    // supabase-js's literal-type parser.
    const row = memberRow as unknown as Record<string, string | null>
    return {
      found: true,
      memberId: row[MEMBER_ID_COLUMN] ?? memberId,
      name: row.full_name ?? "",
      verdict: memberVerdict(row.status),
      source: "member",
      status: row.status,
    }
  }

  const { data: staffRow, error: staffError } = await supabase
    .from(STAFF_TABLE)
    .select(`${STAFF_ID_COLUMN}, name, role, deleted_at`)
    .ilike(STAFF_ID_COLUMN, memberId)
    .maybeSingle()
  if (staffError) throw new Error(staffError.message)
  if (!staffRow) return { found: false }

  const staff = staffRow as unknown as Record<string, string | null>
  // `users` has no status column — CDASH closes a staff account by setting
  // deleted_at, so that is the whole test.
  const deleted = Boolean(staff.deleted_at)
  return {
    found: true,
    memberId: staff[STAFF_ID_COLUMN] ?? memberId,
    name: staff.name ?? "",
    verdict: deleted ? "deactivated" : "active",
    source: "staff",
    role: staff.role,
    status: deleted ? "closed" : "active",
  }
}
