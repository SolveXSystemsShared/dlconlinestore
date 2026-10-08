import { getSupabaseAdmin } from "./supabase-admin"
import { MEMBER_ID_COLUMN, ONLINE_REGISTRATION_SOURCE, STAFF_ID_COLUMN, STAFF_TABLE } from "./members-schema"
import { lookupMember } from "./members"
import type { MemberProfile } from "./types"
import { getFulfillmentStoreId } from "./store-settings"

/** Everything the account page shows about the person, from whichever table knows them. */
export async function getMemberProfile(memberId: string): Promise<MemberProfile | null> {
  const member = await lookupMember(memberId)
  if (!member.found) return null

  const base = {
    memberId: member.memberId,
    name: member.name,
    source: member.source,
    role: member.role ?? null,
  }

  // A staff member with no membership row has no email or address here, only the
  // phone on their staff account, which pre-fills checkout.
  if (member.source === "staff") {
    const { data: own } = await getSupabaseAdmin().from(STAFF_TABLE).select("phone").ilike(STAFF_ID_COLUMN, member.memberId).maybeSingle()
    return { ...base, editable: false, email: null, mobileNumber: (own?.phone as string | null) ?? null, residentialAddress: null, dateOfBirth: null, memberSince: null, marketingOptIn: null }
  }

  const { data, error } = await getSupabaseAdmin()
    .from("members")
    .select("email, mobile_number, residential_address, date_of_birth, created_at, marketing_opt_in")
    .ilike(MEMBER_ID_COLUMN, member.memberId)
    .maybeSingle()
  if (error) throw new Error(error.message)

  return {
    ...base,
    editable: true,
    email: data?.email ?? null,
    mobileNumber: data?.mobile_number ?? null,
    residentialAddress: data?.residential_address ?? null,
    dateOfBirth: data?.date_of_birth ?? null,
    memberSince: data?.created_at ?? null,
    marketingOptIn: data?.marketing_opt_in ?? null,
  }
}

/**
 * Records a member's own edit in the CDASH audit trail.
 *
 * CDASH logs every member.update its staff make; a change the member made
 * themselves online is no less worth knowing about, and without this a detail
 * would appear to have changed on its own.
 */
export async function logProfileUpdate(memberRowId: string, memberId: string, changed: Record<string, { from: unknown; to: unknown }>) {
  const { error } = await getSupabaseAdmin().from("audit_logs").insert({
    action: "member.update",
    entity_type: "member",
    entity_id: memberRowId,
    user_id: null,
    user_name: ONLINE_REGISTRATION_SOURCE,
    user_role: null,
    store_id: await getFulfillmentStoreId(),
    details: { memberId, changedBy: "member", source: "online_store", changed },
  })
  // The edit stands even if its log line does not.
  if (error) console.error("Profile update audit log failed", error)
}
