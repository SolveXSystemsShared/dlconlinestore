/**
 * Versions of the legal documents, and the exact sentences members accept.
 *
 * One source for three places: the checkbox a member ticks, the statement the
 * server stores as evidence in online_legal_acceptances, and the version shown
 * on the published pages (scripts/build-legal-pages.py reads the versions from
 * this file). Keeping them together is what lets DLC prove, later, exactly
 * which words a member agreed to.
 *
 * When terms.html or privacy.html change in substance: bump the version here,
 * rebuild the pages, and members accept the new version on their next exchange
 * request. A request carrying an older version is refused with a prompt to
 * review the new terms.
 */
export const TERMS_VERSION = "2026-09-29"
export const PRIVACY_VERSION = "2026-09-29"

export type AcceptanceContext = "registration" | "exchange_request"

/** Shown next to the registration checkbox and stored verbatim on acceptance. */
export const REGISTRATION_STATEMENT =
  "I confirm I am 18 or older, that these details are accurate, and that I have read and accept the Terms & Conditions and the Privacy Policy, including how DLC processes my personal information for my membership."

/** Shown next to the bag checkbox and stored verbatim on acceptance. */
export const EXCHANGE_REQUEST_STATEMENT =
  "I have reviewed my bag and accept the Terms & Conditions. I understand this is a request that the DLC team confirms and settles with me at hand-over."
