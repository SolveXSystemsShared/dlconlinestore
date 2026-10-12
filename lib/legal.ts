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
export const TERMS_VERSION = "2026-10-05"
export const PRIVACY_VERSION = "2026-10-05"

export type AcceptanceContext = "registration" | "exchange_request"

/** Shown next to the registration checkbox and stored verbatim on acceptance. */
export const REGISTRATION_STATEMENT =
  "I confirm I am 18 or older, that these details are accurate, and that I have read and accept the Terms & Conditions and the Privacy Policy, including how DLC processes my personal information for my membership."

/** Shown next to the bag checkbox and stored verbatim on acceptance. */
export const EXCHANGE_REQUEST_STATEMENT =
  "I have reviewed my bag and accept the Terms & Conditions. I understand I settle this exchange by card now, and that if the DLC team cannot complete it the full settlement is returned to my card."

/**
 * The club rules a new member confirms one by one, word for word the same as
 * the membership form the lounge team shares, so a member signs the same thing
 * whichever form they use. Age and the Privacy Policy are covered by
 * REGISTRATION_STATEMENT. The keys travel to the server; the wording never does.
 */
export const MEMBERSHIP_RULES = [
  { key: "privateClub", text: "I understand DLC is a private membership club, not a cannabis retailer" },
  { key: "personalUse", text: "I agree to use any cannabis received only for my personal, private use" },
  { key: "noResale", text: "I will not resell, distribute, or supply any cannabis to third parties" },
  { key: "contributions", text: "I understand my contributions are not payments for cannabis, but support the Club's private cultivation and operations" },
  { key: "cultivation", text: "I authorise the Club to cultivate cannabis on my behalf and allocate it to me privately" },
  { key: "credits", text: "I accept that R1 = 1 Credit, and that credits have no cash value and cannot be transferred" },
  { key: "healthRisks", text: "I acknowledge the health risks of cannabis and take full responsibility for my use" },
  { key: "termination", text: "I understand my membership may be terminated for any breach of these rules" },
] as const

export type MembershipRuleKey = (typeof MEMBERSHIP_RULES)[number]["key"]

/** The "How credits work" explanation shown above the rules, as on the lounge form. */
export const CREDITS_EXPLAINER = [
  "As a member, you may make voluntary contributions to the Club. For every R1 contributed, you will receive 1 Credit. Credits can be exchanged for cannabis cultivated on your behalf, as well as other available products.",
  "No cash exchange of cannabis takes place.",
] as const

/** What a registration stores as evidence: the statement, then every rule ticked. */
export const REGISTRATION_EVIDENCE = [REGISTRATION_STATEMENT, ...MEMBERSHIP_RULES.map((rule) => `- ${rule.text}`)].join("\n")
