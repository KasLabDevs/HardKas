// Escrow (SilverScript v1, P2SH) end to end on the canonical localnet.
//
//   @hardkas/escrow createEscrow (managed silverc) -> P2SH funding (SDK fee)
//   -> refundBuyer: one draft, signed separately by buyer and arbiter
//   -> finalized through the canonical ABI -> rusty-kaspad accepts
//
// Controls: a second signature from the wrong party, and an output amount the
// contract does not allow, must both be refused by the node.
// Scope: SilverScript L1/P2SH execution (a 2-of-3 contract), not covenants.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadManagedKaspaWasmSync } from "@hardkas/core";
import { requireNodeIdentity } from "@hardkas/node-runner";
import { buildScriptFunding, finalizeSilverSpend, prepareSilverSpend, signSilverSpend } from "@hardkas/accounts";
// The CLI does not depend on @hardkas/escrow; load the workspace package's build.
const { createEscrow, escrowResolution, ESCROW_SOURCE } = await import(new URL("../../../escrow/dist/index.js", import.meta.url).href);
import {
  FIXTURE_ADDRESS,
  FIXTURE_KEY,
  P2SH_SCOPE,
  expectRejectionClass,
  jsonReplacer,
  log,
  mineUntil,
  rpc,
  sha256,
  stopMiner, HARNESS_MINER_THROTTLE,
  submitExpectingAcceptance,
  toContractUtxo,
  virtualDaaScore,
  writeCorpusCase
} from "./silver-e2e.mjs";

const REFUND = 1_000_000_000n; // 10 KAS back to the buyer
const RELEASE = 1_500_000_000n;
const FEE_ALLOWANCE = 1_000_000n; // what the refund leaves as fee

function assert(cond, message) {
  if (!cond) throw new Error(`ESCROW_E2E_ASSERTION_FAILED: ${message}`);
}

async function main() {
  log("=== Escrow (SilverScript v1 P2SH) E2E ===");
  const work = path.resolve(process.env.HARDKAS_SILVER_E2E_WORK || path.join(os.tmpdir(), "hardkas-silver-escrow-e2e"));
  fs.mkdirSync(work, { recursive: true });

  const identity = await requireNodeIdentity();
  log(`[0] node identity verified: ${identity.observed.container?.name} rusty-kaspad ${identity.observed.server?.serverVersion}`);

  // Fresh parties; the buyer's refund goes to its own P2PK script.
  const k = loadManagedKaspaWasmSync();
  const party = (seed) => {
    const priv = sha256(`escrow-e2e ${seed} ${Date.now()}`);
    const key = new k.PrivateKey(priv);
    const address = key.toKeypair().toAddress("simnet").toString();
    const spk = k.payToAddressScript(new k.Address(address));
    return { priv, xonly: String(key.toPublicKey().toXOnlyPublicKey().toString()), address, script: String(spk.script) };
  };
  const buyer = party("buyer"), seller = party("seller"), arbiter = party("arbiter");
  const config = {
    buyer: { publicKeyHex: buyer.xonly },
    seller: { publicKeyHex: seller.xonly },
    arbiter: { publicKeyHex: arbiter.xonly },
    buyerDestinationSpk: buyer.script,
    sellerDestinationSpk: seller.script,
    refundAmount: REFUND,
    releaseAmount: RELEASE
  };
  const escrow = await createEscrow(config, { networkId: "simnet" });
  log(`[1] escrow ${escrow.state.address} (silverc ${escrow.provenance.compiler.releaseTag}, artifact ${escrow.provenance.artifactSha256})`);

  // Fund from the mature fixture: exactly the refund plus the fee allowance.
  const virt = await virtualDaaScore();
  const coins = (await rpc((c) => c.getUtxosByAddress(FIXTURE_ADDRESS))).map(toContractUtxo)
    .filter((u) => !u.isCoinbase || u.blockDaaScore + 1010n < virt)
    .sort((a, b) => (a.amountSompi > b.amountSompi ? -1 : 1));
  const funding = buildScriptFunding({
    utxos: coins.slice(0, 3),
    privateKey: FIXTURE_KEY,
    lockingScript: { version: 0, script: escrow.state.lockingScriptHex },
    valueSompi: REFUND + FEE_ALLOWANCE,
    networkId: "simnet"
  });
  await submitExpectingAcceptance("funding", { rpcTransaction: funding.rpcTransaction, txId: funding.txId, feeSompi: funding.feeSompi, mass: "-" });
  const fundedRaw = await mineUntil(escrow.state.address, (us) => us.find((x) => x.outpoint.transactionId === funding.txId) ?? null, "funding confirmation");
  const utxo = toContractUtxo(fundedRaw);
  log(`[2] funded ${funding.txId}:0 ${utxo.amountSompi} sompi at block DAA ${utxo.blockDaaScore}`);

  const resolution = escrowResolution(config, "refundBuyer");
  const draft = prepareSilverSpend({
    artifact: escrow.artifact, contractName: "Escrow", entry: "refundBuyer", args: resolution.args,
    utxo, outputs: resolution.requiredOutputs, networkId: "simnet"
  });
  const signatures = { buyer: signSilverSpend(draft, buyer.priv), arbiter: signSilverSpend(draft, arbiter.priv) };

  // Controls.
  const controls = {};
  log("[3] controls");
  {
    const wrongArgs = [{ kind: "signer", signer: "buyer" }, { kind: "signer", signer: "seller" }];
    const wrong = finalizeSilverSpend(draft, escrow.artifact, wrongArgs, { buyer: signatures.buyer, seller: signSilverSpend(draft, seller.priv) });
    controls.wrongSecondSigner = await expectRejectionClass("refund-signed-by-buyer-and-seller", "script-verify", wrong.rpcTransaction,
      "the seller's valid signature in the arbiter's slot; distinguished by constructed mutation");
  }
  {
    const lessDraft = prepareSilverSpend({
      artifact: escrow.artifact, contractName: "Escrow", entry: "refundBuyer", args: resolution.args, utxo,
      outputs: [{ amountSompi: REFUND - 1n, scriptPublicKey: resolution.requiredOutputs[0].scriptPublicKey }], networkId: "simnet"
    });
    const less = finalizeSilverSpend(lessDraft, escrow.artifact, resolution.args, {
      buyer: signSilverSpend(lessDraft, buyer.priv), arbiter: signSilverSpend(lessDraft, arbiter.priv)
    });
    controls.wrongAmount = await expectRejectionClass("refund-of-a-different-amount", "script-verify", less.rpcTransaction,
      "refund of refundAmount-1, validly signed; distinguished by constructed mutation");
  }

  // The canonical resolution.
  log("[4] refundBuyer signed by buyer and arbiter");
  const done = finalizeSilverSpend(draft, escrow.artifact, resolution.args, signatures);
  await submitExpectingAcceptance("refund", { rpcTransaction: done.rpcTransaction, txId: done.txId, feeSompi: draft.feeSompi, mass: draft.mass });
  const refunded = toContractUtxo(await mineUntil(buyer.address, (us) => us.find((x) => x.outpoint.transactionId === done.txId) ?? null, "refund confirmation"));
  assert(refunded.amountSompi === REFUND, `buyer received ${refunded.amountSompi}, expected ${REFUND}`);
  const stillLocked = (await rpc((c) => c.getUtxosByAddress(escrow.state.address))).some((x) => x.outpoint.transactionId === funding.txId);
  assert(!stillLocked, "escrow output still unspent");
  log(`[4] refund ${done.txId} confirmed: buyer received ${refunded.amountSompi} sompi; escrow output consumed`);

  const evidence = {
    schema: "hardkas.silver.e2eEvidence.v1",
    scenario: "Escrow (2-of-3 SilverScript v1 P2SH): refundBuyer",
    scope: P2SH_SCOPE,
    capabilities: ["silver.compile.v1", "silver.p2sh.deploy-spend.v1"],
    node: identity,
    compile: escrow.provenance,
    escrow: { address: escrow.state.address, lockingScript: escrow.state.lockingScriptHex, refundAmount: REFUND.toString(), releaseAmount: RELEASE.toString() },
    funding: { txId: funding.txId, valueSompi: (REFUND + FEE_ALLOWANCE).toString(), feeSompi: funding.feeSompi.toString(), confirmedAtBlockDaaScore: utxo.blockDaaScore.toString() },
    resolution: {
      branch: "refundBuyer",
      signers: resolution.args.map((a) => a.signer),
      txId: done.txId,
      feeSompi: draft.feeSompi,
      signatureScriptSha256: sha256(Buffer.from(done.signatureScriptHex, "hex")),
      refundedSompi: refunded.amountSompi.toString(),
      confirmedAtBlockDaaScore: refunded.blockDaaScore.toString()
    },
    controls,
    harness: { minerThrottle: HARNESS_MINER_THROTTLE },
    result: "PASS"
  };
  const evidencePath = path.join(work, "silver-escrow-evidence.json");
  fs.writeFileSync(evidencePath, JSON.stringify(evidence, jsonReplacer, 2) + "\n");
  await writeCorpusCase({
    id: "p2sh-escrow-refund",
    scenario: evidence.scenario,
    scope: P2SH_SCOPE,
    capabilities: evidence.capabilities,
    compiles: [{
      name: "escrow",
      source: ESCROW_SOURCE,
      constructorArgs: escrow.compiled.constructorArgs,
      result: { artifact: escrow.artifact, artifactBytes: escrow.compiled.artifactBytes, provenance: escrow.provenance },
      contract: "Escrow"
    }],
    evidence
  });
  log(`\n=== ESCROW E2E PASS === evidence: ${evidencePath}`);
}

main().catch((err) => {
  stopMiner();
  console.error("ESCROW E2E FAILED:", err?.message ?? err);
  process.exit(1);
});
