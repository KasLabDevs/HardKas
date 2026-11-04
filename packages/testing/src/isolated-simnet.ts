// SAFETY_LEVEL: SIMULATION_ONLY
//
// @hardkas/testing — Isolated Simnet Laboratory (Fase 5).
//
// Starts an isolated rusty-kaspad v2.1.0 simnet container on a dedicated port/container
// name without ever touching `hardkas-kaspad-toccata-v2` or other lab containers.
// Provides deterministic fast block mining, account funding, coinbase maturity
// verification, and real consensus v1 covenant genesis & transition execution.

import {
  encodeSilverEntryArgs,
  getSilContract,
  loadManagedKaspaWasmSync,
  silContractBytecodeHex,
  silverP2shAddress,
  silverP2shLock,
  silverSigFromInputSignature,
  silverStateSuccessor,
  silverUnlockScript,
  verifySilverTemplate,
  type SilArtifactValue
} from "@hardkas/core";
import { JsonWrpcKaspaClient } from "@hardkas/kaspa-rpc";
import { buildCovenantGenesis, parseWasmTxToRpc } from "@hardkas/accounts";
import { calculateUpstreamStorageMass } from "@hardkas/tx-builder";
import { SimnetNodeHarness, type SimnetNodeHandle } from "./simnet-node-harness.js";
import { getHardkasFixtureKey, type HardkasFixtureName } from "./fixture-signer.js";
import type { CompiledCovenantContract, CovenantUtxoFixture } from "./covenant-testbed.js";
import type { ConsensusSimnetRpc } from "./consensus-submission.js";

/**
 * Upstream rusty-kaspad v2.1.0 simnet consensus coinbase maturity:
 * `SIMNET_PARAMS.coinbase_maturity = Bps::<10>::coinbase_maturity() = 10 * 100 = 1000` DAA
 * (`consensus/core/src/config/params.rs:742`, `bps.rs:120`, `constants.rs:91`).
 */
export const SIMNET_CONSENSUS_COINBASE_MATURITY_DAA = 1_000n;

export interface IsolatedSimnetSession {
  readonly sessionId: string;
  readonly rpcUrl: string;
  readonly containerName: string | undefined;
  readonly handle: SimnetNodeHandle;
  readonly rpc: JsonWrpcKaspaClient;
  readonly minerFixture: HardkasFixtureName;
  readonly minerAddress: string;
  readonly minerPrivateKey: string;
}

export interface StartIsolatedSimnetOptions {
  /** Optional explicit RPC port (defaults to an unused dynamic localhost port). */
  rpcPort?: number;
  /** Default fixture account used as miner/funder (default: "alice"). */
  minerFixture?: HardkasFixtureName;
  /** Startup timeout in ms (default: 90_000). */
  startupTimeoutMs?: number;
}

export interface SimnetOnChainUtxo {
  outpoint: { transactionId: string; index: number };
  amountSompi: bigint;
  scriptPublicKey: { version: number; script: string };
  blockDaaScore: bigint;
  isCoinbase: boolean;
  covenantId?: string;
}

export interface CoinbaseMaturityAuditResult {
  networkId: string;
  consensusCoinbaseMaturityDaa: bigint;
  kaspaWasmSimnetMaturityDaa: bigint;
  kaspaWasmDevnetMaturityDaa: bigint;
  coinbaseBlockDaaScore: bigint;
  immatureSpendAttemptDaaScore: bigint;
  immatureSpendRejected: boolean;
  immatureRejectReason: string;
  matureSpendDaaScore: bigint;
  matureSpendAccepted: boolean;
  matureSpendTxId?: string;
}

export interface SimnetCovenantTransitionInput {
  contract: CompiledCovenantContract;
  inputUtxo: CovenantUtxoFixture;
  policy?: string;
  entrypoint?: string;
  args: Array<
    | SilArtifactValue
    | { kind: "signer"; account: HardkasFixtureName }
    | { kind: "raw_signature"; signatureHex: string }
  >;
  nextState?: Record<string, SilArtifactValue | bigint | number | string | boolean | Uint8Array>;
  feeSompi?: bigint;
  computeBudget?: number;
  /** Optional override for successor output amount (to test value drain rejections on-chain). */
  overrideOutputAmountSompi?: bigint;
  /** Optional override for successor covenantId (to test covenant ID tampering on-chain). */
  overrideSuccessorCovenantId?: string;
  /** Mine 1 block after mempool acceptance (default: true). */
  mineBlockAfterSubmit?: boolean;
}

export interface SimnetCovenantTransitionOutcome {
  acceptedByNode: boolean;
  confirmedInDag: boolean;
  txId: string;
  rejectReason?: string;
  inputSpentOnNode: boolean;
  successorUtxo?: CovenantUtxoFixture;
  virtualDaaScoreAfter: bigint;
}

function normalizeOnChainUtxo(u: any): SimnetOnChainUtxo {
  const e = u.raw?.utxoEntry ?? u.raw?.utxo_entry ?? u.raw ?? {};
  const spk = e.scriptPublicKey ?? e.script_public_key ?? u.scriptPublicKey;
  const scriptPublicKey =
    spk && typeof spk === "object"
      ? {
          version: Number(spk.version ?? 0),
          script: String(spk.scriptPublicKey ?? spk.script ?? "").toLowerCase()
        }
      : {
          version: parseInt(String(spk ?? "0000").slice(0, 4), 16) || 0,
          script: String(spk ?? "").slice(4).toLowerCase()
        };
  const covenantId = e.covenantId ?? e.covenant_id ?? u.covenantId;
  return {
    outpoint: {
      transactionId: String(u.outpoint.transactionId).toLowerCase(),
      index: Number(u.outpoint.index)
    },
    amountSompi: BigInt(u.amountSompi),
    scriptPublicKey,
    blockDaaScore: BigInt(e.blockDaaScore ?? e.block_daa_score ?? u.blockDaaScore ?? 0),
    isCoinbase: Boolean(e.isCoinbase ?? e.is_coinbase ?? u.isCoinbase),
    ...(covenantId ? { covenantId: String(covenantId).toLowerCase() } : {})
  };
}

function toSilValue(
  raw: SilArtifactValue | bigint | number | string | boolean | Uint8Array
): SilArtifactValue {
  if (typeof raw === "object" && raw !== null && "kind" in raw) {
    return raw as SilArtifactValue;
  }
  if (typeof raw === "bigint" || typeof raw === "number") {
    return { kind: "int", value: BigInt(raw) };
  }
  if (typeof raw === "boolean") {
    return { kind: "bool", value: raw };
  }
  if (raw instanceof Uint8Array) {
    return { kind: "bytes", value: raw };
  }
  if (typeof raw === "string") {
    const clean = raw.startsWith("0x") ? raw.slice(2) : raw;
    return { kind: "bytes", value: Buffer.from(clean, "hex") };
  }
  throw new Error(`Unsupported SilverScript value: ${String(raw)}`);
}

function resolveFixtureAccount(
  fixtureName: HardkasFixtureName | string
): { privateKeyHex: string; address: string; xOnlyPublicKey: string } {
  const k = loadManagedKaspaWasmSync();
  const privateKeyHex = getHardkasFixtureKey(fixtureName);
  const priv = new k.PrivateKey(privateKeyHex);
  const address = String(priv.toPublicKey().toAddress("simnet").toString());
  const xOnlyPublicKey = String(
    priv.toPublicKey().toXOnlyPublicKey().toString()
  ).toLowerCase();
  return { privateKeyHex, address, xOnlyPublicKey };
}

/**
 * Starts an isolated `rusty-kaspad` v2.1.0 simnet node in Docker with `--utxoindex`.
 * Never touches `hardkas-kaspad-toccata-v2` or any container not created by this session.
 */
export async function startIsolatedSimnet(
  options: StartIsolatedSimnetOptions = {}
): Promise<IsolatedSimnetSession> {
  const minerFixture = options.minerFixture ?? "alice";
  const minerKey = resolveFixtureAccount(minerFixture);
  const handle = await SimnetNodeHarness.start({
    ...(options.rpcPort !== undefined ? { rpcPort: options.rpcPort } : {}),
    utxoIndex: true,
    startupTimeoutMs: options.startupTimeoutMs ?? 90_000
  });
  await handle.waitUntilReady({ timeoutMs: options.startupTimeoutMs ?? 90_000 });
  const rpc = new JsonWrpcKaspaClient({ rpcUrl: handle.rpcUrl });
  return {
    sessionId: handle.containerName ?? `simnet-${Date.now()}`,
    rpcUrl: handle.rpcUrl,
    containerName: handle.containerName,
    handle,
    rpc,
    minerFixture,
    minerAddress: minerKey.address,
    minerPrivateKey: minerKey.privateKeyHex
  };
}

/**
 * The session's node as the covenant testbed's `simnetRpc` (CONSENSUS_SIMNET): submissions carry the expected txid, the
 * mempool and the UTXO index are read from the node, and one block is mined after each submission.
 */
export function testbedSimnetRpc(session: IsolatedSimnetSession): ConsensusSimnetRpc {
  return {
    submitTransaction: (tx, options) => session.rpc.submitTransaction(tx, options),
    getUtxosByAddress: (address) => session.rpc.getUtxosByAddress(address),
    getMempoolEntry: (txId) => session.rpc.getMempoolEntry(txId),
    mineBlocks: (count, address) => mineBlocks(session, count, address)
  };
}

/**
 * Stops and removes only the isolated simnet container started for `session`.
 */
export async function stopIsolatedSimnet(session: IsolatedSimnetSession): Promise<void> {
  try {
    await session.rpc.close();
  } catch {
    // ignore close errors
  }
  await session.handle.kill();
}

/**
 * Mines `count` blocks deterministically on the isolated simnet node using
 * `getBlockTemplateRequest` + `submitBlockRequest` over wRPC, and verifies
 * `virtualDaaScore` advances by at least `count`.
 */
export async function mineBlocks(
  session: IsolatedSimnetSession,
  count: number,
  payAddress?: string
): Promise<{ daaBefore: bigint; daaAfter: bigint; blocksMined: number }> {
  if (count <= 0) {
    const info = (await session.rpc.getBlockDagInfo()) as any;
    const daa = BigInt(info.virtualDaaScore ?? 0);
    return { daaBefore: daa, daaAfter: daa, blocksMined: 0 };
  }
  const targetAddress = payAddress ?? session.minerAddress;
  const infoBefore = (await session.rpc.getBlockDagInfo()) as any;
  const daaBefore = BigInt(infoBefore.virtualDaaScore ?? 0);

  for (let i = 0; i < count; i++) {
    const templateRes = (await session.rpc.call("getBlockTemplateRequest", {
      payAddress: targetAddress,
      extraData: []
    })) as any;
    const blockMessage = templateRes.blockMessage || templateRes.block;
    const submitRes = (await session.rpc.call("submitBlockRequest", {
      block: blockMessage,
      allowNonDAABlocks: false
    })) as any;
    if (submitRes?.rejectReason) {
      throw new Error(`SIMNET_BLOCK_REJECTED at block ${i + 1}/${count}: ${submitRes.rejectReason}`);
    }
  }

  const targetDaa = daaBefore + BigInt(count);
  const daaAfter = await waitForDaaScore(session, targetDaa, 15_000);
  return {
    daaBefore,
    daaAfter,
    blocksMined: count
  };
}

/**
 * Polls `getBlockDagInfo` until `virtualDaaScore >= targetDaaScore`.
 */
export async function waitForDaaScore(
  session: IsolatedSimnetSession,
  targetDaaScore: bigint,
  timeoutMs = 15_000
): Promise<bigint> {
  const deadline = Date.now() + timeoutMs;
  let lastDaa = 0n;
  while (Date.now() < deadline) {
    const info = (await session.rpc.getBlockDagInfo()) as any;
    lastDaa = BigInt(info.virtualDaaScore ?? 0);
    if (lastDaa >= targetDaaScore) {
      return lastDaa;
    }
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error(
    `SIMNET_DAA_TIMEOUT: virtualDaaScore reached ${lastDaa}, expected >= ${targetDaaScore} within ${timeoutMs}ms`
  );
}

/**
 * Waits for a specific outpoint (`txId:index`) to appear in `getUtxosByAddress(address)`.
 */
export async function waitForUtxo(
  session: IsolatedSimnetSession,
  address: string,
  outpoint: { transactionId: string; index: number },
  timeoutMs = 15_000
): Promise<SimnetOnChainUtxo> {
  const deadline = Date.now() + timeoutMs;
  const expectedTxId = outpoint.transactionId.toLowerCase();
  while (Date.now() < deadline) {
    const rawList = await session.rpc.getUtxosByAddress(address);
    const match = rawList
      .map(normalizeOnChainUtxo)
      .find(
        (u: SimnetOnChainUtxo) =>
          u.outpoint.transactionId === expectedTxId && u.outpoint.index === outpoint.index
      );
    if (match) return match;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(
    `SIMNET_UTXO_TIMEOUT: outpoint ${expectedTxId}:${outpoint.index} not found at ${address} within ${timeoutMs}ms`
  );
}

/**
 * Waits for any output created by `txId` at `address` to be indexed by the node.
 */
export async function waitForTransaction(
  session: IsolatedSimnetSession,
  address: string,
  txId: string,
  timeoutMs = 15_000
): Promise<SimnetOnChainUtxo[]> {
  const deadline = Date.now() + timeoutMs;
  const expectedTxId = txId.toLowerCase();
  while (Date.now() < deadline) {
    const rawList = await session.rpc.getUtxosByAddress(address);
    const matches = rawList
      .map(normalizeOnChainUtxo)
      .filter((u: SimnetOnChainUtxo) => u.outpoint.transactionId === expectedTxId);
    if (matches.length > 0) return matches;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(
    `SIMNET_TX_TIMEOUT: transaction ${expectedTxId} outputs not found at ${address} within ${timeoutMs}ms`
  );
}

/**
 * Ensures `recipient` (a fixture name or `kaspasim:` address) holds at least one
 * mature, spendable non-covenant UTXO with `>= minAmountSompi`.
 */
export async function fundTestAccount(
  session: IsolatedSimnetSession,
  recipient: HardkasFixtureName | string = "alice",
  minAmountSompi: bigint = 1_000_000_000n
): Promise<SimnetOnChainUtxo> {
  const address = recipient.startsWith("kaspasim:")
    ? recipient
    : resolveFixtureAccount(recipient).address;

  const findMature = async (): Promise<SimnetOnChainUtxo | undefined> => {
    const info = (await session.rpc.getBlockDagInfo()) as any;
    const virtualDaa = BigInt(info.virtualDaaScore ?? 0);
    const utxos = (await session.rpc.getUtxosByAddress(address)).map(normalizeOnChainUtxo);
    return utxos.find((u: SimnetOnChainUtxo) => {
      if (u.covenantId) return false;
      if (u.amountSompi < minAmountSompi) return false;
      if (u.isCoinbase) {
        return virtualDaa >= u.blockDaaScore + SIMNET_CONSENSUS_COINBASE_MATURITY_DAA;
      }
      return true;
    });
  };

  const existing = await findMature();
  if (existing) return existing;

  // Mine 5 blocks to the target address, then advance DAA by 1000 so the coinbase UTXOs mature.
  await mineBlocks(session, 5, address);
  await mineBlocks(session, Number(SIMNET_CONSENSUS_COINBASE_MATURITY_DAA), session.minerAddress);

  const matured = await findMature();
  if (!matured) {
    throw new Error(`SIMNET_FUNDING_FAILED: no mature UTXO >= ${minAmountSompi} found for ${address}`);
  }
  return matured;
}

/**
 * Verifies the exact coinbase maturity rule on the live `rusty-kaspad` v2.1.0 simnet node:
 * 1. Mines a fresh coinbase UTXO at `blockDaaScore = D0`.
 * 2. Advances DAA by 100 (`D0 + 100`, which would pass `devnet`'s 100 DAA rule) and proves
 *    `rusty-kaspad` rejects spending the coinbase UTXO (`ImmatureCoinbaseSpend`).
 * 3. Advances DAA to `D0 + 1000` (`SIMNET_PARAMS.coinbase_maturity = 1000`) and proves
 *    `rusty-kaspad` accepts the spend into the mempool and confirms it in the DAG.
 */
export async function inspectCoinbaseMaturity(
  session: IsolatedSimnetSession
): Promise<CoinbaseMaturityAuditResult> {
  const k = loadManagedKaspaWasmSync();
  const simnetParams = k.getNetworkParams("simnet");
  const devnetParams = k.getNetworkParams("devnet");
  const kaspaWasmSimnetMaturityDaa = BigInt(simnetParams.coinbaseTransactionMaturityPeriodDaa);
  const kaspaWasmDevnetMaturityDaa = BigInt(devnetParams.coinbaseTransactionMaturityPeriodDaa);

  const probeSigner = resolveFixtureAccount("erin");
  const recipientSigner = resolveFixtureAccount("dave");

  // Mine 3 blocks to erin so at least the first coinbase UTXO is merged and indexed in UTXO set
  await mineBlocks(session, 3, probeSigner.address);
  const eveUtxos = (await session.rpc.getUtxosByAddress(probeSigner.address)).map(normalizeOnChainUtxo);
  const coinbaseUtxo = eveUtxos.sort(
    (a: SimnetOnChainUtxo, b: SimnetOnChainUtxo) => (a.blockDaaScore > b.blockDaaScore ? -1 : 1)
  )[0];
  if (!coinbaseUtxo) {
    throw new Error("Failed to locate freshly mined coinbase UTXO for maturity audit");
  }

  // Advance by 105 DAA (past devnet's 100 DAA, but below simnet's 1000 DAA)
  const after105 = await mineBlocks(session, 105, session.minerAddress);

  // Build a signed v0 P2PK spend of the coinbase UTXO (with 200_000 sompi fee to cover standard compute mass)
  const key = new k.PrivateKey(probeSigner.privateKeyHex);
  const sendValue = coinbaseUtxo.amountSompi - 200_000n;
  const makeSpendTx = (sigScript = "") => {
    const tx = new k.Transaction({
      version: 0,
      inputs: [
        {
          previousOutpoint: coinbaseUtxo.outpoint,
          signatureScript: sigScript,
          sequence: 0n,
          sigOpCount: 1,
          utxo: {
            outpoint: coinbaseUtxo.outpoint,
            amount: coinbaseUtxo.amountSompi,
            scriptPublicKey: new k.ScriptPublicKey(
              coinbaseUtxo.scriptPublicKey.version,
              coinbaseUtxo.scriptPublicKey.script
            ),
            blockDaaScore: coinbaseUtxo.blockDaaScore,
            isCoinbase: true
          }
        }
      ],
      outputs: [
        {
          value: sendValue,
          scriptPublicKey: k.payToAddressScript(new k.Address(recipientSigner.address))
        }
      ],
      lockTime: 0n,
      subnetworkId: "0000000000000000000000000000000000000000",
      gas: 0n,
      payload: ""
    });
    tx.storageMass = calculateUpstreamStorageMass([coinbaseUtxo.amountSompi], [sendValue], "simnet");
    tx.finalize();
    return tx;
  };

  const unsignedTx = makeSpendTx();
  const sig = String(k.createInputSignature(unsignedTx, 0, key, k.SighashType.All));
  const signedTx = makeSpendTx(sig);
  const rpcTx = parseWasmTxToRpc(signedTx.serializeToObject());

  let immatureSpendRejected = false;
  let immatureRejectReason = "";
  try {
    const res = await session.rpc.submitTransaction(rpcTx, { allowOrphan: false });
    if (res.accepted === false) {
      immatureSpendRejected = true;
      immatureRejectReason = (res as any).error ?? "rejected";
    }
  } catch (err: any) {
    immatureSpendRejected = true;
    immatureRejectReason = err?.message ?? String(err);
  }

  // Now mine remaining 900 blocks so virtualDaaScore >= coinbaseBlockDaaScore + 1000
  const afterMature = await mineBlocks(session, 900, session.minerAddress);
  const submitMature = await session.rpc.submitTransaction(rpcTx, { allowOrphan: false });
  const matureSpendAccepted = submitMature.accepted === true;
  if (matureSpendAccepted) {
    await mineBlocks(session, 1, session.minerAddress);
  }

  return {
    networkId: "simnet",
    consensusCoinbaseMaturityDaa: SIMNET_CONSENSUS_COINBASE_MATURITY_DAA,
    kaspaWasmSimnetMaturityDaa,
    kaspaWasmDevnetMaturityDaa,
    coinbaseBlockDaaScore: coinbaseUtxo.blockDaaScore,
    immatureSpendAttemptDaaScore: after105.daaAfter,
    immatureSpendRejected,
    immatureRejectReason,
    matureSpendDaaScore: afterMature.daaAfter,
    matureSpendAccepted,
    ...(submitMature.transactionId ? { matureSpendTxId: submitMature.transactionId } : {})
  };
}

/**
 * Funds and confirms a v1 covenant genesis UTXO on the isolated simnet node,
 * verifying that the node's indexed `covenantId` matches the SDK-computed genesis covenant ID.
 */
export async function createFundedCovenant(
  session: IsolatedSimnetSession,
  options: {
    contract: CompiledCovenantContract;
    funderFixture?: HardkasFixtureName;
    valueSompi?: bigint;
    initialState?: Record<string, SilArtifactValue | bigint | number | string | boolean | Uint8Array>;
    fundingComputeBudget?: number;
    feeSompi?: bigint;
  }
): Promise<CovenantUtxoFixture> {
  const funderName = options.funderFixture ?? session.minerFixture;
  const funderKey = resolveFixtureAccount(funderName);
  const valueSompi = options.valueSompi ?? 1_000_000_000n; // 10 KAS default (keeps storage mass low)
  const feeSompi = options.feeSompi ?? 1_000_000n;
  const fundingComputeBudget = options.fundingComputeBudget ?? 10;

  const fundingUtxo = await fundTestAccount(
    session,
    funderName,
    valueSompi + feeSompi + 10_000_000n
  );

  // If custom initialState is requested, materialize it into a clone of the artifact
  let genesisArtifact = options.contract.artifact;
  let resolvedState = options.contract.initialState;
  const { contract: baseSilContract } = getSilContract(
    options.contract.artifact,
    options.contract.contractName
  );
  const hasState = baseSilContract.compiled.state_span.len > 0;
  if (options.initialState) {
    const silState: Record<string, SilArtifactValue> = {};
    for (const [k, v] of Object.entries(options.initialState)) {
      silState[k] = toSilValue(v);
    }
    const { bytecodeHex } = silverStateSuccessor(
      options.contract.artifact,
      options.contract.contractName,
      silState
    );
    genesisArtifact = JSON.parse(JSON.stringify(options.contract.artifact));
    const { contract } = getSilContract(genesisArtifact, options.contract.contractName);
    (contract.compiled as any).bytecode = [
      ...Buffer.from(bytecodeHex, "hex")
    ];
    resolvedState = silState;
  } else if (!resolvedState && hasState) {
    resolvedState = verifySilverTemplate(
      options.contract.artifact,
      options.contract.contractName
    ).state;
  }

  const genesis = buildCovenantGenesis({
    artifact: genesisArtifact,
    contractName: options.contract.contractName,
    valueSompi,
    funding: [
      {
        ...fundingUtxo,
        privateKey: funderKey.privateKeyHex,
        computeBudget: fundingComputeBudget
      }
    ],
    changeAddress: funderKey.address,
    networkId: "simnet",
    feeSompi
  });

  const submitRes = await session.rpc.submitTransaction(genesis.rpcTransaction, {
    allowOrphan: false,
    expectedTxId: genesis.txId
  });
  if (!submitRes.accepted) {
    throw new Error(
      `SIMNET_GENESIS_REJECTED: ${(submitRes as any).error ?? "node rejected covenant genesis"}`
    );
  }

  await mineBlocks(session, 1, session.minerAddress);
  const { contract } = getSilContract(genesisArtifact, options.contract.contractName);
  const bytecodeHex = silContractBytecodeHex(contract);
  const address = silverP2shAddress(bytecodeHex, "simnet");
  const outpoint = { transactionId: genesis.txId, index: 0 };
  const confirmed = await waitForUtxo(session, address, outpoint, 15_000);

  if (!confirmed.covenantId || confirmed.covenantId !== genesis.covenantId.toLowerCase()) {
    throw new Error(
      `SIMNET_COVENANT_ID_MISMATCH: node reported ${String(confirmed.covenantId)}, SDK derived ${genesis.covenantId}`
    );
  }

  return {
    outpoint: confirmed.outpoint,
    amountSompi: confirmed.amountSompi,
    covenantId: confirmed.covenantId,
    address,
    scriptPublicKey: `${confirmed.scriptPublicKey.version.toString(16).padStart(4, "0")}${confirmed.scriptPublicKey.script}`,
    contract: options.contract,
    ...(resolvedState ? { state: resolvedState } : {}),
    blockDaaScore: confirmed.blockDaaScore,
    isCoinbase: confirmed.isCoinbase
  };
}

/**
 * Builds, signs, and submits a v1 covenant transition transaction against the live
 * isolated `rusty-kaspad` v2.1.0 simnet node, returning real consensus evidence
 * (`CONSENSUS_SIMNET`).
 */
/**
 * Funds and confirms a stateless P2SH contract UTXO on the isolated simnet node
 * (without a `covenantId`), returning a `CovenantUtxoFixture` ready for `bed.adoptLiveUtxo(...)`.
 */
export async function createFundedP2sh(
  session: IsolatedSimnetSession,
  options: {
    contract: CompiledCovenantContract;
    funderFixture?: HardkasFixtureName;
    valueSompi?: bigint;
    feeSompi?: bigint;
  }
): Promise<CovenantUtxoFixture> {
  const k = loadManagedKaspaWasmSync();
  const funderName = options.funderFixture ?? session.minerFixture;
  const funderKey = resolveFixtureAccount(funderName);
  const valueSompi = options.valueSompi ?? 1_000_000_000n;
  const feeSompi = options.feeSompi ?? 500_000n;

  const fundingUtxo = await fundTestAccount(
    session,
    funderName,
    valueSompi + feeSompi + 10_000_000n
  );

  const bytecodeHex = options.contract.facts.bytecodeHex;
  const p2shAddress = silverP2shAddress(bytecodeHex, "simnet");
  const changeSompi = fundingUtxo.amountSompi - valueSompi - feeSompi;
  const key = new k.PrivateKey(funderKey.privateKeyHex);

  const makeTx = (sigScript = "") => {
    const tx = new k.Transaction({
      version: 0,
      inputs: [
        {
          previousOutpoint: fundingUtxo.outpoint,
          signatureScript: sigScript,
          sequence: 0n,
          sigOpCount: 1,
          utxo: {
            outpoint: fundingUtxo.outpoint,
            amount: fundingUtxo.amountSompi,
            scriptPublicKey: new k.ScriptPublicKey(
              fundingUtxo.scriptPublicKey.version,
              fundingUtxo.scriptPublicKey.script
            ),
            blockDaaScore: fundingUtxo.blockDaaScore,
            isCoinbase: fundingUtxo.isCoinbase
          }
        }
      ],
      outputs: [
        {
          value: valueSompi,
          scriptPublicKey: k.payToAddressScript(new k.Address(p2shAddress))
        },
        ...(changeSompi > 0n
          ? [
              {
                value: changeSompi,
                scriptPublicKey: k.payToAddressScript(new k.Address(funderKey.address))
              }
            ]
          : [])
      ],
      lockTime: 0n,
      subnetworkId: "0000000000000000000000000000000000000000",
      gas: 0n,
      payload: ""
    });
    tx.storageMass = calculateUpstreamStorageMass(
      [fundingUtxo.amountSompi],
      changeSompi > 0n ? [valueSompi, changeSompi] : [valueSompi],
      "simnet"
    );
    tx.finalize();
    return tx;
  };

  const unsignedTx = makeTx();
  const sig = String(k.createInputSignature(unsignedTx, 0, key, k.SighashType.All));
  const signedTx = makeTx(sig);
  const txId = String(signedTx.id).toLowerCase();
  const rpcTx = parseWasmTxToRpc(signedTx.serializeToObject());

  const submitRes = await session.rpc.submitTransaction(rpcTx, {
    allowOrphan: false,
    expectedTxId: txId
  });
  if (!submitRes.accepted) {
    throw new Error(
      `SIMNET_P2SH_FUNDING_REJECTED: ${(submitRes as any).error ?? "node rejected P2SH funding tx"}`
    );
  }

  await mineBlocks(session, 1, session.minerAddress);
  const confirmed = await waitForUtxo(session, p2shAddress, { transactionId: txId, index: 0 }, 15_000);

  return {
    outpoint: confirmed.outpoint,
    amountSompi: confirmed.amountSompi,
    address: p2shAddress,
    scriptPublicKey: `${confirmed.scriptPublicKey.version.toString(16).padStart(4, "0")}${confirmed.scriptPublicKey.script}`,
    contract: options.contract,
    blockDaaScore: confirmed.blockDaaScore,
    isCoinbase: confirmed.isCoinbase
  };
}

export async function executeSimnetCovenantTransition(
  session: IsolatedSimnetSession,
  input: SimnetCovenantTransitionInput
): Promise<SimnetCovenantTransitionOutcome> {
  const k = loadManagedKaspaWasmSync();
  const { name, contract } = getSilContract(
    input.contract.artifact,
    input.contract.contractName
  );
  const entryName =
    input.entrypoint ??
    (input.policy ? contract.cov_decl_to_abi?.[input.policy] : undefined) ??
    input.policy;
  if (!entryName || !contract.entries[entryName]) {
    throw new Error(
      `Unknown entrypoint/policy "${String(input.policy ?? input.entrypoint)}" on ${name}`
    );
  }

  const feeSompi = input.feeSompi ?? 500_000n;
  const computeBudget = input.computeBudget ?? 20;
  const outputValue =
    input.overrideOutputAmountSompi ?? input.inputUtxo.amountSompi - feeSompi;
  const successorCovenantId = (
    input.overrideSuccessorCovenantId ??
    input.inputUtxo.covenantId ??
    ""
  ).toLowerCase();

  // Compute input and successor bytecode/locks
  const currentState = input.inputUtxo.state ?? input.contract.initialState;
  const inputBytecodeHex = currentState
    ? silverStateSuccessor(input.contract.artifact, name, currentState).bytecodeHex
    : silContractBytecodeHex(contract);
  const inputLock = silverP2shLock(inputBytecodeHex);

  let nextSilState: Record<string, SilArtifactValue> | undefined;
  let successorBytecodeHex = inputBytecodeHex;
  if (input.nextState) {
    nextSilState = {};
    for (const [kField, vVal] of Object.entries(input.nextState)) {
      nextSilState[kField] = toSilValue(vVal);
    }
    successorBytecodeHex = silverStateSuccessor(
      input.contract.artifact,
      name,
      nextSilState
    ).bytecodeHex;
  }
  const successorLock = silverP2shLock(successorBytecodeHex);
  const successorAddress = silverP2shAddress(successorBytecodeHex, "simnet");

  const makeTx = (signatureScriptHex = "") => {
    const tx = new k.Transaction({
      version: 1,
      inputs: [
        {
          previousOutpoint: input.inputUtxo.outpoint,
          signatureScript: signatureScriptHex,
          sequence: 0n,
          sigOpCount: 0,
          computeBudget,
          utxo: {
            outpoint: input.inputUtxo.outpoint,
            amount: input.inputUtxo.amountSompi,
            scriptPublicKey: new k.ScriptPublicKey(inputLock.version, inputLock.script),
            blockDaaScore: input.inputUtxo.blockDaaScore,
            isCoinbase: input.inputUtxo.isCoinbase,
            covenantId: input.inputUtxo.covenantId,
            covenant_id: input.inputUtxo.covenantId
          }
        }
      ],
      outputs: [
        {
          value: outputValue,
          scriptPublicKey: new k.ScriptPublicKey(
            successorLock.version,
            successorLock.script
          ),
          covenant: {
            authorizingInput: 0,
            covenantId: successorCovenantId
          }
        }
      ],
      lockTime: 0n,
      subnetworkId: "0000000000000000000000000000000000000000",
      gas: 0n,
      payload: ""
    });
    tx.storageMass = calculateUpstreamStorageMass(
      [input.inputUtxo.amountSompi],
      [outputValue],
      "simnet"
    );
    tx.finalize();
    return tx;
  };

  const unsignedTx = makeTx("");
  const userArgs: SilArtifactValue[] = input.args.map((arg) => {
    if ("kind" in arg && arg.kind === "signer") {
      const signerKey = resolveFixtureAccount(arg.account);
      const inputSig = String(
        k.createInputSignature(
          unsignedTx,
          0,
          new k.PrivateKey(signerKey.privateKeyHex),
          k.SighashType.All
        )
      );
      return {
        kind: "bytes",
        value: silverSigFromInputSignature(inputSig)
      };
    }
    if ("kind" in arg && arg.kind === "raw_signature") {
      const cleanHex = arg.signatureHex.startsWith("0x")
        ? arg.signatureHex.slice(2)
        : arg.signatureHex;
      return {
        kind: "bytes",
        value: new Uint8Array(Buffer.from(cleanHex, "hex"))
      };
    }
    return arg as SilArtifactValue;
  });

  const entryDef = contract.entries[entryName];
  const firstParam = entryDef?.params[0];
  const hasStateStructPrefix =
    firstParam?.type.kind === "struct" && firstParam.type.name === "State";
  const hasStateArrayPrefix =
    firstParam?.type.kind === "dynamic_array" &&
    firstParam.type.item.kind === "struct" &&
    firstParam.type.item.name === "State";

  const resolvedArgs: SilArtifactValue[] = [];
  if (hasStateStructPrefix && nextSilState) {
    resolvedArgs.push({ kind: "object", value: nextSilState });
  } else if (hasStateArrayPrefix && nextSilState) {
    resolvedArgs.push({
      kind: "array",
      value: [{ kind: "object", value: nextSilState }]
    });
  }
  resolvedArgs.push(...userArgs);

  const unlockHex = silverUnlockScript(
    inputBytecodeHex,
    encodeSilverEntryArgs({
      artifact: input.contract.artifact,
      contractName: name,
      entry: entryName,
      args: resolvedArgs
    })
  );
  const signedTx = makeTx(unlockHex);
  const txId = String(signedTx.id).toLowerCase();
  const rpcTx = parseWasmTxToRpc(signedTx.serializeToObject());

  let acceptedByNode = false;
  let rejectReason: string | undefined;
  try {
    const res = await session.rpc.submitTransaction(rpcTx, {
      allowOrphan: false,
      expectedTxId: txId
    });
    acceptedByNode = res.accepted === true;
    if (!acceptedByNode) {
      rejectReason = (res as any).error ?? "rejected by rusty-kaspad";
    }
  } catch (err: any) {
    acceptedByNode = false;
    rejectReason = err?.message ?? String(err);
  }

  let confirmedInDag = false;
  let successorUtxo: CovenantUtxoFixture | undefined;

  if (acceptedByNode && input.mineBlockAfterSubmit !== false) {
    await mineBlocks(session, 1, session.minerAddress);
    const onChainSuccessor = await waitForUtxo(
      session,
      successorAddress,
      { transactionId: txId, index: 0 },
      15_000
    );
    confirmedInDag = true;
    successorUtxo = {
      outpoint: onChainSuccessor.outpoint,
      amountSompi: onChainSuccessor.amountSompi,
      covenantId: onChainSuccessor.covenantId ?? successorCovenantId,
      address: successorAddress,
      scriptPublicKey: `${onChainSuccessor.scriptPublicKey.version.toString(16).padStart(4, "0")}${onChainSuccessor.scriptPublicKey.script}`,
      contract: input.contract,
      ...(nextSilState ? { state: nextSilState } : {}),
      blockDaaScore: onChainSuccessor.blockDaaScore,
      isCoinbase: onChainSuccessor.isCoinbase
    };
  }

  // Check whether input outpoint is still unspent on the node
  const inputAddressUtxos = (
    await session.rpc.getUtxosByAddress(input.inputUtxo.address)
  ).map(normalizeOnChainUtxo);
  const inputStillUnspent = inputAddressUtxos.some(
    (u: SimnetOnChainUtxo) =>
      u.outpoint.transactionId === input.inputUtxo.outpoint.transactionId.toLowerCase() &&
      u.outpoint.index === input.inputUtxo.outpoint.index
  );
  const infoAfter = (await session.rpc.getBlockDagInfo()) as any;

  return {
    acceptedByNode,
    confirmedInDag,
    txId,
    ...(rejectReason !== undefined ? { rejectReason } : {}),
    inputSpentOnNode: !inputStillUnspent,
    ...(successorUtxo ? { successorUtxo } : {}),
    virtualDaaScoreAfter: BigInt(infoAfter.virtualDaaScore ?? 0)
  };
}
