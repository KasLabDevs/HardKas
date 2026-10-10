import { describe, it, expect, vi, beforeEach } from "vitest";
import { createCommandOutput, setGlobalOutput } from "../src/output.js";

// SECRET-SURFACE-2 · D1 (P1) — the part a process cannot show from outside: the refusal is decided BEFORE the key
// generator runs. The generator is replaced by a spy; the runner is driven directly, its output captured.

const { generate } = vi.hoisted(() => ({
  generate: vi.fn(async () => ({ address: "kaspasim:qtestaddress", publicKey: "02" + "ab".repeat(32), privateKey: "cd".repeat(32) }))
}));
vi.mock("@hardkas/accounts", async (orig) => ({ ...(await orig<any>()), createLocalKaspaWallet: generate }));

const KEY = "cd".repeat(32);

const capture = (mode: "human" | "json") => {
  const stdout: string[] = [];
  const stderr: string[] = [];
  setGlobalOutput(
    createCommandOutput({
      mode,
      stdout: { write: (m: string) => void stdout.push(m) },
      stderr: { write: (m: string) => void stderr.push(m) }
    })
  );
  return { out: () => stdout.join(""), err: () => stderr.join("") };
};

const runner = () => import("../src/runners/kaspa-wallet-runner.js");

describe("SECRET-SURFACE-2 · D1 · the refusal happens before any key exists", () => {
  beforeEach(() => generate.mockClear());

  it("without --show-private-key: a typed usage refusal, the generator never called, nothing printed (human)", async () => {
    const io = capture("human");
    const { runKaspaWalletCreate } = await runner();
    await expect(runKaspaWalletCreate("vault", { network: "mainnet" })).rejects.toMatchObject({
      name: "HardkasCliError",
      code: "WALLET_KEY_OUTPUT_REQUIRED",
      exitCode: 2
    });
    expect(generate).not.toHaveBeenCalled();
    expect(io.out() + io.err()).toBe("");
  });

  it("without --show-private-key, --json: the same refusal, the generator never called, nothing printed by the runner", async () => {
    const io = capture("json");
    const { runKaspaWalletCreate } = await runner();
    await expect(runKaspaWalletCreate("vault", { network: "simnet", json: true })).rejects.toMatchObject({ code: "WALLET_KEY_OUTPUT_REQUIRED", exitCode: 2 });
    expect(generate).not.toHaveBeenCalled();
    expect(io.out() + io.err()).toBe("");
  });

  it("the refusal names the two ways out and says nothing was generated, without any value", async () => {
    const { runKaspaWalletCreate } = await runner();
    const e: any = await runKaspaWalletCreate("vault", { network: "testnet-10" }).catch((err) => err);
    const text = `${e.message}\n${e.suggestion ?? ""}`;
    expect(text).toMatch(/--show-private-key/);
    expect(text).toMatch(/accounts real generate --name vault --network testnet-10 --password-env/);
    expect(text).toMatch(/[Nn]othing was generated/);
    expect(text).not.toMatch(/[0-9a-f]{64}/i);
  });

  it("with --show-private-key: the generator runs once, the key is printed once, after the warning (human)", async () => {
    const io = capture("human");
    const { runKaspaWalletCreate } = await runner();
    await runKaspaWalletCreate("vault", { network: "simnet", showPrivateKey: true });
    expect(generate).toHaveBeenCalledTimes(1);
    const text = io.out();
    expect(text.split(KEY).length - 1, "once").toBe(1);
    expect(text).toMatch(/VAULT_PRIVATE_KEY=/);
    expect(text).toMatch(/only copy/i);
    expect(text.search(/only copy/i)).toBeLessThan(text.indexOf("VAULT_PRIVATE_KEY="));
    expect(text).toContain("kaspasim:qtestaddress");
    expect(io.err()).not.toContain(KEY);
  });

  it("with --show-private-key --json: one document on stdout with the key, the warning on stderr, the key once in all", async () => {
    const io = capture("json");
    const { runKaspaWalletCreate } = await runner();
    await runKaspaWalletCreate("vault", { network: "mainnet", showPrivateKey: true, json: true });
    expect(generate).toHaveBeenCalledTimes(1);
    const doc = JSON.parse(io.out().trim());
    expect(doc).toMatchObject({ ok: true, command: "kaspa wallet create", result: { name: "vault", network: "mainnet", address: "kaspasim:qtestaddress", privateKeyEnv: "VAULT_PRIVATE_KEY", privateKey: KEY, persisted: false } });
    expect(io.err()).toMatch(/only copy/i);
    expect((io.out() + io.err()).split(KEY).length - 1).toBe(1);
  });
});
