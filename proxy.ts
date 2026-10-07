import { NextRequest, NextResponse } from "next/server"

/**
 * Front door for the API.
 *
 * - Cross-site requests: anything that changes data (POST, PUT, PATCH, DELETE)
 *   must come from this site. The member cookie is SameSite=Lax, which already
 *   stops most forged requests; checking Origin as well covers older browsers
 *   and same-site subdomains. The catalogue sync and the Paystack webhook are called
 *   server-to-server and authenticate themselves, so they are exempt.
 * - Oversized bodies are refused before a route reads them. Registration
 *   carries the drawn signature, so it gets more room than everything else.
 */
const UNSAFE = new Set(["POST", "PUT", "PATCH", "DELETE"])
// Called by another server, not a browser: the sync authenticates with its own
// token and the Paystack webhook with Paystack's signature.
const SERVER_TO_SERVER = new Set(["/api/catalog/sync", "/api/webhooks/paystack"])
const MAX_BODY = 64 * 1024
const MAX_REGISTRATION_BODY = 1024 * 1024

function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin")
  if (origin) return origin === request.nextUrl.origin
  // No Origin header (some older browsers on same-origin requests): fall back
  // to the browser's own Sec-Fetch-Site, and refuse only if it says cross-site.
  const site = request.headers.get("sec-fetch-site")
  return !site || site === "same-origin" || site === "none"
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  if (!UNSAFE.has(request.method) || SERVER_TO_SERVER.has(pathname)) return NextResponse.next()

  if (!sameOrigin(request)) {
    return NextResponse.json({ error: "Requests must come from the DLC site" }, { status: 403 })
  }

  const length = Number(request.headers.get("content-length") || 0)
  const limit = pathname === "/api/members/register" ? MAX_REGISTRATION_BODY : MAX_BODY
  if (length > limit) {
    return NextResponse.json({ error: "That request is too large" }, { status: 413 })
  }

  return NextResponse.next()
}

export const config = { matcher: "/api/:path*" }
