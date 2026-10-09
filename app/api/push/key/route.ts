import { NextResponse } from "next/server"

/**
 * The public half of the push key, so the browser can subscribe. It is public
 * by design; the private half lives only on the servers that send updates.
 * Read at request time so a key added in the host's settings applies on the
 * next deploy without a rebuild.
 */
export async function GET() {
  const key = process.env["VAPID_PUBLIC_KEY"]?.trim()
  if (!key) return NextResponse.json({ error: "Updates are not switched on yet" }, { status: 503 })
  return NextResponse.json({ publicKey: key }, { headers: { "cache-control": "no-store" } })
}
