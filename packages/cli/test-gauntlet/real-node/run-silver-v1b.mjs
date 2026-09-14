// M8-B1b: TransferWithTimeout — a relative DAA lock (`this.ageDaa`) on the canonical localnet.
//
// One new dimension over M8-B1: the input sequence and the node's virtual DAA.
// The condition is computed from rusty-kaspa's rules, not found by mining
// "enough" blocks:
//   script     OP_CHECKSEQUENCEVERIFY: period <= (sequence & 0xffffffff), disable bit clear
//   consensus  check_sequence_lock:    blockDaaScore + (sequence & 0xffffffff) - 1 < virtualDaaScore
// so with sequence = period a reclaim is valid iff virtualDaaScore >= blockDaaScore + period.
//
// The miner only runs when this script starts it, so the virtual DAA is frozen
// while pre-timeout attempts are made, and is observed before and after each.
// The honest reclaim is ONE transaction, submitted before the threshold
// (rejected) and after it (accepted): only the node's DAA changed.
//
// Scope: SilverScript L1/P2SH execution. Not covenant / stateful Toccata semantics.
import fs from "node:fs";
import path from "node:path";
import {
  compileSilverScript,
  getSilContract,
  silContractBytecodeHex,
  silverP2shAddress,
  silverP2shLock,
  loadManagedKaspaWasmSync
} from "@hardkas/core";
import { requireNodeIdentity } from "@hardkas/node-runner";
import { buildSilverSweep } from "@hardkas/accounts";
import {
  P2SH_SCOPE,
  createWorkspace,
  deployToP2sh,
  jsonReplacer,
  log,
  mineUntil,
  mineUntilDaa,
  rpc,
  sha256,
  stopMiner, HARNESS_MINER_THROTTLE,
  submitExpectingAcceptance,
  submitExpectingRejection,
  toContractUtxo,
  virtualDaaScore,
  writeCorpusCase
} from "./silver-e2e.mjs";

const PERIOD = BigInt(process.env.HARDKAS_SILVER_B1B_PERIOD || "500");

const SOURCE = `pragma silverscript ^0.1.0;

contract TransferWithTimeout(pubkey sender, pubkey recipient, int period) {
    entry transfer(sig recipientSig) {
        require(checkSig(recipientSig, recipient));
    }

    entry reclaim(sig senderSig) {
        require(checkSig(senderSig, sender));
        require(this.ageDaa >= period);
    }
}
`;

function assert(cond, message) {
  if (!cond) throw new Error(`B1B_PRECONDITION_FAILED: ${message}`);
}

/** Submits `built` while asserting the virtual DAA stays on the stated side of `threshold`. */
async function observed(label, threshold, expectBelow, submit) {
  const before = await virtualDaaScore();
  const outcome = await submit();
  const after = await virtualDaaScore();
  const side = (d) => (expectBelow ? d < threshold : d >= threshold);
  assert(side(before) && side(after), `${label}: virtual DAA ${before}->${after} is not ${expectBelow ? "below" : "at or above"} ${threshold}`);
  return { ...outcome, virtualDaaScoreBefore: before.toString(), virtualDaaScoreAfter: after.toString() };
}

async function main() {
  log(`=== M8-B1b TransferWithTimeout E2E (period ${PERIOD} DAA) ===`);

  // [0] The canonical node, proven (M5).
  const identity = await requireNodeIdentity();
  log(`[0] node identity verified: ${identity.observed.container?.name} rusty-kaspad ${identity.observed.server?.serverVersion} ${identity.expected.imageDigest}`);

  // [1] Keys: sender may reclaim after the period, recipient may take it any time.
  const ws = createWorkspace("hardkas-silver-v1b-e2e");
  const sender = ws.generate("sender");
  const recipient = ws.generate("recipient");
  const k = loadManagedKaspaWasmSync();
  const xonly = (acct) => Buffer.from(String(new k.PrivateKey(acct.privateKey).toPublicKey().toXOnlyPublicKey().toString()), "hex");

  // [2] Compile with the managed official silverc.
  const constructorArgs = [
    { kind: "bytes", value: xonly(sender) },
    { kind: "bytes", value: xonly(recipient) },
    { kind: "int", value: PERIOD }
  ];
  const compiled = await compileSilverScript({ source: SOURCE, constructorArgs });
  const { name: contractName, contract } = getSilContract(compiled.artifact);
  const bytecode = silContractBytecodeHex(contract);
  const lock = silverP2shLock(bytecode);
  const p2shAddress = silverP2shAddress(bytecode, "simnet");
  log(`[2] compiled ${contractName} (${bytecode.length / 2} bytes); P2SH ${p2shAddress}`);

  // [3] Two contract outputs: A for the transfer branch, B for the reclaim branch.
  log("[3] deploy");
  const deployA = await deployToP2sh(ws, { p2shAddress, amountKas: "10", label: "deploy-A-transfer" });
  const deployB = await deployToP2sh(ws, { p2shAddress, amountKas: "10", label: "deploy-B-reclaim" });

  // [4] The temporal condition, computed from the consensus rule.
  const transferTimeoutDaa = deployA.utxo.blockDaaScore + PERIOD;
  const reclaimValidFromDaa = deployB.utxo.blockDaaScore + PERIOD;
  const v0 = await virtualDaaScore();
  log(`[4] virtual DAA ${v0}; A timeout at ${transferTimeoutDaa}; B reclaim valid from ${reclaimValidFromDaa} (block DAA ${deployB.utxo.blockDaaScore} + period ${PERIOD})`);
  assert(v0 < transferTimeoutDaa, `A's timeout (${transferTimeoutDaa}) already reached at ${v0}: raise HARDKAS_SILVER_B1B_PERIOD`);

  const sweep = (utxo, entry, signer, sequence, to) =>
    buildSilverSweep({
      artifact: compiled.artifact, entry, args: [{ kind: "signature", privateKey: signer.privateKey }],
      utxo, to: to.address, networkId: "simnet", sequence
    });
  // The one honest reclaim transaction, used before and after the threshold.
  const reclaimHonest = sweep(deployB.utxo, "reclaim", sender, PERIOD, sender);

  // [5] Before the threshold (miner stopped, DAA frozen and observed).
  log("[5] before the threshold");
  const pre = {};
  log("  reclaim(sig sender), sequence = period  -> must fail the sequence lock");
  pre.reclaimHonest = await observed("pre reclaim honest", reclaimValidFromDaa, true, () =>
    submitExpectingRejection("reclaim-before-period", reclaimHonest.rpcTransaction)
  );
  log("  reclaim(sig sender), sequence = 0       -> must fail the script's CHECKSEQUENCEVERIFY");
  pre.reclaimSequenceZero = await observed("pre reclaim seq 0", reclaimValidFromDaa, true, () =>
    submitExpectingRejection("reclaim-with-sequence-below-period", sweep(deployB.utxo, "reclaim", sender, 0n, sender).rpcTransaction)
  );
  log("  transfer(sig sender)                    -> must fail: wrong key for this branch");
  pre.transferWrongKey = await observed("pre transfer wrong key", transferTimeoutDaa, true, () =>
    submitExpectingRejection("transfer-signed-by-sender", sweep(deployA.utxo, "transfer", sender, 0n, recipient).rpcTransaction)
  );
  log("  transfer(sig recipient), sequence = 0   -> must be accepted before any timeout");
  const transfer = sweep(deployA.utxo, "transfer", recipient, 0n, recipient);
  pre.transfer = await observed("pre transfer", transferTimeoutDaa, true, async () => ({
    name: "transfer-by-recipient-before-timeout",
    accepted: true,
    txId: await submitExpectingAcceptance("transfer", transfer)
  }));

  // [6] Advance the DAG to the computed threshold, observing the virtual DAA.
  log(`[6] mining until virtual DAA >= ${reclaimValidFromDaa}`);
  const advance = await mineUntilDaa(reclaimValidFromDaa, "reclaim threshold");
  log(`  virtual DAA ${advance.before} -> ${advance.reachedWhileMining} (settled ${advance.settled})`);
  assert(advance.settled >= reclaimValidFromDaa, "virtual DAA fell below the threshold after mining stopped");

  // The transfer made it into a block (with a block DAA below A's timeout at submission).
  const transferUtxo = toContractUtxo(
    await mineUntil(recipient.address, (us) => us.find((x) => x.outpoint.transactionId === transfer.txId) ?? null, "transfer confirmation")
  );
  log(`  transfer confirmed: ${transfer.txId} at block DAA ${transferUtxo.blockDaaScore}`);

  // [7] After the threshold.
  log("[7] after the threshold");
  const post = {};
  log("  reclaim(sig recipient), sequence = period -> must fail: time satisfied, authorization not");
  post.reclaimWrongKey = await observed("post reclaim wrong key", reclaimValidFromDaa, false, () =>
    submitExpectingRejection("reclaim-signed-by-recipient-after-period", sweep(deployB.utxo, "reclaim", recipient, PERIOD, recipient).rpcTransaction)
  );
  log("  reclaim(sig sender), sequence = period    -> the same transaction, now accepted");
  post.reclaimHonest = await observed("post reclaim honest", reclaimValidFromDaa, false, async () => ({
    name: "reclaim-after-period",
    accepted: true,
    txId: await submitExpectingAcceptance("reclaim", reclaimHonest)
  }));
  const reclaimUtxo = toContractUtxo(
    await mineUntil(sender.address, (us) => us.find((x) => x.outpoint.transactionId === reclaimHonest.txId) ?? null, "reclaim confirmation")
  );
  const contractLeft = (await rpc((c) => c.getUtxosByAddress(p2shAddress))).filter((x) =>
    [deployA.txId, deployB.txId].includes(x.outpoint.transactionId)
  );
  assert(contractLeft.length === 0, "a contract output is still unspent");
  log(`  reclaim confirmed: ${reclaimHonest.txId} at block DAA ${reclaimUtxo.blockDaaScore}; both contract outputs consumed`);

  // The node named the same txid when rejecting before and accepting after the threshold.
  const sameTransaction = pre.reclaimHonest.nodeError.includes(reclaimHonest.txId) && post.reclaimHonest.txId === reclaimHonest.txId;
  assert(sameTransaction, "the reclaim rejected before the threshold is not the one accepted after it");

  const spendRecord = (built, confirmedUtxo) => ({
    txId: built.txId,
    entry: built.entry,
    sequence: String(built.rpcTransaction.inputs[0].sequence),
    feeSompi: built.feeSompi.toString(),
    mass: built.mass.toString(),
    signatureScriptSha256: sha256(Buffer.from(built.signatureScriptHex, "hex")),
    confirmedAtBlockDaaScore: confirmedUtxo.blockDaaScore.toString()
  });

  const evidence = {
    schema: "hardkas.silver.e2eEvidence.v1",
    scenario: "M8-B1b TransferWithTimeout (relative DAA lock, this.ageDaa)",
    scope: P2SH_SCOPE,
    capabilities: ["silver.compile.v1", "silver.p2sh.deploy-spend.v1", "silver.p2sh.relative-timelock.v1"],
    node: identity,
    compile: compiled.provenance,
    contract: {
      name: contractName,
      period: PERIOD.toString(),
      entries: Object.fromEntries(Object.entries(contract.entries).map(([n, e]) => [n, e.dispatch_tag])),
      bytecodeSha256: sha256(Buffer.from(bytecode, "hex")),
      lockingScript: lock,
      p2shAddress
    },
    rule: {
      script: "OP_CHECKSEQUENCEVERIFY: period <= (sequence & 0xffffffff), sequence disable bit clear",
      consensus: "check_sequence_lock: blockDaaScore + (sequence & 0xffffffff) - 1 < virtualDaaScore",
      reclaimValidFrom: "virtualDaaScore >= blockDaaScore + period (sequence = period)"
    },
    deploys: {
      transferOutput: { txId: deployA.txId, outpoint: deployA.utxo.outpoint, blockDaaScore: deployA.utxo.blockDaaScore.toString() },
      reclaimOutput: { txId: deployB.txId, outpoint: deployB.utxo.outpoint, blockDaaScore: deployB.utxo.blockDaaScore.toString() }
    },
    transferBranch: {
      timeoutDaaScore: transferTimeoutDaa.toString(),
      beforeTimeout: { rejectedWrongKey: pre.transferWrongKey, accepted: pre.transfer },
      spend: spendRecord(transfer, transferUtxo)
    },
    reclaimBranch: {
      period: PERIOD.toString(),
      sequence: PERIOD.toString(),
      validFromVirtualDaaScore: reclaimValidFromDaa.toString(),
      beforeThreshold: {
        virtualDaaScore: v0.toString(),
        conditionMet: false,
        attempts: [pre.reclaimHonest, pre.reclaimSequenceZero]
      },
      advance: {
        from: advance.before.toString(),
        reachedWhileMining: advance.reachedWhileMining.toString(),
        settled: advance.settled.toString()
      },
      afterThreshold: {
        virtualDaaScore: post.reclaimHonest.virtualDaaScoreBefore,
        conditionMet: true,
        attempts: [post.reclaimWrongKey, post.reclaimHonest]
      },
      sameTransactionBeforeAndAfter: sameTransaction,
      spend: spendRecord(reclaimHonest, reclaimUtxo)
    },
    harness: { minerThrottle: HARNESS_MINER_THROTTLE },
    result: "PASS"
  };
  const evidencePath = path.join(ws.dir, "silver-v1b-evidence.json");
  fs.writeFileSync(evidencePath, JSON.stringify(evidence, jsonReplacer, 2) + "\n");
  await writeCorpusCase({
    id: "p2sh-transfer-with-timeout",
    scenario: evidence.scenario,
    scope: P2SH_SCOPE,
    capabilities: evidence.capabilities,
    compiles: [{ name: "contract", source: SOURCE, constructorArgs, result: compiled, contract: contractName }],
    evidence
  });
  log(`\n=== M8-B1b PASS === evidence: ${evidencePath}`);
}

main().catch((err) => {
  stopMiner();
  console.error("M8-B1b FAILED:", err?.message ?? err);
  process.exit(1);
});
