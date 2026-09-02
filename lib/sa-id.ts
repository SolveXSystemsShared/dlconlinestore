/**
 * South African ID number validation.
 *
 * A direct port of CDASH `backend/lib/sa-id.ts`, kept deliberately identical so
 * the storefront never creates a member CDASH's own registration form would
 * have rejected. Format is YYMMDDSSSSCAZ (13 digits).
 */

/** Trim and drop the spaces and hyphens people type into ID fields. */
export function normalizeSaId(value: string) {
  return value.trim().replace(/[\s-]/g, "")
}

const STRUCTURE = /^\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])\d{4}[01][89]\d$/

/** Real calendar date check — catches Feb 30 and friends, which the regex allows. */
function isRealDate(yy: number, mm: number, dd: number) {
  const fullYear = pivotYear(yy)
  const date = new Date(fullYear, mm - 1, dd)
  return date.getFullYear() === fullYear && date.getMonth() === mm - 1 && date.getDate() === dd
}

/** Two-digit years belong to this century until they run past the current year. */
function pivotYear(yy: number) {
  const currentYY = new Date().getFullYear() % 100
  return yy > currentYY ? 1900 + yy : 2000 + yy
}

/**
 * Luhn-style checksum: sum the odd-position digits, double the number formed by
 * the even-position digits and sum its digits, then the check digit is whatever
 * rounds the total up to a multiple of ten.
 */
function checksumIsValid(id: string) {
  let oddSum = 0
  for (let i = 0; i < 12; i += 2) oddSum += Number(id[i])

  let evenConcat = ""
  for (let i = 1; i < 12; i += 2) evenConcat += id[i]

  let digitSum = 0
  for (const digit of String(Number(evenConcat) * 2)) digitSum += Number(digit)

  return (10 - ((oddSum + digitSum) % 10)) % 10 === Number(id[12])
}

export function dateOfBirthFromSaId(id: string) {
  const normalized = normalizeSaId(id)
  if (!STRUCTURE.test(normalized)) return null
  const yy = Number(normalized.slice(0, 2))
  const mm = Number(normalized.slice(2, 4))
  const dd = Number(normalized.slice(4, 6))
  if (!isRealDate(yy, mm, dd)) return null
  return new Date(pivotYear(yy), mm - 1, dd)
}

/**
 * Validates an SA ID and returns the same customer-facing wording CDASH uses,
 * so a member sees one consistent message wherever they register.
 */
export function validateSaId(rawId: string): { valid: boolean; error?: string; normalized: string } {
  const normalized = normalizeSaId(rawId)

  if (normalized.length !== 13) return { valid: false, error: "SA ID Number must be 13 digits", normalized }
  if (!STRUCTURE.test(normalized)) return { valid: false, error: "SA ID Number has invalid structure", normalized }

  const yy = Number(normalized.slice(0, 2))
  const mm = Number(normalized.slice(2, 4))
  const dd = Number(normalized.slice(4, 6))
  if (!isRealDate(yy, mm, dd)) return { valid: false, error: "SA ID Number contains an invalid date", normalized }

  // Citizenship digit: 0 = citizen, 1 = permanent resident.
  const citizenship = normalized[10]
  if (citizenship !== "0" && citizenship !== "1") {
    return { valid: false, error: "SA ID Number has invalid citizenship digit", normalized }
  }

  // Historically a race digit; every modern ID carries 8 or 9 here.
  const aDigit = normalized[11]
  if (aDigit !== "8" && aDigit !== "9") return { valid: false, error: "SA ID Number has invalid format", normalized }

  if (!checksumIsValid(normalized)) {
    return { valid: false, error: "SA ID Number is invalid (checksum failed)", normalized }
  }

  return { valid: true, normalized }
}
