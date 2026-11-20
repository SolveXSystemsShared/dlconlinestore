import { beforeEach, describe, expect, it, vi } from "vitest"

const PRODUCT_ID = "3f2b8c1e-6a4d-4e2f-9b1a-7c5d8e9f0a1b"

// A stand-in for the Supabase query builder: every filter returns the builder,
// and awaiting it resolves to whatever the table was given. Postgres returns
// UUIDs in lower case, so the fake does too.
const tables: Record<string, unknown[]> = {}
const queried: Array<{ table: string; ids?: string[] }> = []

function builder(table: string) {
  const query: Record<string, unknown> = {}
  const chain = () => query
  for (const name of ["select", "eq", "ilike", "gt", "limit", "or"]) query[name] = chain
  query.in = (_column: string, ids: string[]) => {
    queried[queried.length - 1].ids = ids
    return query
  }
  query.then = (resolve: (value: unknown) => unknown) => resolve({ data: tables[table] ?? [], error: null })
  return query
}

vi.mock("./supabase-admin", () => ({
  getSupabaseAdmin: () => ({
    from: (table: string) => {
      queried.push({ table })
      return builder(table)
    },
  }),
}))

const { normaliseOrderItems, resolveOrderLines } = await import("./order-lines")

describe("normaliseOrderItems", () => {
  it("lower-cases each product id", () => {
    expect(normaliseOrderItems([{ productId: PRODUCT_ID.toUpperCase(), quantity: 2 }])).toEqual({
      items: [{ productId: PRODUCT_ID, quantity: 2 }],
    })
  })

  it("refuses a product listed twice", () => {
    const result = normaliseOrderItems([
      { productId: PRODUCT_ID, quantity: 1 },
      { productId: PRODUCT_ID, quantity: 3 },
    ])
    expect(result).toEqual({ error: "Each product can only appear once", status: 400 })
  })

  it("refuses ids that differ only in case", () => {
    const result = normaliseOrderItems([
      { productId: PRODUCT_ID, quantity: 1 },
      { productId: PRODUCT_ID.toUpperCase(), quantity: 1 },
    ])
    expect(result).toEqual({ error: "Each product can only appear once", status: 400 })
  })
})

describe("resolveOrderLines", () => {
  beforeEach(() => {
    queried.length = 0
    tables.online_products = [{
      id: PRODUCT_ID,
      display_name: "Lemon Haze",
      product_type: "Bud",
      strain_name: "Lemon Haze",
      grade: "AAA",
      price_override: 150,
      is_published: true,
    }]
  })

  it("prices an upper-case product id instead of throwing", async () => {
    const result = await resolveOrderLines([{ productId: PRODUCT_ID.toUpperCase(), quantity: 2 }], null)
    expect(result).toEqual({
      lines: [{
        productId: PRODUCT_ID,
        productType: "Bud",
        strainName: "Lemon Haze",
        grade: "AAA",
        displayName: "Lemon Haze",
        quantity: 2,
        unitPrice: 150,
        lineTotal: 300,
      }],
    })
    expect(queried[0]).toEqual({ table: "online_products", ids: [PRODUCT_ID] })
  })

  it("returns 400 for a repeated product before querying Supabase", async () => {
    const result = await resolveOrderLines([
      { productId: PRODUCT_ID, quantity: 1 },
      { productId: PRODUCT_ID.toUpperCase(), quantity: 1 },
    ], null)
    expect(result).toEqual({ error: "Each product can only appear once", status: 400 })
    expect(queried).toEqual([])
  })
})
