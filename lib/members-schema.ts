/**
 * CDASH `members` table access details.
 *
 * `member_id` is the authoritative public identifier (CDASH migration
 * 20260226000000_implement_member_id_architecture). It is UNIQUE, permanent —
 * a CDASH trigger rejects any attempt to change it — and formatted DLC-XXXX-YY
 * where XXXX is the last four digits of the member's verified mobile number.
 * The older `member_number` column is deprecated and nullable
 * (20260306110000_make_member_number_nullable); do not query it.
 *
 * CDASH_MEMBER_ID_COLUMN stays available as an escape hatch if the live schema
 * ever diverges — set it rather than editing queries one by one.
 */
export const MEMBER_ID_COLUMN = process.env.CDASH_MEMBER_ID_COLUMN || "member_id"

/** Members created from the storefront are tagged with this in `registered_by`. */
export const ONLINE_REGISTRATION_SOURCE = "Online Store"

/** Web registrations are never self-activating — staff approve them in CDASH. */
export const PENDING_STATUS = "pending"

/**
 * Statuses that mean a member may NOT shop. Kept in sync with
 * DEACTIVATED_STATUSES in the CDASH `/api/verify-member` route so both systems
 * agree on who counts as deactivated.
 */
export const DEACTIVATED_STATUSES = new Set(["deactivated", "inactive", "suspended", "banned", "cancelled", "revoked"])

export type MemberVerdict = "active" | "pending" | "deactivated"

/**
 * Store access decision for a CDASH member row.
 *
 * CDASH's own endpoint treats "anything not deactivated" as verified, which
 * would let a member shop the moment they register. The storefront is stricter:
 * `pending` registrations wait for staff approval in CDASH, so they are called
 * out separately and get their own message instead of a blanket "not found".
 */
export function memberVerdict(status: string | null | undefined): MemberVerdict {
  const normalized = (status ?? "").trim().toLowerCase()
  if (DEACTIVATED_STATUSES.has(normalized)) return "deactivated"
  if (normalized === PENDING_STATUS) return "pending"
  return "active"
}

/** Years between a YYYY-MM-DD date of birth and today. */
export function ageInYears(dateOfBirth: string) {
  const born = new Date(`${dateOfBirth}T00:00:00Z`)
  if (Number.isNaN(born.getTime())) return -1
  const now = new Date()
  let age = now.getUTCFullYear() - born.getUTCFullYear()
  const monthDelta = now.getUTCMonth() - born.getUTCMonth()
  if (monthDelta < 0 || (monthDelta === 0 && now.getUTCDate() < born.getUTCDate())) age -= 1
  return age
}
