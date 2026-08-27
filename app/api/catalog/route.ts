import { NextRequest, NextResponse } from "next/server"
import { getCatalog } from "@/lib/catalog"
import { getMemberAccess } from "@/lib/member-access"
import { isPreviewMode, previewCatalog } from "@/lib/preview"

export async function GET(request: NextRequest) {
  try {
    const access = await getMemberAccess()
    if (!access.ageConfirmed || !access.memberId) return NextResponse.json({ error: "Registered DLC member access is required" }, { status: 401 })
    if (isPreviewMode()) return NextResponse.json({ products: previewCatalog() })
    const storeId = new URL(request.url).searchParams.get("storeId") || undefined
    return NextResponse.json({ products: await getCatalog(storeId) })
  } catch (error) {
    console.error("Catalog error", error)
    return NextResponse.json({ error: "Could not load the catalogue" }, { status: 500 })
  }
}
