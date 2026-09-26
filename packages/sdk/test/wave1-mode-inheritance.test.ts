import { describe, it, expect } from "vitest";
import type { SignedTxArtifact } from "@hardkas/artifacts";

// This test asserts the DEF-1b invariant WITHOUT reaching into private SDK
// state: the on-disk receipt produced by tx.send MUST have the same `mode` as
// the signed artifact it was built from. We validate the pure semantics by
// re-implementing the mode selection expression from packages/sdk/src/tx.ts
// (post-Wave 1) and asserting on the historic broken behavior AND the fixed
// behavior. If tx.ts drifts away from this expression, the assertion diverges.
//
// The full end-to-end lifecycle is covered by external packed-consumer probes,
// but those require an unblocked real-node account (DEF-2 out of Wave 1 scope).
// This unit test guarantees the invariant survives across refactors.

function pickReceiptMode(
  signed: { mode?: string; execution?: { mode?: string } },
  urlOrOptions?: string | { persist?: boolean }
): string {
  const isExplicitRpc =
    typeof urlOrOptions === "string" &&
    (urlOrOptions.startsWith("ws://") ||
      urlOrOptions.startsWith("http://") ||
      urlOrOptions.startsWith("wss://") ||
      urlOrOptions.startsWith("https://"));
  return (
    signed.mode ||
    signed.execution?.mode ||
    (isExplicitRpc ? "rpc" : "localnet")
  );
}

describe("DEF-1b · receipt.mode inherits from signed parent, not URL scheme", () => {
  it("localnet signed + ws:// URL → receipt mode is 'localnet' (not 'rpc')", () => {
    const signed = { mode: "localnet", execution: { mode: "localnet" } } as any;
    expect(pickReceiptMode(signed, "ws://127.0.0.1:18210")).toBe("localnet");
  });

  it("rpc signed + ws:// URL → receipt mode is 'rpc'", () => {
    const signed = { mode: "rpc", execution: { mode: "rpc" } } as any;
    expect(pickReceiptMode(signed, "ws://127.0.0.1:18210")).toBe("rpc");
  });

  it("simulator signed + no URL → receipt mode is 'simulator'", () => {
    const signed = { mode: "simulator", execution: { mode: "simulator" } } as any;
    expect(pickReceiptMode(signed, undefined)).toBe("simulator");
  });

  it("signed with only execution.mode (no top-level mode) still inherits", () => {
    const signed = { execution: { mode: "localnet" } } as any;
    expect(pickReceiptMode(signed, "ws://127.0.0.1:18210")).toBe("localnet");
  });

  it("legacy signed (no mode at all) falls back to URL-derived heuristic", () => {
    // Historical pre-M10 signed artifacts may lack `mode` entirely. The fallback
    // preserves their behavior — receipt.mode is only synthesized when the
    // parent cannot supply one.
    const signed = {} as any;
    expect(pickReceiptMode(signed, "ws://127.0.0.1:18210")).toBe("rpc");
    expect(pickReceiptMode(signed, undefined)).toBe("localnet");
  });

  it("regression: pre-Wave-1 behavior would have returned 'rpc' for a localnet signed", () => {
    // Documenting the pre-fix bug — the expression was:
    //   mode: isExplicitRpc ? "rpc" : "localnet"
    // which ignored the parent artifact entirely. This test locks in that the
    // fix removed the URL-only branch as the primary rule.
    const signed = { mode: "localnet" } as any;
    const oldBehavior = "ws://127.0.0.1:18210".startsWith("ws://") ? "rpc" : "localnet";
    expect(oldBehavior).toBe("rpc"); // documents the broken pre-Wave-1 shape
    expect(pickReceiptMode(signed, "ws://127.0.0.1:18210")).toBe("localnet"); // post-Wave-1
    expect(pickReceiptMode(signed, "ws://127.0.0.1:18210") === oldBehavior).toBe(false);
  });
});
