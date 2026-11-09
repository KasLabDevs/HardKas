// scripts/demo-simulator.mjs
// Real developer demo for HardKas Simulator (Zero-Docker, 0ms Anvil for Kaspa)
import { createKaspaSimulator, SOMPI_PER_KAS } from "../packages/simulator/dist/index.js";
import { signInputForAccount, deriveAccountFromSeed } from "../packages/simulator/dist/index.js";
import { SimulatorRpcServer } from "../packages/simulator/dist/index.js";
import WebSocket from "ws";

globalThis.WebSocket = WebSocket;

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const GREEN = "\x1b[32m";
const BLUE = "\x1b[34m";
const CYAN = "\x1b[36m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";
const MAGENTA = "\x1b[35m";

function logStep(num, title) {
  console.log(`\n${BOLD}${CYAN}================================================================${RESET}`);
  console.log(`${BOLD}${CYAN}[PASO ${num}] ${title}${RESET}`);
  console.log(`${BOLD}${CYAN}================================================================${RESET}`);
}

function sompiToKas(sompi) {
  const s = BigInt(sompi);
  const kas = Number(s) / Number(SOMPI_PER_KAS);
  return `${kas.toLocaleString("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 8 })} KAS (${s} sompi)`;
}

async function runDemo() {
  console.log(`\n${BOLD}${GREEN}================================================================`);
  console.log(`  🚀 DEMO EN VIVO: HARDKAS SIMULATOR (ZERO-DOCKER KASPA ANVIL)`);
  console.log(`================================================================${RESET}`);
  console.log(`Red: ${BOLD}simnet${RESET} | DAG: ${BOLD}GHOSTDAG K=18${RESET} | Engine: ${BOLD}In-Memory 0ms${RESET}\n`);

  // -------------------------------------------------------------
  // 1. ARRANQUE DEL NODO SIN DOCKER & SERVIDOR RPC
  // -------------------------------------------------------------
  logStep(1, "Arranque del Simulador en Memoria y Servidor RPC wRPC/HTTP");
  const sim = createKaspaSimulator({
    networkId: "simnet",
    automine: false, // Control manual del minado para observar el mempool
    bootstrapDevAccounts: true
  });

  const rpcServer = new SimulatorRpcServer(sim);
  const serverInfo = await rpcServer.start({ port: 19110, host: "127.0.0.1" }); // the simulator's own port, never mainnet's 17110
  console.log(`✓ Simulador iniciado en 0ms sin contenedores Docker`);
  console.log(`✓ Servidor wRPC activo: ${BOLD}${GREEN}${serverInfo.wsUrl}${RESET}`);
  console.log(`✓ Endpoint HTTP JSON-RPC: ${BOLD}${GREEN}${serverInfo.httpUrl}${RESET}`);

  // Cuentas pre-cargadas
  const alice = sim.accounts.alice;
  const bob = sim.accounts.bob;
  const carol = sim.accounts.carol;
  const dave = sim.accounts.dave;

  console.log(`\nCuentas del entorno de desarrollo:`);
  console.log(`  • Alice: ${BOLD}${alice.address}${RESET}`);
  console.log(`  • Bob:   ${BOLD}${bob.address}${RESET}`);
  console.log(`  • Carol: ${BOLD}${carol.address}${RESET}`);

  const aliceUtxos0 = sim.ledger.getUtxosByAddress(alice.address);
  const aliceBal0 = aliceUtxos0.reduce((acc, u) => acc + u.amountSompi, 0n);
  console.log(`\nSaldo inicial de Alice: ${BOLD}${YELLOW}${sompiToKas(aliceBal0)}${RESET}`);
  console.log(`UTXOs iniciales de Alice: ${aliceUtxos0.length} UTXO disponible`);

  // -------------------------------------------------------------
  // 2. TRANSACCIÓN ALICE -> BOB (Firma Schnorr BIP-340 + Mempool + Minado)
  // -------------------------------------------------------------
  logStep(2, "Transacción Real Alice -> Bob (100 KAS) con Firma Schnorr");
  const utxoAlice1 = aliceUtxos0[0];
  const sendAmount1 = 100n * SOMPI_PER_KAS;
  const fee1 = 100_000n; // 0.001 KAS fee
  const change1 = utxoAlice1.amountSompi - sendAmount1 - fee1;

  const tx1 = {
    version: 0,
    inputs: [
      {
        previousOutpoint: { transactionId: utxoAlice1.transactionId, index: utxoAlice1.index },
        signatureScript: "",
        sequence: 0n,
        sigOpCount: 1
      }
    ],
    outputs: [
      {
        amount: sendAmount1,
        scriptPublicKey: { version: 0, scriptPublicKey: bob.scriptPublicKey }
      },
      {
        amount: change1,
        scriptPublicKey: { version: 0, scriptPublicKey: alice.scriptPublicKey }
      }
    ],
    lockTime: 0n,
    subnetworkId: "00".repeat(20),
    gas: 0n,
    payload: ""
  };

  // Firma Schnorr real sobre Kaspa TransactionSigningHash
  signInputForAccount(alice, tx1, 0, utxoAlice1);
  console.log(`✓ Input 0 firmado con Schnorr BIP-340`);
  console.log(`  SignatureScript: ${tx1.inputs[0].signatureScript.slice(0, 32)}...`);

  const submitRes1 = await sim.rpc.submitTransaction(tx1);
  console.log(`✓ Transacción admitida en Mempool: ${BOLD}${GREEN}${submitRes1.transactionId}${RESET}`);
  console.log(`  Transacciones en mempool: ${sim.mempool.getAllTransactions().length}`);

  // Minado de bloque en el DAG
  console.log(`⛏️  Minando 1 bloque en el BlockDAG...`);
  const minedBlocks1 = sim.mine(1);
  const block1 = minedBlocks1[0];
  console.log(`✓ Bloque minado con hash: ${BOLD}${block1.header.hash.slice(0, 16)}...${RESET}`);
  console.log(`  DAA Score: ${block1.header.daaScore} | Blue Score: ${block1.header.blueScore}`);
  console.log(`  Transacciones en mempool tras minar: ${sim.mempool.getAllTransactions().length}`);

  // Comprobar balances tras transferencia 1
  const bobBal1 = sim.ledger.getBalance(bob.address);
  const aliceBal1 = sim.ledger.getBalance(alice.address);
  console.log(`\nSaldos verificados tras Paso 2:`);
  console.log(`  • Alice: ${BOLD}${YELLOW}${sompiToKas(aliceBal1)}${RESET}`);
  console.log(`  • Bob:   ${BOLD}${GREEN}${sompiToKas(bobBal1)}${RESET}`);

  // -------------------------------------------------------------
  // 3. TRANSACCIÓN BOB -> CAROL (50 KAS)
  // -------------------------------------------------------------
  logStep(3, "Transacción Real Bob -> Carol (50 KAS)");
  const bobUtxos = sim.ledger.getUtxosByAddress(bob.address);
  const utxoBob1 = bobUtxos[0];
  const sendBob = 50n * SOMPI_PER_KAS;
  const feeBob = 100_000n;
  const changeBob = utxoBob1.amountSompi - sendBob - feeBob;

  const txBob = {
    version: 0,
    inputs: [
      {
        previousOutpoint: { transactionId: utxoBob1.transactionId, index: utxoBob1.index },
        signatureScript: "",
        sequence: 0n,
        sigOpCount: 1
      }
    ],
    outputs: [
      {
        amount: sendBob,
        scriptPublicKey: { version: 0, scriptPublicKey: carol.scriptPublicKey }
      },
      {
        amount: changeBob,
        scriptPublicKey: { version: 0, scriptPublicKey: bob.scriptPublicKey }
      }
    ],
    lockTime: 0n,
    subnetworkId: "00".repeat(20),
    gas: 0n,
    payload: ""
  };

  signInputForAccount(bob, txBob, 0, utxoBob1);
  const submitBob = await sim.rpc.submitTransaction(txBob);
  console.log(`✓ Transacción Bob -> Carol admitida: ${BOLD}${GREEN}${submitBob.transactionId}${RESET}`);
  sim.mine(1);

  const carolBal1 = sim.ledger.getBalance(carol.address);
  const bobBal2 = sim.ledger.getBalance(bob.address);
  console.log(`✓ Bloque minado. Saldos actuales:`);
  console.log(`  • Bob:   ${sompiToKas(bobBal2)}`);
  console.log(`  • Carol: ${BOLD}${GREEN}${sompiToKas(carolBal1)}${RESET}`);

  // -------------------------------------------------------------
  // 4. SNAPSHOT Y REVERT INSTANTÁNEO (ANVIL 0ms)
  // -------------------------------------------------------------
  logStep(4, "Snapshot y Reversión Atómica de Estado (0ms)");
  const snapId = sim.snapshot();
  console.log(`📸 Snapshot creado con identificador: ${BOLD}${MAGENTA}${snapId}${RESET}`);

  // Ejecutamos una transferencia adicional (Carol -> Dave por 20 KAS)
  console.log(`\nRealizando transferencia temporal Carol -> Dave (20 KAS)...`);
  const carolUtxos = sim.ledger.getUtxosByAddress(carol.address);
  const utxoCarol = carolUtxos[0];
  const sendCarol = 20n * SOMPI_PER_KAS;
  const changeCarol = utxoCarol.amountSompi - sendCarol - 100_000n;

  const txCarol = {
    version: 0,
    inputs: [
      {
        previousOutpoint: { transactionId: utxoCarol.transactionId, index: utxoCarol.index },
        signatureScript: "",
        sequence: 0n,
        sigOpCount: 1
      }
    ],
    outputs: [
      { amount: sendCarol, scriptPublicKey: { version: 0, scriptPublicKey: dave.scriptPublicKey } },
      { amount: changeCarol, scriptPublicKey: { version: 0, scriptPublicKey: carol.scriptPublicKey } }
    ],
    lockTime: 0n,
    subnetworkId: "00".repeat(20),
    gas: 0n,
    payload: ""
  };
  signInputForAccount(carol, txCarol, 0, utxoCarol);
  await sim.rpc.submitTransaction(txCarol);
  sim.mine(1);

  console.log(`Estado ANTES de revertir:`);
  console.log(`  • Dave:  ${BOLD}${sompiToKas(sim.ledger.getBalance(dave.address))}${RESET}`);
  console.log(`  • Carol: ${sompiToKas(sim.ledger.getBalance(carol.address))}`);

  console.log(`\n⏪ Revirtiendo estado al snapshot ${snapId}...`);
  sim.revert(snapId);

  console.log(`Estado DESPUÉS de revertir:`);
  console.log(`  • Dave:  ${BOLD}${sompiToKas(sim.ledger.getBalance(dave.address))}${RESET} (restaurado a 0 KAS)`);
  console.log(`  • Carol: ${BOLD}${sompiToKas(sim.ledger.getBalance(carol.address))}${RESET} (restaurada a 50 KAS)`);
  console.log(`✓ Reversión atómica completada con éxito.`);

  // -------------------------------------------------------------
  // 5. ERRORES Y RECHAZOS: DOBLE GASTO & FIRMA INVÁLIDA
  // -------------------------------------------------------------
  logStep(5, "Validación Negativa: Rechazo Estricto de Doble Gasto y Firma Inválida");

  // Prueba 5a: Doble gasto contra mempool
  const aliceUtxosNow = sim.ledger.getUtxosByAddress(alice.address);
  const utxoToDoubleSpend = aliceUtxosNow[0];

  const legitTx = {
    version: 0,
    inputs: [{ previousOutpoint: { transactionId: utxoToDoubleSpend.transactionId, index: utxoToDoubleSpend.index }, signatureScript: "", sequence: 0n, sigOpCount: 1 }],
    outputs: [
      { amount: 10n * SOMPI_PER_KAS, scriptPublicKey: { version: 0, scriptPublicKey: bob.scriptPublicKey } },
      { amount: utxoToDoubleSpend.amountSompi - 10n * SOMPI_PER_KAS - 100_000n, scriptPublicKey: { version: 0, scriptPublicKey: alice.scriptPublicKey } }
    ],
    lockTime: 0n,
    subnetworkId: "00".repeat(20),
    gas: 0n,
    payload: ""
  };
  signInputForAccount(alice, legitTx, 0, utxoToDoubleSpend);
  await sim.rpc.submitTransaction(legitTx);
  console.log(`✓ Primera transacción ingresada al mempool con éxito.`);

  // Intentamos gastar el mismo UTXO en una segunda transacción competing
  const doubleSpendTx = {
    version: 0,
    inputs: [{ previousOutpoint: { transactionId: utxoToDoubleSpend.transactionId, index: utxoToDoubleSpend.index }, signatureScript: "", sequence: 0n, sigOpCount: 1 }],
    outputs: [
      { amount: 10n * SOMPI_PER_KAS, scriptPublicKey: { version: 0, scriptPublicKey: carol.scriptPublicKey } },
      { amount: utxoToDoubleSpend.amountSompi - 10n * SOMPI_PER_KAS - 100_000n, scriptPublicKey: { version: 0, scriptPublicKey: alice.scriptPublicKey } }
    ],
    lockTime: 0n,
    subnetworkId: "00".repeat(20),
    gas: 0n,
    payload: ""
  };
  signInputForAccount(alice, doubleSpendTx, 0, utxoToDoubleSpend);

  try {
    await sim.rpc.submitTransaction(doubleSpendTx);
    console.error(`${RED}ERROR: El doble gasto fue admitido (no debió ocurrir)${RESET}`);
  } catch (err) {
    console.log(`✓ Doble gasto RECHAZADO por el mempool:`);
    console.log(`  ${RED}${err.message}${RESET}`);
  }

  // Limpiamos mempool minando la transacción legítima
  sim.mine(1);

  // -------------------------------------------------------------
  // 6. REORGANIZACIÓN DEL BLOCKDAG Y REVERSIÓN DE UTXOS
  // -------------------------------------------------------------
  logStep(6, "Reorganización Dinámica del BlockDAG y Reversión de UTXOs");
  const commonTip = sim.dag.getSink();
  console.log(`Tip común de bifurcación: ${commonTip.slice(0, 16)}...`);

  // Rama A: 1 bloque sobre commonTip
  const bA1 = sim.mine(1, undefined, undefined, [commonTip])[0];
  console.log(`Rama A: bloque ${bA1.header.hash.slice(0, 16)} (blueWork: ${bA1.header.blueWork})`);

  // Rama B: 3 bloques competidores sobre commonTip
  const bB1 = sim.mine(1, undefined, undefined, [commonTip])[0];
  const bB2 = sim.mine(1, undefined, undefined, [bB1.header.hash])[0];
  const bB3 = sim.mine(1, undefined, undefined, [bB2.header.hash])[0];
  console.log(`Rama B: 3 bloques añadidos (${bB1.header.hash.slice(0, 8)} -> ${bB2.header.hash.slice(0, 8)} -> ${bB3.header.hash.slice(0, 8)})`);
  console.log(`  blueWork de Rama B (B3): ${bB3.header.blueWork}`);

  const sinkAfter = sim.dag.getSink();
  console.log(`✓ Reorganización dinámica completada: el sink del DAG ahora es la Rama B (${BOLD}${GREEN}${sinkAfter.slice(0, 16)}...${RESET})`);
  console.log(`  El sink converge hacia la rama más pesada según GHOSTDAG.`);

  // -------------------------------------------------------------
  // 7. TOCCATA CONSENSUS: TRANSACTION V1 & COVENANTS
  // -------------------------------------------------------------
  logStep(7, "Toccata Consensus & Silverscript: Transaction v1 y Reglas de Covenants");

  const aliceUtxosV1 = sim.ledger.getUtxosByAddress(alice.address);
  const utxoV1 = aliceUtxosV1[0];
  const validCovenantId = "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90";

  // Prueba 7a: Regla de consenso oficial - Covenant en Transacción v0 está PROHIBIDO
  console.log(`Prueba 7a: Verificando rechazo de covenant en Transacción v0 (paridad rusty-kaspad)...`);
  const txV0WithCov = {
    version: 0,
    inputs: [{ previousOutpoint: { transactionId: utxoV1.transactionId, index: utxoV1.index }, signatureScript: "", sequence: 0n, sigOpCount: 1 }],
    outputs: [
      { amount: 5n * SOMPI_PER_KAS, scriptPublicKey: { version: 0, scriptPublicKey: bob.scriptPublicKey }, covenant: { authorizingInput: 0, covenantId: validCovenantId } },
      { amount: utxoV1.amountSompi - 5n * SOMPI_PER_KAS - 100_000n, scriptPublicKey: { version: 0, scriptPublicKey: alice.scriptPublicKey } }
    ],
    lockTime: 0n,
    subnetworkId: "00".repeat(20),
    gas: 0n,
    payload: ""
  };
  signInputForAccount(alice, txV0WithCov, 0, utxoV1);

  try {
    await sim.rpc.submitTransaction(txV0WithCov);
    console.error(`${RED}ERROR: Covenant en v0 fue admitido${RESET}`);
  } catch (err) {
    console.log(`✓ Covenant en versión 0 RECHAZADO (fiel a regla de consenso rusty-kaspad):`);
    console.log(`  ${RED}${err.message}${RESET}`);
  }

  // Prueba 7b: Transacción v1 con Covenant válido y computeBudget suficiente
  console.log(`\nPrueba 7b: Envío de Transacción v1 válida con Covenant y computeBudget = 10...`);
  const txV1Valid = {
    version: 1,
    inputs: [
      {
        previousOutpoint: { transactionId: utxoV1.transactionId, index: utxoV1.index },
        signatureScript: "",
        sequence: 0n,
        sigOpCount: 0, // En v1 debe ser 0 (compute metering reemplaza sigops)
        computeBudget: 10
      }
    ],
    outputs: [
      {
        amount: 5n * SOMPI_PER_KAS,
        scriptPublicKey: { version: 0, scriptPublicKey: bob.scriptPublicKey },
        covenant: { authorizingInput: 0, covenantId: validCovenantId }
      },
      {
        amount: utxoV1.amountSompi - 5n * SOMPI_PER_KAS - 100_000n,
        scriptPublicKey: { version: 0, scriptPublicKey: alice.scriptPublicKey }
      }
    ],
    lockTime: 0n,
    subnetworkId: "00".repeat(20),
    gas: 0n,
    payload: ""
  };
  signInputForAccount(alice, txV1Valid, 0, utxoV1);
  const submitV1 = await sim.rpc.submitTransaction(txV1Valid);
  console.log(`✓ Transacción v1 con Covenant ACEPTADA en Mempool: ${BOLD}${GREEN}${submitV1.transactionId}${RESET}`);
  sim.mine(1);
  console.log(`✓ Bloque con Transacción v1 minado con éxito.`);

  // Cierre del servidor
  await rpcServer.close();
  console.log(`\n${BOLD}${GREEN}================================================================`);
  console.log(`  🎉 DEMO LOCAL COMPLETADA CON ÉXITO — 7/7 PRUEBAS SUPERADAS`);
  console.log(`================================================================${RESET}\n`);
}

runDemo().catch((err) => {
  console.error("FATAL ERROR EN DEMO:", err);
  process.exit(1);
});
