import Script from "next/script"
import { AccessGate } from "@/components/access-gate"

/**
 * Every page of the store sits behind the gate. The gate lives here rather than
 * in the root layout only so that the 404 for an unknown address, which is not
 * a store page, can show its message without it. Put new pages in this folder:
 * app/(store)/gate.test.tsx fails if one is added outside it.
 */
export default function StoreLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <>
    <AccessGate>{children}</AccessGate>
    {/* Same consent banner as the storefront pages in public/. Not on the 404,
        which stores nothing and on a phone would be covered by it. */}
    <Script src="/cookies.js" strategy="afterInteractive" />
    {/* Both look up the signed-in member, so they come with the gate. */}
    <Script src="/pwa.js" strategy="afterInteractive" />
    <Script src="/cloudy.js" strategy="afterInteractive" />
  </>
}
