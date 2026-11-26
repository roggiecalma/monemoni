import * as Sentry from "@sentry/nextjs"

/**
 * Reads the Sentry DSN.
 * On client: only NEXT_PUBLIC_SENTRY_DSN.
 * On server/edge: SENTRY_DSN ?? NEXT_PUBLIC_SENTRY_DSN.
 */
export function getSentryDsn(isClient = false): string | undefined {
  const raw = isClient
    ? process.env.NEXT_PUBLIC_SENTRY_DSN
    : (process.env.SENTRY_DSN?.trim() || process.env.NEXT_PUBLIC_SENTRY_DSN)

  if (typeof raw === "string") {
    const trimmed = raw.trim()
    return trimmed.length > 0 ? trimmed : undefined
  }
  return undefined
}

/**
 * Tracing sample rate: 0.1 in production, 1.0 in dev/test.
 */
export function getSentryTracesSampleRate(): number {
  return process.env.NODE_ENV === "production" ? 0.1 : 1.0
}

/**
 * Checks whether an error is a Next.js control flow exception (redirect, notFound, etc.).
 * These should never be treated as application bugs.
 */
export function isControlFlowError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false
  if ("digest" in error && typeof (error as { digest: unknown }).digest === "string") {
    const digest = (error as { digest: string }).digest
    if (
      digest.startsWith("NEXT_REDIRECT") ||
      digest.startsWith("NEXT_NOT_FOUND") ||
      digest.startsWith("NEXT_HTTP_ERROR_FALLBACK")
    ) {
      return true
    }
  }
  return false
}

const REDACTED = "[REDACTED]"
const SENSITIVE_HEADERS = new Set(["cookie", "authorization", "x-forwarded-for", "x-real-ip"])
const SENSITIVE_KEYS = new Set([
  "password",
  "passcode",
  "confirmpassword",
  "confirmpasscode",
  "secret",
  "token",
  "auth",
])

function sanitizeData(data: unknown): unknown {
  if (!data) return data
  if (typeof data === "string") {
    try {
      const parsed = JSON.parse(data)
      if (parsed && typeof parsed === "object") {
        return JSON.stringify(sanitizeData(parsed))
      }
    } catch {
      // not JSON
    }
    // Check if form-encoded string
    if (data.includes("=") && (data.toLowerCase().includes("password") || data.toLowerCase().includes("passcode"))) {
      const params = new URLSearchParams(data)
      for (const [key] of params.entries()) {
        if (SENSITIVE_KEYS.has(key.toLowerCase())) {
          params.set(key, REDACTED)
        }
      }
      return params.toString()
    }
    return data
  }

  if (Array.isArray(data)) {
    return data.map((item) => sanitizeData(item))
  }

  if (typeof data === "object") {
    const sanitizedObj: Record<string, unknown> = {}
    for (const [key, val] of Object.entries(data as Record<string, unknown>)) {
      if (SENSITIVE_KEYS.has(key.toLowerCase())) {
        sanitizedObj[key] = REDACTED
      } else if (val && typeof val === "object") {
        sanitizedObj[key] = sanitizeData(val)
      } else {
        sanitizedObj[key] = val
      }
    }
    return sanitizedObj
  }

  return data
}

/**
 * Sanitizes Sentry event to strip PII and secrets (user info, cookies, auth headers, client IPs, passwords).
 */
export function sanitizeSentryEvent<T extends Record<string, any>>(event: T): T {
  const copy: Record<string, any> = { ...event }

  if ("user" in copy) {
    delete copy.user
  }

  if (copy.request && typeof copy.request === "object") {
    const req = { ...copy.request }

    if ("cookies" in req) {
      delete req.cookies
    }

    if (req.headers && typeof req.headers === "object") {
      const sanitizedHeaders: Record<string, string> = {}
      for (const [header, val] of Object.entries(req.headers)) {
        if (!SENSITIVE_HEADERS.has(header.toLowerCase())) {
          sanitizedHeaders[header] = val as string
        }
      }
      req.headers = sanitizedHeaders
    }

    if ("data" in req && req.data) {
      req.data = sanitizeData(req.data)
    }

    copy.request = req
  }

  return copy as T
}

/**
 * Reports a caught error to Sentry, ignoring Next.js control flow errors.
 */
export function captureCaughtError(error: unknown, context?: Record<string, unknown>): void {
  if (isControlFlowError(error)) {
    return
  }

  Sentry.captureException(error, context ? { extra: context } : undefined)
}
