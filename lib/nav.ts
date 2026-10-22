/**
 * MoneMoni — main navigation.
 *
 * Single source of truth for the app shell: later waves append their routes
 * here and the shell renders them automatically.
 */

export interface NavItem {
  href: string
  label: string
}

export const NAV_ITEMS: readonly NavItem[] = [
  { href: "/dashboard", label: "Dashboard" },
]
