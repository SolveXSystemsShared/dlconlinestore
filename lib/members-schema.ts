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

/**
 * Status the storefront gives a new member.
 *
 * CDASH's own public self-registration form (`/membership`, registered_by
 * "Self (Public Form)") creates members as "active" straight away, and CDASH
 * has no pending-approval queue to drain — a "pending" row would simply never
 * be looked at. Online registrations therefore activate on the same terms;
 * `registered_by` is what marks where they came from.
 */
export const ONLINE_REGISTRATION_STATUS = "active"

/**
 * Legacy status. No longer written by this app, but rows created before the
 * storefront matched CDASH may still carry it, so `memberVerdict` keeps
 * recognising it and telling those members to speak to the team.
 */
export const PENDING_STATUS = "pending"

/** Where the marketing consent on a storefront registration was captured. */
export const ONLINE_MARKETING_SOURCE = "online_store"

/**
 * Statuses that mean a member may NOT shop.
 *
 * The first six mirror DEACTIVATED_STATUSES in the CDASH `/api/verify-member`
 * route so both systems agree on who counts as deactivated. "paused" and
 * "on_hold" are storefront additions: CDASH does not use them today, but a
 * paused membership must not be able to buy, and it costs nothing to refuse a
 * status that would otherwise fall through to "active" by default.
 */
export const DEACTIVATED_STATUSES = new Set([
  "deactivated", "inactive", "suspended", "banned", "cancelled", "revoked",
  "paused", "on_hold", "on hold",
])

/**
 * CDASH staff — directors, managers, staff, auditors — live in `users`, not
 * `members`, and carry their own DLC-XXXX-YY identifier in `member_number`.
 * They are members of the club too and shop with that ID, so member lookup
 * falls back to this table when `members` has no row.
 *
 * There is no status column: `deleted_at` is CDASH's soft delete
 * (20260526090000_add_users_soft_delete), so a NULL there means a serving
 * staff member.
 */
export const STAFF_TABLE = "users"
export const STAFF_ID_COLUMN = "member_number"

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
