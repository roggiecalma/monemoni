import type { MetadataRoute } from "next"

type ManifestIcon = NonNullable<MetadataRoute.Manifest["icons"]>[number]

/**
 * The manifest spec allows a space separated list of purposes; Next.js types
 * the field as a single keyword.
 */
const ANY_MASKABLE = "any maskable" as unknown as ManifestIcon["purpose"]

/**
 * PWA manifest. The colours match the design tokens in `app/globals.css`
 * (`--color-brand-600` and the light surface ramp).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "MoneMoni",
    short_name: "MoneMoni",
    description: "Personal finance for Philippine pesos — track accounts, income and spending.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f8fafc",
    theme_color: "#2563eb",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: ANY_MASKABLE,
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: ANY_MASKABLE,
      },
    ],
  }
}
