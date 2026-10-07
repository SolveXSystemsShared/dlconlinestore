/**
 * South African mobile numbers, for registration and the SMS sign-in PIN.
 *
 * The same rules as CDASH (backend/lib/phone-validation.ts, member-phone.ts and
 * phone-key.ts), so a number is valid, saved and matched the same way
 * whichever site a member registers on. Pure functions (no database), so the
 * form in the browser and the API route share them.
 */

/** A mobile is 0 or +27 or 27, then 6, 7 or 8, then 8 more digits. */
const SA_MOBILE = /^(?:0|\+?27)([678]\d{8})$/

/**
 * "082 123 4567", "0821234567", "+27 82 123 4567" and "27821234567" all give
 * `{ stored: "+27821234567", display: "082 123 4567" }`; anything else is null.
 * `stored` is what goes in members.mobile_number, as CDASH saves it.
 */
export function parseSaMobile(input: string): { stored: string; display: string } | null {
  const match = SA_MOBILE.exec(input.replace(/[\s()-]/g, ""))
  if (!match) return null
  const national = match[1]
  return { stored: `+27${national}`, display: `0${national.slice(0, 2)} ${national.slice(2, 5)} ${national.slice(5)}` }
}

/**
 * One comparable key for a number however it was typed or saved: all of
 * "+27821234567", "0821234567" and "27 82 123 4567" give "0821234567". Members
 * saved before the storefront existed carry both the 0… and +27… forms, so
 * duplicates have to be compared by key, not by exact text.
 */
export function phoneKey(phone: string | null | undefined): string {
  const digits = (phone ?? "").replace(/\D/g, "")
  if (digits.length === 11 && digits.startsWith("27")) return `0${digits.slice(2)}`
  if (digits.length === 9 && /^[678]/.test(digits)) return `0${digits}`
  return digits
}
