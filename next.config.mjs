/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Don't advertise the framework (X-Powered-By: Next.js) to scanners.
  poweredByHeader: false,
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
    // Scripts: the storefront pages in public/ load every script from a file,
    // so they get script-src 'self' alone and an injected inline script cannot
    // run there. The React pages still need 'unsafe-inline' for Next's inline
    // bootstrap scripts, for now.
    const cspWith = (scriptSrc) => [
      "default-src 'self'",
      `script-src ${scriptSrc}`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "media-src 'self'",
      "font-src 'self' data: https://cdn.gpteng.co",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
      "manifest-src 'self'",
      "worker-src 'self'",
      "upgrade-insecure-requests",
    ].join("; ")
    const production = process.env.NODE_ENV === "production"
    const reactCsp = production ? [{ key: "Content-Security-Policy", value: cspWith("'self' 'unsafe-inline'") }] : []
    const storefrontCsp = production ? [{ key: "Content-Security-Policy", value: cspWith("'self'") }] : []
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
      ...reactCsp,
    ]
    // Member data must never be stored by the browser's back button, a shared
    // proxy or a CDN: every API answer and every server-rendered member page.
    const noStore = [{ key: "Cache-Control", value: "private, no-store, max-age=0" }]
    return [
      { source: "/:path*", headers: security },
      // The storefront's stricter policy. Listed after /:path* so its
      // Content-Security-Policy replaces the one above instead of adding a
      // second (Next keeps the last value for a repeated header key).
      ...(production ? [
        { source: "/", headers: storefrontCsp },
        { source: "/:file(.*\\.html)", headers: storefrontCsp },
      ] : []),
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
