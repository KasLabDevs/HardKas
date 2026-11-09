// In-memory Kaspa node simulator for local development (EXPERIMENTAL).
// It imitates rusty-kaspad 2.1.0's RPC and approximates its rules; it is not consensus-equivalent and never evidence of
// node behaviour. Known divergences: packages/simulator/README.md. Part of the @hardkas builder framework.

// ── Node & Factory ──────────────────────────────────────────────────────────
export { KaspaSimulatorNode, createKaspaSimulator, SOMPI_PER_KAS, scriptPublicKeyForAddress } from "./simulator-node.js";
export { CONSENSUS_BPS, CONSENSUS_COINBASE_MATURITY, CONSENSUS_GHOSTDAG_K, COINBASE_MATURITY_SECONDS } from "./params.js";

// ── Legacy Simulation Primitives ────────────────────────────────────────────
export type { TxLifecyclePhase, TxTraceEvent, SimulationResult } from "./tx-simulator.js";
export { TxSimulator, createTraceId } from "./tx-simulator.js";

// ── Types ───────────────────────────────────────────────────────────────────
export type {
  SimulatorConfig,
  DevAccount,
  SimulatorUtxo,
  Outpoint,
  ScriptPublicKey,
  TransactionInput,
  TransactionOutput,
  KaspaRpcTransaction,
  MempoolTransaction,
  BlockHeader,
  SimulatorBlock,
  BlockDagInfo,
  SimulatorSnapshot,
  NetworkId
} from "./types.js";

// ── Cryptography & Accounts ─────────────────────────────────────────────────
export {
  DEV_ACCOUNT_NAMES,
  type DevAccountName,
  deriveAccountFromSeed,
  createDefaultDevAccounts,
  getNetworkPrefix,
  p2pkScriptFromPublicKey,
  signInputForAccount
} from "./crypto/accounts.js";

export {
  encodeKaspaAddress,
  decodeKaspaAddress
} from "./crypto/bech32.js";

export {
  SIGHASH_ALL,
  SIGHASH_NONE,
  SIGHASH_SINGLE,
  SIGHASH_ANYONE_CAN_PAY,
  KaspaHasher,
  calcKaspaSchnorrSignatureHash,
  verifyKaspaInputSignature,
  signKaspaInput,
  bytesToHex,
  type KaspaSighashTransaction,
  type KaspaSighashUtxo,
  type KaspaSighashScript
} from "./crypto/kaspa-sighash.js";

// ── Script VM & Opcodes ─────────────────────────────────────────────────────
export { Op, opcodeName, UNSUPPORTED_OPCODES, DISABLED_OPCODES, ALWAYS_ILLEGAL_OPCODES } from "./script/opcodes.js";
export {
  ScriptVM,
  ScriptError,
  decodeScriptNum,
  encodeScriptNum,
  isTruthy,
  LOCK_TIME_THRESHOLD,
  SEQUENCE_LOCK_TIME_DISABLED,
  SEQUENCE_LOCK_TIME_MASK,
  MAX_STACK_SIZE,
  MAX_SCRIPT_ELEMENT_SIZE,
  type ScriptUtxoEntry,
  type ScriptExecutionContext,
  type ScriptExecutionResult
} from "./script/vm.js";
export {
  buildCovenantsContext,
  CovenantsError,
  EMPTY_COVENANTS_CONTEXT,
  type CovenantsContext,
  type CovenantTxView
} from "./script/covenants.js";

// ── UTXO Ledger ─────────────────────────────────────────────────────────────
export { UtxoLedger, DEFAULT_COINBASE_MATURITY } from "./ledger/utxo-ledger.js";
export {
  validateTransactionScripts,
  extractPublicKeyFromScriptPublicKey,
  extractAddressFromScriptPublicKey,
  extractSignatureFromSignatureScript,
  DUST_LIMIT_SOMPI,
  allowedScriptUnits,
  utxoScriptPublicKey,
  utxoCovenantId,
  MAX_SOMPI,
  type ValidateTransactionOptions,
  type ScriptValidationResult
} from "./ledger/script-engine.js";

// ── Mempool ─────────────────────────────────────────────────────────────────
export {
  Mempool,
  computeTransactionId,
  estimateTxMass,
  DEFAULT_MIN_FEE_RATE,
  DEFAULT_MAX_BLOCK_MASS,
  UNACCEPTED_DAA_SCORE
} from "./mempool/mempool.js";
export {
  measureTransactionMass,
  minimumRelayFee,
  nonContextualMasses,
  checkMassCommitment,
  DEFAULT_MINIMUM_RELAY_FEERATE,
  type MassCommitmentCheck,
  type MeasuredTransactionMass,
  type TransactionMass
} from "./mass.js";
export { transactionId, transactionIdV0, transactionHash } from "./crypto/tx-hashing.js";

// ── DAG Chain & Mining ──────────────────────────────────────────────────────
export { DagChain, DEFAULT_BLOCK_REWARD_SOMPI, assertBlockMassCommitments, type BlockUtxoDiff } from "./dag/dag-chain.js";

// ── RPC Client & Server ─────────────────────────────────────────────────────
export {
  SimulatorRpcClient,
  normalizeRpcTransaction,
  simulatorRpcError,
  SIMULATOR_SERVER_VERSION,
  SIMULATOR_EVENTS,
  type RpcUtxoEntry
} from "./rpc/simulator-rpc.js";
export {
  SimulatorRpcServer,
  sanitizeForJson,
  stringifyRpcJson,
  type SimulatorRpcServerOptions
} from "./rpc/rpc-server.js";

// ── Snapshots & Time Travel ─────────────────────────────────────────────────
export { SnapshotManager } from "./snapshots.js";

// ── GHOSTDAG Consensus Math ─────────────────────────────────────────────────
export type {
  BlockHash,
  BlueWorkType,
  GhostdagData,
  CompactGhostdagData,
  SimBlockHeader,
  SimBlock
} from "./ghostdag/ghostdag-types.js";

export {
  GENESIS_HASH,
  blockHash,
  blockParents,
  blockBlueWork,
  blockBlueScore,
  headerWork,
  compactFromFull
} from "./ghostdag/ghostdag-types.js";

export type { SortableBlock } from "./ghostdag/ordering.js";
export { compareSortableBlocks, sortBlocks, findSelectedParent } from "./ghostdag/ordering.js";
export { GhostdagStore, genesisGhostdagData } from "./ghostdag/ghostdag-store.js";
export {
  pastSet,
  isDagAncestorOf,
  unorderedMergesetWithoutSelectedParent,
  orderedMergesetWithoutSelectedParent
} from "./ghostdag/reachability.js";
export { ApproxGhostdagEngine, DEFAULT_K } from "./ghostdag/ghostdag-engine.js";
export type { DagMetrics } from "./ghostdag/metrics.js";
export { computeDagMetrics } from "./ghostdag/metrics.js";
export type { ScenarioConfig, ScenarioResult } from "./ghostdag/scenarios.js";
export {
  runLinearChain,
  runWideDag,
  runForkResolution,
  runDiamondDag,
  runAllScenarios
} from "./ghostdag/scenarios.js";
export { formatScenarioReport } from "./ghostdag/report.js";

// ── Mass Profiling ──────────────────────────────────────────────────────────
export type { MassBreakdown, MassComparison } from "./ghostdag/mass-profile.js";
export {
  profileMass,
  compareMassProfiles,
  formatMassProfile,
  formatMassComparison,
  estimateTransactionMass,
  estimateFeeFromMass,
  formatSompiToKas
} from "./ghostdag/mass-profile.js";

export type { MassSnapshot, MassSnapshotStore } from "./ghostdag/mass-snapshot.js";
export {
  saveMassSnapshot,
  loadMassSnapshot,
  profileAndCompare
} from "./ghostdag/mass-snapshot.js";
