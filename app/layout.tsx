import type { Metadata } from "next"
import "./globals.css"
import { AccessGate } from "@/components/access-gate"

export const metadata: Metadata = {
  title: "DLC Online Lounge",
  description: "DLC member online lounge",
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body><AccessGate>{children}</AccessGate></body>
    </html>
  )
}
