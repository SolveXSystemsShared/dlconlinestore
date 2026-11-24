import { NextRequest, NextResponse } from "next/server"
import { cspFor, normalisePath, publicFileSet } from "@/lib/csp"
import { MAX_BODY, MAX_REGISTRATION_BODY } from "@/lib/request-body"

/**
 * Front door: the Content-Security-Policy for every response (lib/csp.ts) and,
 * for the API:
 *
 * - Cross-site requests: anything that changes data (POST, PUT, PATCH, DELETE)
 *   must come from this site. The member cookie is SameSite=Lax, which already
 *   stops most forged requests; checking Origin as well covers older browsers
 *   and same-site subdomains. The catalogue sync and the Paystack webhook are called
 *   server-to-server and authenticate themselves, so they are exempt.
 * - Oversized bodies are refused before a route reads them, when they say how
 *   big they are. Registration carries the drawn signature, so it gets more
 *   room than everything else. A request without Content-Length (a bodiless
 *   DELETE, HTTP/2) is let through: the route's reader in lib/request-body.ts
 *   counts the bytes itself and stops at the same limit.
 */
const UNSAFE = new Set(["POST", "PUT", "PATCH", "DELETE"])
// Called by another server, not a browser: the sync authenticates with its own
// token and the Paystack webhook with Paystack's signature.
const SERVER_TO_SERVER = new Set(["/api/catalog/sync", "/api/webhooks/paystack"])

function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin")
  if (origin) return origin === request.nextUrl.origin
  // No Origin header (some older browsers on same-origin requests): fall back
  // to the browser's own Sec-Fetch-Site, and refuse only if it says cross-site.
  const site = request.headers.get("sec-fetch-site")
  return !site || site === "same-origin" || site === "none"
}

function apiDoor(request: NextRequest) {
  const { pathname } = request.nextUrl
  if (!UNSAFE.has(request.method) || SERVER_TO_SERVER.has(pathname)) return NextResponse.next()

  if (!sameOrigin(request)) {
    return NextResponse.json({ error: "Requests must come from the DLC site" }, { status: 403 })
  }

  const declared = request.headers.get("content-length")
  if (declared !== null) {
    // Anything but a whole number of bytes is malformed, not "zero".
    if (!/^\d+$/.test(declared)) {
      return NextResponse.json({ error: "That request could not be read" }, { status: 400 })
    }
    const limit = pathname === "/api/members/register" ? MAX_REGISTRATION_BODY : MAX_BODY
    if (Number(declared) > limit) {
      return NextResponse.json({ error: "That request is too large" }, { status: 413 })
    }
  }

  return NextResponse.next()
}

// Inlined at build time from next.config.mjs.
const PUBLIC_FILES = publicFileSet(process.env.DLC_PUBLIC_FILES)

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const isApi = [pathname, normalisePath(pathname)].some((path) => path === "/api" || path?.startsWith("/api/"))
  const response = isApi ? apiDoor(request) : NextResponse.next()
  // Production only: the dev server needs eval and a websocket for hot reload.
  if (process.env.NODE_ENV === "production") response.headers.set("Content-Security-Policy", cspFor(pathname, PUBLIC_FILES))
  return response
}

// Everything but the built files and images Next serves itself, which are never
// pages. /favicon.ico and the like stay in: here the 404 page answers them.
export const config = { matcher: "/((?!_next/static/|_next/image$).*)" }
