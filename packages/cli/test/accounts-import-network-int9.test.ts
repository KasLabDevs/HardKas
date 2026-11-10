import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runAccountsKeystoreImport } from "../src/runners/accounts-keystore-runners";
import { loadRealAccountStoreSync, resolveHardkasAccount } from "@hardkas/accounts";

// INT9-C4 · found building HardKAS's own payment vectors against a real node: `accounts real import` of a simnet key
// (kaspasim:) wrote its encrypted keystore with network "devnet" — any address that is not mainnet's got "devnet" — so
// the account could not sign at all (AccountNetworkConflictError: keystore=devnet, address=kaspasim:…), and its store
// entry carried no network. The import now records the network the address belongs to (kaspasim → simnet, kaspadev →
// devnet, kaspa → mainnet); a testnet address (kaspatest) names no testnet: --network, or the workspace's testnet-<n>.
// A network that does not fit the address is refused, and a missing address is a typed usage error; nothing is written.

const SIM = "kaspasim:qpumuen7l8wthtz45p3ftn58pvrs9xlumvkuu2xet8egzkcklqtes65ue9mw6";
const TEST = "kaspatest:qrh60m5zv98m5l855l855l855l855l855l855l855l855l85sxtunx";

let dir = "";
const keystoreOf = (name: string) => JSON.parse(fs.readFileSync(path.join(dir, ".hardkas", "keystore", `${name}.json`), "utf8"));
const entryOf = (name: string) => loadRealAccountStoreSync({ cwd: dir })?.accounts.find((a) => a.name === name);
const settle = async (p: Promise<unknown>) => p.then(() => undefined, (e: any) => e);

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "hk-import-network-"));
  fs.writeFileSync(path.join(dir, "hardkas.config.ts"), "export default {};\n");
  process.env.HK_IMPORT_NET_PW = "import-network-password";
  process.env.HK_IMPORT_NET_PK = "11".repeat(32);
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
  delete process.env.HK_IMPORT_NET_PW;
  delete process.env.HK_IMPORT_NET_PK;
});

describe("INT9-C4 · accounts real import records the network of the address it imports", () => {
  it("N-1 an encrypted simnet import: keystore and store entry say simnet, and the account resolves (it used to be keystore=devnet, unusable)", async () => {
    await runAccountsKeystoreImport({ name: "alice", address: SIM, privateKeyEnv: "HK_IMPORT_NET_PK", passwordEnv: "HK_IMPORT_NET_PW", json: true, workspaceRoot: dir } as any);
    expect(keystoreOf("alice").metadata.network).toBe("simnet");
    expect(entryOf("alice")?.network).toBe("simnet");
    const account: any = resolveHardkasAccount({ nameOrAddress: "alice", config: { cwd: dir } as any });
    expect(account.address).toBe(SIM);
    expect(account.network).toBe("simnet");
  });

  it("N-2 a testnet address with --network testnet-10: recorded as testnet-10", async () => {
    await runAccountsKeystoreImport({ name: "tn", address: TEST, network: "testnet-10", privateKeyEnv: "HK_IMPORT_NET_PK", passwordEnv: "HK_IMPORT_NET_PW", json: true, workspaceRoot: dir } as any);
    expect(keystoreOf("tn").metadata.network).toBe("testnet-10");
    expect(entryOf("tn")?.network).toBe("testnet-10");
  });

  it("N-3 a testnet address, no --network, a workspace without a testnet: ACCOUNT_NETWORK_REQUIRED, nothing written", async () => {
    const e: any = await settle(runAccountsKeystoreImport({ name: "tn", address: TEST, privateKeyEnv: "HK_IMPORT_NET_PK", passwordEnv: "HK_IMPORT_NET_PW", json: true, workspaceRoot: dir } as any));
    expect(e?.code).toBe("ACCOUNT_NETWORK_REQUIRED");
    expect(fs.existsSync(path.join(dir, ".hardkas", "keystore", "tn.json"))).toBe(false);
    expect(entryOf("tn")).toBeUndefined();
  });

  it("N-4 a --network that does not fit the address is refused before anything is written", async () => {
    const e: any = await settle(runAccountsKeystoreImport({ name: "bad", address: SIM, network: "testnet-10", privateKeyEnv: "HK_IMPORT_NET_PK", passwordEnv: "HK_IMPORT_NET_PW", json: true, workspaceRoot: dir } as any));
    expect(e?.code).toBe("NETWORK_ADDRESS_MISMATCH");
    expect(fs.existsSync(path.join(dir, ".hardkas", "keystore", "bad.json"))).toBe(false);
    expect(entryOf("bad")).toBeUndefined();
  });

  it("N-5 no --address: a typed usage error (it was UNKNOWN_ERROR), nothing read or written", async () => {
    const e: any = await settle(runAccountsKeystoreImport({ name: "none", privateKeyEnv: "HK_IMPORT_NET_PK", passwordEnv: "HK_IMPORT_NET_PW", json: true, workspaceRoot: dir } as any));
    expect(e?.code).toBe("ACCOUNT_ADDRESS_REQUIRED");
    expect(entryOf("none")).toBeUndefined();
  });
});
