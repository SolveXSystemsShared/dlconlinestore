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

export type OrderSummary = {
  id: string
  orderNumber: string
  status: string
  total: number
  createdAt: string
  itemCount: number
}
