import { NextRequest, NextResponse } from "next/server"
import { getCatalogCached } from "@/lib/catalog"
import { getMemberAccess } from "@/lib/member-access"
import { isPreviewMode, previewCatalog } from "@/lib/preview"


export async function GET(request: NextRequest) {
  try {
    const access = await getMemberAccess()
    if (!access.ageConfirmed || !access.memberId) return NextResponse.json({ error: "Registered DLC member access is required" }, { status: 401 })
    if (isPreviewMode()) return NextResponse.json({ products: previewCatalog() })
    const storeId = new URL(request.url).searchParams.get("storeId") || undefined
    // Shared 20-second copy — see getCatalogCached.
    const products = await getCatalogCached(storeId)
    return NextResponse.json({ products })
  } catch (error) {
    console.error("Catalog error", error)
    return NextResponse.json({ error: "Could not load the catalogue" }, { status: 500 })
  }
}
