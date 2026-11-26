import * as Sentry from "@sentry/nextjs"
import { getSentryDsn, getSentryTracesSampleRate, sanitizeSentryEvent } from "@/lib/sentry"

const dsn = getSentryDsn(false)

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  // @ts-expect-error sendDefaultPii is enforced by MoneMoni privacy policy
  sendDefaultPii: false,
  tracesSampleRate: getSentryTracesSampleRate(),
  beforeSend(event) {
    return sanitizeSentryEvent(event)
  },
  beforeSendTransaction(event) {
    return sanitizeSentryEvent(event)
  },
})
