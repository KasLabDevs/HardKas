import { describe, it, expect, vi, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LoadBalancedRpcProvider } from "../src/provider.js";

// P29: `LoadBalancedRpcProvider.getVirtualChainFromBlockV2` printed `[DEBUG] getVirtualChainFromBlockV2 payload: …` on
// stdout for every call (an RPC payload in the output of whoever used it, a --json envelope included). The method stays
// (the QRY-03 qualification gate and a lab call the V2 wrappers); it no longer prints, and passes the same payload on.

const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), "../src");
const sources = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? sources(path.join(dir, e.name)) : e.name.endsWith(".ts") ? [path.join(dir, e.name)] : []));

afterEach(() => vi.restoreAllMocks());

describe("P29 · kaspa-rpc prints no [DEBUG] lines", () => {
  it("getVirtualChainFromBlockV2 through the load balancer writes nothing to stdout and forwards the payload", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const write = vi.spyOn(process.stdout, "write");
    const answer = { removedChainBlockHashes: [], addedChainBlockHashes: ["b1"] };
    const v2 = vi.fn(async () => answer);
    const provider = new LoadBalancedRpcProvider([{ getVirtualChainFromBlockV2: v2 } as any]);

    await expect(provider.getVirtualChainFromBlockV2({ startHash: "aa".repeat(32), dataVerbosityLevel: "LEGACY_RECOVERY" })).resolves.toBe(answer);
    await expect(provider.getVirtualChainFromBlockV2({ startHash: "bb".repeat(32) })).resolves.toBe(answer);

    expect(v2.mock.calls).toEqual([
      [{ startHash: "aa".repeat(32), includeAcceptedTransactionIds: true }],
      [{ startHash: "bb".repeat(32), includeAcceptedTransactionIds: false }]
    ]);
    expect(log).not.toHaveBeenCalled();
    expect(write.mock.calls.map((c) => String(c[0])).filter((s) => s.includes("[DEBUG]"))).toEqual([]);
  });

  it("no source file of @hardkas/kaspa-rpc carries a console.log(\"[DEBUG]\")", () => {
    const hits = sources(SRC).filter((f) => /console\.log\(\s*["'`]\[DEBUG\]/.test(fs.readFileSync(f, "utf8")));
    expect(hits).toEqual([]);
  });
});
