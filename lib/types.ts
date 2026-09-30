export type CatalogProduct = {
  id: string
  slug: string
  name: string
  productType: string
  grade: string | null
  /** From CDASH inventory. Sparse — only ~a fifth of stock carries one. */
  brand: string | null
  description: string | null
  imageUrl: string | null
  price: number
  availableQuantity: number
  storeId: string | null
}

export type CartLine = CatalogProduct & { quantity: number }

export type SavedAddress = {
  id: string
  label: string | null
  recipient: string
  phone: string
  line1: string
  line2: string | null
  suburb: string | null
  city: string | null
  postalCode: string | null
  notes: string | null
  isDefault: boolean
}

/**
 * The member's own details.
 *
 * `editable` is false for CDASH staff who shop on a `users.member_number` and
 * have no `members` row — there is nothing to edit, and inventing one from the
 * storefront would create a membership record nobody applied for.
 */
export type MemberProfile = {
  memberId: string
  name: string
  source: "member" | "staff"
  role: string | null
  editable: boolean
  email: string | null
  mobileNumber: string | null
  residentialAddress: string | null
  dateOfBirth: string | null
  memberSince: string | null
  marketingOptIn: boolean | null
}

/** One exchange request in the member's history. Deliberately carries no credits or totals. */
export type OrderSummary = {
  id: string
  orderNumber: string
  status: string
  createdAt: string
  itemCount: number
  items: Array<{ name: string; type: string; grade: string | null; quantity: number }>
}

/**
 * The checkout total as CDASH computed it.
 *
 * Both channels come back because §7 rule 2 gives ONE membership discount and it
 * matches how the member pays — online, that is only known at the door. Where
 * only one figure fits, show the card one: it is the smaller discount at every
 * tier, so it can never under-quote.
 */
export type CheckoutQuoteChannel = {
  channel: "card" | "cash"
  goodsTotal: number
  deliveryFee: number
  amountDue: number
  memberDiscountPercent: number
  memberDiscountAmount: number
  creditsApplied: number
  pointsEarned: number
}

export type CheckoutQuote = {
  tier: { key: string; name: string } | null
  gross: number
  credits: { balance: number; maxOnThisBasket: number; basketCapPercent: number }
  card: CheckoutQuoteChannel
  cash: CheckoutQuoteChannel
  /** Always false — prices come from our catalogue, so a quote is a preview. */
  authoritative: boolean
}
