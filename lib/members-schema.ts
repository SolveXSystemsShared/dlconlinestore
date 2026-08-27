/**
 * CDASH `members` table access details.
 *
 * NOTE: the CDASH Prisma migration (20260219000000_add_members) defines the
 * unique member identifier as `member_number`, while the rest of this app
 * queries `member_id`. The live Supabase schema is the authority. If member
 * lookup or registration fails with "column does not exist", set
 * CDASH_MEMBER_ID_COLUMN to the correct column name rather than editing
 * queries one by one.
 */
export const MEMBER_ID_COLUMN = process.env.CDASH_MEMBER_ID_COLUMN || "member_id"

/** Members created from the storefront are tagged with this in `registered_by`. */
export const ONLINE_REGISTRATION_SOURCE = "Online Store"

/** Web registrations are never self-activating — staff approve them in CDASH. */
export const PENDING_STATUS = "pending"

/** Generates a DLC-1234-56 style member number. */
export function generateMemberNumber() {
  const block = Math.floor(1000 + Math.random() * 9000)
  const suffix = Math.floor(10 + Math.random() * 90)
  return `DLC-${block}-${suffix}`
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
