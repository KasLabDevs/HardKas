import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { ARTIFACT_VERSION, CURRENT_HASH_VERSION, HARDKAS_VERSION, calculateContentHash } from "@hardkas/artifacts";
import { loadManagedKaspaWasmSync } from "@hardkas/core";
import { assertHermeticPreloadActive } from "./hermetic-child.js";
import { startFakeNode, runCli, tempDir, type FakeNode, BLUE0 } from "./helpers/int9-a-fake-node.js";

vi.setConfig({ testTimeout: 180_000, hookTimeout: 180_000 });

// INT9-A (I-1) · `artifact verify` in three levels, on every network, against loopback fakes that can lie.
//   INTEGRITY_VERIFIED   offline, every network (mainnet included, offline only)
//   NETWORK_OBSERVED     a node of the artifact's network sees the transaction (identity, source and scope recorded)
//   CONSENSUS_CONFIRMED  inclusion with the declared policy's blue-score depth on a synced node (not finality)
//   NOT_CHECKED          no node asked: offline, mainnet, simulated, no endpoint, an unproven node — never a fake PASS
// The matrix: per environment, valid, tampered, other-network, legacy, incomplete records and malicious endpoints.

const hex = (seed: string) => Buffer.from(seed.padEnd(32, "#").slice(0, 32)).toString("hex");
// real addresses (the official client decodes them): a public test key (BIP-340 vector 1), never funds
const TEST_KEY = "b7e151628aed2a6abf7158809cf4f3c762e7160f38b4da56a784d9045190cfef";
const addresses = new Map<string, string>();
const addrOf = (network: string) => {
  if (!addresses.has(network)) {
    const k: any = loadManagedKaspaWasmSync();
    addresses.set(network, String(new k.PrivateKey(TEST_KEY).toAddress(network === "simulated" ? "simnet" : network).toString()));
  }
  return addresses.get(network)!;
};

function seal(draft: Record<string, unknown>): any {
  const d: Record<string, unknown> = JSON.parse(JSON.stringify(draft));
  delete d.contentHash;
  return { ...d, contentHash: calculateContentHash(d, CURRENT_HASH_VERSION) };
}

function deployRecord(network: string, txId: string, over: Record<string, unknown> = {}, nodeOver: Record<string, unknown> = {}) {
  return seal({
    schema: "hardkas.silverDeploy.v1",
    hardkasVersion: HARDKAS_VERSION,
    createdAt: "2026-11-09T00:00:00.000Z",
    networkId: network,
    capability: "silver.p2sh.deploy-spend.v1",
    compileRecord: { path: "c.json", contentHash: "a".repeat(64), artifactSha256: "b".repeat(64) },
    contract: "Vault",
    lockingScript: { version: 0, script: "aa20" + "11".repeat(32) + "87" },
    address: addrOf(network),
    txId,
    outpoint: { transactionId: txId, index: 0 },
    valueSompi: "100000000",
    feeSompi: "2036",
    status: "confirmed",
    confirmedAtBlockDaaScore: "1234",
    node: { kind: "rusty-kaspad", verified: true, serverVersion: "2.1.0", verification: "endpoint", network, sync: "synced", endpoint: "ws://127.0.0.1:26320", ...nodeOver },
    version: ARTIFACT_VERSION,
    mode: "rpc",
    hashVersion: CURRENT_HASH_VERSION,
    ...over
  });
}

function simulatedReceipt() {
  return seal({
    schema: "hardkas.txReceipt",
    hardkasVersion: HARDKAS_VERSION,
    version: ARTIFACT_VERSION,
    hashVersion: CURRENT_HASH_VERSION,
    networkId: "simulated",
    mode: "simulator",
    createdAt: "2026-11-09T00:00:00.000Z",
    execution: { mode: "simulator", domain: "kaspa-l1", network: "simulated" },
    txId: `synthetic-${hex("int9a-sim")}`,
    status: "confirmed",
    from: { address: addrOf("simnet") },
    to: { address: addrOf("simnet") },
    amountSompi: "100000000",
    feeSompi: "2036"
  });
}

const made: string[] = [];
const fakes: FakeNode[] = [];
let dir = "";
let logs = "";
const write = (name: string, value: unknown) => {
  const file = path.join(dir, `${name}.json`);
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
  return file;
};
const fake = async (label: string, o: Parameters<typeof startFakeNode>[1]) => {
  const f = await startFakeNode(label, o);
  fakes.push(f);
  return f;
};
const verify = (name: string, file: string, extra: string[] = []) => runCli(logs, name, ["artifact", "verify", file, "--json", ...extra], dir);
const levels = (r: any) => r.json?.result?.levels;
const dialledTo = (r: any, f: FakeNode) => r.dialled.filter((d: string) => d.endsWith(`:${f.port}`));

beforeAll(() => {
  assertHermeticPreloadActive();
  dir = tempDir("hk-int9a-verify-", made);
  logs = tempDir("hk-int9a-verify-logs-", made);
});

afterAll(async () => {
  for (const f of fakes) await f.close();
  for (const d of made) fs.rmSync(d, { recursive: true, force: true });
});

describe("INT9-A · offline: integrity on every network, the network levels NOT_CHECKED (never a fake PASS)", () => {
  for (const network of ["simnet", "devnet", "testnet-10", "mainnet"]) {
    it(`${network}: INTEGRITY_VERIFIED offline, network and consensus NOT_CHECKED (OFFLINE), nothing contacted`, async () => {
      const r = await verify(`offline-${network}`, write(`offline-${network}`, deployRecord(network, hex(`off-${network}`))));
      expect(r.status, r.brief).toBe(0);
      expect(levels(r), r.brief).toMatchObject({ integrity: "INTEGRITY_VERIFIED", network: { level: "NOT_CHECKED", reason: "OFFLINE" }, consensus: { level: "NOT_CHECKED" }, verdict: "INTEGRITY_VERIFIED" });
      expect(r.dialled.filter((d) => d.startsWith("LOOPBACK_CONNECT") || d.startsWith("REFUSED")), r.brief).toEqual([]);
    });
  }

  it("--require network offline: the level is not reached (exit 1, VERIFICATION_LEVEL_NOT_REACHED) — and asking for it means a network check", async () => {
    const r = await verify("require-offline", write("require-offline", deployRecord("testnet-10", hex("req-off"))), ["--require", "network"]);
    expect(r.status, r.brief).toBe(1);
    // testnet-10 with no endpoint chosen: NOT_CHECKED, nothing contacted
    expect(levels(r)?.network, r.brief).toMatchObject({ level: "NOT_CHECKED", reason: "NETWORK_ENDPOINT_REQUIRED" });
    expect({ ok: r.json?.ok, code: r.json?.code }, r.brief).toEqual({ ok: false, code: "VERIFICATION_LEVEL_NOT_REACHED" });
    expect(r.dialled.filter((d) => d.startsWith("LOOPBACK_CONNECT")), r.brief).toEqual([]);
  });
});

describe("INT9-A · simulated: integrity yes, node evidence only the simulator's (labelled), never consensus", () => {
  it("a simulated receipt verifies offline; with --url it is NOT_CHECKED (SIMULATED_ARTIFACT) and the endpoint is never contacted", async () => {
    const f = await fake("sim-any", { network: "simnet" });
    const file = write("sim-receipt", simulatedReceipt());
    const offline = await verify("sim-offline", file);
    expect(levels(offline)?.integrity, offline.brief).toBe("INTEGRITY_VERIFIED");
    const r = await verify("sim-url", file, ["--url", f.url, "--require", "consensus"]);
    expect(r.status, r.brief).toBe(1);
    expect(levels(r), r.brief).toMatchObject({ network: { level: "NOT_CHECKED", reason: "SIMULATED_ARTIFACT" }, consensus: { level: "NOT_CHECKED" }, verdict: "INTEGRITY_VERIFIED" });
    expect(levels(r).consensus.message).toMatch(/simulator never gives consensus/);
    expect(f.methods, r.brief).toEqual([]);
    expect(dialledTo(r, f), r.brief).toEqual([]);
  });

  it("a real-network record checked against the HardKAS simulator: NOT_CHECKED (the simulator is never a node)", async () => {
    const f = await fake("sim-impostor", { network: "simnet", serverVersion: "2.1.0-kaspa-simulator" });
    const txId = hex("sim-impostor-tx");
    const r = await verify("sim-impostor", write("sim-impostor", deployRecord("simnet", txId)), ["--url", f.url]);
    expect(levels(r)?.network, r.brief).toMatchObject({ level: "NOT_CHECKED", reason: "NODE_IDENTITY_UNVERIFIED" });
    expect(f.methods.filter((m) => m !== "getServerInfo"), r.brief).toEqual([]);
  });
});

describe("INT9-A · simnet / devnet: an own node's evidence", () => {
  it("simnet: accepted deep in the virtual chain of a synced node → NETWORK_OBSERVED + CONSENSUS_CONFIRMED (policy, not finality)", async () => {
    const txId = hex("simnet-deep");
    const f = await fake("simnet-deep", { network: "simnet", tip: 400, accepted: { [txId]: 50 } });
    const r = await verify("simnet-deep", write("simnet-deep", deployRecord("simnet", txId)), ["--url", f.url, "--require", "consensus"]);
    expect(r.status, r.brief).toBe(0);
    const l = levels(r);
    expect(l, r.brief).toMatchObject({
      integrity: "INTEGRITY_VERIFIED",
      network: { level: "NETWORK_OBSERVED", observation: { source: "virtual-chain", acceptingBlockHash: f.hashOf(50), confirmationsBlue: "350" } },
      consensus: { level: "CONSENSUS_CONFIRMED", policy: { minConfirmations: 100, confirmationUnit: "blue-score" } },
      verdict: "CONSENSUS_CONFIRMED"
    });
    expect(l.consensus.scope).toMatch(/not irreversible finality/);
    expect(l.network.node, r.brief).toMatchObject({ family: "simnet", networkId: "simnet", observedNetworkId: "simnet", nodeType: "rusty-kaspad", trust: "node-endpoint", sync: "synced", evidence: { kind: "endpoint", serverVersion: "2.1.0", rpcApiVersion: 1 } });
    expect(JSON.stringify(l.network.node)).not.toMatch(/imageDigest/);
    expect(f.methods).not.toContain("submitTransaction");
  });

  it("simnet with --network only: the canonical localnet (container + digest) — unreachable here, so NOT_CHECKED; never a PASS", async () => {
    const r = await verify("simnet-canonical", write("simnet-canonical", deployRecord("simnet", hex("simnet-canonical"))), ["--network", "simnet"]);
    expect(r.status, r.brief).toBe(0);
    expect(levels(r)?.network?.level, r.brief).toBe("NOT_CHECKED");
    expect(["NODE_UNREACHABLE", "NODE_IDENTITY_UNVERIFIED"]).toContain(levels(r)?.network?.reason);
    expect(levels(r)?.verdict).toBe("INTEGRITY_VERIFIED");
  });

  it("devnet: shallow acceptance → NETWORK_OBSERVED, NOT_CONFIRMED (BELOW_POLICY_DEPTH); a declared policy of 3 → CONSENSUS_CONFIRMED", async () => {
    const txId = hex("devnet-shallow");
    const f = await fake("devnet-shallow", { network: "devnet", tip: 400, accepted: { [txId]: 395 } });
    const file = write("devnet-shallow", deployRecord("devnet", txId));
    const r = await verify("devnet-shallow", file, ["--url", f.url]);
    expect(levels(r), r.brief).toMatchObject({ network: { level: "NETWORK_OBSERVED" }, consensus: { level: "NOT_CONFIRMED", reason: "BELOW_POLICY_DEPTH" }, verdict: "NETWORK_OBSERVED" });
    const p = await verify("devnet-policy3", file, ["--url", f.url, "--min-confirmations", "3", "--require", "consensus"]);
    expect(p.status, p.brief).toBe(0);
    expect(levels(p)?.consensus, p.brief).toMatchObject({ level: "CONSENSUS_CONFIRMED", policy: { minConfirmations: 3, origin: "user" } });
  });

  it("devnet record, --network simnet: refused before anything is contacted (devnet is never read as simnet)", async () => {
    const f = await fake("devnet-as-simnet", { network: "simnet" });
    const r = await verify("devnet-as-simnet", write("devnet-as-simnet", deployRecord("devnet", hex("devnet-as-simnet"))), ["--network", "simnet", "--url", f.url]);
    expect(r.status, r.brief).not.toBe(0);
    expect(r.all, r.brief).toMatch(/ARTIFACT_NETWORK_MISMATCH/);
    expect(f.methods).toEqual([]);
  });

  it("devnet record, a node that LIES about its network (says simnet): NOT_CHECKED, only its identity was asked", async () => {
    const f = await fake("devnet-liar", { network: "simnet" });
    const r = await verify("devnet-liar", write("devnet-liar", deployRecord("devnet", hex("devnet-liar"))), ["--url", f.url, "--require", "network"]);
    expect(r.status, r.brief).toBe(1);
    expect(levels(r)?.network, r.brief).toMatchObject({ level: "NOT_CHECKED", reason: "NODE_IDENTITY_UNVERIFIED" });
    expect(levels(r).network.message, r.brief).toMatch(/reports network 'simnet', expected 'devnet'/);
    expect(f.methods.filter((m) => m !== "getServerInfo"), r.brief).toEqual([]);
  });
});

describe("INT9-A · testnet-10: read-only, by UTXO set or mempool", () => {
  it("an output still unspent in the UTXO set, accepted below the pruning point → NETWORK_OBSERVED (utxo-set) + CONSENSUS_CONFIRMED by a sound lower bound", async () => {
    const txId = hex("tn10-old");
    const address = addrOf("testnet-10");
    // pruning point at block 300: an accepting DAA score below its own (DAA0 + 600) precedes it on the chain
    const f = await fake("tn10-old", { network: "testnet-10", tip: 500, pruningAt: 300, utxos: [{ address, transactionId: txId, index: 0, amount: "100000000", blockDaaScore: "3000100" }] });
    const r = await verify("tn10-old", write("tn10-old", deployRecord("testnet-10", txId)), ["--url", f.url, "--require", "consensus"]);
    expect(r.status, r.brief).toBe(0);
    expect(levels(r), r.brief).toMatchObject({
      network: { level: "NETWORK_OBSERVED", observation: { source: "utxo-set", acceptingDaaScore: "3000100" }, node: { networkId: "testnet-10", family: "testnet" } },
      consensus: { level: "CONSENSUS_CONFIRMED" }
    });
    expect(levels(r).consensus.message).toMatch(/below the pruning point/);
    expect(levels(r).consensus.message).toContain(`${BLUE0 + 500 - (BLUE0 + 300)}`);
    expect(f.methods).not.toContain("submitTransaction");
  });

  it("an unspent output accepted after the pruning point, not located in the chain window: observed, NOT_CONFIRMED (ACCEPTING_BLOCK_NOT_LOCATED)", async () => {
    const txId = hex("tn10-recent");
    const address = addrOf("testnet-10");
    const f = await fake("tn10-recent", { network: "testnet-10", tip: 500, pruningAt: 300, utxos: [{ address, transactionId: txId, index: 0, amount: "100000000", blockDaaScore: "3000900" }] });
    const r = await verify("tn10-recent", write("tn10-recent", deployRecord("testnet-10", txId)), ["--url", f.url]);
    expect(levels(r), r.brief).toMatchObject({ network: { level: "NETWORK_OBSERVED", observation: { source: "utxo-set" } }, consensus: { level: "NOT_CONFIRMED", reason: "ACCEPTING_BLOCK_NOT_LOCATED" } });
  });

  it("only in the mempool: NETWORK_OBSERVED (mempool), NOT_CONFIRMED — mempool is not confirmation", async () => {
    const txId = hex("tn10-mempool");
    const f = await fake("tn10-mempool", { network: "testnet-10", mempool: [txId] });
    const r = await verify("tn10-mempool", write("tn10-mempool", deployRecord("testnet-10", txId)), ["--url", f.url, "--require", "consensus"]);
    expect(r.status, r.brief).toBe(1);
    expect(levels(r), r.brief).toMatchObject({ network: { level: "NETWORK_OBSERVED", observation: { source: "mempool" } }, consensus: { level: "NOT_CONFIRMED", reason: "MEMPOOL_IS_NOT_CONFIRMATION" }, verdict: "NETWORK_OBSERVED" });
  });

  it("nowhere on the node: NOT_OBSERVED (checked, not seen) — distinct from NOT_CHECKED", async () => {
    const f = await fake("tn10-absent", { network: "testnet-10" });
    const r = await verify("tn10-absent", write("tn10-absent", deployRecord("testnet-10", hex("tn10-absent"))), ["--url", f.url, "--require", "network"]);
    expect(r.status, r.brief).toBe(1);
    expect(levels(r)?.network, r.brief).toMatchObject({ level: "NOT_OBSERVED", reason: "NOT_FOUND" });
  });

  it("the node holds another amount at that outpoint than the record says: NOT_OBSERVED (OBSERVATION_CONFLICTS_WITH_ARTIFACT)", async () => {
    const txId = hex("tn10-amount");
    const f = await fake("tn10-amount", { network: "testnet-10", utxos: [{ address: addrOf("testnet-10"), transactionId: txId, index: 0, amount: "999", blockDaaScore: "3000100" }] });
    const r = await verify("tn10-amount", write("tn10-amount", deployRecord("testnet-10", txId)), ["--url", f.url]);
    expect(levels(r)?.network, r.brief).toMatchObject({ level: "NOT_OBSERVED", reason: "OBSERVATION_CONFLICTS_WITH_ARTIFACT" });
  });
});

describe("INT9-A · mainnet: integrity offline only; never contacted", () => {
  it("--url to a node that says mainnet: INTEGRITY_VERIFIED, NOT_CHECKED (MAINNET_NETWORK_CHECK_BLOCKED), zero connections to it", async () => {
    const f = await fake("mainnet", { network: "mainnet" });
    const file = write("mainnet", deployRecord("mainnet", hex("mainnet-tx")));
    for (const extra of [["--url", f.url], ["--network", "mainnet", "--url", f.url], ["--network", "mainnet"]]) {
      const r = await verify(`mainnet-${extra.length}`, file, extra);
      expect(r.status, r.brief).toBe(0);
      expect(levels(r), r.brief).toMatchObject({ integrity: "INTEGRITY_VERIFIED", network: { level: "NOT_CHECKED", reason: "MAINNET_NETWORK_CHECK_BLOCKED" }, consensus: { level: "NOT_CHECKED" } });
      expect(dialledTo(r, f), r.brief).toEqual([]);
      expect(r.dialled.filter((d) => d.startsWith("LOOPBACK_CONNECT") || d.startsWith("REFUSED")), r.brief).toEqual([]);
    }
    expect(f.methods).toEqual([]);
  });

  it("a testnet record checked on a URL whose node turns out to be mainnet: refused on its identity answer, nothing else asked", async () => {
    const f = await fake("mainnet-behind-tn10", { network: "mainnet" });
    const r = await verify("mainnet-behind-tn10", write("mainnet-behind-tn10", deployRecord("testnet-10", hex("mbt"))), ["--url", f.url]);
    expect(levels(r)?.network, r.brief).toMatchObject({ level: "NOT_CHECKED", reason: "NODE_IDENTITY_UNVERIFIED" });
    expect(f.methods.filter((m) => m !== "getServerInfo"), r.brief).toEqual([]);
  });
});

describe("INT9-A · tampered, legacy and incomplete records", () => {
  it("tampered: INTEGRITY_FAILED, exit 1, and no node is asked about it", async () => {
    const f = await fake("tampered", { network: "devnet" });
    const rec = deployRecord("devnet", hex("tampered"));
    const r = await verify("tampered", write("tampered", { ...rec, valueSompi: "999999999" }), ["--url", f.url]);
    expect(r.status, r.brief).toBe(1);
    expect(levels(r), r.brief).toMatchObject({ integrity: "INTEGRITY_FAILED", network: { level: "NOT_CHECKED", reason: "INTEGRITY_FAILED" }, verdict: "INTEGRITY_FAILED" });
    expect(f.methods).toEqual([]);
  });

  it("another network inside the record (its node reported simnet, it says devnet): INTEGRITY_FAILED (NETWORK_IDENTITY_MISMATCH)", async () => {
    const r = await verify("inner-mismatch", write("inner-mismatch", deployRecord("devnet", hex("inner"), {}, { network: "simnet" })));
    expect(r.status, r.brief).toBe(1);
    expect(JSON.stringify(r.json?.result?.issues), r.brief).toMatch(/NETWORK_IDENTITY_MISMATCH/);
  });

  it("legacy B3 testnet record (mode 'localnet', endpoint node, no sync): still verifies, warned, and the network check works", async () => {
    const txId = hex("legacy-b3");
    const legacy = seal({ ...deployRecord("testnet-10", txId), mode: "localnet", node: { kind: "rusty-kaspad", verified: true, serverVersion: "2.1.0", verification: "endpoint", network: "testnet-10" } });
    const f = await fake("legacy-b3", { network: "testnet-10", mempool: [txId] });
    const r = await verify("legacy-b3", write("legacy-b3", legacy), ["--url", f.url]);
    expect(r.status, r.brief).toBe(0);
    expect(JSON.stringify(r.json?.result?.issues)).toMatch(/LEGACY_MODE_LABEL/);
    expect(levels(r)?.network?.level, r.brief).toBe("NETWORK_OBSERVED");
  });

  it("legacy container record (before kind/verification/sync existed): still INTEGRITY_VERIFIED", async () => {
    const digest = "sha256:f85da74b9514584451f83a2cbea3aa93f700248302fe7e3e0ab17288f93c905b";
    const base = deployRecord("simnet", hex("legacy-container"));
    const legacy = seal({ ...base, mode: "localnet", node: { verified: true, container: "hardkas-kaspad-toccata-v2", imageDigest: digest, expectedImageDigest: digest, serverVersion: "2.1.0" } });
    const r = await verify("legacy-container", write("legacy-container", legacy));
    expect(r.status, r.brief).toBe(0);
    expect(levels(r)?.integrity).toBe("INTEGRITY_VERIFIED");
  });

  it("incomplete (no node): INTEGRITY_FAILED, nothing contacted", async () => {
    const f = await fake("incomplete", { network: "devnet" });
    const rec: any = deployRecord("devnet", hex("incomplete"));
    delete rec.node;
    const r = await verify("incomplete", write("incomplete", seal(rec)), ["--url", f.url]);
    expect(r.status, r.brief).toBe(1);
    expect(levels(r)?.network?.reason, r.brief).toBe("INTEGRITY_FAILED");
    expect(f.methods).toEqual([]);
  });

  it("a directory with a network option is refused (one artifact per network check), nothing contacted", async () => {
    const f = await fake("dir", { network: "devnet" });
    const r = await runCli(logs, "dir", ["artifact", "verify", dir, "--json", "--url", f.url], dir);
    expect(r.status, r.brief).not.toBe(0);
    expect(r.all, r.brief).toMatch(/ARTIFACT_VERIFY_NETWORK_SINGLE_FILE/);
    expect(f.methods).toEqual([]);
  });
});

// The same categories on every environment (legacy: only simnet and testnet records were ever written before INT9-A —
// the canonical localnet's container records and B3's endpoint records, both covered above; no devnet or mainnet
// Silver record existed, so there is nothing older to read there).
describe("INT9-A · the matrix per environment: tampered, another network inside, incomplete, a node of another network, a node that lies about sync", () => {
  const other: Record<string, string> = { simnet: "devnet", devnet: "simnet", "testnet-10": "simnet", mainnet: "testnet-10" };
  for (const network of ["simnet", "devnet", "testnet-10", "mainnet"]) {
    it(`${network}: tampered → INTEGRITY_FAILED; another network inside → NETWORK_IDENTITY_MISMATCH; incomplete → INTEGRITY_FAILED; nothing contacted`, async () => {
      const f = await fake(`matrix-${network}-untouched`, { network });
      const rec = deployRecord(network, hex(`m-${network}`));
      const cases: Array<[string, unknown, RegExp | undefined]> = [
        ["tampered", { ...rec, feeSompi: "1" }, /ARTIFACT_HASH_MISMATCH/],
        ["inner", deployRecord(network, hex(`mi-${network}`), {}, { network: other[network] }), /NETWORK_IDENTITY_MISMATCH/],
        ["incomplete", seal((({ txId, ...rest }) => rest)(rec as any)), undefined]
      ];
      for (const [label, value, code] of cases) {
        const r = await verify(`matrix-${network}-${label}`, write(`matrix-${network}-${label}`, value), ["--url", f.url]);
        expect({ label, status: r.status }, r.brief).toEqual({ label, status: 1 });
        expect(levels(r), r.brief).toMatchObject({ integrity: "INTEGRITY_FAILED", network: { level: "NOT_CHECKED", reason: "INTEGRITY_FAILED" } });
        if (code) expect(JSON.stringify(r.json?.result?.issues), r.brief).toMatch(code);
      }
      expect(f.methods).toEqual([]);
    });

    if (network !== "mainnet") {
      it(`${network}: a node of another network → NOT_CHECKED; a node that says it is not synced → never CONSENSUS_CONFIRMED`, async () => {
        const txId = hex(`mn-${network}`);
        const wrong = await fake(`matrix-${network}-wrong`, { network: other[network], accepted: { [txId]: 10 } });
        const unsynced = await fake(`matrix-${network}-unsynced`, { network, isSynced: false, accepted: { [txId]: 10 } });
        const file = write(`matrix-${network}-valid`, deployRecord(network, txId));
        const a = await verify(`matrix-${network}-wrongnode`, file, ["--url", wrong.url]);
        expect(levels(a)?.network, a.brief).toMatchObject({ level: "NOT_CHECKED", reason: "NODE_IDENTITY_UNVERIFIED" });
        expect(wrong.methods.filter((m) => m !== "getServerInfo"), a.brief).toEqual([]);
        const b = await verify(`matrix-${network}-unsynced`, file, ["--url", unsynced.url, "--require", "consensus"]);
        expect(b.status, b.brief).toBe(1);
        expect(levels(b)?.consensus, b.brief).toMatchObject({ level: "NOT_CONFIRMED", reason: "NODE_NOT_SYNCED" });
      });
    }
  }

  it("simulated: a tampered receipt fails integrity, and --network of a real network is refused (never contacted)", async () => {
    const f = await fake("matrix-sim", { network: "simnet" });
    const rec = simulatedReceipt();
    const t = await verify("matrix-sim-tampered", write("matrix-sim-tampered", { ...rec, amountSompi: "1" }), ["--url", f.url]);
    expect(levels(t)?.integrity, t.brief).toBe("INTEGRITY_FAILED");
    const o = await verify("matrix-sim-as-simnet", write("matrix-sim-valid", rec), ["--network", "simnet", "--url", f.url]);
    expect(o.all, o.brief).toMatch(/ARTIFACT_NETWORK_MISMATCH/);
    expect(f.methods).toEqual([]);
  });
});

describe("INT9-A · malicious endpoints: lies about version, sync or the chain never become a PASS", () => {
  it("another server version: NOT_CHECKED (identity)", async () => {
    const txId = hex("liar-version");
    const f = await fake("liar-version", { network: "devnet", serverVersion: "2.0.0", accepted: { [txId]: 10 } });
    const r = await verify("liar-version", write("liar-version", deployRecord("devnet", txId)), ["--url", f.url]);
    expect(levels(r)?.network, r.brief).toMatchObject({ level: "NOT_CHECKED", reason: "NODE_IDENTITY_UNVERIFIED" });
  });

  it("says it is not synced: the transaction may be observed, but its depth is not a confirmation (NODE_NOT_SYNCED)", async () => {
    const txId = hex("liar-unsynced");
    const f = await fake("liar-unsynced", { network: "devnet", isSynced: false, accepted: { [txId]: 10 } });
    const r = await verify("liar-unsynced", write("liar-unsynced", deployRecord("devnet", txId)), ["--url", f.url, "--require", "consensus"]);
    expect(r.status, r.brief).toBe(1);
    expect(levels(r), r.brief).toMatchObject({ network: { level: "NETWORK_OBSERVED", node: { sync: "not-synced", nodeType: "rusty-kaspad" } }, consensus: { level: "NOT_CONFIRMED", reason: "NODE_NOT_SYNCED" } });
  });

  // A getServerInfo without isSynced cannot be decoded by the official client (rusty-kaspad always sends it). Before
  // INT9-A this looped getServerInfo/getInfo forever (the CLI hung, hammering the endpoint); now it ends at once, and an
  // identity that cannot be read is never a node (the "unknown" sync state itself is covered by the unit tests).
  it("does not say whether it is synced (undecodable answer): ends promptly, NOT_CHECKED — never assumed synced, never a hang", async () => {
    const txId = hex("liar-nosync");
    const f = await fake("liar-nosync", { network: "devnet", isSynced: undefined, accepted: { [txId]: 10 } });
    const started = Date.now();
    const r = await verify("liar-nosync", write("liar-nosync", deployRecord("devnet", txId)), ["--url", f.url]);
    expect(r.status, r.brief).toBe(0);
    expect(Date.now() - started, r.brief).toBeLessThan(60_000);
    expect(levels(r)?.network, r.brief).toMatchObject({ level: "NOT_CHECKED", reason: "NODE_IDENTITY_UNVERIFIED" });
    expect(f.methods.filter((m) => m === "getServerInfo").length, r.brief).toBeLessThanOrEqual(2);
  });

  it("an incoherent virtual-chain answer: rejected whole, NOT_CHECKED (OBSERVATION_FAILED)", async () => {
    const txId = hex("liar-chain");
    const f = await fake("liar-chain", { network: "devnet", incoherentChain: true, accepted: { [txId]: 10 } });
    const r = await verify("liar-chain", write("liar-chain", deployRecord("devnet", txId)), ["--url", f.url]);
    expect(levels(r)?.network, r.brief).toMatchObject({ level: "NOT_CHECKED", reason: "OBSERVATION_FAILED" });
    expect(levels(r).network.message).toMatch(/OBSERVE_CHAIN_ANSWER_INCOHERENT/);
  });
});
