import { NextResponse } from "next/server"
import { getCatalogCached } from "@/lib/catalog"
import { getMemberAccess } from "@/lib/member-access"
import { isPreviewMode, previewCatalog } from "@/lib/preview"


export async function GET() {
  try {
    const access = await getMemberAccess()
    if (!access.ageConfirmed || !access.memberId) return NextResponse.json({ error: "Registered DLC member access is required" }, { status: 401 })
    if (isPreviewMode()) return NextResponse.json({ products: previewCatalog() })
    // Always the fulfilment store's shelf. A caller-chosen store id used to be
    // accepted here: it went unescaped into PostgREST or() filters and each new
    // value added a catalogue cache entry that was never cleared.
    // Shared 20-second copy — see getCatalogCached.
    const products = await getCatalogCached()
    return NextResponse.json({ products })
  } catch (error) {
    console.error("Catalog error", error)
    return NextResponse.json({ error: "Could not load the catalogue" }, { status: 500 })
  }
}
