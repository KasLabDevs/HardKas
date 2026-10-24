import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execa } from "execa";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

// E2E-SIMULATOR-ACCOUNT-1: the synthetic account contract localnet-account.e2e.test.ts used to assert under the wrong
// command. `simulator account create` derives everything from the name (kaspa:sim_<name> and sim_pub_/sim_priv_
// placeholders, never a real key), records it in .hardkas/keystore.json, never writes the real account store, and never
// overwrites an account. It takes no --workspace, so every run happens in a temporary directory, never in the repository.
describe("hardkas simulator account create", () => {
  let parent: string;
  const cliPath = path.resolve(__dirname, "../src/index.ts");
  const tsx = "node";
  // as in localnet-account.e2e.test.ts (E2E-HARDKAS-ISOLATION-1): from a temporary directory a bare `--import tsx`
  // does not resolve, so the loader goes by absolute URL
  const tsxLoader = pathToFileURL(createRequire(import.meta.url).resolve("tsx")).href;
  const runArgs = ["--import", tsxLoader, cliPath];
  const create = (name: string, cwd: string) =>
    execa(tsx, [...runArgs, "simulator", "account", "create", name, "--json"], { cwd, reject: false });
  const fresh = async (name: string) => {
    const dir = path.join(parent, name);
    await fs.mkdir(dir);
    return dir;
  };

  beforeAll(async () => {
    parent = await fs.mkdtemp(path.join(os.tmpdir(), "simulator-account-test-"));
  });

  afterAll(async () => {
    await fs.rm(parent, { recursive: true, force: true });
  });

  it("creates a synthetic account derived from its name, with no real key", async () => {
    const ws = await fresh("one");
    const r = await create("zoe", ws);
    expect(r.exitCode, r.stderr).toBe(0);
    const account = JSON.parse(r.stdout);
    expect(account).toMatchObject({
      accountName: "zoe",
      address: "kaspa:sim_zoe",
      securityModel: "simulated-only",
      rpc: "disabled",
      wasm: "disabled"
    });
    expect(account.publicKey).toMatch(/^sim_pub_[0-9a-f]{16}$/);
    expect(account.privateKey).toMatch(/^sim_priv_[0-9a-f]{64}$/);

    const keystore = JSON.parse(await fs.readFile(path.join(ws, ".hardkas", "keystore.json"), "utf-8"));
    expect(keystore.zoe).toEqual({ address: "kaspa:sim_zoe", type: "simulated" });
    expect(existsSync(path.join(ws, ".hardkas", "accounts.real.json")), "no real account store").toBe(false);
  }, 180000);

  it("is the same account in every workspace, and another name is another account", async () => {
    const a = JSON.parse((await create("zoe", await fresh("two"))).stdout);
    const b = JSON.parse((await create("zoe", await fresh("three"))).stdout);
    expect(a).toEqual(b);
    const other = JSON.parse((await create("yuri", await fresh("four"))).stdout);
    expect(other.address).toBe("kaspa:sim_yuri");
    expect(other.privateKey).not.toBe(a.privateKey);
  }, 180000);

  it("never overwrites: neither an account of this workspace nor a preset dev account", async () => {
    const ws = await fresh("five");
    expect((await create("zoe", ws)).exitCode).toBe(0);
    const again = await create("zoe", ws);
    expect(again.exitCode).not.toBe(0);
    expect(`${again.stdout}\n${again.stderr}`).toMatch(/already exists/);
    const preset = await create("alice", ws);
    expect(preset.exitCode).not.toBe(0);
    expect(`${preset.stdout}\n${preset.stderr}`).toMatch(/already exists \(kind: synthetic\)/);
  }, 180000);
});
