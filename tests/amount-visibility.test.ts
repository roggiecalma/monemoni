/**
 * MoneMoni — the amount-visibility DOM walker (`walkAndApply`).
 *
 * The project has no DOM library, so a minimal fake is stubbed in place of
 * `document.createTreeWalker` / `NodeFilter`: just enough for the walker to
 * iterate text nodes and honour its `acceptNode` filter.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { walkAndApply } from "@/components/ui/AmountVisibilityToggle"

interface FakeText {
  nodeValue: string | null
  parentElement: { tagName: string } | null
}

interface FakeRoot {
  nodes: FakeText[]
}

function text(value: string, tagName: string | null = "SPAN"): FakeText {
  return { nodeValue: value, parentElement: tagName ? { tagName } : null }
}

function root(...nodes: FakeText[]): FakeRoot {
  return { nodes }
}

function run(r: FakeRoot, hide: boolean): void {
  walkAndApply(r as unknown as Node, hide)
}

beforeEach(() => {
  vi.stubGlobal("NodeFilter", { SHOW_TEXT: 4, FILTER_ACCEPT: 1, FILTER_REJECT: 2 })
  vi.stubGlobal("document", {
    createTreeWalker: (
      r: FakeRoot,
      _whatToShow: number,
      filter: { acceptNode: (node: FakeText) => number },
    ) => {
      const accepted = r.nodes.filter((node) => filter.acceptNode(node) === 1)
      let index = 0
      return { nextNode: () => accepted[index++] ?? null }
    },
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("walkAndApply — hiding", () => {
  it("masks only text nodes that contain a peso amount", () => {
    const balance = text("₱1,234.56")
    const label = text("Total Borrowed")
    const compound = text("Paid ₱5,000.00 of ₱10,000.00")
    const percent = text("12.5%")

    run(root(balance, label, compound, percent), true)

    expect(balance.nodeValue).toBe("₱••••••")
    expect(label.nodeValue).toBe("Total Borrowed")
    expect(compound.nodeValue).toBe("Paid ₱•••••• of ₱••••••")
    expect(percent.nodeValue).toBe("12.5%")
  })

  it("never touches form controls, scripts or styles, nor nodes without a parent element", () => {
    const nodes = ["INPUT", "TEXTAREA", "SELECT", "OPTION", "SCRIPT", "STYLE"].map((tag) =>
      text("₱1,234.56", tag),
    )
    const orphan = text("₱1,234.56", null)

    run(root(...nodes, orphan), true)

    for (const node of [...nodes, orphan]) {
      expect(node.nodeValue).toBe("₱1,234.56")
    }
  })

  it("is idempotent: a second pass keeps the mask and the remembered original", () => {
    const node = text("₱1,234.56")
    const r = root(node)

    run(r, true)
    run(r, true)
    expect(node.nodeValue).toBe("₱••••••")

    run(r, false)
    expect(node.nodeValue).toBe("₱1,234.56")
  })
})

describe("walkAndApply — showing again", () => {
  it("restores every original value", () => {
    const a = text("₱1,234.56")
    const b = text("Paid ₱5,000.00 of ₱10,000.00")
    const c = text("Dashboard")
    const r = root(a, b, c)

    run(r, true)
    run(r, false)

    expect(a.nodeValue).toBe("₱1,234.56")
    expect(b.nodeValue).toBe("Paid ₱5,000.00 of ₱10,000.00")
    expect(c.nodeValue).toBe("Dashboard")
  })

  it("shows the NEW amount when the text node was rewritten while hidden", () => {
    const node = text("₱0.00")
    const r = root(node)

    run(r, true)
    expect(node.nodeValue).toBe("₱••••••")

    // React updates the same text node in place (for example after a repayment).
    node.nodeValue = "₱5,000.00"
    run(r, true) // what the MutationObserver triggers
    expect(node.nodeValue).toBe("₱••••••")

    run(r, false)
    expect(node.nodeValue).toBe("₱5,000.00")
  })

  it("keeps newer non-amount text when the node was rewritten while hidden", () => {
    const node = text("₱1,234.56")
    const r = root(node)

    run(r, true)
    node.nodeValue = "Nothing recorded yet"
    run(r, true)
    run(r, false)

    expect(node.nodeValue).toBe("Nothing recorded yet")
  })

  it("masks nodes added after the first pass, then restores them", () => {
    const first = text("₱100.00")
    const r = root(first)
    run(r, true)

    const added = text("-₱2,500.00")
    r.nodes.push(added)
    run(r, true)
    expect(added.nodeValue).toBe("-₱••••••")

    run(r, false)
    expect(first.nodeValue).toBe("₱100.00")
    expect(added.nodeValue).toBe("-₱2,500.00")
  })

  it("does nothing when nothing was hidden", () => {
    const node = text("₱1,234.56")

    run(root(node), false)

    expect(node.nodeValue).toBe("₱1,234.56")
  })
})
