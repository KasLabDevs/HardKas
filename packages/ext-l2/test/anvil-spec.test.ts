import { describe, it, expect } from "vitest";
import path from "node:path";
import { anvilArgs, anvilStateDir, parsePort, parseAccounts, verifiedFoundry } from "../src/node/anvil.js";

// L2-EXT stage 4 · what is specific to Anvil: loopback-only arguments, the local chain id, the workspace state dir,
// argument validation, and no start without a verified Foundry (the real runs are in anvil-node.foundry.test.ts).
describe("Anvil node spec", () => {
  it("binds 127.0.0.1 only, on chain id 31337", () => {
    expect(anvilArgs(8545, 10)).toEqual(["--host", "127.0.0.1", "--port", "8545", "--chain-id", "31337", "--accounts", "10"]);
  });

  it("keeps its record, log and lock under the workspace", () => {
    expect(anvilStateDir(path.resolve("/ws"))).toBe(path.join(path.resolve("/ws"), ".hardkas", "processes", "l2-anvil"));
  });

  it("validates --port and --accounts", () => {
    expect(parsePort(undefined)).toBe(8545);
    expect(parsePort("18545")).toBe(18545);
    for (const bad of ["80", "70000", "abc", "8545.5"]) expect(() => parsePort(bad)).toThrow(expect.objectContaining({ code: "L2_NODE_PORT_INVALID" }));
    expect(parseAccounts("3")).toBe(3);
    for (const bad of ["0", "101", "x"]) expect(() => parseAccounts(bad)).toThrow(expect.objectContaining({ code: "L2_NODE_ACCOUNTS_INVALID" }));
  });

  it("without a verified Foundry it refuses with the exact install command (it never installs it)", async () => {
    const prev = process.env.HARDKAS_HOME;
    process.env.HARDKAS_HOME = path.resolve("/hardkas-home-that-does-not-exist");
    try {
      await expect(verifiedFoundry()).rejects.toMatchObject({
        code: expect.stringMatching(/TOOLCHAIN_NOT_INSTALLED|TOOLCHAIN_PLATFORM_UNSUPPORTED/),
        message: expect.stringMatching(/hardkas toolchain install foundry|no pinned Foundry/)
      });
    } finally {
      if (prev === undefined) delete process.env.HARDKAS_HOME;
      else process.env.HARDKAS_HOME = prev;
    }
  });
});
