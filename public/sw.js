/**
 * MoneMoni — service worker.
 *
 * Strategies:
 * - navigations: network only. The dashboard renders balances, net worth,
 *   totals and transaction notes, so an authenticated page must never be
 *   written into Cache Storage — it would still be readable on the device
 *   after a sign-out. When the network cannot be reached the worker serves
 *   the static, data-free `/offline.html` page instead;
 * - static assets (`/_next/static/`, `/icons/`, `/icon.svg`,
 *   `/manifest.webmanifest`): cache first.
 *
 * Only static, same-origin, cacheable `GET` responses are stored: a
 * response that says `Cache-Control: no-store` or `private` is never
 * cached, and nothing outside the allowlisted paths is cached at all.
 *
 * Bump `CACHE_VERSION` whenever the assets change — every cache this app
 * owns is purged when the new worker activates.
 */

const CACHE_VERSION = "v2"
const CACHE_PREFIX = "moneMoni-"
const CACHE_NAME = `${CACHE_PREFIX}${CACHE_VERSION}`

/** Static page served when a navigation cannot reach the network. */
const OFFLINE_URL = "/offline.html"

/** Path prefixes whose responses may be stored in the cache. */
const CACHEABLE_PREFIXES = ["/_next/static/", "/icons/"]

/** Exact paths whose responses may be stored in the cache. */
const CACHEABLE_PATHS = ["/icon.svg", "/manifest.webmanifest"]

/** Cached on install so the app can start without a network. */
const PRECACHE_URLS = [
  "/offline.html",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/apple-touch-icon.png",
  "/icon.svg",
]

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME)
      // A missing file must not break the installation.
      await Promise.allSettled(PRECACHE_URLS.map((url) => cache.add(url)))
      await self.skipWaiting()
    })(),
  )
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Purge every cache this app owns. A new worker version must not leave
      // a stale entry behind — and must never leave a page with user data
      // behind, whatever a future bug may have cached.
      const keys = await caches.keys()
      await Promise.all(
        keys.filter((key) => key.startsWith(CACHE_PREFIX)).map((key) => caches.delete(key)),
      )

      // Re-precache the static shell: the offline page and the icons.
      const cache = await caches.open(CACHE_NAME)
      await Promise.allSettled(PRECACHE_URLS.map((url) => cache.add(url)))

      await self.clients.claim()
    })(),
  )
})

self.addEventListener("fetch", (event) => {
  const request = event.request

  if (request.method !== "GET") return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  // Navigations are never cached. An authenticated page (balances, totals,
  // transaction notes) would stay readable in Cache Storage even after the
  // session was destroyed, so the network is the only source and the
  // static offline page is the only fallback.
  if (request.mode === "navigate") {
    event.respondWith(networkOnly(request))
    return
  }

  // Everything that is not an allowlisted static asset goes to the network
  // and is never stored.
  if (!isCacheablePath(url.pathname)) return

  event.respondWith(cacheFirst(request))
})

/** Is this path one of the static assets the app is allowed to cache? */
function isCacheablePath(pathname) {
  return (
    CACHEABLE_PREFIXES.some((prefix) => pathname.startsWith(prefix)) ||
    CACHEABLE_PATHS.includes(pathname)
  )
}

/** Serves the network response, falling back to the static offline page. */
async function networkOnly(request) {
  try {
    return await fetch(request)
  } catch (error) {
    const cache = await caches.open(CACHE_NAME)
    const offline = await cache.match(OFFLINE_URL)
    if (offline) return offline
    throw error
  }
}

/** Serves the cached copy when there is one, otherwise fetches and caches. */
async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME)
  const cached = await cache.match(request)

  if (cached) return cached

  const response = await fetch(request)
  await store(cache, request, response)
  return response
}

/**
 * Stores a response in the cache — but only when it may be stored.
 *
 * A response is stored when it is a same-origin `200` for a `GET` request
 * and its `Cache-Control` does not forbid caching. Everything else (a
 * `206`, an error page, an opaque response, a `no-store` response) is
 * served straight from the network and never written to disk.
 */
async function store(cache, request, response) {
  if (request.method !== "GET") return
  if (response.status !== 200) return
  // "basic" is a same-origin response; "opaque" and "cors" are not.
  if (response.type !== "basic") return

  const cacheControl = response.headers.get("Cache-Control") || ""
  if (/no-store/i.test(cacheControl) || /private/i.test(cacheControl)) return

  try {
    await cache.put(request, response.clone())
  } catch {
    // A full cache must never break the response.
  }
}
