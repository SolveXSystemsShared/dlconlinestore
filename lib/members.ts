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
      /** The person's own number: members.mobile_number, or users.phone for staff. */
      mobile?: string | null
      /**
       * Where the sign-in PIN goes. Only resolved when asked for (`signin`).
       * Anyone with a CDASH staff account, including one who also has a
       * `members` row, is texted where CDASH sends their own login code;
       * everyone else at `mobile`.
       */
      signinMobile?: string | null
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
 * input first, and anything that could act as a wildcard is refused.
 */
export async function lookupMember(rawMemberId: string, options: { signin?: boolean } = {}): Promise<MemberLookup> {
  const memberId = normalizeMemberId(rawMemberId)
  // `ilike` treats % and _ (and PostgREST's *) as wildcards, so "DLC-1234-%"
  // would find a member without knowing their ID and text them a PIN. Real
  // Member IDs are letters, digits and dashes only.
  if (!/^[A-Z0-9-]+$/.test(memberId)) return { found: false }

  if (isPreviewMode()) {
    if (memberId !== PREVIEW_MEMBER.memberId) return { found: false }
    return { found: true, memberId: PREVIEW_MEMBER.memberId, name: PREVIEW_MEMBER.name, verdict: "active", source: "member", mobile: "0820000000", signinMobile: "0820000000" }
  }

  const supabase = getSupabaseAdmin()

  const { data: memberRow, error } = await supabase
    .from("members")
    .select(`${MEMBER_ID_COLUMN}, full_name, status, mobile_number`)
    .ilike(MEMBER_ID_COLUMN, memberId)
    .maybeSingle()
  if (error) throw new Error(error.message)

  if (memberRow) {
    // MEMBER_ID_COLUMN is resolved at runtime, so the select string is opaque to
    // supabase-js's literal-type parser.
    const row = memberRow as unknown as Record<string, string | null>
    let signinMobile: string | null | undefined
    if (options.signin) {
      // Staff such as DLC-0001-69 have both rows, and the members row can hold
      // a different number from the one they chose for login codes in CDASH.
      // An open staff account decides where the PIN goes, whichever row
      // matched first.
      const staff = await findStaff(supabase, memberId)
      signinMobile = (staff && !staff.deleted_at ? await staffSigninPhone(supabase, staff) : null) || row.mobile_number
    }
    return {
      found: true,
      memberId: row[MEMBER_ID_COLUMN] ?? memberId,
      name: row.full_name ?? "",
      verdict: memberVerdict(row.status),
      source: "member",
      status: row.status,
      mobile: row.mobile_number,
      signinMobile,
    }
  }

  const staff = await findStaff(supabase, memberId)
  if (!staff) return { found: false }
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
    mobile: staff.phone,
    signinMobile: options.signin ? await staffSigninPhone(supabase, staff) : undefined,
  }
}

async function findStaff(supabase: ReturnType<typeof getSupabaseAdmin>, memberId: string) {
  const { data, error } = await supabase
    .from(STAFF_TABLE)
    .select(`${STAFF_ID_COLUMN}, name, role, deleted_at, phone, store_id, otp_phone, otp_phone_type`)
    .ilike(STAFF_ID_COLUMN, memberId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data as unknown as Record<string, string | null> | null
}

/**
 * Where a staff member's sign-in code goes, by the rules CDASH's own login uses
 * (CDASH app/api/auth/otp/send), so the same person is texted at the same number
 * whichever site they sign in to.
 *
 * - Directors, managers and auditors choose in CDASH Settings: a personal number
 *   (`otp_phone`) or a store's phone (`otp_phone` holds the store id). Anything
 *   missing falls back to their account phone, so a half-set choice never locks
 *   them out.
 * - Other staff are texted at their assigned store's phone (CDASH sends nothing
 *   if there is none; the store falls back to their own phone instead).
 *
 * CDASH can also email a director's code instead; the store only sends SMS, so
 * it uses the same phone they would otherwise get.
 */
async function staffSigninPhone(supabase: ReturnType<typeof getSupabaseAdmin>, staff: Record<string, string | null>) {
  const role = (staff.role || "").toLowerCase()
  const privileged = role === "director" || role === "manager" || role === "auditor"
  const storePhone = async (storeId: string | null) => {
    if (!storeId) return null
    const { data } = await supabase.from("stores").select("phone").eq("id", storeId).maybeSingle()
    return (data?.phone as string | null) ?? null
  }
  if (!privileged) return (await storePhone(staff.store_id)) || staff.phone
  let resolved: string | null = null
  if (staff.otp_phone_type === "store" && staff.otp_phone) resolved = await storePhone(staff.otp_phone)
  else if (staff.otp_phone_type === "personal" && staff.otp_phone) resolved = staff.otp_phone
  return resolved || staff.phone
}
