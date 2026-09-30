/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The storefront (lounge, collections, product pages) is the static site in
  // public/. It talks to the same /api routes as the React pages, so `/` just
  // serves its lounge; checkout, account and registration stay in app/.
  // Member-facing URLs use the exchange wording; the old paths still land.
  async redirects() {
    return [
      { source: "/checkout", destination: "/bag", permanent: true },
      { source: "/order/:id", destination: "/exchange/:id", permanent: true },
    ]
  },
  async rewrites() {
    return [{ source: "/", destination: "/index.html" }]
  },
}

export default nextConfig
