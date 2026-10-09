import { getSupabaseAdmin } from "./supabase-admin"
import { STAFF_ID_COLUMN, STAFF_TABLE } from "./members-schema"

/**
 * An open shift older than this was never clocked out. CDASH treats it as
 * abandoned rather than still working (MAX_SHIFT_HOURS in its shift-limits), so
 * the store does too, or someone who forgot to clock out last week could never
 * shop online again.
 */
const MAX_OPEN_SHIFT_MS = 20 * 60 * 60 * 1000

/**
 * Is this Member ID a staff member who is clocked in right now?
 *
 * Staff may shop online like any member, but not while they are working. A
 * shift is open while `shifts.ended_at` is null; both apps share the table.
 * Anyone who is not staff, or has no open shift, is simply not clocked in.
 */
export async function isStaffClockedIn(memberId: string): Promise<boolean> {
  const supabase = getSupabaseAdmin()
  const { data: staff, error: staffError } = await supabase
    .from(STAFF_TABLE)
    .select("name")
    .ilike(STAFF_ID_COLUMN, memberId)
    .is("deleted_at", null)
    .maybeSingle()
  if (staffError) throw new Error(staffError.message)
  if (!staff?.name) return false

  const { data: shift, error: shiftError } = await supabase
    .from("shifts")
    .select("started_at")
    .eq("staff_name", staff.name)
    .is("ended_at", null)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (shiftError) throw new Error(shiftError.message)
  if (!shift?.started_at) return false

  return Date.now() - new Date(shift.started_at).getTime() <= MAX_OPEN_SHIFT_MS
}

export const CLOCKED_IN_MESSAGE = "You are clocked in, so you cannot place an exchange on the online store while you are on shift. Clock out first, then try again."
