// M8-B1: end-to-end proof of a SilverScript v1 contract on the canonical localnet.
//
//   source -> managed silverc v1.0.0 -> ABI artifact -> bytecode -> P2SH lock
//   -> deploy accepted -> canonical dispatch/unlock -> signed spend -> accepted
//
// The node must prove its identity first (M5). Deploy goes through HardKAS's
// standard transaction lifecycle (a deploy on Kaspa L1 is a payment to the
// contract's P2SH address); the spend is built by @hardkas/accounts
// buildSilverSweep. Two negative controls check that the node really enforces
// the contract. Evidence holds identities and digests only: no private keys,
// no signatures, no constructor arguments in clear.
import fs from "node:fs";
import path from "node:path";
import {
  compileSilverScript,
  getSilContract,
  silContractBytecodeHex,
  silverP2shAddress,
  silverP2shLock,
  silverUnlockScript,
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
  rpc,
  sha256,
  stopMiner, HARNESS_MINER_THROTTLE,
  submitExpectingAcceptance,
  submitExpectingRejection,
  toContractUtxo,
  writeCorpusCase
} from "./silver-e2e.mjs";

// The smallest contract that exercises both dispatch and a real signature.
const SOURCE = `pragma silverscript ^0.1.0;

contract SignedRelease(pubkey owner) {
    entry release(sig ownerSig) {
        require(checkSig(ownerSig, owner));
    }
}
`;

async function main() {
  log("=== M8-B1 SilverScript v1 E2E (canonical localnet) ===");

  // [0] The node must be the canonical one, proven (M5).
  const identity = await requireNodeIdentity();
  log(`[0] node identity verified: ${identity.observed.container?.name} rusty-kaspad ${identity.observed.server?.serverVersion} ${identity.expected.imageDigest}`);

  // [1] Accounts: the pre-funded fixture pays the deploy; a fresh owner key controls the contract.
  const ws = createWorkspace("hardkas-silver-v1-e2e");
  const owner = ws.generate("owner");
  const k = loadManagedKaspaWasmSync();
  const ownerXOnly = String(new k.PrivateKey(owner.privateKey).toPublicKey().toXOnlyPublicKey().toString());
  log(`[1] owner ${owner.address}`);

  // [2] Compile with the managed official silverc.
  const ownerArgs = [{ kind: "bytes", value: Buffer.from(ownerXOnly, "hex") }];
  const compiled = await compileSilverScript({ source: SOURCE, constructorArgs: ownerArgs });
  const { name: contractName, contract } = getSilContract(compiled.artifact);
  const bytecode = silContractBytecodeHex(contract);
  const lock = silverP2shLock(bytecode);
  const p2shAddress = silverP2shAddress(bytecode, "simnet");
  log(`[2] compiled ${contractName} (${bytecode.length / 2} bytes), silverc ${compiled.provenance.compiler.releaseTag} ${compiled.provenance.compiler.binarySha256}`);
  log(`    P2SH ${p2shAddress}`);

  // [3] Deploy: the standard lifecycle (plan -> sign -> send) paying the P2SH address.
  log("[3] deploy");
  const deploy = await deployToP2sh(ws, { p2shAddress, amountKas: "10", label: "deploy" });
  const utxo = deploy.utxo;

  // [4] Negative controls: the node must refuse spends that do not satisfy the contract.
  const negativeControls = [];
  const good = buildSilverSweep({
    artifact: compiled.artifact, entry: "release", args: [{ kind: "signature", privateKey: owner.privateKey }],
    utxo, to: owner.address, networkId: "simnet"
  });
  // Same valid signature, laid out as pre-v1 HardKAS did: <sig> <redeem>, no dispatch tag.
  log("[4] negative control: pre-v1 HardKAS unlock (no dispatch tag)");
  const sigPush = good.signatureScriptHex.slice(0, 132); // OP_DATA_65 <sig+sighash>
  const legacyTx = structuredClone(good.rpcTransaction);
  legacyTx.inputs[0].signatureScript = silverUnlockScript(bytecode, sigPush);
  negativeControls.push(await submitExpectingRejection("legacy-unlock-without-dispatch-tag", legacyTx));

  log("[4] negative control: signature by a key that is not the owner");
  const wrong = buildSilverSweep({
    artifact: compiled.artifact, entry: "release", args: [{ kind: "signature", privateKey: sha256("not the owner") }],
    utxo, to: owner.address, networkId: "simnet"
  });
  negativeControls.push(await submitExpectingRejection("signature-by-non-owner", wrong.rpcTransaction));

  // [5] The canonical spend.
  log("[5] spend: release(sig) signed by the owner");
  await submitExpectingAcceptance("spend", good);
  const spent = await mineUntil(owner.address, (us) => us.find((x) => x.outpoint.transactionId === good.txId) ?? null, "spend confirmation");
  const stillLocked = (await rpc((c) => c.getUtxosByAddress(p2shAddress))).some((x) => x.outpoint.transactionId === deploy.txId);
  if (stillLocked) throw new Error("contract output still unspent after the spend confirmed");
  const spendUtxo = toContractUtxo(spent);
  log(`[5] spend confirmed: ${good.txId}:0 ${spendUtxo.amountSompi} sompi at DAA ${spendUtxo.blockDaaScore}; contract output consumed`);

  const evidence = {
    schema: "hardkas.silver.e2eEvidence.v1",
    scenario: "M8-B1 plain signed SilverScript contract",
    scope: P2SH_SCOPE,
    capabilities: ["silver.compile.v1", "silver.p2sh.deploy-spend.v1"],
    node: identity,
    compile: compiled.provenance,
    contract: {
      name: contractName,
      entry: "release",
      dispatchTag: contract.entries.release.dispatch_tag,
      bytecodeSha256: sha256(Buffer.from(bytecode, "hex")),
      lockingScript: lock,
      p2shAddress
    },
    deploy: {
      txId: deploy.txId,
      outpoint: utxo.outpoint,
      amountSompi: utxo.amountSompi.toString(),
      confirmedAtDaaScore: utxo.blockDaaScore.toString(),
      via: "hardkas tx plan/sign/send"
    },
    negativeControls,
    spend: {
      txId: good.txId,
      entry: "release",
      feeSompi: good.feeSompi.toString(),
      mass: good.mass.toString(),
      storageMass: good.storageMass.toString(),
      signatureScriptSha256: sha256(Buffer.from(good.signatureScriptHex, "hex")),
      outputSompi: good.outputSompi.toString(),
      confirmedAtDaaScore: spendUtxo.blockDaaScore.toString(),
      assumptions: good.assumptions
    },
    harness: { minerThrottle: HARNESS_MINER_THROTTLE },
    result: "PASS"
  };
  const evidencePath = path.join(ws.dir, "silver-v1-evidence.json");
  fs.writeFileSync(evidencePath, JSON.stringify(evidence, jsonReplacer, 2) + "\n");
  await writeCorpusCase({
    id: "p2sh-signed-release",
    scenario: evidence.scenario,
    scope: P2SH_SCOPE,
    capabilities: evidence.capabilities,
    compiles: [{ name: "contract", source: SOURCE, constructorArgs: ownerArgs, result: compiled, contract: contractName }],
    evidence
  });
  log(`\n=== M8-B1 PASS === evidence: ${evidencePath}`);
}

main().catch((err) => {
  stopMiner();
  console.error("M8-B1 FAILED:", err?.message ?? err);
  process.exit(1);
});
