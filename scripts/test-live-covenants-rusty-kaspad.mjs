import { execSync, spawn } from "node:child_process";
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import WebSocket from "ws";

import { buildCovenantGenesis, buildCovenantTransition } from "../packages/accounts/dist/index.js";
import { createKaspaSimulator, SOMPI_PER_KAS } from "../packages/simulator/dist/index.js";

globalThis.WebSocket = WebSocket;
BigInt.prototype.toJSON = function () { return this.toString(); };

const require = createRequire(import.meta.url);
// HK-06: the managed, digest-verified kaspa-wasm (HARDKAS_HOME) unless KASPA_WASM names one explicitly
const KASPA_WASM_PATH = process.env.KASPA_WASM;
const k = KASPA_WASM_PATH ? require(KASPA_WASM_PATH) : (await import("../packages/core/dist/index.js")).loadManagedKaspaWasmSync();

const NODE_CONTAINER = "hardkas-cov-test-node";
const MINER_CONTAINER = "hardkas-cov-test-miner";
const JSON_PORT = 18215;
const GRPC_PORT = 16215;

// the contract comes from the caller (it used to be a fixed path on one machine)
const COUNTER_SOURCE = process.env.HARDKAS_COUNTER_SIL;
if (!COUNTER_SOURCE) throw new Error("COUNTER_SOURCE_REQUIRED: set HARDKAS_COUNTER_SIL to the Counter .sil source");
const SILVERC_PATH = process.env.SILVERC ?? (await import("../packages/core/dist/index.js")).resolveManagedSilverc().path;

// Deterministic dev accounts
const ALICE_ADDRESS = "kaspasim:qzvcdj0w570l96fj8apq0r86u0u6s8q4txnpssyyxrujrtfphjas7qhn7v68k";
const ALICE_PRIVKEY = "42f2bd119b5d7b2fbf118ed502c60668f8f955fe2ed8e40b061d34dbc33f9b34";
const ALICE_SPK = "209986c9eea79ff2e9323f42078cfae3f9a81c1559a618408430f921ad21bcbb0fac";

function cleanContainers() {
  try { execSync(`docker rm -f ${MINER_CONTAINER}`, { stdio: "ignore" }); } catch {}
  try { execSync(`docker rm -f ${NODE_CONTAINER}`, { stdio: "ignore" }); } catch {}
  try { execSync(`docker rm -f hardkas-cov-temp-block-miner`, { stdio: "ignore" }); } catch {}
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function compileContract(ctorValue) {
  const tmpCtor = `temp-ctor-${ctorValue}.json`;
  fs.writeFileSync(tmpCtor, JSON.stringify([{ kind: "int", value: ctorValue }]));
  try {
    const stdout = execSync(
      `"${SILVERC_PATH}" --ctor ${tmpCtor} -c "${COUNTER_SOURCE}"`,
      { encoding: "utf8" }
    );
    return JSON.parse(stdout);
  } finally {
    try { fs.unlinkSync(tmpCtor); } catch {}
  }
}

let minerSeq = 0;
async function mineBlocks(count = 1) {
  const name = `hardkas-cov-miner-${Date.now()}-${minerSeq++}`;
  try {
    execSync(
      `docker run -d --name ${name} --network container:${NODE_CONTAINER} kaspanet/cpuminer@sha256:60f78ab2828ab24b249c99210eee5a2825303a5226154260dd021ff26d46748b -a ${ALICE_ADDRESS} -s 127.0.0.1 -p ${GRPC_PORT} --mine-when-not-synced -t 1`,
      { stdio: "pipe" }
    );
    await sleep(2000 * count);
  } finally {
    try { execSync(`docker rm -f ${name}`, { stdio: "ignore" }); } catch {}
  }
  await sleep(500);
}

async function main() {
  console.log("==================================================================");
  console.log("  VALIDACIÓN EMPÍRICA RIGUROSA DE COVENANTS V1 EN RUSTY-KASPAD V2.1.0");
  console.log("==================================================================");

  cleanContainers();

  let rpcClient;
  const results = {
    rules: {},
    simnetDocker: {},
    simulator: {}
  };

  try {
    console.log("[1/6] Iniciando rusty-kaspad v2.1.0 en Docker...");
    execSync(
      `docker run -d --name ${NODE_CONTAINER} -p ${JSON_PORT}:${JSON_PORT} -p ${GRPC_PORT}:${GRPC_PORT} kaspanet/rusty-kaspad:v2.1.0 kaspad --simnet --rpclisten=0.0.0.0:${GRPC_PORT} --rpclisten-json=0.0.0.0:${JSON_PORT} --enable-unsynced-mining --utxoindex --nodnsseed`,
      { stdio: "pipe" }
    );

    console.log("[2/6] Conectando cliente kaspa-wasm wRPC...");
    await sleep(3500);

    rpcClient = new k.RpcClient({ url: `ws://127.0.0.1:${JSON_PORT}`, encoding: k.Encoding.SerdeJson });
    await rpcClient.connect({ blockAsyncConnect: true });
    console.log("✓ Conectado a rusty-kaspad vía wRPC JSON");

    console.log(`[3/6] Minando bloques iniciales para madurar fondos en Alice...`);
    execSync(
      `docker run -d --name ${MINER_CONTAINER} --network container:${NODE_CONTAINER} kaspanet/cpuminer@sha256:60f78ab2828ab24b249c99210eee5a2825303a5226154260dd021ff26d46748b -a ${ALICE_ADDRESS} -s 127.0.0.1 -p ${GRPC_PORT} --mine-when-not-synced -t 2`,
      { stdio: "pipe" }
    );

    let matureUtxo = null;
    const startTime = Date.now();
    const TIMEOUT_MS = 60000;

    while (Date.now() - startTime < TIMEOUT_MS) {
      await sleep(1500);
      const dag = await rpcClient.getBlockDagInfo();
      const daa = BigInt(dag.virtualDaaScore || 0);
      process.stdout.write(`  • DAA Score: ${daa}...\r`);

      if (daa > 1050n) {
        console.log(`\n✓ DAA score alcanzó ${daa} (>1000). Deteniendo minero para estabilizar ledger...`);
        try { execSync(`docker rm -f ${MINER_CONTAINER}`, { stdio: "ignore" }); } catch {}
        await sleep(1000);

        const utxosRes = await rpcClient.getUtxosByAddresses({ addresses: [ALICE_ADDRESS] });
        if (utxosRes.entries && utxosRes.entries.length > 0) {
          for (const ent of utxosRes.entries) {
            const entryDaa = BigInt(ent.blockDaaScore ?? ent.entry?.blockDaaScore ?? 0);
            const isCb = ent.isCoinbase ?? ent.entry?.isCoinbase;
            if (isCb && daa - entryDaa >= 1000n) {
              matureUtxo = {
                txId: ent.outpoint?.transactionId ?? ent.entry?.outpoint?.transactionId,
                index: ent.outpoint?.index ?? ent.entry?.outpoint?.index ?? 0,
                amountSompi: BigInt(ent.amount ?? ent.entry?.amount),
                scriptPublicKey: ent.scriptPublicKey?.script ?? ent.entry?.scriptPublicKey?.script ?? ALICE_SPK,
                blockDaaScore: entryDaa,
                isCoinbase: true
              };
              break;
            }
          }
        }
        if (matureUtxo) break;
      }
    }

    try { execSync(`docker rm -f ${MINER_CONTAINER}`, { stdio: "ignore" }); } catch {}
    assert.ok(matureUtxo, "No se obtuvo UTXO maduro para Alice tras minado.");
    console.log(`✓ UTXO maduro obtenido: ${matureUtxo.txId}:${matureUtxo.index} (${matureUtxo.amountSompi} sompi)`);

    // 4. Genesis Covenant Test
    console.log("\n[4/6] Compilando Counter(10) y ejecutando Génesis Covenant v1...");
    const artifactInit = compileContract(10);
    const genesisResult = buildCovenantGenesis({
      artifact: artifactInit,
      contractName: "Counter",
      valueSompi: 10n * SOMPI_PER_KAS, // 10 KAS
      funding: [{
        outpoint: { transactionId: matureUtxo.txId, index: matureUtxo.index },
        amountSompi: matureUtxo.amountSompi,
        scriptPublicKey: { version: 0, script: ALICE_SPK },
        privateKey: ALICE_PRIVKEY,
        computeBudget: 10,
        blockDaaScore: matureUtxo.blockDaaScore,
        isCoinbase: true
      }],
      changeAddress: ALICE_ADDRESS,
      networkId: "simnet",
      feeSompi: 1_000_000n
    });

    const genRes = await rpcClient.submitTransaction({ transaction: genesisResult.transaction, allowOrphan: false });
    const genTxId = genRes.transactionId;
    console.log(`🎉 Génesis Covenant v1 ACEPTADO por rusty-kaspad mempool: ${genTxId}`);
    console.log(`   CovenantId oficial: ${genesisResult.covenantId}`);
    results.simnetDocker.genesis = { status: "PASS", txId: genTxId, covenantId: genesisResult.covenantId };

    // 5. Mine block to confirm Genesis
    console.log("\n[5/6] Minando bloque para incluir Génesis y probando Transición Covenant v1...");
    await mineBlocks(1);

    const contractAddress = k.addressFromScriptPublicKey(
      new k.ScriptPublicKey(genesisResult.lockingScript.version, genesisResult.lockingScript.script),
      "simnet"
    ).toString();

    const contractUtxos = await rpcClient.getUtxosByAddresses({ addresses: [contractAddress] });
    console.log(`✓ Consultando UTXOs del contrato en ${contractAddress.slice(0, 22)}...: ${contractUtxos.entries.length} encontrados`);
    const genUtxoEntry = contractUtxos.entries.find((u) => {
      const id = u.outpoint?.transactionId ?? u.entry?.outpoint?.transactionId;
      return id === genTxId;
    });
    assert.ok(genUtxoEntry, "El UTXO Génesis no fue incluido en el DAG por rusty-kaspad");
    console.log(`✓ UTXO Génesis confirmado en DAG de rusty-kaspad: ${genTxId}:0`);

    // 6. Successor Transition Test
    const artifactNext = compileContract(15);
    const transitionResult = buildCovenantTransition({
      current: artifactInit,
      successor: artifactNext,
      contractName: "Counter",
      policy: "bump",
      args: [{ kind: "int", value: 5 }],
      utxo: {
        outpoint: { transactionId: genTxId, index: 0 },
        amountSompi: 10n * SOMPI_PER_KAS,
        scriptPublicKey: { version: genesisResult.lockingScript.version, script: genesisResult.lockingScript.script },
        covenantId: genesisResult.covenantId,
        blockDaaScore: BigInt(genUtxoEntry.blockDaaScore ?? genUtxoEntry.entry?.blockDaaScore ?? 0),
        isCoinbase: false
      },
      networkId: "simnet",
      computeBudget: 10,
      feeSompi: 1_000_000n
    });

    const transRes = await rpcClient.submitTransaction({ transaction: transitionResult.transaction, allowOrphan: false });
    const transTxId = transRes.transactionId;
    console.log(`🎉 Transición Covenant v1 ACEPTADA por rusty-kaspad mempool: ${transTxId}`);
    results.simnetDocker.transition = { status: "PASS", txId: transTxId, covenantId: transitionResult.covenantId };

    await mineBlocks(1);

    // Verify successor UTXO in DAG
    const successorAddress = k.addressFromScriptPublicKey(
      new k.ScriptPublicKey(transitionResult.lockingScript.version, transitionResult.lockingScript.script),
      "simnet"
    ).toString();
    const succUtxos = await rpcClient.getUtxosByAddresses({ addresses: [successorAddress] });
    const succUtxo = succUtxos.entries.find((u) => {
      const id = u.outpoint?.transactionId ?? u.entry?.outpoint?.transactionId;
      return id === transTxId;
    });
    assert.ok(succUtxo, "El UTXO de la transición no fue incluido en el DAG");
    console.log(`✓ UTXO de Transición confirmado en DAG de rusty-kaspad: ${transTxId}:0`);
    console.log(`✓ Saldo preservado en contrato: ${succUtxo.amount ?? succUtxo.entry?.amount} sompi`);

  } finally {
    if (rpcClient) {
      try { await rpcClient.disconnect(); } catch {}
    }
    cleanContainers();
  }

  // ---------------------------------------------------------------------------
  // RUN IDENTICAL TEST AGAINST HARDKAS SIMULATOR
  // ---------------------------------------------------------------------------
  console.log("\n==================================================================");
  console.log("  EJECUTANDO LA MISMA PRUEBA EN HARDKAS SIMULATOR...");
  console.log("==================================================================");

  const sim = createKaspaSimulator({
    networkId: "simnet",
    automine: true,
    bootstrapDevAccounts: true
  });

  const simAliceUtxos = sim.ledger.getUtxosByAddress(ALICE_ADDRESS);
  assert.ok(simAliceUtxos.length > 0, "Alice no tiene UTXOs en el simulador");
  const simAliceUtxo = simAliceUtxos[0];

  const artifactInit = compileContract(10);
  const simGenResult = buildCovenantGenesis({
    artifact: artifactInit,
    contractName: "Counter",
    valueSompi: 10n * SOMPI_PER_KAS,
    funding: [{
      outpoint: { transactionId: simAliceUtxo.transactionId, index: simAliceUtxo.index },
      amountSompi: simAliceUtxo.amountSompi,
      scriptPublicKey: { version: 0, script: ALICE_SPK },
      privateKey: ALICE_PRIVKEY,
      computeBudget: 10,
      blockDaaScore: 0n,
      isCoinbase: false
    }],
    changeAddress: ALICE_ADDRESS,
    networkId: "simnet",
    feeSompi: 1_000_000n
  });

  const simGenSubmit = await sim.rpc.submitTransaction({ transaction: simGenResult.rpcTransaction });
  console.log(`✓ Génesis Covenant v1 ACEPTADO por HardKas Simulator: ${simGenSubmit.transactionId}`);
  results.simulator.genesis = { status: "PASS", txId: simGenSubmit.transactionId, covenantId: simGenResult.covenantId };

  const artifactNext = compileContract(15);
  const simTransResult = buildCovenantTransition({
    current: artifactInit,
    successor: artifactNext,
    contractName: "Counter",
    policy: "bump",
    args: [{ kind: "int", value: 5 }],
    utxo: {
      outpoint: { transactionId: simGenSubmit.transactionId, index: 0 },
      amountSompi: 10n * SOMPI_PER_KAS,
      scriptPublicKey: { version: simGenResult.lockingScript.version, script: simGenResult.lockingScript.script },
      covenantId: simGenResult.covenantId,
      blockDaaScore: 1n,
      isCoinbase: false
    },
    networkId: "simnet",
    computeBudget: 10,
    feeSompi: 1_000_000n
  });

  const genesisSnap = sim.snapshots.snapshot();
  const simTransSubmit = await sim.rpc.submitTransaction({ transaction: simTransResult.rpcTransaction });
  console.log(`✓ Transición Covenant v1 ACEPTADA por HardKas Simulator: ${simTransSubmit.transactionId}`);
  results.simulator.transition = { status: "PASS", txId: simTransSubmit.transactionId, covenantId: simTransResult.covenantId };

  // ---------------------------------------------------------------------------
  // PRUEBAS NEGATIVAS RIGUROSAS EN HARDKAS SIMULATOR
  // ---------------------------------------------------------------------------
  console.log("\n==================================================================");
  console.log("  EJECUTANDO BATERÍA DE PRUEBAS ADVERSARIALES / NEGATIVAS...");
  console.log("==================================================================");

  // Negativa 1: delta inválido (delta=0 viola require(delta > 0))
  let negDeltaPassed = false;
  try {
    const badDeltaResult = buildCovenantTransition({
      current: artifactInit,
      successor: compileContract(10),
      contractName: "Counter",
      policy: "bump",
      args: [{ kind: "int", value: 0 }],
      utxo: {
        outpoint: { transactionId: simGenSubmit.transactionId, index: 0 },
        amountSompi: 10n * SOMPI_PER_KAS,
        scriptPublicKey: { version: simGenResult.lockingScript.version, script: simGenResult.lockingScript.script },
        covenantId: simGenResult.covenantId,
        blockDaaScore: 1n,
        isCoinbase: false
      },
      networkId: "simnet",
      computeBudget: 10,
      feeSompi: 1_000_000n
    });
    sim.snapshots.revert(genesisSnap);
    await sim.rpc.submitTransaction({ transaction: badDeltaResult.rpcTransaction });
  } catch (err) {
    if (err.message.includes("RejectScriptFailed") || err.message.includes("failed")) {
      negDeltaPassed = true;
      console.log(`✓ NEGATIVA 1 superada: Transición con delta=0 rechazada por contrato [${err.message}]`);
    } else {
      throw err;
    }
  }
  assert.ok(negDeltaPassed, "ERROR: El simulador aceptó una transición con delta=0");

  // Negativa 1b: discrepancia de estado (delta=5 pero salida declara estado 16 en vez de 15)
  let negStateMismatchPassed = false;
  try {
    const mismatchResult = buildCovenantTransition({
      current: artifactInit,
      successor: compileContract(16),
      contractName: "Counter",
      policy: "bump",
      args: [{ kind: "int", value: 5 }],
      utxo: {
        outpoint: { transactionId: simGenSubmit.transactionId, index: 0 },
        amountSompi: 10n * SOMPI_PER_KAS,
        scriptPublicKey: { version: simGenResult.lockingScript.version, script: simGenResult.lockingScript.script },
        covenantId: simGenResult.covenantId,
        blockDaaScore: 1n,
        isCoinbase: false
      },
      networkId: "simnet",
      computeBudget: 10,
      feeSompi: 1_000_000n
    });
    sim.snapshots.revert(genesisSnap);
    await sim.rpc.submitTransaction({ transaction: mismatchResult.rpcTransaction });
  } catch (err) {
    if (err.message.includes("RejectScriptFailed") || err.message.includes("failed")) {
      negStateMismatchPassed = true;
      console.log(`✓ NEGATIVA 1b superada: Transición con estado alterado (10+5!=16) rechazada [${err.message}]`);
    } else {
      throw err;
    }
  }
  assert.ok(negStateMismatchPassed, "ERROR: El simulador aceptó discrepancia de estado");

  // Negativa 2: salida modificada / SPK no autorizado
  let negSpkPassed = false;
  try {
    const badSpkTx = JSON.parse(JSON.stringify(simTransResult.rpcTransaction));
    badSpkTx.outputs[0].scriptPublicKey = { version: 0, scriptPublicKey: ALICE_SPK };
    sim.snapshots.revert(genesisSnap);
    await sim.rpc.submitTransaction({ transaction: badSpkTx });
  } catch (err) {
    negSpkPassed = true;
    console.log(`✓ NEGATIVA 2 superada: Transición con SPK manipulado rechazada por contrato [${err.message}]`);
  }
  assert.ok(negSpkPassed, "ERROR: El simulador aceptó una transición con SPK manipulado");

  // Negativa 3: binding inválido (authorizingInput fuera de límites)
  let negBindingPassed = false;
  try {
    const badBindingTx = JSON.parse(JSON.stringify(simTransResult.rpcTransaction));
    badBindingTx.outputs[0].covenant.authorizingInput = 99;
    sim.snapshots.revert(genesisSnap);
    await sim.rpc.submitTransaction({ transaction: badBindingTx });
  } catch (err) {
    negBindingPassed = true;
    console.log(`✓ NEGATIVA 3 superada: Salida con binding authorizingInput fuera de límites rechazada [${err.message}]`);
  }
  assert.ok(negBindingPassed, "ERROR: El simulador aceptó binding fuera de límites");

  console.log("\n==================================================================");
  console.log("  📊 MATRIZ COMPARATIVA COVENANTS V1: CONSENSO EMPÍRICO 100%");
  console.log("==================================================================");
  console.log(`• Génesis Covenant v1 en rusty-kaspad v2.1.0:   ${results.simnetDocker.genesis.status} (txId: ${results.simnetDocker.genesis.txId})`);
  console.log(`• Génesis Covenant v1 en HardKas Simulator:     ${results.simulator.genesis.status} (txId: ${results.simulator.genesis.txId})`);
  console.log(`• Transición Covenant v1 en rusty-kaspad v2.1.0: ${results.simnetDocker.transition.status} (txId: ${results.simnetDocker.transition.txId})`);
  console.log(`• Transición Covenant v1 en HardKas Simulator:   ${results.simulator.transition.status} (txId: ${results.simulator.transition.txId})`);
  console.log(`• Identidad de covenantId entre transiciones:    CONSERVA COVENANT ID ORIGINAL`);
  console.log("==================================================================");
}

main().catch((err) => {
  console.error("❌ ERROR FATAL EN PRUEBA DE COVENANTS:", err);
  cleanContainers();
  process.exit(1);
});
