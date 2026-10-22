import type { NextConfig } from "next"

/**
 * Security response headers.
 *
 * The app is a single-user, server-rendered finance app with no raw-HTML
 * sink, so a tight policy is realistic.
 */
const isProduction = process.env.NODE_ENV === "production"

/**
 * Content Security Policy.
 *
 * Next.js injects inline bootstrap scripts, so `script-src` needs
 * `'unsafe-inline'` — per-request nonces would force every page to render
 * dynamically and are out of scope for this wave.
 *
 * The dev server additionally needs `'unsafe-eval'` for React Fast Refresh
 * and a websocket for hot reloading, so both are only allowed outside
 * production. The production policy stays tight.
 */
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isProduction ? "" : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  `connect-src 'self'${isProduction ? "" : " ws: wss:"}`,
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-src 'none'",
  "frame-ancestors 'none'",
].join("; ")

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  // HSTS is only safe over HTTPS: sending it on `http://localhost` makes
  // the browser refuse to load the app at all, so it is limited to
  // production (the only place the app is served over HTTPS).
  ...(isProduction
    ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]
    : []),
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
]

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ]
  },
}

export default nextConfig
