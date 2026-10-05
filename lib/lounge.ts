import { getSupabaseAdmin } from "./supabase-admin"

/**
 * The lounge packages and in-store extras, for the public Packages page.
 *
 * CDASH owns these numbers: directors edit them on /director/lounge-settings and
 * they are stored as one JSON row in `product_config`
 * (config_key = 'lounge_membership_config'). We only READ that row, keep the
 * fields a member needs to compare packages, and drop everything internal
 * (build cost, channel costs, staff-guest rules).
 *
 * If the row is missing or unreadable the page falls back to CDASH's
 * published V4 figures (DEFAULT_LOUNGE_CONFIG in CDASH's
 * backend/lib/lounge-config.ts) — the same fallback the till uses, so the page
 * and the counter never disagree.
 */

export type LoungePackage = {
  key: string
  name: string
  kind: "individual" | "squad" | "day_pass"
  billingPeriod: "monthly" | "per_visit"
  credits: number
  perVisitCredits: number | null
  squadSize: number | null
  cardPercent: number
  cashPercent: number
  /** null = unlimited (subject to the turn cap). */
  playstationMinutes: number | null
  earnsPoints: boolean
  earnsReferralRewards: boolean
  birthdayCredits: number
  memberEvents: boolean
  earlyProductAccess: "none" | "selected" | "full"
  description: string
}

export type LoungeInfo = {
  packages: LoungePackage[]
  freeAccess: { enabled: boolean; minSpend: number; hours: number }
  playstation: { turnCapMinutes: number; consoleCount: number; extraTime: Array<{ label: string; credits: number }> }
  rewards: {
    bands: Array<{ from: number; to: number | null; percent: number }>
    pointsPerCredit: number
    basketCapPercent: number
    visitBonus: { visits: number; points: number }
    referralPoints: number
  }
}

const DEFAULT_PACKAGES: LoungePackage[] = [
  { key: "day_pass", name: "Day Pass", kind: "day_pass", billingPeriod: "per_visit", credits: 20, perVisitCredits: null, squadSize: null, cardPercent: 0, cashPercent: 0, playstationMinutes: 0, earnsPoints: false, earnsReferralRewards: false, birthdayCredits: 0, memberEvents: false, earlyProductAccess: "none", description: "Lounge access only. No discount, no points, no PlayStation." },
  { key: "cloud", name: "Cloud", kind: "individual", billingPeriod: "monthly", credits: 99, perVisitCredits: null, squadSize: null, cardPercent: 3, cashPercent: 5, playstationMinutes: 30, earnsPoints: true, earnsReferralRewards: true, birthdayCredits: 100, memberEvents: true, earlyProductAccess: "none", description: "30 min PlayStation per day." },
  { key: "cloud_plus", name: "Cloud Plus", kind: "individual", billingPeriod: "monthly", credits: 199, perVisitCredits: null, squadSize: null, cardPercent: 5, cashPercent: 9, playstationMinutes: 60, earnsPoints: true, earnsReferralRewards: true, birthdayCredits: 150, memberEvents: true, earlyProductAccess: "selected", description: "1 hr PlayStation per day. Selected early product access." },
  { key: "cloud_nine", name: "Cloud Nine", kind: "individual", billingPeriod: "monthly", credits: 349, perVisitCredits: null, squadSize: null, cardPercent: 7, cashPercent: 13, playstationMinutes: null, earnsPoints: true, earnsReferralRewards: true, birthdayCredits: 200, memberEvents: true, earlyProductAccess: "full", description: "Unlimited PlayStation, subject to the turn cap. Priority at member events." },
  { key: "squad_3", name: "Squad of 3", kind: "squad", billingPeriod: "monthly", credits: 200, perVisitCredits: 50, squadSize: 3, cardPercent: 5, cashPercent: 9, playstationMinutes: 90, earnsPoints: false, earnsReferralRewards: false, birthdayCredits: 0, memberEvents: false, earlyProductAccess: "none", description: "Named group of 3. Cloud Plus discount rates, no points or birthday rewards." },
  { key: "squad_5", name: "Squad of 5", kind: "squad", billingPeriod: "monthly", credits: 250, perVisitCredits: 75, squadSize: 5, cardPercent: 5, cashPercent: 9, playstationMinutes: 90, earnsPoints: false, earnsReferralRewards: false, birthdayCredits: 0, memberEvents: false, earlyProductAccess: "none", description: "Named group of 5. Cloud Plus discount rates, no points or birthday rewards." },
  { key: "squad_7", name: "Squad of 7", kind: "squad", billingPeriod: "monthly", credits: 450, perVisitCredits: 100, squadSize: 7, cardPercent: 5, cashPercent: 9, playstationMinutes: 90, earnsPoints: false, earnsReferralRewards: false, birthdayCredits: 0, memberEvents: false, earlyProductAccess: "none", description: "Named group of 7. Cloud Plus discount rates, no points or birthday rewards." },
]

const DEFAULT_INFO: Omit<LoungeInfo, "playstation"> & { playstation: Omit<LoungeInfo["playstation"], "extraTime"> } = {
  packages: DEFAULT_PACKAGES,
  freeAccess: { enabled: true, minSpend: 200, hours: 24 },
  playstation: { turnCapMinutes: 30, consoleCount: 1 },
  rewards: {
    bands: [{ from: 0, to: 499, percent: 2 }, { from: 500, to: 1499, percent: 5 }, { from: 1500, to: 2999, percent: 7 }, { from: 3000, to: null, percent: 10 }],
    pointsPerCredit: 10,
    basketCapPercent: 20,
    visitBonus: { visits: 5, points: 100 },
    referralPoints: 200,
  },
}

// Stored config is JSON written by a director's form: coerce, never trust.
const num = (v: unknown, fallback: number) => (Number.isFinite(Number(v)) && v !== null && v !== "" ? Number(v) : fallback)
const pct = (v: unknown, fallback: number) => { const n = num(v, fallback); return n >= 0 && n <= 100 ? n : fallback }
const bool = (v: unknown, fallback: boolean) => (typeof v === "boolean" ? v : fallback)
const text = (v: unknown, fallback: string) => (typeof v === "string" && v.trim() ? v.trim() : fallback)
const oneOf = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T => (allowed as readonly unknown[]).includes(v) ? (v as T) : fallback

function readPackage(raw: Record<string, unknown>): LoungePackage | null {
  const key = text(raw.key, "")
  // spend_access is the free window the till grants, never a package to choose.
  if (!key || key === "spend_access" || raw.isActive === false) return null
  const base = DEFAULT_PACKAGES.find((p) => p.key === key)
  const kind = oneOf(raw.kind, ["individual", "squad", "day_pass"] as const, base?.kind ?? "individual")
  const ps = raw.playstationMinutes
  return {
    key,
    name: text(raw.name, base?.name ?? key),
    kind,
    billingPeriod: oneOf(raw.billingPeriod, ["monthly", "per_visit"] as const, base?.billingPeriod ?? "monthly"),
    credits: Math.max(0, num(raw.price, base?.credits ?? 0)),
    perVisitCredits: kind === "squad" ? Math.max(0, num(raw.perVisitPrice, base?.perVisitCredits ?? 0)) : null,
    squadSize: kind === "squad" ? Math.max(1, Math.round(num(raw.squadSize, base?.squadSize ?? 1))) : null,
    cardPercent: pct(raw.cardDiscountPercent, base?.cardPercent ?? 0),
    cashPercent: pct(raw.cashDiscountPercent, base?.cashPercent ?? 0),
    // null is meaningful (unlimited); only a missing field falls back.
    playstationMinutes: ps === null ? null : ps === undefined ? (base ? base.playstationMinutes : 0) : Math.max(0, num(ps, 0)),
    earnsPoints: bool(raw.earnsPoints, base?.earnsPoints ?? false),
    earnsReferralRewards: bool(raw.earnsReferralRewards, base?.earnsReferralRewards ?? false),
    birthdayCredits: Math.max(0, num(raw.birthdayCreditValue, base?.birthdayCredits ?? 0)),
    memberEvents: bool(raw.memberEvents, base?.memberEvents ?? false),
    earlyProductAccess: oneOf(raw.earlyProductAccess, ["none", "selected", "full"] as const, base?.earlyProductAccess ?? "none"),
    description: text(raw.description, base?.description ?? ""),
  }
}

let cache: { at: number; value: LoungeInfo } | null = null
const CACHE_MS = 60_000

export async function getLoungeInfo(): Promise<LoungeInfo> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.value
  const supabase = getSupabaseAdmin()
  const [configResult, extraTime] = await Promise.all([
    supabase.from("product_config").select("config_value").eq("config_key", "lounge_membership_config").maybeSingle(),
    readExtraConsoleTime(),
  ])
  if (configResult.error) console.error("Lounge config read failed, using published defaults", configResult.error)
  const c = (configResult.data?.config_value ?? {}) as Record<string, any>

  const packages = Array.isArray(c.tiers)
    ? c.tiers.map((t: unknown) => (t && typeof t === "object" ? readPackage(t as Record<string, unknown>) : null)).filter((p: LoungePackage | null): p is LoungePackage => Boolean(p))
    : []
  const bands = Array.isArray(c.points?.bands)
    ? c.points.bands
        .map((b: Record<string, unknown>) => ({ from: num(b?.fromAmount, NaN), percent: pct(b?.ratePercent, NaN) }))
        .filter((b: { from: number; percent: number }) => Number.isFinite(b.from) && Number.isFinite(b.percent))
        .sort((a: { from: number }, b: { from: number }) => a.from - b.from)
    : []
  const d = DEFAULT_INFO

  const value: LoungeInfo = {
    packages: packages.length ? packages : d.packages,
    freeAccess: {
      enabled: bool(c.spendAccess?.enabled, d.freeAccess.enabled),
      minSpend: Math.max(0, num(c.spendAccess?.minSpend, d.freeAccess.minSpend)),
      hours: Math.max(1, num(c.spendAccess?.hours, d.freeAccess.hours)),
    },
    playstation: {
      turnCapMinutes: Math.max(1, Math.round(num(c.playstation?.turnCapMinutes, d.playstation.turnCapMinutes))),
      consoleCount: Math.max(1, Math.round(num(c.playstation?.consoleCount, d.playstation.consoleCount))),
      extraTime,
    },
    rewards: {
      // Each band runs up to the next one's start, as CDASH reads them.
      bands: bands.length
        ? bands.map((b: { from: number; percent: number }, i: number) => ({ ...b, to: i < bands.length - 1 ? bands[i + 1].from - 1 : null }))
        : d.rewards.bands,
      pointsPerCredit: Math.max(1, num(c.points?.pointsPerCredit, d.rewards.pointsPerCredit)),
      basketCapPercent: pct(c.points?.redemptionBasketCapPercent, d.rewards.basketCapPercent),
      visitBonus: {
        visits: Math.max(1, Math.round(num(c.visitBonus?.visitsRequired, d.rewards.visitBonus.visits))),
        points: Math.max(0, Math.round(num(c.visitBonus?.points, d.rewards.visitBonus.points))),
      },
      referralPoints: Math.max(0, Math.round(num(c.referral?.points, d.rewards.referralPoints))),
    },
  }
  cache = { at: Date.now(), value }
  return value
}

/** Extra console time sold at the counter: the active PlayStation activity's tiers. */
async function readExtraConsoleTime(): Promise<Array<{ label: string; credits: number }>> {
  const supabase = getSupabaseAdmin()
  const { data: activities, error } = await supabase.from("activities").select("id, name").eq("is_active", true)
  if (error || !activities) return []
  const ps = activities.find((a) => /ps\s?5|playstation/i.test(a.name || ""))
  if (!ps) return []
  const { data: tiers } = await supabase.from("activity_tiers").select("label, price, duration_minutes").eq("activity_id", ps.id).order("duration_minutes")
  return (tiers || []).filter((t) => Number(t.price) > 0).map((t) => ({ label: String(t.label), credits: Number(t.price) }))
}
