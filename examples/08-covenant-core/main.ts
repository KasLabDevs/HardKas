// SilverScript v1 example: a fixed-destination P2SH contract on the canonical localnet.
//
// The contract (fixtures/covenant.sil) lets its output be spent only to one
// recipient — a covenant in the classic sense, enforced by the script. It is
// not a Toccata covenant declaration (see run-silver-v2-covenant.mjs for that).
//
// Everything consensus-relevant comes from upstream: silverc v1.0.0 (managed)
// compiles, the Kaspa SDK builds the lock, unlock, fees and signatures, and the
// verified canonical rusty-kaspad decides.
//
// Prerequisites: `hardkas toolchain install kaspa-wasm`, `hardkas toolchain install silverc`,
// and the canonical localnet running with its miner (`hardkas localnet start --toccata`).
// The funding key defaults to the simnet fixture key; override with HARDKAS_EXAMPLE_FUNDER_KEY.
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import {
  compileSilverScript,
  getSilContract,
  loadManagedKaspaWasmSync,
  nodeRpcUrl,
  silContractBytecodeHex,
  silverP2shAddress,
  silverP2shLock
} from "@hardkas/core";
import { requireNodeIdentity } from "@hardkas/node-runner";
import { buildScriptFunding, buildSilverSweep } from "../../packages/accounts/dist/index.js";
import { JsonWrpcKaspaClient } from "../../packages/kaspa-rpc/dist/index.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(HERE, "fixtures");
const FUNDER_KEY = process.env.HARDKAS_EXAMPLE_FUNDER_KEY ?? "b7e151628aed2a6abf7158809cf4f3c762e7160f38b4da56a784d9045190cfef";
const RECIPIENT_KEY = "2222222222222222222222222222222222222222222222222222222222222222";
const AMOUNT = 100_000_000n; // 1 KAS

const sha256 = (b: Uint8Array | string) => createHash("sha256").update(b).digest("hex");
const rpc = new JsonWrpcKaspaClient({ rpcUrl: nodeRpcUrl() });

async function waitForUtxo(address: string, txId: string, label: string) {
  for (let i = 0; i < 120; i++) {
    const found = (await rpc.getUtxosByAddress(address)).find((u) => u.outpoint.transactionId === txId);
    if (found) return found;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`${label}: not confirmed within 120 s — is the localnet miner running?`);
}

function contractUtxo(u: any) {
  const e = u.raw?.utxoEntry ?? u.raw ?? {};
  const spk = e.scriptPublicKey;
  return {
    outpoint: u.outpoint,
    amountSompi: BigInt(u.amountSompi),
    scriptPublicKey: typeof spk === "object" ? { version: Number(spk.version ?? 0), script: String(spk.scriptPublicKey ?? spk.script) } : { version: 0, script: String(spk).slice(4) },
    blockDaaScore: BigInt(e.blockDaaScore ?? 0),
    isCoinbase: !!e.isCoinbase
  };
}

async function main() {
  console.log("HardKAS SilverScript v1 — fixed-destination P2SH contract\n");

  // 1. Compile with the managed official compiler; the fixture must be reproducible.
  const source = fs.readFileSync(path.join(FIXTURES, "covenant.sil"));
  const compiled = await compileSilverScript({ source });
  const fixture = fs.readFileSync(path.join(FIXTURES, "covenant.json"));
  if (!Buffer.from(compiled.artifactBytes).equals(fixture)) {
    throw new Error("fixtures/covenant.json is not what silverc v1.0.0 produces from covenant.sil");
  }
  const bytecode = silContractBytecodeHex(getSilContract(compiled.artifact).contract);
  const address = silverP2shAddress(bytecode, "simnet");
  console.log(`Compiled with silverc ${compiled.provenance.compiler.releaseTag} (${compiled.provenance.compiler.binarySha256})`);
  console.log(`Artifact sha256 ${compiled.provenance.artifactSha256} == fixture`);
  console.log(`Contract address ${address}`);

  // 2. The node must be the canonical one, proven.
  const identity = await requireNodeIdentity();
  console.log(`Node ${identity.observed.container?.name}: rusty-kaspad ${identity.observed.server?.serverVersion} (identity verified)`);

  // 3. Fund the contract.
  const k = loadManagedKaspaWasmSync();
  const funder = new k.PrivateKey(FUNDER_KEY).toKeypair().toAddress("simnet").toString();
  const recipient = new k.PrivateKey(RECIPIENT_KEY).toKeypair().toAddress("simnet").toString();
  const virt = BigInt((await rpc.getBlockDagInfo()).virtualDaaScore);
  const coins = (await rpc.getUtxosByAddress(funder)).map(contractUtxo).filter((u) => !u.isCoinbase || u.blockDaaScore + 1010n < virt);
  const funding = buildScriptFunding({ utxos: coins, privateKey: FUNDER_KEY, lockingScript: silverP2shLock(bytecode), valueSompi: AMOUNT, networkId: "simnet" });
  await rpc.submitTransaction(funding.rpcTransaction);
  const funded = contractUtxo(await waitForUtxo(address, funding.txId, "funding"));
  console.log(`Funded ${funding.txId}:0 with ${funded.amountSompi} sompi (fee ${funding.feeSompi})`);

  // 4. The contract refuses any other destination...
  const elsewhere = buildSilverSweep({ artifact: compiled.artifact, entry: "spend", args: [], utxo: funded, to: funder, networkId: "simnet" });
  try {
    await rpc.submitTransaction(elsewhere.rpcTransaction);
    throw new Error("the node accepted a spend to a destination the contract forbids");
  } catch (e: any) {
    if (String(e.message).startsWith("the node accepted")) throw e;
    console.log(`Spend to the funder refused by the node: ${String(e.message).slice(0, 120)}`);
  }

  // 5. ...and accepts the recipient.
  const spend = buildSilverSweep({ artifact: compiled.artifact, entry: "spend", args: [], utxo: funded, to: recipient, networkId: "simnet" });
  await rpc.submitTransaction(spend.rpcTransaction);
  const paid = await waitForUtxo(recipient, spend.txId, "spend");
  console.log(`Spent ${spend.txId} to the recipient: ${paid.amountSompi} sompi (fee ${spend.feeSompi})`);
  console.log(`Unlock sha256 ${sha256(Buffer.from(spend.signatureScriptHex, "hex"))}`);
  console.log("\nDone: SilverScript L1/P2SH execution against the verified node.");
  await rpc.close();
}

main().catch(async (err) => {
  console.error(err?.message ?? err);
  await rpc.close().catch(() => {});
  process.exit(1);
});
