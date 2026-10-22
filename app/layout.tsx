import type { Metadata, Viewport } from "next"

import { ServiceWorkerRegistrar } from "@/components/pwa/ServiceWorkerRegistrar"

import "./globals.css"

export const metadata: Metadata = {
  title: "MoneMoni",
  description: "Personal finance for Philippine pesos — track accounts, income and spending.",
  applicationName: "MoneMoni",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "MoneMoni",
    statusBarStyle: "default",
  },
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#2563eb",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-surface-muted text-ink antialiased">
        {children}
        <ServiceWorkerRegistrar />
      </body>
    </html>
  )
}
