export type CatalogProduct = {
  id: string
  slug: string
  name: string
  productType: string
  grade: string | null
  description: string | null
  imageUrl: string | null
  price: number
  availableQuantity: number
  storeId: string | null
}

export type CartLine = CatalogProduct & { quantity: number }
