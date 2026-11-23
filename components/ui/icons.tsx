import type { ReactNode, SVGProps } from "react"

/**
 * Inline icon set.
 *
 * The app avoids an icon dependency: these are a handful of hand-picked
 * 24 × 24 stroke paths rendered on the server, so they add no JavaScript and
 * no network requests.
 */
export type IconName =
  | "dashboard"
  | "wallet"
  | "tag"
  | "receipt"
  | "plus"
  | "arrow-up-right"
  | "arrow-down-left"
  | "transfer"
  | "bank"
  | "cash"
  | "card"
  | "phone"
  | "logout"
  | "pencil"
  | "arrow-left"
  | "chevron-right"
  | "shield"
  | "sparkles"
  | "trend-up"
  | "archive"
  | "alert"
  | "lock"
  | "check"
  | "chart"
  | "repeat"
  | "target"
  | "users"

const PATHS: Record<IconName, ReactNode> = {
  dashboard: (
    <>
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </>
  ),
  wallet: (
    <>
      <path d="M20 7H5a2 2 0 0 1 0-4h14v4" />
      <path d="M3 5v14a2 2 0 0 0 2 2h15V7" />
      <path d="M16.5 13h.01" />
    </>
  ),
  tag: (
    <>
      <path d="M20.6 13.4 12 22l-9-9V3h10l7.6 7.6a2 2 0 0 1 0 2.8Z" />
      <circle cx="7.5" cy="7.5" r="1" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  receipt: (
    <>
      <path d="M4 3h16v18H4Z" />
      <path d="M8 8h8M8 12h8M8 16h4" />
    </>
  ),
  "arrow-up-right": <path d="M7 17 17 7M8 7h9v9" />,
  "arrow-down-left": <path d="M17 7 7 17M16 17H7V8" />,
  transfer: <path d="M4 7h13l-3-3M20 17H7l3 3" />,
  bank: (
    <>
      <path d="m3 10 9-6 9 6" />
      <path d="M5 10v8M9.5 10v8M14.5 10v8M19 10v8" />
      <path d="M3 21h18" />
    </>
  ),
  cash: (
    <>
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <circle cx="12" cy="12" r="2.5" />
      <path d="M6 12h.01M18 12h.01" />
    </>
  ),
  card: (
    <>
      <rect x="2" y="5" width="20" height="14" rx="2.5" />
      <path d="M2 10h20" />
    </>
  ),
  phone: (
    <>
      <rect x="6" y="2" width="12" height="20" rx="2.5" />
      <path d="M11 18h2" />
    </>
  ),
  logout: (
    <>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="m16 17 5-5-5-5" />
      <path d="M21 12H9" />
    </>
  ),
  pencil: (
    <>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </>
  ),
  "arrow-left": (
    <>
      <path d="m12 19-7-7 7-7" />
      <path d="M19 12H5" />
    </>
  ),
  "chevron-right": <path d="m9 18 6-6-6-6" />,
  shield: (
    <>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),
  sparkles: (
    <>
      <path d="m12 3 1.7 4.8L18.5 9.5l-4.8 1.7L12 16l-1.7-4.8L5.5 9.5l4.8-1.7Z" />
      <path d="M19 16.5 19.8 19l2.5.8-2.5.8L19 23l-.8-2.4-2.5-.8 2.5-.8Z" />
    </>
  ),
  "trend-up": (
    <>
      <path d="m3 17 6-6 4 4 8-8" />
      <path d="M15 7h6v6" />
    </>
  ),
  archive: (
    <>
      <rect x="2" y="4" width="20" height="5" rx="1" />
      <path d="M4 9v10a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V9" />
      <path d="M10 13h4" />
    </>
  ),
  alert: (
    <>
      <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
      <path d="M12 9v4M12 17h.01" />
    </>
  ),
  lock: (
    <>
      <rect x="4" y="10" width="16" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </>
  ),
  check: <path d="m5 12 4.5 4.5L19 7" />,
  chart: (
    <>
      <path d="M3 21h18" />
      <path d="M6 21v-9M11 21V5M16 21v-6M21 21v-10" />
    </>
  ),
  repeat: (
    <>
      <path d="m17 2 4 4-4 4" />
      <path d="M3 11V9a4 4 0 0 1 4-4h14" />
      <path d="m7 22-4-4 4-4" />
      <path d="M21 13v2a4 4 0 0 1-4 4H3" />
    </>
  ),
  target: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1" />
    </>
  ),
  users: (
    <>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </>
  ),
}

export function Icon({
  name,
  className = "size-5",
  strokeWidth = 1.75,
  ...props
}: {
  name: IconName
  className?: string
  strokeWidth?: number
} & Omit<SVGProps<SVGSVGElement>, "name">) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
      {...props}
    >
      {PATHS[name]}
    </svg>
  )
}

/**
 * The app mark — three ascending bars, matching the PWA icon.
 */
export function BrandMark({ className = "size-10" }: { className?: string }) {
  return (
    <span
      className={`grid shrink-0 place-items-center rounded-xl bg-gradient-to-br from-brand-500 via-brand-600 to-brand-800 text-white shadow-lg shadow-brand-900/25 ${className}`}
    >
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="size-[55%]">
        <rect x="2.5" y="12" width="4.5" height="9" rx="1.4" />
        <rect x="9.75" y="8" width="4.5" height="13" rx="1.4" />
        <rect x="17" y="4" width="4.5" height="17" rx="1.4" />
      </svg>
    </span>
  )
}
