import { describe, it, expect } from "vitest";
import { execa } from "execa";
import path from "node:path";

describe("hardkas localnet account create", () => {
  const cliPath = path.resolve(__dirname, "../src/index.ts");
  const tsx = "node";
  const runArgs = ["--import", "tsx", cliPath];

  it("should deterministically create a simulated localnet account", async () => {
    const { stdout } = await execa(tsx, [
      ...runArgs,
      "localnet",
      "account",
      "create",
      "alice",
      "--json"
    ]);

    const account = JSON.parse(stdout);

    expect(account.accountName).toBe("alice");
    expect(account.address).toBe("kaspa:sim_alice");
    expect(account.securityModel).toBe("simulated-only");
    expect(account.rpc).toBe("disabled");
    expect(account.wasm).toBe("disabled");

    // Check determinism
    const { stdout: stdout2 } = await execa(tsx, [
      ...runArgs,
      "localnet",
      "account",
      "create",
      "alice",
      "--json"
    ]);
    const account2 = JSON.parse(stdout2);

    expect(account).toEqual(account2);

    // Another account
    const { stdout: stdout3 } = await execa(tsx, [
      ...runArgs,
      "localnet",
      "account",
      "create",
      "bob",
      "--json"
    ]);
    const account3 = JSON.parse(stdout3);

    expect(account.privateKey).not.toBe(account3.privateKey);
    expect(account.publicKey).not.toBe(account3.publicKey);
  }, 30000);
});
