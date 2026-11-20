/**
 * The React app's page routes (app/), the only paths whose Content-Security-
 * Policy allows inline scripts, which Next's bootstrap needs. Everything else
 * gets the strict policy. next.config.test.ts walks app/ and fails if a page
 * is missing here, so add the route when you add a page.
 */
export const REACT_ROUTES = [
  "/account",
  "/bag",
  "/exchange/:path*",
  "/menu",
  "/register",
  "/settings/:path*",
]

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Don't advertise the framework (X-Powered-By: Next.js) to scanners.
  poweredByHeader: false,
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
    // Content-Security-Policy only in production: the dev server needs eval and
    // a websocket for hot reload. Everything is locked to this site. Product
    // photos may come from CDASH storage, hence https: for images.
    //
    // Scripts: script-src 'self' alone is the default, so an injected inline
    // script cannot run on the storefront pages in public/ (which load every
    // script from a file) or anywhere else not named. The React pages in
    // REACT_ROUTES still need 'unsafe-inline' for Next's inline bootstrap
    // scripts, for now.
    //
    // No upgrade-insecure-requests: HSTS already keeps the site on HTTPS, and
    // every fetch directive is 'self' or https:, so it added nothing — while
    // WebKit applies it to http://localhost, which broke every script and
    // style on a local production build.
    const cspWith = (scriptSrc) => [
      "default-src 'self'",
      `script-src ${scriptSrc}`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "media-src 'self'",
      // The site uses the system font stack; no web fonts are loaded.
      "font-src 'self'",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
      "manifest-src 'self'",
      "worker-src 'self'",
    ].join("; ")
    const production = process.env.NODE_ENV === "production"
    const strictCsp = production ? [{ key: "Content-Security-Policy", value: cspWith("'self'") }] : []
    const reactCsp = production ? [{ key: "Content-Security-Policy", value: cspWith("'self' 'unsafe-inline'") }] : []
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
      ...strictCsp,
    ]
    // Member data must never be stored by the browser's back button, a shared
    // proxy or a CDN: every API answer and every server-rendered member page.
    const noStore = [{ key: "Cache-Control", value: "private, no-store, max-age=0" }]
    return [
      { source: "/:path*", headers: security },
      // The React pages' policy, listed after /:path* so it replaces the strict
      // one instead of adding a second (Next keeps the last value for a
      // repeated header key). Nothing here matches on ".html": the server
      // decodes %2E before serving a file, so /strains%2Ehtml slipped past
      // such a rule into the looser policy.
      ...(production ? REACT_ROUTES.map((source) => ({ source, headers: reactCsp })) : []),
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

export default nextConfig
