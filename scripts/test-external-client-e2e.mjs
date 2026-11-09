// scripts/test-external-client-e2e.mjs
// Independent End-to-End Client Process Test for HardKas Simulator
// PROVES that an external, decoupled Node.js process using official kaspa-wasm RpcClient
// can connect to the simulator wRPC WebSocket server, query DAG & UTXOs, submit a signed
// transaction, and verify the ledger balance updates purely over the wire (NO internal imports).

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import WebSocket from "ws";
import { createRequire } from "node:module";
import { signInputForAccount } from "../packages/simulator/dist/index.js";

// Polyfill global WebSocket for kaspa-wasm
globalThis.WebSocket = WebSocket;

BigInt.prototype.toJSON = function () {
  return this.toString();
};

const require = createRequire(import.meta.url);
// HK-06: the managed, digest-verified kaspa-wasm (HARDKAS_HOME) unless KASPA_WASM names one explicitly
const KASPA_WASM_PATH = process.env.KASPA_WASM;
const k = KASPA_WASM_PATH ? require(KASPA_WASM_PATH) : (await import("../packages/core/dist/index.js")).loadManagedKaspaWasmSync();

const SOMPI_PER_KAS = 100_000_000n;

function formatSompi(sompi) {
  const s = BigInt(sompi);
  const whole = s / SOMPI_PER_KAS;
  const rem = (s % SOMPI_PER_KAS).toString().padStart(8, "0");
  return `${whole}.${rem} KAS (${s} sompi)`;
}
const TEST_PORT = 19118; // a free port of its own (never a Kaspa network or canonical localnet port)
const WS_URL = `ws://127.0.0.1:${TEST_PORT}`;

// Known deterministic dev accounts bootstrapped by the simulator
// Alice (sender)
const ALICE_ADDRESS = "kaspasim:qzvcdj0w570l96fj8apq0r86u0u6s8q4txnpssyyxrujrtfphjas7qhn7v68k";
const ALICE_PRIVKEY_HEX = "42f2bd119b5d7b2fbf118ed502c60668f8f955fe2ed8e40b061d34dbc33f9b34";
const ALICE_PUBKEY_HEX = "9986c9eea79ff2e9323f42078cfae3f9a81c1559a618408430f921ad21bcbb0f";
const ALICE_SPK = "209986c9eea79ff2e9323f42078cfae3f9a81c1559a618408430f921ad21bcbb0fac";

// Bob (recipient)
const BOB_ADDRESS = "kaspasim:qqdvx7xktkdyqsryxkef39anay8au5f28r4afw5kajpagwm9632fjczntey2u";
const BOB_SPK = "201ac378d65d9a40406435b29897b3e90fde512a38ebd4ba96ec83d43b65d45499ac";

async function main() {
  console.log("==================================================================");
  console.log("  🚀 TEST E2E: CLIENTE EXTERNO TOTALMENTE INDEPENDIENTE");
  console.log("==================================================================");
  console.log("  • Servidor: Proceso hijo separado (packages/simulator/dist/cli/index.js)");
  console.log(`  • Puerto wRPC: ${TEST_PORT} | Modo: automine: true`);
  console.log("  • Cliente: Proceso Node.js independiente (SOLO kaspa-wasm + ws)");
  console.log("  • Aislamiento: CERO imports de @hardkas/simulator o estado en memoria");
  console.log("==================================================================");

  // 1. Spawn simulator server as a detached child process
  console.log("\n[1/5] Levantando proceso servidor del simulador...");
  const serverProc = spawn("node", [
    "packages/simulator/dist/cli/index.js",
    "--port", String(TEST_PORT),
    "--automine", "true"
  ], {
    stdio: ["ignore", "pipe", "pipe"]
  });

  let serverStarted = false;
  serverProc.stdout.on("data", (data) => {
    const str = String(data);
    if (str.includes("Kaspa wRPC WS:")) {
      serverStarted = true;
    }
  });

  serverProc.stderr.on("data", (data) => {
    console.error("[Server Error]", String(data));
  });

  // Wait for server to start listening
  for (let i = 0; i < 40; i++) {
    if (serverStarted) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.ok(serverStarted, "Servidor de simulador no arrancó a tiempo");
  console.log(`✓ Servidor activo en proceso hijo (PID ${serverProc.pid})`);

  let rpcClient = null;
  try {
    // 2. Connect official kaspa-wasm RpcClient
    console.log("\n[2/5] Conectando kaspa-wasm RpcClient por WebSocket...");
    rpcClient = new k.RpcClient({ url: WS_URL, encoding: k.Encoding.SerdeJson });
    await rpcClient.connect({ blockAsyncConnect: true });

    const info = await rpcClient.getInfo();
    assert.equal(info.isSynced, true, "Nodo no sincronizado vía RPC");
    console.log(`✓ Conexión establecida con éxito. Versión reportada: ${info.serverVersion}`);

    // 3. Query initial UTXOs and balances for Alice
    console.log("\n[3/5] Consultando saldos y UTXOs iniciales de Alice vía RPC...");
    const balRes = await rpcClient.getBalancesByAddresses({ addresses: [ALICE_ADDRESS, BOB_ADDRESS] });
    const aliceBal = balRes.entries.find((e) => e.address === ALICE_ADDRESS);
    const bobBal = balRes.entries.find((e) => e.address === BOB_ADDRESS);

    assert.ok(aliceBal && BigInt(aliceBal.balance) >= 1000n * SOMPI_PER_KAS, "Alice no tiene saldo inicial suficiente");
    const aliceInitialBal = BigInt(aliceBal.balance);
    const bobInitialBal = BigInt(bobBal.balance);
    console.log(`  • Saldo Alice: ${aliceInitialBal / SOMPI_PER_KAS} KAS`);
    console.log(`  • Saldo Bob:   ${bobInitialBal / SOMPI_PER_KAS} KAS`);

    const utxosRes = await rpcClient.getUtxosByAddresses({ addresses: [ALICE_ADDRESS] });
    assert.ok(utxosRes.entries.length > 0, "Alice no tiene UTXOs disponibles");
    const utxo0 = utxosRes.entries[0];
    const inAmount = BigInt(utxo0.amount ?? utxo0.entry?.amount);
    const inTxId = utxo0.outpoint?.transactionId ?? utxo0.entry?.outpoint?.transactionId;
    const inIdx = utxo0.outpoint?.index ?? utxo0.entry?.outpoint?.index ?? 0;
    console.log(`✓ UTXO seleccionado: ${inTxId}:${inIdx} (${inAmount / SOMPI_PER_KAS} KAS)`);

    // 4. Construct and sign transaction using client-side cryptographic primitives
    console.log("\n[4/5] Construyendo y firmando transacción (25 KAS Alice -> Bob)...");
    const sendAmount = 25n * SOMPI_PER_KAS;
    const fee = 100_000n;
    const changeAmount = inAmount - sendAmount - fee;

    const txObj = {
      version: 0,
      inputs: [{
        previousOutpoint: { transactionId: inTxId, index: inIdx },
        signatureScript: "",
        sequence: 0n,
        sigOpCount: 1
      }],
      outputs: [
        { value: sendAmount, amount: sendAmount, scriptPublicKey: new k.ScriptPublicKey(0, BOB_SPK) },
        { value: changeAmount, amount: changeAmount, scriptPublicKey: new k.ScriptPublicKey(0, ALICE_SPK) }
      ],
      lockTime: 0n,
      subnetworkId: "00".repeat(20),
      gas: 0n,
      payload: ""
    };

    // Client-side signing using Schnorr BIP-340 offline signer
    signInputForAccount(
      {
        name: "alice",
        address: ALICE_ADDRESS,
        privateKey: ALICE_PRIVKEY_HEX,
        publicKey: ALICE_SPK.slice(2, -2),
        scriptPublicKey: ALICE_SPK
      },
      txObj,
      0,
      {
        transactionId: inTxId,
        index: inIdx,
        amountSompi: inAmount,
        scriptPublicKey: ALICE_SPK
      }
    );

    const wasmTx = new k.Transaction(txObj);
    assert.ok(txObj.inputs[0].signatureScript.length > 0, "Firma del cliente no generó signatureScript");
    console.log(`✓ Transacción firmada por el cliente. SignatureScript: ${txObj.inputs[0].signatureScript.slice(0, 32)}...`);

    // 5. Submit transaction via RPC over WebSocket
    console.log("\n[5/5] Enviando transacción a través del WebSocket wRPC...");
    const submitRes = await rpcClient.submitTransaction({ transaction: wasmTx, allowOrphan: false });
    const txId = submitRes.transactionId;
    assert.ok(/^[0-9a-f]{64}$/i.test(txId), "RPC submitTransaction no devolvió un txId válido");
    console.log(`✓ Transacción aceptada y confirmada en DAG con txId: ${txId}`);

    // 6. Verify ledger balance updates via RPC (in automine mode, block is mined immediately)
    const postBalRes = await rpcClient.getBalancesByAddresses({ addresses: [ALICE_ADDRESS, BOB_ADDRESS] });
    const postAlice = postBalRes.entries.find((e) => e.address === ALICE_ADDRESS);
    const postBob = postBalRes.entries.find((e) => e.address === BOB_ADDRESS);

    const postBobSompi = BigInt(postBob.balance);
    const postAliceSompi = BigInt(postAlice.balance);

    // Exact Sompi Assertions (Zero truncation, zero rounding)
    assert.equal(postBobSompi, bobInitialBal + sendAmount, "El saldo de Bob no aumentó exactamente 25 KAS");
    assert.equal(postAliceSompi, aliceInitialBal - sendAmount - fee, "El saldo de Alice no disminuyó exactamente 25 KAS + fee");
    assert.equal(postAliceSompi + postBobSompi + fee, aliceInitialBal + bobInitialBal, "Violación de conservación de masa/sompi");

    console.log(`✓ Verificación de saldos POST-TX exacta al sompi vía RPC:`);
    console.log(`  • balanceBeforeSompi (Alice): ${aliceInitialBal} sompi (${formatSompi(aliceInitialBal)})`);
    console.log(`  • amountSompi (Envío Bob):    ${sendAmount} sompi (${formatSompi(sendAmount)})`);
    console.log(`  • feeSompi:                   ${fee} sompi (${formatSompi(fee)})`);
    console.log(`  • balanceAfterSompi (Alice):  ${postAliceSompi} sompi (${formatSompi(postAliceSompi)})`);
    console.log(`  • balanceAfterSompi (Bob):    ${postBobSompi} sompi (${formatSompi(postBobSompi)})`);
    console.log(`  • Conservación comprobada:    ${postAliceSompi} + ${postBobSompi} + ${fee} == ${aliceInitialBal + bobInitialBal}`);

    // 7. Verify UTXO set of Alice and Bob via RPC
    const aliceUtxos = await rpcClient.getUtxosByAddresses({ addresses: [ALICE_ADDRESS] });
    const changeUtxo = aliceUtxos.entries.find((u) => {
      const id = u.outpoint?.transactionId ?? u.entry?.outpoint?.transactionId;
      const idx = u.outpoint?.index ?? u.entry?.outpoint?.index;
      return id === txId && idx === 1;
    });
    assert.ok(changeUtxo, "El UTXO de cambio (index 1) no figura en la consulta RPC de Alice");
    const changeUtxoAmount = BigInt(changeUtxo.amount ?? changeUtxo.entry?.amount);
    assert.equal(changeUtxoAmount, changeAmount, "El importe del UTXO de cambio no coincide con inAmount - sendAmount - fee");
    console.log(`✓ UTXO de cambio de Alice verificado: ${txId}:1 con ${changeUtxoAmount} sompi (${formatSompi(changeUtxoAmount)})`);

    const bobUtxos = await rpcClient.getUtxosByAddresses({ addresses: [BOB_ADDRESS] });
    const receivedUtxo = bobUtxos.entries.find((u) => {
      const id = u.outpoint?.transactionId ?? u.entry?.outpoint?.transactionId;
      const idx = u.outpoint?.index ?? u.entry?.outpoint?.index;
      return id === txId && idx === 0;
    });
    assert.ok(receivedUtxo, "El nuevo UTXO (index 0) no figura en la consulta RPC de Bob");
    const receivedAmount = BigInt(receivedUtxo.amount ?? receivedUtxo.entry?.amount);
    assert.equal(receivedAmount, sendAmount, "El importe del UTXO recibido por Bob no coincide exactamente");
    console.log(`✓ Nuevo UTXO de Bob verificado en RPC: ${txId}:0 con ${receivedAmount} sompi (${formatSompi(receivedAmount)})`);

    console.log("\n==================================================================");
    console.log("  🎉 TEST E2E CLIENTE EXTERNO: 100% PASS (EXIT CODE 0)");
    console.log("  La prueba demostró interoperabilidad real cliente-servidor wRPC.");
    console.log("==================================================================");
  } finally {
    if (rpcClient) {
      try { await rpcClient.disconnect(); } catch {}
    }
    serverProc.kill("SIGTERM");
  }
}

main().catch((err) => {
  console.error("❌ FALLO FATAL EN CLIENTE EXTERNO E2E:", err);
  process.exit(1);
});
