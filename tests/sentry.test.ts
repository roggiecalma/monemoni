/**
 * MoneMoni — Sentry helpers (`lib/sentry.ts`) and the privacy guarantees of
 * the Sentry configuration files.
 *
 * `@sentry/nextjs` is mocked so no SDK code runs and nothing is ever sent.
 */

import { readFileSync } from "node:fs"
import { resolve } from "node:path"

import * as Sentry from "@sentry/nextjs"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  captureCaughtError,
  getSentryDsn,
  getSentryTracesSampleRate,
  isControlFlowError,
  sanitizeSentryEvent,
} from "@/lib/sentry"

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
}))

const DSN = "https://publicKey@o0.ingest.sentry.io/1"
const OTHER_DSN = "https://otherKey@o0.ingest.sentry.io/2"

afterEach(() => {
  vi.unstubAllEnvs()
  vi.clearAllMocks()
})

describe("getSentryDsn", () => {
  beforeEach(() => {
    vi.stubEnv("SENTRY_DSN", "")
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "")
  })

  it("returns undefined when nothing is configured", () => {
    vi.unstubAllEnvs()
    delete process.env.SENTRY_DSN
    delete process.env.NEXT_PUBLIC_SENTRY_DSN

    expect(getSentryDsn(false)).toBeUndefined()
    expect(getSentryDsn(true)).toBeUndefined()
  })

  it("client reads only NEXT_PUBLIC_SENTRY_DSN", () => {
    vi.stubEnv("SENTRY_DSN", OTHER_DSN)
    expect(getSentryDsn(true)).toBeUndefined()

    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", DSN)
    expect(getSentryDsn(true)).toBe(DSN)
  })

  it("server prefers SENTRY_DSN and falls back to NEXT_PUBLIC_SENTRY_DSN", () => {
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", DSN)
    vi.stubEnv("SENTRY_DSN", OTHER_DSN)
    expect(getSentryDsn(false)).toBe(OTHER_DSN)
    expect(getSentryDsn()).toBe(OTHER_DSN)

    vi.unstubAllEnvs()
    delete process.env.SENTRY_DSN
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", DSN)
    expect(getSentryDsn(false)).toBe(DSN)
  })

  it("falls back to NEXT_PUBLIC_SENTRY_DSN when SENTRY_DSN is empty or blank", () => {
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", DSN)

    vi.stubEnv("SENTRY_DSN", "")
    expect(getSentryDsn(false)).toBe(DSN)

    vi.stubEnv("SENTRY_DSN", "   ")
    expect(getSentryDsn(false)).toBe(DSN)
  })

  it("trims whitespace and treats blank values as unset", () => {
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", `  ${DSN}  \n`)
    expect(getSentryDsn(true)).toBe(DSN)

    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "   ")
    expect(getSentryDsn(true)).toBeUndefined()
  })
})

describe("getSentryTracesSampleRate", () => {
  it("samples 10% of traces in production", () => {
    vi.stubEnv("NODE_ENV", "production")
    expect(getSentryTracesSampleRate()).toBe(0.1)
  })

  it.each(["development", "test"])("samples every trace in %s", (env) => {
    vi.stubEnv("NODE_ENV", env)
    expect(getSentryTracesSampleRate()).toBe(1.0)
  })
})

describe("isControlFlowError", () => {
  it.each([
    "NEXT_REDIRECT",
    "NEXT_REDIRECT;replace;/dashboard;307;",
    "NEXT_NOT_FOUND",
    "NEXT_HTTP_ERROR_FALLBACK;404",
    "NEXT_HTTP_ERROR_FALLBACK;401",
  ])("treats an error with digest %j as control flow", (digest) => {
    expect(isControlFlowError(Object.assign(new Error("x"), { digest }))).toBe(true)
    expect(isControlFlowError({ digest })).toBe(true)
  })

  it("does not treat real errors as control flow", () => {
    expect(isControlFlowError(new Error("boom"))).toBe(false)
    expect(isControlFlowError(new TypeError("NEXT_REDIRECT in the message only"))).toBe(false)
    expect(isControlFlowError(Object.assign(new Error("x"), { digest: "1234567890" }))).toBe(false)
    expect(isControlFlowError({ digest: 42 })).toBe(false)
    expect(isControlFlowError({ digest: "my NEXT_REDIRECT" })).toBe(false)
    expect(isControlFlowError({})).toBe(false)
  })

  it("is false for non-objects", () => {
    for (const value of [null, undefined, "NEXT_REDIRECT", 404, true]) {
      expect(isControlFlowError(value)).toBe(false)
    }
  })
})

describe("sanitizeSentryEvent", () => {
  it("removes the user", () => {
    const event = { message: "boom", user: { id: "user", ip_address: "1.2.3.4" } }

    const result = sanitizeSentryEvent(event)

    expect("user" in result).toBe(false)
    expect(result.message).toBe("boom")
  })

  it("removes request cookies and sensitive headers case-insensitively, keeping the rest", () => {
    const event = {
      request: {
        url: "https://monemoni.example/dashboard",
        method: "POST",
        cookies: { session: "abc" },
        headers: {
          Cookie: "session=abc",
          cookie: "session=abc",
          AUTHORIZATION: "Bearer secret",
          "X-Forwarded-For": "1.2.3.4",
          "x-real-ip": "1.2.3.4",
          "User-Agent": "vitest",
          Accept: "text/html",
        },
      },
    }

    const result = sanitizeSentryEvent(event)

    expect(result.request.cookies).toBeUndefined()
    expect(result.request.headers).toEqual({ "User-Agent": "vitest", Accept: "text/html" })
    expect(result.request.url).toBe("https://monemoni.example/dashboard")
    expect(result.request.method).toBe("POST")
  })

  it("does not mutate the original event", () => {
    const event = {
      user: { id: "user" },
      request: { cookies: { s: "1" }, headers: { cookie: "s=1" }, data: { passcode: "hunter22" } },
    }

    sanitizeSentryEvent(event)

    expect(event.user).toEqual({ id: "user" })
    expect(event.request.cookies).toEqual({ s: "1" })
    expect(event.request.headers).toEqual({ cookie: "s=1" })
    expect(event.request.data).toEqual({ passcode: "hunter22" })
  })

  it("passes through events that have no request or user", () => {
    expect(sanitizeSentryEvent({ message: "plain" })).toEqual({ message: "plain" })
  })

  it("redacts password / passcode fields in object payloads, including nested ones", () => {
    const result = sanitizeSentryEvent({
      request: {
        data: {
          passcode: "hunter22",
          Password: "hunter22",
          amount: "5,000.00",
          nested: { password: "hunter22", note: "rent", deeper: [{ passcode: "hunter22", ok: 1 }] },
        },
      },
    })

    expect(result.request.data).toEqual({
      passcode: "[REDACTED]",
      Password: "[REDACTED]",
      amount: "5,000.00",
      nested: { password: "[REDACTED]", note: "rent", deeper: [{ passcode: "[REDACTED]", ok: 1 }] },
    })
  })

  it("redacts a confirmation field regardless of its casing", () => {
    const result = sanitizeSentryEvent({
      request: { data: { passcode: "hunter22", confirmPassword: "hunter22", confirmPasscode: "hunter22" } },
    })

    expect(JSON.stringify(result.request.data)).not.toContain("hunter22")
  })

  it("redacts password / passcode in a JSON string payload", () => {
    const result = sanitizeSentryEvent({
      request: { data: JSON.stringify({ passcode: "hunter22", amount: "5" }) },
    })

    const parsed = JSON.parse(result.request.data as string)
    expect(parsed).toEqual({ passcode: "[REDACTED]", amount: "5" })
  })

  it("redacts password / passcode in a form-encoded string payload", () => {
    const result = sanitizeSentryEvent({
      request: { data: "passcode=hunter22&amount=5&Password=hunter22" },
    })

    const data = result.request.data as string
    expect(data).not.toContain("hunter22")
    expect(data).toContain("amount=5")
  })

  it("leaves harmless payloads untouched", () => {
    const objectData = { amount: "5", note: "lunch" }
    expect(sanitizeSentryEvent({ request: { data: objectData } }).request.data).toEqual(objectData)
    expect(sanitizeSentryEvent({ request: { data: "just some text" } }).request.data).toBe(
      "just some text",
    )
  })
})

describe("captureCaughtError", () => {
  it("reports a real error to Sentry", () => {
    const error = new Error("boom")

    captureCaughtError(error)

    expect(Sentry.captureException).toHaveBeenCalledTimes(1)
    expect(Sentry.captureException).toHaveBeenCalledWith(error, undefined)
  })

  it("passes the context through as `extra`", () => {
    const error = new Error("boom")

    captureCaughtError(error, { route: "/loans", loanId: "loan-1" })

    expect(Sentry.captureException).toHaveBeenCalledWith(error, {
      extra: { route: "/loans", loanId: "loan-1" },
    })
  })

  it.each(["NEXT_REDIRECT;replace;/login;307;", "NEXT_NOT_FOUND", "NEXT_HTTP_ERROR_FALLBACK;404"])(
    "never reports the control-flow digest %j",
    (digest) => {
      captureCaughtError(Object.assign(new Error("control flow"), { digest }), { a: 1 })

      expect(Sentry.captureException).not.toHaveBeenCalled()
    },
  )
})

describe("Sentry configuration privacy guard", () => {
  const read = (file: string): string => readFileSync(resolve(process.cwd(), file), "utf8")

  it.each(["sentry.server.config.ts", "sentry.edge.config.ts", "instrumentation-client.ts"])(
    "%s sets sendDefaultPii: false and sanitizes events",
    (file) => {
      const source = read(file)

      expect(source).toMatch(/sendDefaultPii:\s*false/)
      expect(source).toContain("sanitizeSentryEvent")
      expect(source).toMatch(/beforeSend\(/)
      expect(source).toMatch(/beforeSendTransaction\(/)
      expect(source).not.toMatch(/sendDefaultPii:\s*true/)
    },
  )

  it("sends browser events through the same-origin tunnel so the CSP stays tight", () => {
    expect(read("instrumentation-client.ts")).toMatch(/tunnel:\s*"\/sentry-tunnel"/)
    expect(read("next.config.ts")).toContain("connect-src 'self'")
    expect(read("next.config.ts")).not.toMatch(/sentry\.io/)
  })
})
