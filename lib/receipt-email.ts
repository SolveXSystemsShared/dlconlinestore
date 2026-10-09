import { getSupabaseAdmin } from "./supabase-admin"
import { MEMBER_ID_COLUMN } from "./members-schema"

/**
 * Paystack will not open a checkout without an email, but the store does not
 * ask members for one. Use the email already on their membership; a member
 * without one gets a placeholder address, so nothing is mailed to a stranger.
 */
export async function receiptEmailFor(memberId: string): Promise<string> {
  const { data } = await getSupabaseAdmin().from("members").select("email").ilike(MEMBER_ID_COLUMN, memberId).maybeSingle()
  const onFile = typeof data?.email === "string" ? data.email.trim() : ""
  // Staff memberships carry an internal @staff.dlc address that is not a real mailbox.
  if (/^\S+@\S+\.\S+$/.test(onFile) && !onFile.endsWith("@staff.dlc")) return onFile
  return `${memberId.toLowerCase()}@members.downlowcannabis.com`
}
