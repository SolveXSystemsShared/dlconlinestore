import { readdirSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { PHASE_PRODUCTION_BUILD } from "next/constants.js"

const PUBLIC_DIR = fileURLToPath(new URL("./public", import.meta.url))

/** Every file in public/, as the URL path it is served at. */
export function listPublicFiles(dir = PUBLIC_DIR, base = "") {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = `${base}/${entry.name}`
    return entry.isDirectory() ? listPublicFiles(join(dir, entry.name), path) : [path]
  }).sort()
}

/** The list, or an empty one when public/ cannot be read: lib/csp.ts then falls back to the strict policy. */
function publicFiles() {
  try { return listPublicFiles() } catch { return [] }
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Don't advertise the framework (X-Powered-By: Next.js) to scanners.
  poweredByHeader: false,
  // Built into proxy.ts, which tells the static storefront from the React pages
  // by it, without reading the disk on each request. Public URL paths only.
  env: { DLC_PUBLIC_FILES: JSON.stringify(publicFiles()) },
  experimental: {
    // proxy.ts runs on every /api request, so Next buffers each body for it,
    // up to 10 MB by default. No route accepts more than 1 MB (registration;
    // lib/request-body.ts). Past this limit Next drops the chunk that crosses
    // it and hands the route only what came before, so the limit sits a full
    // 1 MB above registration's cap: what is left of a cut-off body is still
    // over every route's cap, and the route answers 413.
    proxyClientMaxBodySize: 2 * 1024 * 1024,
  },
  // The storefront (lounge, collections, product pages) is the static site in
  // public/. It talks to the same /api routes as the React pages, so `/` just
  // serves its lounge; checkout, account and registration stay in app/.
  // Member-facing URLs use the exchange wording; the old paths still land.
  async redirects() {
    return [
      { source: "/checkout", destination: "/bag", permanent: true },
      { source: "/order/:id", destination: "/exchange/:id", permanent: true },
      // The old full-menu page is no longer linked; the shelf pages replace it.
      { source: "/menu", destination: "/strains.html", permanent: false },
    ]
  },
  // Slow connections: the lounge video — most of the bytes — is downloaded
  // once and kept for a week. Artwork, scripts and styles are revalidated on
  // every load (a tiny 304 when unchanged) so a deploy never shows old
  // pictures or pairs new pages with old scripts.
  async headers() {
    // The Content-Security-Policy is sent by proxy.ts (see lib/csp.ts).
    const security = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
      { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
      // No other site can open this one in a shared window, embed its files,
      // or load it into a Flash/PDF cross-domain policy.
      { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
      { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
      { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
    ]
    // Member data must never be stored by the browser's back button, a shared
    // proxy or a CDN: every API answer and every server-rendered member page.
    const noStore = [{ key: "Cache-Control", value: "private, no-store, max-age=0" }]
    return [
      { source: "/:path*", headers: security },
      { source: "/api/:path*", headers: noStore },
      { source: "/exchange/:path*", headers: noStore },
      // Artwork is swapped in place under the same file name, so the browser
      // checks for a newer copy on every load (a tiny 304 when unchanged).
      { source: "/assets/:path*", headers: [{ key: "Cache-Control", value: "public, max-age=0, must-revalidate" }] },
      { source: "/assets/:file(.*\\.mp4)", headers: [{ key: "Cache-Control", value: "public, max-age=604800, stale-while-revalidate=86400" }] },
      { source: "/:file((?!api/|_next/).*\\.(?:js|css))", headers: [{ key: "Cache-Control", value: "public, max-age=0, must-revalidate" }] },
    ]
  },
  async rewrites() {
    return [{ source: "/", destination: "/index.html" }]
  },
}

/**
 * A build without the list would leave the storefront and the 404 on the
 * fallback policy, so it stops here instead of shipping that.
 */
export default function config(phase) {
  if (phase === PHASE_PRODUCTION_BUILD && JSON.parse(nextConfig.env.DLC_PUBLIC_FILES).length === 0) {
    throw new Error("public/ could not be listed, so proxy.ts cannot tell which pages are the storefront")
  }
  return nextConfig
}
