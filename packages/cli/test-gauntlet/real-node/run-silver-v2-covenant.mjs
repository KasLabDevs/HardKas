// M8-B2-B: a SilverScript covenant (Toccata transaction v1) on the canonical localnet.
//
//   Silver covenant source -> silverc lowering -> genesis covenant output
//   -> covenant_id observed from rusty-kaspad -> spend with the generated
//   transition entry -> successor with compiler-produced state and the same
//   binding -> node accepts -> successor preserves the covenant lineage
//
// Contract: the smallest declaration shape, a 1:1 auth-bound transition
// (`Counter.bump`). Covenant ids come from the SDK (populateGenesisCovenants),
// successor state from silverc, validity and compute budgets from the node.
// Compute budgets are CERTIFIED here by the verified node (certifyComputeBudget);
// that mechanism belongs to this runner, not to HardKAS's API.
//
// Scope: COVENANT_SCOPE. Not vProgs, L2, EVM, multi-input covenants, or audited contracts.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  compileSilverSuccessor,
  getSilContract,
  isSingletonAuthTransition,
  loadManagedKaspaWasmSync,
  silContractBytecodeHex,
  silverP2shAddress,
  silverP2shLock
} from "@hardkas/core";
import { requireNodeIdentity } from "@hardkas/node-runner";
import { buildCovenantGenesis, buildCovenantTransition } from "@hardkas/accounts";
import {
  COVENANT_SCOPE,
  FIXTURE_ADDRESS,
  FIXTURE_KEY,
  certifyComputeBudget,
  expectRejectionClass,
  jsonReplacer,
  log,
  mineUntil,
  rpc,
  sha256,
  stopMiner, HARNESS_MINER_THROTTLE,
  toContractUtxo,
  virtualDaaScore,
  writeCorpusCase
} from "./silver-e2e.mjs";

const SOURCE = `pragma silverscript ^0.1.0;

contract Counter(int init_value) {
    int value = init_value;

    #[covenant(binding = auth, from = 1, to = 1, mode = transition)]
    function bump(State prev_state, int delta) : (State) {
        require(delta > 0);
        return(State { value: prev_state.value + delta });
    }
}
`;
const INITIAL = 7n;
const DELTA = 5n;
const GENESIS_VALUE = 1_000_000_000n; // 10 KAS locked in the covenant

const int = (v) => ({ kind: "int", value: v });

function assert(cond, message) {
  if (!cond) throw new Error(`B2B_ASSERTION_FAILED: ${message}`);
}

async function main() {
  log("=== M8-B2-B SilverScript covenant (tx v1) E2E ===");
  const work = path.resolve(process.env.HARDKAS_SILVER_E2E_WORK || path.join(os.tmpdir(), "hardkas-silver-v2-covenant-e2e"));
  fs.mkdirSync(work, { recursive: true });

  // [0] The canonical node, proven (M5).
  const identity = await requireNodeIdentity();
  log(`[0] node identity verified: ${identity.observed.container?.name} rusty-kaspad ${identity.observed.server?.serverVersion} ${identity.expected.imageDigest}`);

  // [1] Compile the current state and the successor with silverc; the guard runs inside.
  const mapping = { value: 0 };
  const next = await compileSilverSuccessor({ source: SOURCE, constructorArgs: [int(INITIAL)], stateToConstructorArg: mapping, nextState: { value: int(INITIAL + DELTA) } });
  const wrong = await compileSilverSuccessor({ source: SOURCE, constructorArgs: [int(INITIAL)], stateToConstructorArg: mapping, nextState: { value: int(INITIAL + DELTA - 1n) } });
  const declaration = next.declarations.find((d) => d.policy === "bump");
  assert(declaration && isSingletonAuthTransition(declaration), `bump is not a 1:1 auth transition: ${JSON.stringify(next.declarations)}`);
  const current = next.current.artifact;
  const { contract } = getSilContract(current);
  const entry = contract.cov_decl_to_abi.bump;
  const bytecode = silContractBytecodeHex(contract);
  const lock = silverP2shLock(bytecode);
  const covenantAddress = silverP2shAddress(bytecode, "simnet");
  const successorBytecode = silContractBytecodeHex(getSilContract(next.successor.artifact).contract);
  const successorLock = silverP2shLock(successorBytecode);
  const successorAddress = silverP2shAddress(successorBytecode, "simnet");
  log(`[1] ${declaration.form}(binding=${declaration.binding}, from=${declaration.from}, to=${declaration.to}, mode=${declaration.mode}) -> entry ${entry}; state span ${JSON.stringify(next.stateSpan)}`);

  // [2] Fund the genesis from a mature fixture output.
  const k = loadManagedKaspaWasmSync();
  const virt = await virtualDaaScore();
  const funding = (await rpc((c) => c.getUtxosByAddress(FIXTURE_ADDRESS))).map(toContractUtxo)
    .filter((u) => (!u.isCoinbase || u.blockDaaScore + 1010n < virt) && u.amountSompi >= 2n * GENESIS_VALUE)
    .sort((a, b) => (a.amountSompi < b.amountSompi ? -1 : 1))[0];
  assert(funding, "no mature fixture output of at least 20 KAS");
  const genesisRequest = (budget, feeSompi) => ({
    artifact: current,
    valueSompi: GENESIS_VALUE,
    funding: [{ ...funding, privateKey: FIXTURE_KEY, computeBudget: budget }],
    changeAddress: FIXTURE_ADDRESS,
    networkId: "simnet",
    ...(feeSompi !== undefined ? { feeSompi } : {})
  });
  // The SDK prices budget 0 exactly; for larger budgets the fee must be explicit.
  const sdkFee = buildCovenantGenesis(genesisRequest(0)).feeSompi;
  const buildGenesis = (budget, fee) => buildCovenantGenesis(genesisRequest(budget, budget === 0 ? undefined : fee ?? sdkFee));

  // [3] Controls before the genesis exists.
  log("[3] controls: transaction version");
  const controls = {};
  {
    const v0 = structuredClone(buildGenesis(0).rpcTransaction);
    v0.version = 0;
    v0.inputs[0].sigOpCount = 1;
    delete v0.inputs[0].computeBudget;
    controls.bindingInV0 = await expectRejectionClass("covenant-binding-in-tx-v0", "tx-version-rule", v0);
  }

  // [4] Genesis, with the funding input's compute budget certified by the node.
  log("[4] genesis (compute budget certified by the node)");
  const genesisCert = await certifyComputeBudget("genesis", buildGenesis);
  const genesis = genesisCert.built;
  const insufficient = genesisCert.attempts.filter((a) => a.rejectionClass === "compute-budget-exceeded").at(-1);
  assert(insufficient && insufficient.budget === genesisCert.certifiedBudget - 1, "no insufficient-budget rejection just below the certified budget");
  controls.insufficientComputeBudget = {
    name: "genesis-funding-input-under-budget",
    expectedClass: "compute-budget-exceeded",
    ...insufficient,
    note: "on the genesis P2PK input (the Counter covenant input needs no budget); a signed covenant (B2-C) would meter the covenant input itself"
  };
  const genesisUtxoRaw = await mineUntil(covenantAddress, (us) => us.find((x) => x.outpoint.transactionId === genesisCert.txId) ?? null, "genesis confirmation");
  const covenantUtxo = toContractUtxo(genesisUtxoRaw);
  assert(covenantUtxo.covenantId === genesis.covenantId, `node reports covenant id ${covenantUtxo.covenantId}, the SDK computed ${genesis.covenantId}`);
  log(`[4] genesis ${genesisCert.txId} confirmed at block DAA ${covenantUtxo.blockDaaScore}; covenant id from the node ${covenantUtxo.covenantId} (== SDK)`);

  // [5] The transition: controls first (never accepted), then the valid spend.
  const transition = (successor, budget, fee) =>
    buildCovenantTransition({
      current, successor, policy: "bump", args: [int(DELTA)], utxo: covenantUtxo, networkId: "simnet",
      computeBudget: budget, ...(budget > 0 ? { feeSompi: fee ?? buildCovenantTransition({ current, successor, policy: "bump", args: [int(DELTA)], utxo: covenantUtxo, networkId: "simnet", computeBudget: 0 }).feeSompi } : {})
    });
  // Lower bound for the budget: where the (wrong-state) script stops failing on units.
  const floor = await certifyComputeBudget("transition(wrong state)", (b, f) => transition(wrong.successor.artifact, b, f));
  assert(floor.stopped === "script-verify", `wrong-state transition ended in ${floor.stopped ?? "acceptance"}`);
  const B = floor.attempts.at(-1).budget;
  log(`[5] controls at compute budget ${B}`);
  const good = transition(next.successor.artifact, B);
  const noBinding = structuredClone(good.rpcTransaction);
  delete noBinding.outputs[0].covenant;
  controls.successorWithoutBinding = await expectRejectionClass("successor-without-covenant-binding", "script-verify", noBinding,
    "distinguished by constructed mutation (the accepted transaction minus the binding), not by a distinct node diagnostic");
  const otherId = structuredClone(good.rpcTransaction);
  otherId.outputs[0].covenant = { authorizingInput: 0, covenantId: sha256("not this covenant") };
  controls.wrongCovenantId = await expectRejectionClass("successor-bound-to-another-covenant-id", "covenant-rule", otherId);
  controls.wrongState = await expectRejectionClass("successor-with-wrong-state", "script-verify", transition(wrong.successor.artifact, B).rpcTransaction,
    "distinguished by constructed mutation (successor state value+delta-1), not by a distinct node diagnostic");

  log("[5] transition: bump(delta) through the generated entry");
  const transitionCert = await certifyComputeBudget("transition", (b, f) => transition(next.successor.artifact, b, f), { start: B });
  const accepted = transitionCert.built;
  const successorRaw = await mineUntil(successorAddress, (us) => us.find((x) => x.outpoint.transactionId === transitionCert.txId) ?? null, "transition confirmation");
  const successorUtxo = toContractUtxo(successorRaw);
  const genesisSpent = !(await rpc((c) => c.getUtxosByAddress(covenantAddress))).some((x) => x.outpoint.transactionId === genesisCert.txId);
  assert(genesisSpent, "genesis covenant output still unspent");
  assert(successorUtxo.covenantId === covenantUtxo.covenantId, `successor covenant id ${successorUtxo.covenantId} != genesis ${covenantUtxo.covenantId}`);
  assert(successorUtxo.scriptPublicKey.script.toLowerCase() === successorLock.script, "successor is not locked to the compiler-produced successor state");
  log(`[6] successor ${transitionCert.txId}:0 at block DAA ${successorUtxo.blockDaaScore}; covenant id ${successorUtxo.covenantId} preserved; genesis consumed`);

  const stateBytes = (a) => {
    const c = getSilContract(a).contract.compiled;
    return Buffer.from(c.bytecode).subarray(c.state_span.offset, c.state_span.offset + c.state_span.len).toString("hex");
  };
  const evidence = {
    schema: "hardkas.silver.e2eEvidence.v1",
    scenario: "M8-B2-B Counter: 1:1 auth-bound covenant transition (Toccata tx v1)",
    scope: COVENANT_SCOPE,
    capabilities: ["silver.compile.v1", "toccata.covenant.auth-1to1-transition.v1"],
    node: identity,
    compile: { current: next.current.provenance, successor: next.successor.provenance },
    declaration: { ...declaration, entry, dispatchTag: contract.entries[entry].dispatch_tag },
    state: {
      mapping,
      verifiedAgainst: "silverc --ast-only: each State field initialized directly by the mapped constructor parameter",
      guard: "same template_hash + same prefix + same suffix + changed state_span",
      span: next.stateSpan,
      templateHash: next.current.provenance.contracts[0].templateHash,
      current: { value: INITIAL.toString(), stateBytes: stateBytes(current) },
      successor: { value: (INITIAL + DELTA).toString(), stateBytes: stateBytes(next.successor.artifact) }
    },
    genesis: {
      txId: genesisCert.txId,
      version: genesis.rpcTransaction.version,
      covenantIdComputedBySdk: genesis.covenantId,
      covenantIdObservedFromNode: covenantUtxo.covenantId,
      authorizingInput: 0,
      fundingOutpoint: funding.outpoint,
      lockingScript: lock,
      address: covenantAddress,
      valueSompi: GENESIS_VALUE.toString(),
      feeSompi: genesis.feeSompi.toString(),
      storageMass: genesis.storageMass.toString(),
      confirmedAtBlockDaaScore: covenantUtxo.blockDaaScore.toString(),
      computeBudgetCertification: { certifiedBudget: genesisCert.certifiedBudget, attempts: genesisCert.attempts, mechanism: "certification probe against the verified node; not an estimator" }
    },
    transition: {
      txId: transitionCert.txId,
      version: accepted.rpcTransaction.version,
      entry,
      args: { delta: DELTA.toString() },
      computeBudget: transitionCert.certifiedBudget,
      computeBudgetCertification: { lowerBoundFromWrongState: floor.attempts, attempts: transitionCert.attempts },
      feeSompi: accepted.feeSompi.toString(),
      storageMass: accepted.storageMass.toString(),
      signatureScriptSha256: sha256(Buffer.from(accepted.rpcTransaction.inputs[0].signatureScript, "hex")),
      successor: {
        outpoint: successorUtxo.outpoint,
        lockingScript: successorLock,
        address: successorAddress,
        valueSompi: successorUtxo.amountSompi.toString(),
        covenantIdObservedFromNode: successorUtxo.covenantId,
        confirmedAtBlockDaaScore: successorUtxo.blockDaaScore.toString()
      },
      lineage: {
        genesisCovenantId: covenantUtxo.covenantId,
        successorCovenantId: successorUtxo.covenantId,
        preserved: successorUtxo.covenantId === covenantUtxo.covenantId,
        genesisOutputConsumed: genesisSpent
      }
    },
    controls,
    upstreamGaps: [
      "kaspa-wasm 2.0.1 mass calculator ignores v1 compute budgets (wallet/core/src/tx/mass.rs TODO): fees for inputs with computeBudget > 0 are explicit",
      "no compute-budget estimator in the SDK: budgets here are certified by the node, not estimated by HardKAS"
    ],
    harness: { minerThrottle: HARNESS_MINER_THROTTLE },
    result: "PASS"
  };
  const evidencePath = path.join(work, "silver-v2-covenant-evidence.json");
  fs.writeFileSync(evidencePath, JSON.stringify(evidence, jsonReplacer, 2) + "\n");
  await writeCorpusCase({
    id: "covenant-counter-transition",
    scenario: evidence.scenario,
    scope: COVENANT_SCOPE,
    capabilities: evidence.capabilities,
    compiles: [
      { name: "current", source: SOURCE, constructorArgs: [int(INITIAL)], result: next.current, contract: "Counter" },
      { name: "successor", source: SOURCE, constructorArgs: next.successorConstructorArgs, result: next.successor, contract: "Counter" }
    ],
    covenant: {
      compile: "current",
      successorCompile: "successor",
      genesisOutpoint: funding.outpoint,
      genesisValueSompi: GENESIS_VALUE.toString(),
      covenantId: covenantUtxo.covenantId,
      successorCovenantId: successorUtxo.covenantId
    },
    evidence
  });
  log(`\n=== M8-B2-B PASS === evidence: ${evidencePath}`);
}

main().catch((err) => {
  stopMiner();
  console.error("M8-B2-B FAILED:", err?.message ?? err);
  process.exit(1);
});
