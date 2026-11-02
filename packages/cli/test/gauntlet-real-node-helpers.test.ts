import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

// -----------------------------------------------------------------------------
// GAUNTLET-HELPERS-UNTRACKED · the gauntlet's real-node phase (run-real-node.mjs) imported its waits from an ignored
// local file, so `pnpm gauntlet:toccata` could not run from a clean clone. The waits are now a tracked module: every
// name the phase imports must come from a file in the repository that exports it. The waits are bounded and only read.
// Canonical level: no node (an unreachable loopback port), no Docker.
// -----------------------------------------------------------------------------

const DIR = path.resolve(__dirname, "../test-gauntlet/real-node");
const RUNNER = path.join(DIR, "run-real-node.mjs");
const load = () => import(pathToFileURL(path.join(DIR, "real-node-helpers.mjs")).href);

describe("GAUNTLET-HELPERS-UNTRACKED · the real-node phase's waits are a tracked module", () => {
  it("every name run-real-node.mjs imports from a relative module is exported by that module, which is in the repository", async () => {
    const source = fs.readFileSync(RUNNER, "utf8");
    const imports = [...source.matchAll(/import\s*\{([^}]*)\}\s*from\s*"(\.\/[^"]+)"/g)];
    expect(imports.length).toBeGreaterThan(0);
    for (const [, names, rel] of imports) {
      const file = path.join(DIR, rel!);
      expect(fs.existsSync(file), rel).toBe(true);
      const mod = await import(pathToFileURL(file).href);
      for (const name of names!.split(",").map((n) => n.trim()).filter(Boolean)) expect(typeof mod[name], `${rel}: ${name}`).toBe("function");
    }
    expect(source).not.toMatch(/from "\.\/helpers\.mjs"/);
  });

  it("the waits answer within their bound: funding reads the CLI's JSON balance; DAA waits fail with TOCCATA_DAA_TIMEOUT", async () => {
    const h = await load();
    let calls = 0;
    const runCmd = (cmd: string) => {
      calls++;
      expect(cmd).toBe("accounts balance fresh_alice --provider rpc --json");
      return JSON.stringify({ ok: true, command: "accounts balance", result: { balanceSompi: calls < 2 ? "5" : "100000000000" } });
    };
    const r = await h.waitForFundingConfirmation({ runCmd, accountName: "fresh_alice", expectedSompi: 100000000000n, timeoutMs: 5_000, intervalMs: 10, context: {} });
    expect(r.balanceSompi).toBe(100000000000n);
    await expect(
      h.waitForFundingConfirmation({ runCmd: () => JSON.stringify({ result: { balanceSompi: "1" } }), accountName: "x", expectedSompi: 2n, timeoutMs: 50, intervalMs: 10, context: { daaStart: 7n } })
    ).rejects.toThrow(/^TOCCATA_FUNDING_CONFIRMATION_TIMEOUT: x holds 1 of the 2 sompi expected.*DAA Start: 7, DAA End: unavailable$/);
    expect(await h.getVirtualDaaScoreBestEffort("ws://127.0.0.1:1")).toBeUndefined();
    await expect(h.waitForDaaScore({ rpcUrl: "ws://127.0.0.1:1", target: 10n, timeoutMs: 200, intervalMs: 50 })).rejects.toThrow(/^TOCCATA_DAA_TIMEOUT: /);
  }, 30_000);

  // The CI Docker suite's canonical gauntlet failed with EACCES: the phase removed the whole .hardkas, which held the chain
  // the canonical node's container had written as root (the localnet was started from the same directory).
  it("the clean state empties the workspace state but keeps the canonical node's data folder (.hardkas/kaspad)", async () => {
    const h = await load();
    const ws = fs.mkdtempSync(path.join(os.tmpdir(), "hk-gauntlet-clean-"));
    try {
      const dir = path.join(ws, ".hardkas");
      fs.mkdirSync(path.join(dir, "kaspad", ".rusty-kaspa"), { recursive: true });
      fs.writeFileSync(path.join(dir, "kaspad", ".rusty-kaspa", "chain"), "chain data\n");
      fs.mkdirSync(path.join(dir, "artifacts", "misc"), { recursive: true });
      fs.writeFileSync(path.join(dir, "artifacts", "misc", "a.json"), "{}");
      fs.writeFileSync(path.join(dir, "accounts.real.json"), "{}");
      h.cleanWorkspaceState(dir);
      expect(fs.readdirSync(dir)).toEqual(["kaspad"]);
      expect(fs.readFileSync(path.join(dir, "kaspad", ".rusty-kaspa", "chain"), "utf8")).toBe("chain data\n");
      expect(() => h.cleanWorkspaceState(path.join(ws, "absent"))).not.toThrow();
    } finally {
      fs.rmSync(ws, { recursive: true, force: true });
    }
  });
});
