export function money(value: number) {
  return new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" }).format(value)
}

export function normalizeMemberId(value: string) {
  return value.trim().toUpperCase()
}

/**
 * DLC Member IDs are DLC-1234-56: a fixed prefix, four digits, two digits.
 * The input keeps the prefix in place and inserts the separators as the
 * customer types, so they only ever key in the six digits.
 */
export const MEMBER_ID_PREFIX = "DLC-"
const MEMBER_ID_DIGITS = 6

export function formatMemberId(raw: string) {
  const digits = raw.replace(/\D/g, "").slice(0, MEMBER_ID_DIGITS)
  if (digits.length <= 4) return `${MEMBER_ID_PREFIX}${digits}`
  return `${MEMBER_ID_PREFIX}${digits.slice(0, 4)}-${digits.slice(4)}`
}

export function isCompleteMemberId(value: string) {
  return value.replace(/\D/g, "").length === MEMBER_ID_DIGITS
}
