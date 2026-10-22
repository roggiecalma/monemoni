/**
 * MoneMoni — service worker.
 *
 * Strategies:
 * - navigations: network-first, falling back to the cached app shell when the
 *   device is offline;
 * - build assets (`/_next/static/`) and icons: cache-first.
 *
 * Bump `CACHE_VERSION` whenever the assets change — old caches are removed
 * when the new worker activates.
 */

const CACHE_VERSION = "v1"
const CACHE_NAME = `moneMoni-${CACHE_VERSION}`

/** Fallback used when a navigation cannot reach the network. */
const SHELL_URL = "/"

/** Cached on install so the app can start without a network. */
const PRECACHE_URLS = [
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
      const keys = await caches.keys()
      await Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)),
      )
      await self.clients.claim()
    })(),
  )
})

self.addEventListener("fetch", (event) => {
  const request = event.request

  if (request.method !== "GET") return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  // Navigations: network first, cached shell as the fallback.
  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request))
    return
  }

  // Static build output and icons: cache first.
  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname === "/icon.svg"
  ) {
    event.respondWith(cacheFirst(request))
  }
})

/** Serves the cached copy when there is one, otherwise fetches and caches. */
async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME)
  const cached = await cache.match(request)

  if (cached) return cached

  const response = await fetch(request)
  if (response.ok) {
    await cache.put(request, response.clone())
  }
  return response
}

/** Serves the network response, falling back to the cached copy when offline. */
async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME)

  try {
    const response = await fetch(request)
    if (response.ok) {
      await cache.put(request, response.clone())
    }
    return response
  } catch (error) {
    const cached = (await cache.match(request)) ?? (await cache.match(SHELL_URL))
    if (cached) return cached
    throw error
  }
}
