import type { Metadata } from "next"
import Script from "next/script"
import "./globals.css"
import "./storefront.css"
import { AccessGate } from "@/components/access-gate"

export const metadata: Metadata = {
  title: "DLC Online Store",
  description: "DLC member online store",
  manifest: "/site.webmanifest",
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-ZA">
      <body>
        <AccessGate>{children}</AccessGate>
        {/* Same consent banner as the storefront pages in public/. */}
        <Script src="/cookies.js" strategy="afterInteractive" />
        <Script src="/pwa.js" strategy="afterInteractive" />
        <Script src="/cloudy.js" strategy="afterInteractive" />
      </body>
    </html>
  )
}
