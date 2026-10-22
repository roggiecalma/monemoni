"use client"

import { useEffect } from "react"

/**
 * Registers the PWA service worker.
 *
 * This is the only client component in the app: it renders nothing and exists
 * purely so the browser can install the worker. Registration is skipped in
 * development, where a cache-first worker would serve stale `/_next/static`
 * chunks and break hot reloading.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return
    if (!("serviceWorker" in navigator)) return

    const register = () => {
      // `updateViaCache: "none"` keeps the browser from serving a stale
      // `sw.js` out of the HTTP cache — the worker has to be the one the
      // server just sent, otherwise an old (caching) worker stays alive.
      navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" }).catch(() => {
        // A failed registration must never break the app.
      })
    }

    if (document.readyState === "complete") {
      register()
    } else {
      window.addEventListener("load", register, { once: true })
    }
  }, [])

  return null
}
