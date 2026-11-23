import type { IconName } from "@/components/ui/icons"

/**
 * MoneMoni — main navigation.
 *
 * Single source of truth for the app shell: later waves append their routes
 * here and the shell renders them automatically.
 */

export interface NavItem {
  href: string
  label: string
  icon: IconName
}

export const NAV_ITEMS: readonly NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
  { href: "/transactions", label: "Transactions", icon: "receipt" },
  { href: "/recurring", label: "Recurring", icon: "repeat" },
  { href: "/goals", label: "Goals", icon: "target" },
  { href: "/loans", label: "Borrowed / Lent", icon: "users" },
  { href: "/accounts", label: "Accounts", icon: "wallet" },
  { href: "/categories", label: "Categories", icon: "tag" },
]
