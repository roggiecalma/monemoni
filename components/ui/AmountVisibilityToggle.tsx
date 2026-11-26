"use client"

import { useEffect, useState } from "react"
import { Icon } from "@/components/ui/icons"

const STORAGE_KEY = "mm_hide_amounts"
const EVENT_NAME = "mm-amount-visibility"

const PESO_AMOUNT_REGEX = /([+-]?\s*₱)\s*\d[\d,]*(?:\.\d+)?[kM]?/g

/**
 * Checks if a string contains any formatted peso amount.
 */
export function containsPesoAmount(text: string): boolean {
  PESO_AMOUNT_REGEX.lastIndex = 0
  return PESO_AMOUNT_REGEX.test(text)
}

/**
 * Masks formatted peso amounts in text (e.g., "₱1,234.50" -> "₱••••••", "- ₱500" -> "- ₱••••••").
 */
export function maskPesoText(text: string): string {
  PESO_AMOUNT_REGEX.lastIndex = 0
  return text.replace(PESO_AMOUNT_REGEX, "$1••••••")
}

const originalTextMap = new WeakMap<Text, string>()

const IGNORED_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT", "OPTION", "SCRIPT", "STYLE"])

export function walkAndApply(root: Node, hide: boolean) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement
      if (!parent || IGNORED_TAGS.has(parent.tagName)) {
        return NodeFilter.FILTER_REJECT
      }
      return NodeFilter.FILTER_ACCEPT
    },
  })

  let currentNode = walker.nextNode()
  while (currentNode) {
    const textNode = currentNode as Text
    const currentVal = textNode.nodeValue ?? ""

    if (hide) {
      if (containsPesoAmount(currentVal)) {
        originalTextMap.set(textNode, currentVal)
        const masked = maskPesoText(currentVal)
        if (textNode.nodeValue !== masked) {
          textNode.nodeValue = masked
        }
      }
    } else {
      if (originalTextMap.has(textNode)) {
        const original = originalTextMap.get(textNode)!
        const expectedMasked = maskPesoText(original)
        if (textNode.nodeValue === expectedMasked) {
          textNode.nodeValue = original
        }
        originalTextMap.delete(textNode)
      }
    }

    currentNode = walker.nextNode()
  }
}

export function AmountVisibilityToggle() {
  const [hidden, setHidden] = useState<boolean>(false)

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === "1") {
      setHidden(true)
    }

    const onVisibilityChange = (e: Event) => {
      const customEvent = e as CustomEvent<boolean>
      setHidden(customEvent.detail)
    }

    window.addEventListener(EVENT_NAME, onVisibilityChange)
    return () => {
      window.removeEventListener(EVENT_NAME, onVisibilityChange)
    }
  }, [])

  useEffect(() => {
    const mainEl = document.querySelector("main")
    if (!mainEl) return

    walkAndApply(mainEl, hidden)

    if (!hidden) return

    const observer = new MutationObserver(() => {
      walkAndApply(mainEl, true)
    })

    observer.observe(mainEl, {
      childList: true,
      subtree: true,
      characterData: true,
    })

    return () => {
      observer.disconnect()
    }
  }, [hidden])

  const toggle = () => {
    const next = !hidden
    setHidden(next)
    localStorage.setItem(STORAGE_KEY, next ? "1" : "0")
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: next }))
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={hidden ? "Show amounts" : "Hide amounts"}
      aria-pressed={hidden}
      title={hidden ? "Show amounts" : "Hide amounts"}
      className="grid size-9 place-items-center rounded-xl border border-border bg-surface text-ink-muted transition hover:bg-surface-muted hover:text-ink"
    >
      <Icon name={hidden ? "eye-off" : "eye"} className="size-4" />
    </button>
  )
}
