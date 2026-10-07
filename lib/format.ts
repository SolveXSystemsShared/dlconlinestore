/**
 * DLC amounts are credits, never currency — compliance wording, not styling.
 * Keep in step with price() in public/store.js: "C 79.99" (no-break space).
 */
export function credits(value: number) {
  // A no-break space, so "C 79.99" never splits across two lines.
  return `C\u00a0${Number(value || 0).toFixed(2)}`
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

/**
 * Exchange-request statuses in member-facing words. The database keeps its own
 * status names (pending_payment, paid…); members never see those.
 */
const EXCHANGE_STATUS: Record<string, string> = {
  draft: "Draft",
  pending_payment: "Awaiting settlement",
  pending: "Received",
  paid: "Settled",
  preparing: "Preparing",
  ready: "Ready to collect",
  out_for_delivery: "Collected",
  completed: "Completed",
  cancelled: "Cancelled",
  expired: "Expired",
}

export function exchangeStatus(status: string) {
  return EXCHANGE_STATUS[status] ?? status.replaceAll("_", " ")
}
