import type { Metadata } from "next"
import "./globals.css"
import "./storefront.css"

export const metadata: Metadata = {
  title: "DLC Online Store",
  description: "DLC member online store",
  manifest: "/site.webmanifest",
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-ZA">
      <body>
        {children}
      </body>
    </html>
  )
}
