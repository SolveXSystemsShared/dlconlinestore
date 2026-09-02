import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { getMemberAccess } from "@/lib/member-access"
import { getCatalog } from "@/lib/catalog"
import type { CatalogProduct } from "@/lib/types"

/**
 * Saved items.
 *
 * Unlike the bag, a wishlist row survives its product going out of stock —
 * wanting something is exactly what you do when it is unavailable. Rows are
 * returned with `inStock` so the page can offer "add to bag" or "we'll restock"
 * rather than dropping the item.
 */
async function readWishlist(memberId: string) {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from("online_wishlist_items")
    .select("online_product_id, created_at, online_products(id, slug, display_name, product_type, grade, description, image_url)")
    .eq("member_id", memberId)
    .order("created_at", { ascending: false })
  if (error) throw new Error(error.message)

  const catalog = await getCatalog()
  const live = new Map(catalog.map((product) => [product.id, product]))

  return (data || []).map((row) => {
    const product = live.get(row.online_product_id)
    // The join gives the name and picture even when the item is off the shelf.
    const saved = (Array.isArray(row.online_products) ? row.online_products[0] : row.online_products) as
      | { id: string; slug: string; display_name: string; product_type: string; grade: string | null; description: string | null; image_url: string | null }
      | undefined
    const item: CatalogProduct & { inStock: boolean } = {
      id: row.online_product_id,
      slug: product?.slug ?? saved?.slug ?? "",
      name: product?.name ?? saved?.display_name ?? "Unavailable item",
      productType: product?.productType ?? saved?.product_type ?? "",
      grade: product?.grade ?? saved?.grade ?? null,
      brand: product?.brand ?? null,
      description: product?.description ?? saved?.description ?? null,
      imageUrl: product?.imageUrl ?? saved?.image_url ?? null,
      price: product?.price ?? 0,
      availableQuantity: product?.availableQuantity ?? 0,
      storeId: product?.storeId ?? null,
      inStock: Boolean(product),
    }
    return item
  })
}

export async function GET() {
  const access = await getMemberAccess()
  if (!access.ageConfirmed || !access.memberId) return NextResponse.json({ error: "Member access required" }, { status: 401 })
  try {
    return NextResponse.json({ items: await readWishlist(access.memberId) })
  } catch (error) {
    console.error("Wishlist load error", error)
    return NextResponse.json({ error: "Could not load your saved items" }, { status: 500 })
  }
}

const input = z.object({ productId: z.string().uuid() })

export async function POST(request: NextRequest) {
  const access = await getMemberAccess()
  if (!access.ageConfirmed || !access.memberId) return NextResponse.json({ error: "Member access required" }, { status: 401 })
  try {
    const parsed = input.safeParse(await request.json())
    if (!parsed.success) return NextResponse.json({ error: "Please provide a valid product" }, { status: 400 })
    // Saving something already saved is the same wish, not an error.
    const { error } = await getSupabaseAdmin()
      .from("online_wishlist_items")
      .upsert({ member_id: access.memberId, online_product_id: parsed.data.productId }, { onConflict: "member_id,online_product_id", ignoreDuplicates: true })
    if (error) throw error
    return NextResponse.json({ items: await readWishlist(access.memberId) }, { status: 201 })
  } catch (error) {
    console.error("Wishlist add error", error)
    return NextResponse.json({ error: "Could not save that item" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  const access = await getMemberAccess()
  if (!access.ageConfirmed || !access.memberId) return NextResponse.json({ error: "Member access required" }, { status: 401 })
  try {
    const parsed = input.safeParse(await request.json())
    if (!parsed.success) return NextResponse.json({ error: "Please provide a valid product" }, { status: 400 })
    const { error } = await getSupabaseAdmin()
      .from("online_wishlist_items").delete()
      .eq("member_id", access.memberId).eq("online_product_id", parsed.data.productId)
    if (error) throw error
    return NextResponse.json({ items: await readWishlist(access.memberId) })
  } catch (error) {
    console.error("Wishlist remove error", error)
    return NextResponse.json({ error: "Could not remove that item" }, { status: 500 })
  }
}
