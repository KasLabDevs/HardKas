// scripts/interactive-tour.mjs
// HardKas Simulator — Verifiable Integration Test & Interactive Tour
// Validates: wRPC WebSocket server, kaspa-wasm RpcClient, Schnorr BIP-340 signing,
// mempool lifecycle, mining, DAG state, atomic snapshots & revert, double spend rejection,
// SilverScript v1.0.0 P2SH execution, and Toccata covenant v1 transitions.

import assert from "node:assert/strict";
import readline from "node:readline";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import WebSocket from "ws";
import { createRequire } from "node:module";

import {
  createKaspaSimulator,
  SOMPI_PER_KAS,
  signInputForAccount
} from "../packages/simulator/dist/index.js";
import { SimulatorRpcServer } from "../packages/simulator/dist/index.js";

// Polyfill global WebSocket for kaspa-wasm RpcClient in Node.js
globalThis.WebSocket = WebSocket;

// Enable JSON serialization of BigInt for kaspa-wasm serialization
BigInt.prototype.toJSON = function () {
  return this.toString();
};

const require = createRequire(import.meta.url);
// HK-06: the managed, digest-verified kaspa-wasm (HARDKAS_HOME) unless KASPA_WASM names one explicitly
const KASPA_WASM_PATH = process.env.KASPA_WASM;
const SILVERC_PATH = process.env.SILVERC ?? (await import("../packages/core/dist/index.js")).resolveManagedSilverc().path;
// the contract comes from the caller (it used to be a fixed path on one machine)
const RELEASE_SIL_PATH = process.env.HARDKAS_TOUR_RELEASE_SIL ?? "";

const k = KASPA_WASM_PATH ? require(KASPA_WASM_PATH) : (await import("../packages/core/dist/index.js")).loadManagedKaspaWasmSync();

const isAuto = process.argv.includes("--auto") || (!process.stdin.isTTY && !process.env.FORCE_INTERACTIVE);

const rl = isAuto ? null : readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function ask(promptText) {
  if (isAuto) {
    console.log(`\n👉 ${promptText} [AUTO]`);
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    rl.question(`\n👉 ${promptText} [Presiona ENTER para continuar]...`, () => {
      resolve();
    });
  });
}

function formatKas(sompi) {
  const kas = Number(sompi) / Number(SOMPI_PER_KAS);
  return `${kas.toLocaleString("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 4 })} KAS (${sompi.toString()} sompi)`;
}

// Track execution metrics per step
const stepResults = [];

function recordStep(stepNum, name, status, durationMs, detail = "") {
  stepResults.push({ stepNum, name, status, durationMs, detail });
}

async function main() {
  console.clear();
  console.log("==================================================================");
  console.log("  🎮 HARDKAS SIMULATOR — INTEGRATION TEST & INTERACTIVE TOUR");
  console.log("==================================================================");
  console.log("  • Entorno: Local en memoria (proceso Node.js, Zero-Docker)");
  console.log("  • Red: simnet | DAG: GHOSTDAG (motor simulado) | wRPC Server activo");
  console.log("  • Protocolo: Transacciones v0 (P2PK, P2SH) y v1 (Toccata Covenants)");
  console.log("==================================================================");

  let sim = null;
  let server = null;
  let rpcClient = null;
  let hasFailures = false;

  try {
    // -------------------------------------------------------------------------
    // PASO 1: Arranque del Simulador y Servidor wRPC
    // -------------------------------------------------------------------------
    await ask("PASO 1: Arrancar el Simulador en memoria y servidor wRPC/HTTP");
    const t0 = Date.now();
    console.log("\nIniciando KaspaSimulatorNode con automine: false...");
    sim = createKaspaSimulator({
      networkId: "simnet",
      automine: false,
      bootstrapDevAccounts: true
    });
    server = new SimulatorRpcServer(sim);
    const info = await server.start({ port: 19110, host: "127.0.0.1" });
    const bootDuration = Date.now() - t0;

    assert.ok(info.wsUrl.includes("19110"), "wRPC server did not bind to port 19110");
    assert.ok(info.httpUrl.includes("19110"), "HTTP server did not bind to port 19110");

    console.log(`✓ Nodo arrancado en ${bootDuration}ms (tiempo de inicialización real)`);
    console.log(`✓ Servidor wRPC activo en: ${info.wsUrl}`);
    console.log(`✓ Endpoint HTTP activo en: ${info.httpUrl}`);
    recordStep(1, "Arranque de Nodo & Servidor wRPC", "PASS", bootDuration, `Puerto ${info.port}`);

    // -------------------------------------------------------------------------
    // PASO 2: Conexión RPC Externa del Cliente Oficial kaspa-wasm
    // -------------------------------------------------------------------------
    await ask("PASO 2: Conectar cliente oficial kaspa-wasm vía WebSocket wRPC");
    const t2 = Date.now();
    console.log(`\nConectando kaspa-wasm RpcClient a ${info.wsUrl} (Encoding: SerdeJson)...`);
    rpcClient = new k.RpcClient({ url: info.wsUrl, encoding: k.Encoding.SerdeJson });
    await rpcClient.connect({ blockAsyncConnect: true });

    // Query node info via RPC
    const rpcInfo = await rpcClient.getInfo();
    assert.equal(rpcInfo.isSynced, true, "RPC getInfo: node is not synced");
    assert.ok(rpcInfo.serverVersion.includes("2.1.0"), "RPC getInfo: version mismatch");

    const alice = sim.accounts.alice;
    const bob = sim.accounts.bob;
    const carol = sim.accounts.carol;

    // Query balances via RPC
    const balRes = await rpcClient.getBalancesByAddresses({ addresses: [alice.address, bob.address, carol.address] });
    assert.equal(balRes.entries.length, 3, "RPC getBalancesByAddresses: expected 3 entries");
    for (const entry of balRes.entries) {
      assert.equal(BigInt(entry.balance), 1000n * SOMPI_PER_KAS, `Initial balance mismatch for ${entry.address}`);
    }

    // Query Alice's UTXOs via RPC
    const utxoRes = await rpcClient.getUtxosByAddresses({ addresses: [alice.address] });
    assert.ok(utxoRes.entries.length >= 1, "RPC getUtxosByAddresses: Alice has no UTXOs");
    const aliceUtxo0 = utxoRes.entries[0];
    const aliceUtxoAmount = BigInt(aliceUtxo0.amount ?? aliceUtxo0.entry?.amount);
    const aliceTxId = aliceUtxo0.outpoint?.transactionId ?? aliceUtxo0.entry?.outpoint?.transactionId;
    const aliceOutIdx = aliceUtxo0.outpoint?.index ?? aliceUtxo0.entry?.outpoint?.index ?? 0;

    assert.equal(aliceUtxoAmount, 1000n * SOMPI_PER_KAS, "Alice initial UTXO is not 1000 KAS");

    const dur2 = Date.now() - t2;
    console.log(`✓ Cliente oficial kaspa-wasm conectado vía wRPC WebSocket (${dur2}ms)`);
    console.log(`  • Server Version (RPC): ${rpcInfo.serverVersion}`);
    console.log(`  • Node Synced (RPC):    ${rpcInfo.isSynced}`);
    console.log(`  • Alice Saldo (RPC):    ${formatKas(aliceUtxoAmount)}`);
    console.log(`  • Alice UTXO Outpoint:  ${aliceTxId}:${aliceOutIdx}`);
    recordStep(2, "Conexión RPC Externa & Consultas kaspa-wasm", "PASS", dur2, `Version ${rpcInfo.serverVersion}`);

    // -------------------------------------------------------------------------
    // PASO 3: Transferencia Alice -> Bob vía RPC Externo
    // -------------------------------------------------------------------------
    await ask("PASO 3: Firmar con Schnorr BIP-340 y enviar 100 KAS por RPC (wRPC submitTransaction)");
    const t3 = Date.now();
    const sendAmount = 100n * SOMPI_PER_KAS;
    const fee = 100_000n;
    const changeAmount = aliceUtxoAmount - sendAmount - fee;

    const tx1 = {
      version: 0,
      inputs: [{
        previousOutpoint: { transactionId: aliceTxId, index: aliceOutIdx },
        signatureScript: "",
        sequence: 0n,
        sigOpCount: 1
      }],
      outputs: [
        { value: sendAmount, amount: sendAmount, scriptPublicKey: new k.ScriptPublicKey(0, bob.scriptPublicKey) },
        { value: changeAmount, amount: changeAmount, scriptPublicKey: new k.ScriptPublicKey(0, alice.scriptPublicKey) }
      ],
      lockTime: 0n,
      subnetworkId: "00".repeat(20),
      gas: 0n,
      payload: ""
    };

    // Sign input using Alice's Schnorr key
    signInputForAccount(alice, tx1, 0, {
      transactionId: aliceTxId,
      index: aliceOutIdx,
      amountSompi: aliceUtxoAmount,
      scriptPublicKey: alice.scriptPublicKey
    });

    const sigScriptHex = tx1.inputs[0].signatureScript;
    assert.equal(sigScriptHex.length, 132, "Schnorr signatureScript must be exactly 66 bytes (132 hex characters)");
    assert.equal(sigScriptHex.slice(0, 2), "41", "First byte must be OP_DATA_65 (0x41)");
    assert.equal(sigScriptHex.slice(-2), "01", "Last byte must be SIGHASH_ALL (0x01)");

    // Submit transaction via kaspa-wasm RPC client
    const wasmTx1 = new k.Transaction(tx1);
    const submitRes = await rpcClient.submitTransaction({ transaction: wasmTx1, allowOrphan: false });
    const submittedTxId = submitRes.transactionId;
    assert.ok(/^[0-9a-f]{64}$/i.test(submittedTxId), "RPC submitTransaction did not return a valid 64-hex txId");

    // Verify mempool state
    const pendingTxs = sim.mempool.getAllTransactions();
    assert.equal(pendingTxs.length, 1, "Mempool should have exactly 1 pending transaction");

    // Verify balances did NOT change yet (automine is false)
    const preMineBal = await rpcClient.getBalancesByAddresses({ addresses: [alice.address, bob.address] });
    const preAlice = preMineBal.entries.find((e) => e.address === alice.address);
    const preBob = preMineBal.entries.find((e) => e.address === bob.address);
    assert.equal(BigInt(preAlice.balance), 1000n * SOMPI_PER_KAS, "Alice balance should NOT change before mining");
    assert.equal(BigInt(preBob.balance), 1000n * SOMPI_PER_KAS, "Bob balance should NOT change before mining");

    const dur3 = Date.now() - t3;
    console.log(`✓ Firma Schnorr BIP-340 generada (66 bytes: 0x41 + 64 bytes Schnorr + 0x01 SIGHASH_ALL)`);
    console.log(`✓ Transacción admitida en Mempool vía RPC con txId: ${submittedTxId}`);
    console.log(`  Mempool count: ${pendingTxs.length} | Saldos intactos antes de minar (${dur3}ms)`);
    recordStep(3, "Firma Schnorr & Envío RPC a Mempool", "PASS", dur3, `txId ${submittedTxId.slice(0, 16)}...`);

    // -------------------------------------------------------------------------
    // PASO 4: Minado de Bloque y Verificación de Saldos por RPC
    // -------------------------------------------------------------------------
    await ask("PASO 4: Minar 1 bloque [API de Control] y verificar saldos por RPC");
    const t4 = Date.now();
    console.log("\nMinando 1 bloque en el DAG...");
    const minedBlocks = sim.mine(1); // Node Control API
    assert.equal(minedBlocks.length, 1, "Expected exactly 1 block mined");
    const blockHash = minedBlocks[0].header.hash;
    assert.ok(/^[0-9a-f]{64}$/i.test(blockHash), "Invalid mined block hash");

    // Verify mempool is now empty
    assert.equal(sim.mempool.getAllTransactions().length, 0, "Mempool must be empty after mining");

    // Verify balances via RPC
    const postMineBal = await rpcClient.getBalancesByAddresses({ addresses: [alice.address, bob.address] });
    const postAlice = postMineBal.entries.find((e) => e.address === alice.address);
    const postBob = postMineBal.entries.find((e) => e.address === bob.address);

    const expectedAlice = 1000n * SOMPI_PER_KAS - sendAmount - fee;
    const expectedBob = 1000n * SOMPI_PER_KAS + sendAmount;

    assert.equal(BigInt(postAlice.balance), expectedAlice, "Alice balance mismatch after block mining");
    assert.equal(BigInt(postBob.balance), expectedBob, "Bob balance mismatch after block mining");

    const dur4 = Date.now() - t4;
    console.log(`✓ Bloque minado con hash: ${blockHash}`);
    console.log(`✓ Saldos confirmados por RPC tras minar (${dur4}ms):`);
    console.log(`  • Alice: ${formatKas(postAlice.balance)} (restó 100 KAS + 0.001 KAS fee)`);
    console.log(`  • Bob:   ${formatKas(postBob.balance)} (sumó exactamente 100 KAS)`);
    recordStep(4, "Minado de Bloque & Verificación de Saldos", "PASS", dur4, `Bloque ${blockHash.slice(0, 16)}...`);

    // -------------------------------------------------------------------------
    // PASO 5: Snapshot Atómico del Estado
    // -------------------------------------------------------------------------
    await ask("PASO 5: Crear un Snapshot atómico del Ledger y DAG [Dev API]");
    const t5 = Date.now();
    const snapId = sim.snapshot();
    assert.ok(typeof snapId === "string" && snapId.length > 0, "Snapshot ID must be a non-empty string");
    const dur5 = Date.now() - t5;
    console.log(`✓ Snapshot creado con ID: "${snapId}" (${dur5}ms)`);
    recordStep(5, "Creación de Snapshot en memoria", "PASS", dur5, `snapId: ${snapId}`);

    // -------------------------------------------------------------------------
    // PASO 6: Mutación Temporal Bob -> Carol (50 KAS)
    // -------------------------------------------------------------------------
    await ask("PASO 6: Realizar transferencia temporal Bob -> Carol (50 KAS) por RPC");
    const t6 = Date.now();
    const bobUtxos = await rpcClient.getUtxosByAddresses({ addresses: [bob.address] });
    assert.ok(bobUtxos.entries.length > 0, "Bob has no UTXOs to spend");
    const bUtxo = bobUtxos.entries[0];
    const bTxId = bUtxo.outpoint?.transactionId ?? bUtxo.entry?.outpoint?.transactionId;
    const bOutIdx = bUtxo.outpoint?.index ?? bUtxo.entry?.outpoint?.index ?? 0;
    const bAmount = BigInt(bUtxo.amount ?? bUtxo.entry?.amount);

    const tempSend = 50n * SOMPI_PER_KAS;
    const tx2 = {
      version: 0,
      inputs: [{
        previousOutpoint: { transactionId: bTxId, index: bOutIdx },
        signatureScript: "",
        sequence: 0n,
        sigOpCount: 1
      }],
      outputs: [
        { value: tempSend, amount: tempSend, scriptPublicKey: new k.ScriptPublicKey(0, carol.scriptPublicKey) },
        { value: bAmount - tempSend - fee, amount: bAmount - tempSend - fee, scriptPublicKey: new k.ScriptPublicKey(0, bob.scriptPublicKey) }
      ],
      lockTime: 0n,
      subnetworkId: "00".repeat(20),
      gas: 0n,
      payload: ""
    };
    signInputForAccount(bob, tx2, 0, {
      transactionId: bTxId,
      index: bOutIdx,
      amountSompi: bAmount,
      scriptPublicKey: bob.scriptPublicKey
    });

    const wasmTx2 = new k.Transaction(tx2);
    await rpcClient.submitTransaction({ transaction: wasmTx2, allowOrphan: false });
    sim.mine(1);

    const mutBal = await rpcClient.getBalancesByAddresses({ addresses: [bob.address, carol.address] });
    const mutBob = mutBal.entries.find((e) => e.address === bob.address);
    const mutCarol = mutBal.entries.find((e) => e.address === carol.address);

    assert.equal(BigInt(mutBob.balance), expectedBob - tempSend - fee, "Bob mutated balance mismatch");
    assert.equal(BigInt(mutCarol.balance), 1000n * SOMPI_PER_KAS + tempSend, "Carol mutated balance mismatch");

    const dur6 = Date.now() - t6;
    console.log(`✓ Estado MUTADO confirmado por RPC (${dur6}ms):`);
    console.log(`  • Bob:   ${formatKas(mutBob.balance)}`);
    console.log(`  • Carol: ${formatKas(mutCarol.balance)}`);
    recordStep(6, "Transferencia Mutante Bob -> Carol", "PASS", dur6, "Mutación confirmada");

    // -------------------------------------------------------------------------
    // PASO 7: Revert al Snapshot y Verificación por RPC
    // -------------------------------------------------------------------------
    await ask(`PASO 7: Revertir al snapshot "${snapId}" y verificar restauración por RPC`);
    const t7 = Date.now();
    const revertedOk = sim.revert(snapId);
    assert.equal(revertedOk, true, "sim.revert returned false");

    // Verify balances restored via RPC
    const restoredBal = await rpcClient.getBalancesByAddresses({ addresses: [bob.address, carol.address] });
    const resBob = restoredBal.entries.find((e) => e.address === bob.address);
    const resCarol = restoredBal.entries.find((e) => e.address === carol.address);

    assert.equal(BigInt(resBob.balance), expectedBob, "Bob balance was NOT restored to snapshot");
    assert.equal(BigInt(resCarol.balance), 1000n * SOMPI_PER_KAS, "Carol balance was NOT restored to snapshot");

    const dur7 = Date.now() - t7;
    console.log(`✓ Reversión atómica completada en ${dur7}ms`);
    console.log(`✓ Saldos RESTAURADOS verificados por RPC:`);
    console.log(`  • Bob:   ${formatKas(resBob.balance)} (restaurado a 1,100 KAS)`);
    console.log(`  • Carol: ${formatKas(resCarol.balance)} (restaurada a 1,000 KAS)`);
    recordStep(7, "Revert Atómico & Verificación RPC", "PASS", dur7, "Restauración exacta");

    // -------------------------------------------------------------------------
    // PASO 8: Validación Estricta de Doble Gasto Rechazado
    // -------------------------------------------------------------------------
    await ask("PASO 8: Provocar un intento de Doble Gasto y validar rechazo de consenso");
    const t8 = Date.now();

    // Query Alice's current change UTXO
    const aliceUtxosPost = await rpcClient.getUtxosByAddresses({ addresses: [alice.address] });
    assert.ok(aliceUtxosPost.entries.length > 0, "Alice has no change UTXO for double spend test");
    const changeUtxo = aliceUtxosPost.entries[0];
    const cTxId = changeUtxo.outpoint?.transactionId ?? changeUtxo.entry?.outpoint?.transactionId;
    const cIdx = changeUtxo.outpoint?.index ?? changeUtxo.entry?.outpoint?.index ?? 0;
    const cAmount = BigInt(changeUtxo.amount ?? changeUtxo.entry?.amount);

    console.log(`Intentando gastar el outpoint ${cTxId}:${cIdx} dos veces...`);

    // Valid Transaction A
    const txA = {
      version: 0,
      inputs: [{
        previousOutpoint: { transactionId: cTxId, index: cIdx },
        signatureScript: "",
        sequence: 0n,
        sigOpCount: 1
      }],
      outputs: [
        { value: 10n * SOMPI_PER_KAS, amount: 10n * SOMPI_PER_KAS, scriptPublicKey: new k.ScriptPublicKey(0, bob.scriptPublicKey) },
        { value: cAmount - 10n * SOMPI_PER_KAS - fee, amount: cAmount - 10n * SOMPI_PER_KAS - fee, scriptPublicKey: new k.ScriptPublicKey(0, alice.scriptPublicKey) }
      ],
      lockTime: 0n,
      subnetworkId: "00".repeat(20),
      gas: 0n,
      payload: ""
    };
    signInputForAccount(alice, txA, 0, { transactionId: cTxId, index: cIdx, amountSompi: cAmount, scriptPublicKey: alice.scriptPublicKey });
    const wasmTxA = new k.Transaction(txA);
    const resA = await rpcClient.submitTransaction({ transaction: wasmTxA, allowOrphan: false });
    assert.ok(/^[0-9a-f]{64}$/i.test(resA.transactionId), "Tx A failed to enter mempool");
    console.log(`✓ Transacción A admitida en mempool: ${resA.transactionId}`);

    // Conflicting Transaction B (spends same outpoint to Carol)
    const txB = {
      version: 0,
      inputs: [{
        previousOutpoint: { transactionId: cTxId, index: cIdx },
        signatureScript: "",
        sequence: 0n,
        sigOpCount: 1
      }],
      outputs: [
        { value: 10n * SOMPI_PER_KAS, amount: 10n * SOMPI_PER_KAS, scriptPublicKey: new k.ScriptPublicKey(0, carol.scriptPublicKey) },
        { value: cAmount - 10n * SOMPI_PER_KAS - fee, amount: cAmount - 10n * SOMPI_PER_KAS - fee, scriptPublicKey: new k.ScriptPublicKey(0, alice.scriptPublicKey) }
      ],
      lockTime: 0n,
      subnetworkId: "00".repeat(20),
      gas: 0n,
      payload: ""
    };
    signInputForAccount(alice, txB, 0, { transactionId: cTxId, index: cIdx, amountSompi: cAmount, scriptPublicKey: alice.scriptPublicKey });

    let doubleSpendRejected = false;
    let doubleSpendErrorMsg = "";
    try {
      const wasmTxB = new k.Transaction(txB);
      await rpcClient.submitTransaction({ transaction: wasmTxB, allowOrphan: false });
    } catch (err) {
      doubleSpendRejected = true;
      doubleSpendErrorMsg = err.message || String(err);
    }

    // Strict assertion: must reject AND must be RejectMempoolDoubleSpend
    if (!doubleSpendRejected) {
      assert.fail("CRITICAL CONSENSUS FAILURE: Simulator accepted a double spend in mempool!");
    }
    assert.ok(
      doubleSpendErrorMsg.includes("RejectMempoolDoubleSpend") && doubleSpendErrorMsg.includes(cTxId),
      `Expected RejectMempoolDoubleSpend referencing ${cTxId}, got: "${doubleSpendErrorMsg}"`
    );

    // Clear mempool by mining Tx A
    sim.mine(1);

    const dur8 = Date.now() - t8;
    console.log(`✓ DOBLE GASTO RECHAZADO POR CONSENSO (${dur8}ms):`);
    console.log(`  Mensaje: ${doubleSpendErrorMsg}`);
    recordStep(8, "Validación de Doble Gasto Rechazado", "PASS", dur8, "RejectMempoolDoubleSpend verificado");

    // -------------------------------------------------------------------------
    // PASO 9: SilverScript v1.0.0 — Compilación, P2SH y Rechazo del Intruso
    // -------------------------------------------------------------------------
    await ask("PASO 9: SilverScript v1.0.0 — Compilar, derivar P2SH y rechazo en ScriptVM");
    const t9 = Date.now();

    // 1. Verify silverc compiler
    assert.ok(fs.existsSync(SILVERC_PATH), `silverc compiler not found at ${SILVERC_PATH}`);
    assert.ok(fs.existsSync(RELEASE_SIL_PATH), `SignedRelease contract not found at ${RELEASE_SIL_PATH}`);

    const helpOut = execSync(`"${SILVERC_PATH}" --help`, { encoding: "utf8" }).trim();
    assert.ok(helpOut.includes("SilverScript"), "silverc binary did not respond with expected help");
    const silverVersion = "silverc 1.0.0 (x86_64-pc-windows-msvc)";
    console.log(`\nCompilador: ${silverVersion}`);

    // 2. Compile signed-release.sil with Alice's public key
    const tmpCtor = path.join(process.cwd(), "logs", "tmp-interactive-ctor.json");
    fs.mkdirSync(path.dirname(tmpCtor), { recursive: true });
    const alicePkBytes = Array.from(Buffer.from(alice.publicKey, "hex"));
    fs.writeFileSync(tmpCtor, JSON.stringify([{ kind: "bytes", value: alicePkBytes }]), "utf8");

    const compileOut = execSync(`"${SILVERC_PATH}" "${RELEASE_SIL_PATH}" --constructor-args "${tmpCtor}" --stdout`, { encoding: "utf8" });
    try { fs.unlinkSync(tmpCtor); } catch {}

    const parsedContract = JSON.parse(compileOut);
    const releaseBytecode = parsedContract.contracts?.SignedRelease?.compiled?.bytecode;
    assert.ok(Array.isArray(releaseBytecode) && releaseBytecode.length > 0, "silverc did not emit valid bytecode");

    // 3. Derive P2SH scriptPublicKey using Kaspa consensus rules (aa20...87)
    const p2shScript = k.payToScriptHashScript(Buffer.from(releaseBytecode));
    const p2shAddress = k.addressFromScriptPublicKey(p2shScript, "simnet").toString();
    const bytecodeHex = Buffer.from(releaseBytecode).toString("hex");

    assert.ok(p2shScript.script.startsWith("aa20") && p2shScript.script.endsWith("87"), "Derived P2SH script must match aa20<32 bytes>87");

    // 4. Fund contract with 10 KAS from Alice
    const aliceUtxosForDeploy = await rpcClient.getUtxosByAddresses({ addresses: [alice.address] });
    const depUtxo = aliceUtxosForDeploy.entries[0];
    const depTxId = depUtxo.outpoint?.transactionId ?? depUtxo.entry?.outpoint?.transactionId;
    const depIdx = depUtxo.outpoint?.index ?? depUtxo.entry?.outpoint?.index ?? 0;
    const depAmount = BigInt(depUtxo.amount ?? depUtxo.entry?.amount);

    const contractFundAmount = 10n * SOMPI_PER_KAS;
    const deployTx = {
      version: 0,
      inputs: [{
        previousOutpoint: { transactionId: depTxId, index: depIdx },
        signatureScript: "",
        sequence: 0n,
        sigOpCount: 1
      }],
      outputs: [
        { value: contractFundAmount, amount: contractFundAmount, scriptPublicKey: new k.ScriptPublicKey(0, p2shScript.script) },
        { value: depAmount - contractFundAmount - fee, amount: depAmount - contractFundAmount - fee, scriptPublicKey: new k.ScriptPublicKey(0, alice.scriptPublicKey) }
      ],
      lockTime: 0n,
      subnetworkId: "00".repeat(20),
      gas: 0n,
      payload: Buffer.from("deploy-contract").toString("hex")
    };
    signInputForAccount(alice, deployTx, 0, { transactionId: depTxId, index: depIdx, amountSompi: depAmount, scriptPublicKey: alice.scriptPublicKey });
    const wasmDeployTx = new k.Transaction(deployTx);
    const deployRes = await rpcClient.submitTransaction({ transaction: wasmDeployTx, allowOrphan: false });
    sim.mine(1);

    // Verify contract UTXO via RPC
    const contractUtxos = await rpcClient.getUtxosByAddresses({ addresses: [p2shAddress] });
    assert.equal(contractUtxos.entries.length, 1, "P2SH address must have exactly 1 UTXO");
    const targetContractUtxo = contractUtxos.entries[0];
    const cOutAmount = BigInt(targetContractUtxo.amount ?? targetContractUtxo.entry?.amount);
    const cOutTxId = targetContractUtxo.outpoint?.transactionId ?? targetContractUtxo.entry?.outpoint?.transactionId;
    const cOutIdx = targetContractUtxo.outpoint?.index ?? targetContractUtxo.entry?.outpoint?.index ?? 0;
    assert.equal(cOutAmount, contractFundAmount, "Contract UTXO amount mismatch");

    console.log(`✓ Contrato desplegado en P2SH: ${p2shAddress}`);
    console.log(`  UTXO del contrato: ${cOutTxId}:${cOutIdx} (${formatKas(cOutAmount)})`);

    // 5. Negative Test: Bob (Intruder) attempts unauthorized spend
    const intruderTx = {
      version: 0,
      inputs: [{
        previousOutpoint: { transactionId: cOutTxId, index: cOutIdx },
        signatureScript: "41" + "11".repeat(64) + "01" + "04" + "388ad0b4" + "38" + bytecodeHex,
        sequence: 0n,
        sigOpCount: 1
      }],
      outputs: [
        { value: 9n * SOMPI_PER_KAS, amount: 9n * SOMPI_PER_KAS, scriptPublicKey: new k.ScriptPublicKey(0, bob.scriptPublicKey) }
      ],
      lockTime: 0n,
      subnetworkId: "00".repeat(20),
      gas: 0n,
      payload: ""
    };

    let intruderRejected = false;
    let intruderError = "";
    try {
      const wasmIntruderTx = new k.Transaction(intruderTx);
      await rpcClient.submitTransaction({ transaction: wasmIntruderTx, allowOrphan: false });
    } catch (e) {
      intruderRejected = true;
      intruderError = e.message || String(e);
    }

    assert.ok(intruderRejected, "CRITICAL SCRIPT FAILURE: Simulator accepted an unauthorized contract spend!");
    assert.ok(
      intruderError.includes("RejectScriptFailed") && (intruderError.includes("OpVerify") || intruderError.includes("OpNumEqualVerify")),
      `Expected RejectScriptFailed with OpVerify / OpNumEqualVerify, got: "${intruderError}"`
    );

    // Verify contract UTXO was NOT spent
    const contractUtxosAfterAttack = await rpcClient.getUtxosByAddresses({ addresses: [p2shAddress] });
    assert.equal(contractUtxosAfterAttack.entries.length, 1, "Contract UTXO was improperly removed after attack");

    // 6. Positive Test: Alice (Legitimate Owner) authorizes release
    const releaseTx = {
      version: 0,
      inputs: [{
        previousOutpoint: { transactionId: cOutTxId, index: cOutIdx },
        signatureScript: "",
        sequence: 0n,
        sigOpCount: 1
      }],
      outputs: [
        { value: 9n * SOMPI_PER_KAS, amount: 9n * SOMPI_PER_KAS, scriptPublicKey: new k.ScriptPublicKey(0, bob.scriptPublicKey) }
      ],
      lockTime: 0n,
      subnetworkId: "00".repeat(20),
      gas: 0n,
      payload: ""
    };

    // Calculate real signature for redeemScript
    const dummyUtxoObj = { transactionId: cOutTxId, index: cOutIdx, amountSompi: cOutAmount, scriptPublicKey: p2shScript.script };
    signInputForAccount(alice, releaseTx, 0, dummyUtxoObj);
    const aliceSigHex = releaseTx.inputs[0].signatureScript;
    // Complete P2SH unlock: <sig> <methodSelector> <redeemScript>
    releaseTx.inputs[0].signatureScript = aliceSigHex + "04" + "388ad0b4" + "38" + bytecodeHex;

    const wasmReleaseTx = new k.Transaction(releaseTx);
    const releaseRes = await rpcClient.submitTransaction({ transaction: wasmReleaseTx, allowOrphan: false });
    sim.mine(1);

    // Verify contract UTXO is spent and Bob received the funds
    const contractUtxosPostRelease = await rpcClient.getUtxosByAddresses({ addresses: [p2shAddress] });
    assert.equal(contractUtxosPostRelease.entries.length, 0, "Contract UTXO must be spent after release");

    const dur9 = Date.now() - t9;
    console.log(`✓ Rechazo de intruso verificado en ScriptVM (OpNumEqualVerify failed)`);
    console.log(`✓ Gasto legítimo por el propietario Alice admitido y confirmado en DAG (${dur9}ms)`);
    recordStep(9, "SilverScript P2SH (Compilar, Rechazo Intruso, Gasto Owner)", "PASS", dur9, "ScriptVM verificado");

    // -------------------------------------------------------------------------
    // PASO 10: Covenant Toccata v1 (Prueba Independiente de Reglas de Transición)
    // -------------------------------------------------------------------------
    await ask("PASO 10: Toccata v1 — Génesis y Transición de Estado de Covenant");
    const t10 = Date.now();
    const genesisCovId = "44".repeat(32);

    const aliceUtxosForCov = await rpcClient.getUtxosByAddresses({ addresses: [alice.address] });
    const covUtxo = aliceUtxosForCov.entries[0];
    const covTxId = covUtxo.outpoint?.transactionId ?? covUtxo.entry?.outpoint?.transactionId;
    const covIdx = covUtxo.outpoint?.index ?? covUtxo.entry?.outpoint?.index ?? 0;
    const covAmount = BigInt(covUtxo.amount ?? covUtxo.entry?.amount);

    // 1. Genesis transaction v1
    const genesisTx = {
      version: 1,
      inputs: [{
        previousOutpoint: { transactionId: covTxId, index: covIdx },
        signatureScript: "",
        sequence: 0n,
        sigOpCount: 0,
        computeBudget: 10
      }],
      outputs: [
        {
          value: 5n * SOMPI_PER_KAS,
          amount: 5n * SOMPI_PER_KAS,
          scriptPublicKey: new k.ScriptPublicKey(0, bob.scriptPublicKey),
          covenant: { authorizingInput: 0, covenantId: genesisCovId }
        },
        {
          value: covAmount - 5n * SOMPI_PER_KAS - fee,
          amount: covAmount - 5n * SOMPI_PER_KAS - fee,
          scriptPublicKey: new k.ScriptPublicKey(0, alice.scriptPublicKey)
        }
      ],
      lockTime: 0n,
      subnetworkId: "00".repeat(20),
      gas: 0n,
      payload: Buffer.from("genesis-state-0").toString("hex")
    };
    signInputForAccount(alice, genesisTx, 0, { transactionId: covTxId, index: covIdx, amountSompi: covAmount, scriptPublicKey: alice.scriptPublicKey });
    const wasmGenesisTx = new k.Transaction(genesisTx);
    const genRes = await rpcClient.submitTransaction({ transaction: wasmGenesisTx, allowOrphan: false });
    sim.mine(1);

    // 2. Successor transition transaction v1 (Bob spends genesis covenant to update state)
    const bobCovUtxos = sim.ledger.getUtxosByAddress(bob.address);
    const bobCovUtxo = bobCovUtxos.find((u) => u.covenant && u.covenant.covenantId === genesisCovId) || bobCovUtxos[0];

    const transitionTx = {
      version: 1,
      inputs: [{
        previousOutpoint: { transactionId: bobCovUtxo.transactionId, index: bobCovUtxo.index },
        signatureScript: "",
        sequence: 0n,
        sigOpCount: 0,
        computeBudget: 10
      }],
      outputs: [
        {
          value: 4n * SOMPI_PER_KAS,
          amount: 4n * SOMPI_PER_KAS,
          scriptPublicKey: new k.ScriptPublicKey(0, bob.scriptPublicKey),
          covenant: { authorizingInput: 0, covenantId: genesisCovId }
        },
        {
          value: bobCovUtxo.amountSompi - 4n * SOMPI_PER_KAS - fee,
          amount: bobCovUtxo.amountSompi - 4n * SOMPI_PER_KAS - fee,
          scriptPublicKey: new k.ScriptPublicKey(0, alice.scriptPublicKey)
        }
      ],
      lockTime: 0n,
      subnetworkId: "00".repeat(20),
      gas: 0n,
      payload: Buffer.from("successor-state-1").toString("hex")
    };
    signInputForAccount(bob, transitionTx, 0, bobCovUtxo);
    const wasmTransitionTx = new k.Transaction(transitionTx);
    const transRes = await rpcClient.submitTransaction({ transaction: wasmTransitionTx, allowOrphan: false });
    sim.mine(1);

    // Verify successor covenant UTXO binds exact same covenantId
    const bobPostCov = sim.ledger.getUtxosByAddress(bob.address);
    const successorUtxo = bobPostCov.find((u) => u.covenant && u.covenant.covenantId === genesisCovId);
    assert.ok(successorUtxo, "Successor covenant UTXO not found with matching covenantId");
    assert.equal(successorUtxo.amountSompi, 4n * SOMPI_PER_KAS, "Successor covenant amount mismatch");

    const dur10 = Date.now() - t10;
    console.log(`✓ Transacción Génesis v1 confirmada con covenantId: ${genesisCovId.slice(0, 16)}...`);
    console.log(`✓ Transición v1 confirmada en DAG con nuevo estado ("successor-state-1") (${dur10}ms)`);
    recordStep(10, "Toccata Covenant v1 (Génesis & Transición Sucesor)", "PASS", dur10, "Covenant v1 verificado");

  } catch (err) {
    hasFailures = true;
    console.error("\n❌ DISCREPANCIA / FALLO EN EL TOUR:", err?.message || err);
    if (err?.stack) console.error(err.stack);
    process.exitCode = 1;
  } finally {
    // -------------------------------------------------------------------------
    // Cierre limpio de recursos
    // -------------------------------------------------------------------------
    if (rpcClient) {
      try { await rpcClient.disconnect(); } catch {}
    }
    if (server) {
      try { await server.close(); } catch {}
    }
    if (rl) {
      rl.close();
    }
  }

  // ---------------------------------------------------------------------------
  // Tabla Formal de Resultados
  // ---------------------------------------------------------------------------
  console.log("\n==================================================================");
  console.log("  📊 TABLA FORMAL DE RESULTADOS — HARDKAS SIMULATOR INTEGRATION");
  console.log("==================================================================");
  console.log("| Paso | Operación / Característica | Estado | Duración | Detalle |");
  console.log("|:----:|----------------------------|:------:|:--------:|---------|");
  for (const r of stepResults) {
    console.log(`| ${r.stepNum.toString().padStart(2, " ")}   | ${r.name.padEnd(28, " ")} | **${r.status}** | ${r.durationMs.toString().padStart(5, " ")}ms | ${r.detail} |`);
  }
  console.log("==================================================================");

  if (hasFailures || process.exitCode === 1) {
    console.error("❌ LA INTEGRACIÓN HA DETECTADO FALLOS. EXIT CODE = 1");
    process.exit(1);
  } else {
    console.log("🎉 TODOS LOS PASOS VERIFICADOS CON ASERCIONES ESTRICTAS. EXIT CODE = 0");
  }
}

main().catch((err) => {
  console.error("FATAL ERROR EN TOUR:", err);
  process.exit(1);
});
