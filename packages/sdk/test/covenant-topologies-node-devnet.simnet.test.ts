import { vi, describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { loadManagedKaspaWasmSync } from "@hardkas/core";
import { getHardkasFixtureKey, waitForUtxo } from "../../testing/src/index.js";
import { defineCovenantTopologyScenarios, type CovenantTopologyCaseRecord } from "./helpers/covenant-topologies-scenarios.js";
import { DEVNET_CONSENSUS_COINBASE_MATURITY_DAA, startDevnetNode, type DevnetNode } from "./helpers/devnet-node.js";

// the first run waits for coinbase maturity (1000 DAA mined by a CPU miner); the confirmation checks wait for policy depth
vi.setConfig({ testTimeout: 1_200_000, hookTimeout: 3_000_000 });

// -----------------------------------------------------------------------------
// INT9-C1 on devnet · the same covenant topology scenarios as covenant-topologies-node.simnet.test.ts (1:N, N:M with
// leader and delegates, termination, KCC-20 N:M signed; helpers/covenant-topologies-scenarios.ts), against an own
// rusty-kaspad v2.1.0 --devnet node with its own cpuminer (helpers/devnet-node.ts). Docker level, never the canonical gate.
//
// What devnet changes: blocks come from a real proof-of-work miner that runs all the time (no block-by-block mining), the
// funder (the fixture key "alice", at its kaspadev: address) is the miner's address and waits for its first coinbases to
// mature (1000 DAA), and every address, plan and compile record is devnet's.
//
// After the scenarios, every transaction the node accepted is checked again on the node: the ones the SDK sent through
// `hardkas artifact verify <artifact> --url <node> --network devnet --require consensus` (their txSubmission and signed
// artifacts, until the policy depth is reached), the one sent raw (no artifact) through the node's own UTXO listing.
//
// Evidence: a JSON written to HARDKAS_TEST_COVENANT_TOPOLOGIES_DEVNET_EVIDENCE (or the OS temp directory); with
// HARDKAS_TEST_COVENANT_TOPOLOGIES_DEVNET_ARTIFACTS, a copy of every verified artifact and its verification there.
// Needs Docker, the pinned images local (KASPAD_REFERENCE_IMAGE, CPUMINER_REFERENCE_IMAGE), HARDKAS_HOME with silverc and
// kaspa-wasm, and the built CLI (packages/cli/dist).
// -----------------------------------------------------------------------------

const FUNDING_SOMPI = 200n * 100_000_000n; // the four geneses take about 105 KAS; the rest is margin

let devnet: DevnetNode;
const run = defineCovenantTopologyScenarios({
  networkId: "devnet",
  titleSuffix: " · devnet",
  evidenceEnv: "HARDKAS_TEST_COVENANT_TOPOLOGIES_DEVNET_EVIDENCE",
  evidenceFilePrefix: "covenant-topologies-node-devnet",
  async start() {
    const k = loadManagedKaspaWasmSync();
    const key = getHardkasFixtureKey("alice");
    const funder = String(new k.PrivateKey(key).toPublicKey().toAddress("devnet").toString());
    devnet = await startDevnetNode({ miningAddress: funder });
    return {
      rpc: devnet.rpc,
      rpcUrl: devnet.rpcUrl,
      containerName: devnet.containerName,
      image: devnet.image,
      funderAddress: funder,
      funderPrivateKey: key,
      evidence: { devnet: devnet.describe() },
      async fund() {
        const funded = await devnet.waitForMatureFunds(funder, FUNDING_SOMPI);
        run.evidence.funding = { ...funded, coinbaseMaturityDaa: DEVNET_CONSENSUS_COINBASE_MATURITY_DAA, minSompi: FUNDING_SOMPI };
      },
      // the miner runs all the time: wait for the node to list the output
      confirm: (address, outpoint) => waitForUtxo({ rpc: devnet.rpc } as any, address, outpoint, 180_000),
      stop: () => devnet.stop()
    };
  }
});

interface VerifyRecord {
  file: string;
  schema: string;
  exit: number | null;
  attempts: number;
  verdict?: string;
  network?: string;
  consensus?: string;
  reason?: string;
  acceptingBlockHash?: string;
  confirmationsBlue?: string;
  nodeSync?: string;
  message?: string;
}

function artifactsOf(dir: string): Array<{ file: string; json: any }> {
  const out: Array<{ file: string; json: any }> = [];
  const walk = (d: string) => {
    if (!fs.existsSync(d)) return;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith(".json")) {
        try {
          out.push({ file: p, json: JSON.parse(fs.readFileSync(p, "utf8")) });
        } catch {
          /* not an artifact */
        }
      }
    }
  };
  walk(dir);
  return out;
}

/** `hardkas artifact verify --url --network devnet --require consensus`, again while the node has not reached the policy's depth. */
async function verifyOnNode(ws: string, file: string, deadline: number): Promise<{ rec: VerifyRecord; stdout: string }> {
  for (let attempts = 1; ; attempts++) {
    const r = spawnSync(process.execPath, [run.cliDist, "artifact", "verify", file, "--url", devnet.rpcUrl, "--network", "devnet", "--require", "consensus", "--json"], {
      cwd: ws,
      encoding: "utf8",
      env: process.env,
      timeout: 180_000
    });
    let json: any;
    try {
      json = JSON.parse(r.stdout.slice(r.stdout.indexOf("{")));
    } catch {
      json = undefined;
    }
    const levels = json?.result?.levels ?? json?.levels;
    const rec: VerifyRecord = {
      file: path.relative(ws, file).replace(/\\/g, "/"),
      schema: String(JSON.parse(fs.readFileSync(file, "utf8")).schema),
      exit: r.status,
      attempts,
      ...(levels?.verdict ? { verdict: String(levels.verdict) } : {}),
      ...(levels?.network?.level ? { network: String(levels.network.level) } : {}),
      ...(levels?.consensus?.level ? { consensus: String(levels.consensus.level) } : {}),
      ...(levels?.consensus?.reason ?? levels?.network?.reason ? { reason: String(levels?.consensus?.reason ?? levels?.network?.reason) } : {}),
      ...(levels?.network?.observation?.acceptingBlockHash ? { acceptingBlockHash: String(levels.network.observation.acceptingBlockHash) } : {}),
      ...(levels?.network?.observation?.confirmationsBlue ? { confirmationsBlue: String(levels.network.observation.confirmationsBlue) } : {}),
      ...(levels?.network?.node?.sync ? { nodeSync: String(levels.network.node.sync) } : {}),
      ...(json?.code && r.status !== 0 ? { message: `${json.code}: ${String(json.message ?? json.error?.message ?? "").slice(0, 300)}` } : !json ? { message: (r.stderr || r.stdout).slice(0, 300) } : {})
    };
    const pending = rec.consensus === "NOT_CONFIRMED" || rec.network === "NOT_OBSERVED";
    if (rec.verdict === "CONSENSUS_CONFIRMED" || !pending || Date.now() > deadline) return { rec, stdout: r.stdout };
    await new Promise((res) => setTimeout(res, 10_000));
  }
}

describe("INT9-C1 · devnet · every transaction the node accepted, checked again on the devnet node", () => {
  it("each SDK-sent transaction: its txSubmission and signed artifacts CONSENSUS_CONFIRMED by `artifact verify --require consensus`; the raw-sent one listed by the node", async () => {
    const ws = run.workspace();
    const cases = (run.evidence.cases as CovenantTopologyCaseRecord[]).filter((c) => c.node.accepted);
    expect(cases.length).toBeGreaterThan(0);
    const all = artifactsOf(path.join(ws, ".hardkas"));
    const copyDir = process.env.HARDKAS_TEST_COVENANT_TOPOLOGIES_DEVNET_ARTIFACTS?.trim() || undefined;
    if (copyDir) fs.mkdirSync(copyDir, { recursive: true });
    const deadline = Date.now() + 900_000;
    const checks: any[] = [];
    // the SDK-sent ones first (each waits for its policy depth), then the raw-sent ones (deeper by then)
    const ordered = [...cases.filter((c) => c.expectation === "both-accept"), ...cases.filter((c) => c.expectation !== "both-accept")];
    for (const c of ordered) {
      const txId = c.node.txId.toLowerCase();
      const check: any = { topology: c.topology, case: c.case, expectation: c.expectation, txId, listed: c.node.listed };
      if (c.expectation === "both-accept") {
        const submission = all.find((a) => a.json?.schema === "hardkas.txSubmission.v1" && String(a.json.txId).toLowerCase() === txId);
        const signed = all.find((a) => /^hardkas\.signedTx/.test(String(a.json?.schema)) && String(a.json.txId).toLowerCase() === txId);
        expect(submission, `no txSubmission artifact for ${txId}`).toBeDefined();
        expect(signed, `no signed artifact for ${txId}`).toBeDefined();
        for (const [kind, a] of [["submission", submission!], ["signed", signed!]] as const) {
          const { rec, stdout } = await verifyOnNode(ws, a.file, deadline);
          check[kind] = rec;
          if (copyDir) {
            const base = `${String(checks.length + 1).padStart(2, "0")}-${kind}-${txId.slice(0, 16)}`;
            fs.copyFileSync(a.file, path.join(copyDir, `${base}.json`));
            fs.writeFileSync(path.join(copyDir, `${base}.verify.json`), stdout);
          }
        }
      } else {
        // sent raw by the scenario (no artifact): the node's own listing of its first output, now
        const listed = c.node.listed!;
        expect(listed, `accepted ${txId} was not listed when mined`).toBeDefined();
        const now = await devnet.rpc.getUtxosByAddress(listed.address);
        const dag = await devnet.rpc.getBlockDagInfo();
        const still = (now as any[]).find((u) => `${String(u.outpoint.transactionId).toLowerCase()}:${u.outpoint.index}` === listed.outpoint);
        check.wrpc = {
          method: "getUtxosByAddresses",
          address: listed.address,
          outpoint: listed.outpoint,
          blockDaaScoreWhenMined: listed.blockDaaScore,
          stillListed: Boolean(still),
          virtualDaaScore: String(dag.virtualDaaScore),
          depthDaa: String(BigInt(dag.virtualDaaScore ?? 0) - BigInt(listed.blockDaaScore))
        };
      }
      checks.push(check);
    }
    const info: any = await devnet.rpc.getServerInfo();
    const dag: any = await devnet.rpc.getBlockDagInfo();
    run.evidence.devnetChecks = { checkedAt: new Date().toISOString(), node: { serverVersion: info.serverVersion, networkId: info.networkId, isSynced: info.isSynced, virtualDaaScore: String(dag.virtualDaaScore), sink: dag.sink }, checks };
    for (const check of checks) {
      if (check.expectation === "both-accept") {
        expect(check.submission.verdict, JSON.stringify(check.submission)).toBe("CONSENSUS_CONFIRMED");
        expect(check.signed.verdict, JSON.stringify(check.signed)).toBe("CONSENSUS_CONFIRMED");
      } else {
        // listed by the node when mined, at least 100 DAA deep now (one miner: DAA and blue score advance together)
        expect(BigInt(check.wrpc.depthDaa), JSON.stringify(check.wrpc)).toBeGreaterThanOrEqual(100n);
      }
    }
  });
});
