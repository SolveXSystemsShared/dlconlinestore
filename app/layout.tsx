import type { Metadata } from "next"
import "./globals.css"
import { AccessGate } from "@/components/access-gate"

export const metadata: Metadata = {
  title: "DLC Online Store",
  description: "DLC member online store",
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body><AccessGate>{children}</AccessGate></body>
    </html>
  )
}
