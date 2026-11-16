import { parseKasToSompi, systemRuntimeContext, NetworkId, parseFeeRate, parseMaxFeeSompi } from "@hardkas/core";
import {
  TxPlanService,
  covenantIdOf,
  observePendingSpends,
  utxoOutpointKey,
  PendingSpendAllExcludedError,
  PendingSpendEvidenceUnavailableError,
  feeLimitInForce,
  assertFeeWithinLimitInForce,
  resolveMaxFeeRate,
  assertSpendableAddressScheme,
  describeLockTime,
  lockTimeDistance,
  lockTimeValueOf,
  parseLockTimeRequest,
  planLockTimeRecord,
  readLockTimeChainPoint,
  type LockTimeChainPoint,
  type PendingSpendEvidence,
  type PlanLockTime,
  type TxPlanResult,
  type UtxoProvider
} from "@hardkas/tx-builder";
import { createTxPlanArtifact, finalizeTxPlanIdentity, TxPlanArtifact } from "@hardkas/artifacts";
import { getCoinbaseMaturity, sha256hex, SelectedUtxoInvalidatedError, HardkasError, assertMainnetConnectionsDisabled, declaredNetworkIdOf } from "@hardkas/core";

/**
 * HARDKAS-NETWORK-PORTABILITY-1 (C2): nothing spendable is the same typed refusal on every backend (it was an untyped
 * Error, rendered as UNKNOWN_ERROR, on RPC networks). The message keeps its words and says whether outputs exist that
 * are not mature yet.
 */
function noSpendableUtxos(fromAddress: string, network: string, found = 0, hint = ""): HardkasError {
  const immature = found > 0 ? ` (${found} UTXO(s) found, none mature: coinbase outputs are spendable only after the network's coinbase maturity)` : "";
  return new HardkasError("NO_SPENDABLE_UTXOS", `No UTXOs found for ${fromAddress} on network '${network}'${immature}.${hint}`);
}
import type { RuntimeContext } from "@hardkas/core";
import { resolveExecutionTarget, HardkasConfig } from "@hardkas/config";

// Wave 2(b) · AUD-17 (PLANNER-CONVERGENCE-1) / AUD-28 (CHANGEADDR): the CLI plans
// through the SAME canonical planner as the SDK — `planTransactionUpstream`
// (kaspa-wasm Generator, `plannerAuthority: KASPA_WASM_GENERATOR`) on a real
// network, `planTransactionSynthetic` (`SYNTHETIC_SIMULATOR`) in the simulator —
// and records that authority in the artifact. The CLI's safety layers around the
// network read (re-validation of the selected inputs, bounded retries, RPC error
// classification) stay; since the demo-ready block (E02) the virtual fingerprint before/after is
// recorded as evidence and no longer decides whether a plan is valid.

/** A refusal of the canonical upstream planner, kept distinct from transport (RPC) failures. */
export class UpstreamPlannerError extends Error {
  readonly code: string;
  readonly cause: unknown;
  constructor(cause: unknown) {
    const message = cause instanceof Error ? cause.message : String(cause);
    super(`UPSTREAM_PLANNER_ERROR: ${message}`);
    this.name = "UpstreamPlannerError";
    this.code = typeof (cause as any)?.code === "string" ? (cause as any).code : "UPSTREAM_PLANNER_ERROR";
    this.cause = cause;
  }
}

export interface TxPlanRunnerInput {
  targetName?: string;
  from: string;
  /** The recipient (one-recipient form); required unless `outputs` is given, never together with it. */
  to?: string;
  /** Amount in KAS (one-recipient form); required unless `outputs` is given, never together with it. */
  amount?: string;
  /**
   * R4-T · several recipients paid by ONE transaction (`tx batch --one-transaction`, `tx plan --to <r>=<kas> …`): one
   * payment output per entry, in this order, then one change output and one fee. Exactly one of `to` + `amount` and
   * `outputs` (TX_PLAN_RECIPIENTS_CONFLICT; an empty list TX_PLAN_RECIPIENTS_INVALID). One entry plans exactly what
   * `to` + `amount` plans. The plan's `to` and `amountSompi` name the first recipient; `outputs` records every one.
   */
  outputs?: ReadonlyArray<{ readonly to: string; readonly amount: string }>;
  networkId?: string;
  feeRate?: string;
  /** TX-FEE-GUARD-1: total fee limit in sompi (--max-fee); recorded in the plan and enforced again at sign and send. */
  maxFee?: string;
  provider: string;
  config: HardkasConfig;
  url?: string;
  workspaceRoot?: string;
  workflowId?: string;
  assumptionLevel?: string;
  /** AUD-28: explicit change destination (account name or address); default = the sender. */
  changeAddress?: string;
  /**
   * TX-BATCH-1: the outpoints that earlier payments of the same run (`tx batch`) spent in transactions the node
   * accepted or may have accepted, each mapped to the address that owned it. They are never selected again: the node
   * drops an accepted transaction from its mempool before its UTXO index drops the inputs, and a plan on them is refused
   * ("orphan"). A payment that cannot be funded while the index still lists any of them waits for the index to catch up
   * (up to `spentReleaseTimeoutMs`, default 120 s) and reads again. RPC networks only: the simulator's state is updated
   * by the send itself.
   */
  spentOutpoints?: ReadonlyMap<string, string>;
  spentReleaseTimeoutMs?: number;
  /** CLTV · `--lock-time-daa <n>`: an absolute lock time as a DAA score (decimal; below 500,000,000,000). */
  lockTimeDaa?: string;
  /** CLTV · `--lock-time-ms <t>`: an absolute lock time as milliseconds since the epoch (at or above 500,000,000,000). */
  lockTimeMs?: string;
  /** CLTV · `--confirm-distant-lock-time`: allow a lock more than about a day past the node's position (refused otherwise). */
  confirmDistantLockTime?: boolean;
}

/**
 * CLTV · how far ahead a lock may be without `--confirm-distant-lock-time`: one day of past median time, or one day of
 * DAA at Kaspa's target rate of 10 DAA per second (a DAA-score lock computed on another network's rate, or a time taken
 * for a score, would lock the funds far longer than meant).
 */
const DISTANT_LOCK_MS = 86_400_000n;
const DISTANT_LOCK_DAA = 864_000n;

/** CLTV · the typed lock time of `--lock-time-daa` / `--lock-time-ms` (one of them), checked before anything connects. */
function cliLockTime(input: TxPlanRunnerInput): PlanLockTime | undefined {
  const daa = input.lockTimeDaa;
  const ms = input.lockTimeMs;
  if (daa !== undefined && ms !== undefined) {
    throw new HardkasError("LOCK_TIME_INVALID", "--lock-time-daa and --lock-time-ms are two kinds of lock: give one of them. Nothing was planned.");
  }
  const decimal = (v: string, flag: string) => {
    if (!/^\d{1,20}$/.test(v.trim())) throw new HardkasError("LOCK_TIME_INVALID", `${flag} ${JSON.stringify(v)} is not a whole number. Nothing was planned.`);
    return v.trim();
  };
  if (daa !== undefined) return parseLockTimeRequest({ daaScore: decimal(daa, "--lock-time-daa") }, "--lock-time-daa");
  if (ms !== undefined) return parseLockTimeRequest({ timestampMs: decimal(ms, "--lock-time-ms") }, "--lock-time-ms");
  return undefined;
}

/** TX-BATCH-1: how long a payment waits for the node's UTXO index to release what earlier payments spent, and how often it looks. */
const SPENT_RELEASE_TIMEOUT_MS = 120_000;
const SPENT_RELEASE_POLL_MS = 500;

/** TX-BATCH-1: a payment the node could fund only with outpoints that earlier payments of the run already spent. */
function spentNotReleased(fromAddress: string, listed: number, waitedMs: number, reason: string): HardkasError {
  return new HardkasError(
    "SPENT_OUTPOINTS_NOT_RELEASED",
    `${listed} outpoint(s) spent by earlier payments of this run are still listed by the node after ${Math.round(waitedMs / 1000)} s ` +
      `(their transactions are not accepted yet, or were dropped), and the payment from ${fromAddress} cannot be funded without them: ${reason}. No plan was made.`
  );
}

const isInsufficientFunds = (e: unknown): boolean =>
  (e as any)?.code === "INSUFFICIENT_FUNDS_UPSTREAM" || /insufficient funds/i.test(e instanceof Error ? e.message : String(e));

/**
 * R4-T · the recipients of a plan given as `outputs`, checked for their form: never with `to`/`amount`
 * (TX_PLAN_RECIPIENTS_CONFLICT), a non-empty list of { to, amount } strings (TX_PLAN_RECIPIENTS_INVALID). Undefined for
 * the one-recipient form, planned exactly as before. Pure.
 */
function cliRecipientsOf(input: TxPlanRunnerInput): Array<{ to: string; amount: string }> | undefined {
  if (input.outputs === undefined) return undefined;
  if (input.to !== undefined || input.amount !== undefined) {
    throw new HardkasError(
      "TX_PLAN_RECIPIENTS_CONFLICT",
      "a plan names its recipient either as to + amount or as a list of recipients (several in one transaction), not both. Nothing was planned."
    );
  }
  if (!Array.isArray(input.outputs) || input.outputs.length === 0) {
    throw new HardkasError("TX_PLAN_RECIPIENTS_INVALID", "the list of recipients is empty: a plan pays at least one. Nothing was planned.");
  }
  return input.outputs.map((r, i) => {
    if (typeof r?.to !== "string" || r.to.trim() === "" || typeof r?.amount !== "string" || r.amount.trim() === "") {
      throw new HardkasError("TX_PLAN_RECIPIENTS_INVALID", `recipient ${i + 1} needs a recipient (account or address) and an amount in KAS. Nothing was planned.`);
    }
    return { to: r.to, amount: r.amount };
  });
}

/**
 * Reusable logic for transaction planning.
 */
export async function runTxPlan(input: TxPlanRunnerInput): Promise<TxPlanArtifact> {
  // R4-T · several recipients (`outputs`): exactly one of the two forms, decided before anything connects; a single entry
  // IS the one-recipient form (the same plan, byte for byte)
  const recipients = cliRecipientsOf(input);
  if (recipients !== undefined && recipients.length === 1) {
    const { outputs: _single, ...rest } = input;
    return runTxPlan({ ...rest, to: recipients[0]!.to, amount: recipients[0]!.amount });
  }
  const {
    targetName,
    from,
    networkId,
    feeRate,
    config,
    url,
    workspaceRoot,
    workflowId,
    assumptionLevel
  } = input;
  const to = recipients ? recipients[0]!.to : (input.to as string);
  const amount = recipients ? recipients[0]!.amount : (input.amount as string);

  const resolvedConfig = workspaceRoot ? { ...config, cwd: workspaceRoot } : config;
  const amountSompi = parseKasToSompi(amount);
  // R4-T: every recipient's amount (KAS, the rules of --amount), above 0 (the first is the plan's `amountSompi`)
  const recipientAmounts = recipients?.map((r, i) => {
    const sompi = parseKasToSompi(r.amount);
    if (sompi <= 0n) {
      throw new HardkasError(
        "TX_PLAN_RECIPIENTS_INVALID",
        `recipient ${i + 1} (${r.to}): the amount must be above 0 KAS (Kaspa value-transfer outputs require amount > 0). Nothing was planned.`
      );
    }
    return sompi;
  });
  // TX-FEE-GUARD-1: a fee rate is a positive integer (INVALID_FEE_RATE), a fee limit a positive integer of sompi
  // (INVALID_MAX_FEE); both are decided before anything connects
  const feeRateSompiPerMass = feeRate !== undefined ? parseFeeRate(feeRate, "--fee-rate") : undefined;
  const planMaxFeeSompi = input.maxFee !== undefined ? parseMaxFeeSompi(input.maxFee, "--max-fee") : undefined;
  // CLTV · the lock time asked for (LOCK_TIME_INVALID), decided before anything connects
  const lockTime = cliLockTime(input);
  let lockTimePoint: LockTimeChainPoint = {};

  const { resolveWorkspaceExecution, resolveProvider } = await import("@hardkas/config");
  const { assertAccountCompatible, resolveHardkasAccount } = await import("@hardkas/accounts");
  // MAINNET TOTAL LOCKDOWN (lockdown oracle D2b): mainnet first, before the name is resolved as a HardKAS network — every
  // spelling (`kaspa`, `mainnet-1`, `kaspa-mainnet`…), an alias that declares one, a target on it, or the workspace's
  // own network when none is named — so it is never UNKNOWN_NETWORK
  const { refuseMainnetConnection, targetNetworkOf } = await import("../mainnet-guard.js");
  refuseMainnetConnection(resolvedConfig, [networkId, targetNetworkOf(resolvedConfig, targetName)], "tx plan", !targetName);

  // WORKSPACE-AUTHORITY-2 (WA2-I1): the one resolution the SDK uses too — a named target (`--target`), else a network
  // id (`--network`, never a target name: a declared target for that network, else the mode the network implies), else
  // the workspace's `execution` contract. Unknown names, missing targets and a target/network disagreement are typed
  // refusals (EXECUTION_TARGET_NOT_FOUND, UNKNOWN_NETWORK, EXECUTION_NETWORK_MISMATCH); there is no fallback.
  const resolvedExecution = resolveWorkspaceExecution({
    config: resolvedConfig,
    ...(targetName ? { target: targetName } : {}),
    ...(networkId ? { network: networkId } : {})
  });
  const execution = resolvedExecution.execution;
  // MAINNET TOTAL LOCKDOWN: a plan on mainnet reads mainnet (UTXOs, DAA score, fee estimate): refused before any account,
  // toolchain or endpoint is resolved (the network asked for and what its config entry declares)
  assertMainnetConnectionsDisabled(
    [execution.network, resolvedExecution.networkId, declaredNetworkIdOf(resolvedConfig, execution.network), declaredNetworkIdOf(resolvedConfig, resolvedExecution.networkId)],
    "tx plan"
  );

  const resolvedTargetName = resolvedExecution.targetName ?? execution.network;

  // Resolve and assert account compatibility BEFORE doing address validation
  const fromAccount = resolveHardkasAccount({ nameOrAddress: from, config: resolvedConfig, executionTarget: execution });
  assertAccountCompatible(fromAccount, execution);

  const toAccount = resolveHardkasAccount({ nameOrAddress: to, config: resolvedConfig, executionTarget: execution });
  assertAccountCompatible(toAccount, execution);

  const fromAddress = fromAccount.address as string;
  const toAddress = toAccount.address as string;
  // R4-T: every other recipient is resolved and checked like `to`; they go to the planner as its payment outputs, in the
  // order given (one-recipient form: none)
  const recipientOutputs = recipients?.map((r, i) => {
    let address = toAddress;
    if (i > 0) {
      const account = resolveHardkasAccount({ nameOrAddress: r.to, config: resolvedConfig, executionTarget: execution });
      assertAccountCompatible(account, execution);
      if (!account.address) {
        throw new HardkasError("TX_PLAN_RECIPIENTS_INVALID", `recipient ${i + 1} ('${r.to}') resolves to an account without an address. Nothing was planned.`);
      }
      address = account.address as string;
    }
    return { address, amountSompi: recipientAmounts![i]! };
  });
  const outputsRequest = recipientOutputs ? { outputs: recipientOutputs } : {};
  // ECDSA spends: a payment from an ECDSA account is planned on a node network (the signer signs it with ECDSA); the
  // simulator keeps refusing one, before anything connects (below). RC1 · D7 refused every spend from an ECDSA address.

  // AUD-28: the change destination is resolved and checked like `to`; it is never inferred.
  let changeAddressResolved: string | undefined;
  if (input.changeAddress) {
    const changeAccount = resolveHardkasAccount({ nameOrAddress: input.changeAddress, config: resolvedConfig, executionTarget: execution });
    assertAccountCompatible(changeAccount, execution);
    if (!changeAccount.address) {
      throw new Error(`CHANGE_ADDRESS_UNRESOLVED: '${input.changeAddress}' resolves to an account without an address.`);
    }
    changeAddressResolved = changeAccount.address as string;
  }

  // (a `--network` that disagrees with the target was refused by the resolver above)
  const resolvedNetworkId = execution.network;
  const networkDef = config.networks?.[resolvedNetworkId];

  const configNetworkKind = typeof networkDef === "object" ? networkDef?.kind : undefined;

  const providerConfig = resolveProvider({
    network: resolvedNetworkId,
    provider: input.provider,
    url,
    configNetworkKind,
    executionMode: execution.mode,
    // WORKSPACE-AUTHORITY-2 (closeout): the endpoint the resolved network declares, the same the SDK uses
    networkRpcUrl: resolvedExecution.rpcUrl
  });

  const resolvedNetwork = providerConfig.network;
  let backend = providerConfig.mode;


  // Guard: HardKAS simulated accounts (kaspa:sim_*) can only be used on simulated backends.
  const isHardkasSimulatedAccount = fromAddress.startsWith("kaspa:sim_");

  if (isHardkasSimulatedAccount && backend !== "simulator") {
    throw new Error(
      "NETWORK_ACCOUNT_MISMATCH: Cannot use a simulated account with a real network or RPC provider."
    );
  }

  let availableUtxos: any[] = [];
  let mode: "simulator" | "kaspa-node" | "kaspa-rpc" = "simulator";
  let planResult: TxPlanResult | undefined;
  let pendingSpendEvidence: PendingSpendEvidence | undefined;
  let planningWindow: RuntimeContext["planningWindow"];
  let rpcUrl: string | undefined = providerConfig.endpoint;

  const planCoinbaseMaturity = getCoinbaseMaturity(
    resolvedNetwork as NetworkId,
    configNetworkKind === "kaspa-node" || configNetworkKind === "kaspa-rpc" || configNetworkKind === "simulated"
      ? (networkDef as any).consensusParams
      : undefined
  );

  if (backend === "simulator") {
    assertSpendableAddressScheme(fromAddress, `the sender '${from}'`);
    if (lockTime !== undefined) {
      throw new HardkasError(
        "LOCK_TIME_NOT_SUPPORTED",
        "--lock-time-daa / --lock-time-ms: the simulator's lock-time rule is its own and UNVERIFIED against a node; plan a lock time against a node (simnet, devnet). Nothing was planned."
      );
    }
    const { loadOrCreateLocalnetState, getSpendableUtxos } = await import(
      "@hardkas/localnet"
    );
    const localState = await loadOrCreateLocalnetState({
      cwd: workspaceRoot || process.cwd()
    });

    let queryAddress = fromAddress;
    if (fromAddress.startsWith("kaspasim:") && from !== fromAddress && !from.startsWith("kaspa")) {
      queryAddress = from;
    }
    const unspent = getSpendableUtxos(localState, queryAddress);

    availableUtxos = unspent.map((u) => {
      const parts = u.id.split(":");
      const index = Number(parts[parts.length - 1]);
      const transactionId = parts.slice(0, -1).join(":");
      return {
        outpoint: { transactionId, index },
        address: fromAddress,
        amountSompi: BigInt(u.amountSompi),
        scriptPublicKey: "mock-script"
      };
    });

    if (availableUtxos.length === 0) {
      throw noSpendableUtxos(fromAddress, resolvedNetwork, 0, `\n  Hint: Run 'hardkas simulator fund ${from} --amount 1000' to create simulated UTXOs.`);
    }

    let actualFeeRate = feeRateSompiPerMass;
    if (actualFeeRate === undefined) {
      actualFeeRate = 1n; // Simulator defaults to 1 sompi/mass
    }

    // AUD-17 (T-A17c): the simulator plans through the canonical synthetic planner and
    // is labelled NON-AUTHORITATIVE (`SYNTHETIC_SIMULATOR`), exactly as the SDK does.
    const simulatorProvider: UtxoProvider = { getUtxos: async () => availableUtxos };
    const simulatorService = new TxPlanService(simulatorProvider, { coinbaseMaturity: planCoinbaseMaturity });
    // E04: the simulator state maps the plan's synthetic identities to each account's
    // one address when it executes (outputs AND change), so the plan keeps the sender's
    // own identity as its change destination unless the caller named another one.
    const simulatorChange = changeAddressResolved;
    planResult = await simulatorService.planTransactionSynthetic({
      fromAddress,
      toAddress,
      amountSompi,
      feeRate: actualFeeRate,
      networkId: resolvedNetwork,
      ...(simulatorChange ? { changeAddress: simulatorChange } : {}),
      ...outputsRequest
    });

    mode = "simulator";
    rpcUrl = "simulated://local";
  } else {
    mode = execution.mode === "localnet" ? "kaspa-node" : "kaspa-rpc";
    // TESTNET-PORT-COLLISION-1: the shared endpoint authority, before anything connects — the endpoint given or declared,
    // else a local network's default, else NETWORK_ENDPOINT_REQUIRED (never the listen port of a node HardKAS would start)
    const { resolveNodeEndpoint } = await import("@hardkas/config");
    rpcUrl = resolveNodeEndpoint({ config, networkId: resolvedNetwork, explicitUrl: rpcUrl }).url;
    // RESOURCE-LIFECYCLE-1 (RL-I1/RL-I3): releases the client this planner creates, on success and on every refusal.
    let release: (() => Promise<void>) | undefined;
    try {
      const { JsonWrpcKaspaClient } = await import("@hardkas/kaspa-rpc");

      // NODE-NETWORK-IDENTITY-1: the node's UTXOs are planned on only if the node says it serves the planned network.
      // INT9-A (I-3b): and only if it says it is synced (a plan needs the current UTXO set), the managed localnet included
      const client = new JsonWrpcKaspaClient({ rpcUrl, expectedNetworkId: resolvedNetwork, requireSynced: true });
      release = () => client.close();
      const MAX_PLAN_RETRIES = 3;
      let planSuccess = false;

      // Virtual fingerprint helper
      const getVirtualFingerprint = async (rpc: any) => {
        const dagInfo = await rpc.getBlockDagInfo();
        const virtualDaaScore = BigInt(dagInfo.virtualDaaScore || 0);
        const virtualParentHashes = [...(dagInfo.virtualParentHashes || [])].sort();
        const sink = dagInfo.sink || dagInfo.sinkHash || "";
        return {
          virtualDaaScore,
          hash: sha256hex(JSON.stringify({ virtualDaaScore: virtualDaaScore.toString(), virtualParentHashes, sink }))
        };
      };

      // Demo-ready · E02: what the last invalidated attempt saw, for the error once retries run out.
      let lastInvalidation: { missing: string[]; pending: string[]; virtualDaaScore: bigint } | undefined;

      // TX-BATCH-1: the outpoints earlier payments of this run spent are never selected. When this payment cannot be
      // funded without them, it waits for the node's UTXO index to release them: true once one it saw (or, when it saw
      // none, one the index still listed) is gone — read again; false when the index lists none of them — the failure
      // is this payment's own; SPENT_OUTPOINTS_NOT_RELEASED when the wait runs out.
      const spentEarlier = input.spentOutpoints && input.spentOutpoints.size > 0 ? input.spentOutpoints : undefined;
      const releaseTimeoutMs = input.spentReleaseTimeoutMs ?? SPENT_RELEASE_TIMEOUT_MS;
      let releaseDeadline: number | undefined;
      const listedSpent = async (): Promise<Set<string>> => {
        const byAddress = new Map<string, Set<string>>();
        for (const [key, address] of spentEarlier ?? []) {
          let keys = byAddress.get(address);
          if (!keys) byAddress.set(address, (keys = new Set()));
          keys.add(key);
        }
        const listed = new Set<string>();
        for (const [address, keys] of byAddress) {
          for (const u of await client.getUtxosByAddress(address)) {
            const key = utxoOutpointKey(u);
            if (key && keys.has(key)) listed.add(key);
          }
        }
        return listed;
      };
      const spentReleased = async (seen: ReadonlySet<string>, failure: unknown): Promise<boolean> => {
        if (!spentEarlier) return false;
        const deadline = (releaseDeadline ??= Date.now() + releaseTimeoutMs);
        const waitingFor = new Set(seen);
        for (let listed = await listedSpent(); ; listed = await listedSpent()) {
          const released = [...waitingFor].some((key) => !listed.has(key));
          if (!released && waitingFor.size === 0) {
            if (listed.size === 0) return false;
            for (const key of listed) waitingFor.add(key);
          }
          if (Date.now() >= deadline) {
            throw spentNotReleased(fromAddress, listed.size, releaseTimeoutMs, failure instanceof Error ? failure.message : String(failure));
          }
          if (released) return true;
          await new Promise((resolve) => setTimeout(resolve, SPENT_RELEASE_POLL_MS));
        }
      };
      const none: ReadonlySet<string> = new Set();

      // TX-BATCH-1: `attempt` counts the reads whose selection was invalidated, not the reads after a release
      for (let attempt = 0; attempt < MAX_PLAN_RETRIES; ) {
        const vBefore = await getVirtualFingerprint(client);
        const rpcUtxos = await client.getUtxosByAddress(fromAddress);

        const matureUtxos = rpcUtxos.filter((u) => {
          if (!u.isCoinbase) return true;
          if (u.blockDaaScore === undefined) return false;
          return vBefore.virtualDaaScore - BigInt(u.blockDaaScore) > (planCoinbaseMaturity + 10n);
        }).map((u) => {
          // COVENANT-UTXO-PAYMENT-FILTER-1: the covenant id goes with the UTXO, so the planner leaves a covenant's out
          const covenantId = covenantIdOf(u);
          return {
            outpoint: u.outpoint,
            address: u.address,
            amountSompi: u.amountSompi,
            scriptPublicKey: u.scriptPublicKey || "unresolved",
            ...(u.blockDaaScore !== undefined ? { blockDaaScore: BigInt(u.blockDaaScore) } : {}),
            ...(u.isCoinbase !== undefined ? { isCoinbase: u.isCoinbase } : {}),
            ...(covenantId !== undefined ? { covenantId } : {})
          };
        });

        if (matureUtxos.length === 0) {
          const failure = noSpendableUtxos(fromAddress, resolvedNetwork, rpcUtxos.length);
          if (await spentReleased(none, failure)) continue;
          throw failure;
        }

        // --- Pending-spend exclusion (Wave 2(c) · AUD-19) ---
        // ONE mempool observation taken inside the same fingerprint bracket as the UTXO
        // read: every outpoint a mempool transaction of `fromAddress` is spending is
        // excluded before coin selection. No evidence ⇒ no plan (fail closed). This is
        // observer-local protection, never a statement about the network.
        const observedPending = await observePendingSpends(client, fromAddress, vBefore.virtualDaaScore);
        const pendingOutpoints = observedPending.outpoints;
        // TX-BATCH-1: the outpoints of THIS read that earlier payments of this run spent, pending in the mempool or not.
        // A wait for the index waits on them: the node can accept those payments (and the index drop their inputs)
        // between this read and the next look, and an outpoint gone since this read is a release, never "the failure
        // is this payment's own" (CI: PENDING_SPEND_ALL_EXCLUDED on the third payment of a batch).
        const spentInRead: ReadonlySet<string> = new Set(
          spentEarlier ? matureUtxos.map((u) => utxoOutpointKey(u) ?? "").filter((key) => spentEarlier.has(key)) : []
        );
        const unpendingUtxos = matureUtxos.filter((u) => !pendingOutpoints.has(utxoOutpointKey(u) ?? ""));
        if (unpendingUtxos.length === 0) {
          const failure = new PendingSpendAllExcludedError(observedPending.evidence, matureUtxos.length);
          if (await spentReleased(spentInRead, failure)) continue;
          throw failure;
        }
        // TX-BATCH-1: what an earlier payment of this run spent is never selected, whatever the index still lists
        const spentListed: ReadonlySet<string> = new Set(
          spentEarlier ? unpendingUtxos.map((u) => utxoOutpointKey(u) ?? "").filter((key) => spentEarlier.has(key)) : []
        );
        const spendableUtxos = spentListed.size > 0 ? unpendingUtxos.filter((u) => !spentListed.has(utxoOutpointKey(u) ?? "")) : unpendingUtxos;
        const excludedOutpoints = spentListed.size > 0 ? new Set([...pendingOutpoints, ...spentListed]) : pendingOutpoints;

        let actualFeeRate = feeRateSompiPerMass;
        if (actualFeeRate === undefined) {
          // Only the priority rate is taken from here; the plan's mass and fee are
          // computed by the upstream Generator over the real transaction. The
          // shape is therefore a representative one, not every spendable UTXO (which
          // would describe a transaction far above the standard mass limit).
          // HK-09: the node this plan reads its UTXOs from is asked for its fee estimate (it used to be a stand-in SDK
          // without an RPC client, so the node was never asked); bounded (FEE_RATE_ABOVE_BOUND above
          // networks[<net>].maxFeeRate, default 10,000 sompi/g), never below the relay minimum
          const { HardkasFees } = await import("@hardkas/sdk");
          const nodeFees = new HardkasFees({ rpc: client, network: resolvedNetwork, config: { config: resolvedConfig } } as any);
          const { feeRate: estimated } = await nodeFees.estimate({
            priority: "normal",
            inputs: 1,
            outputs: 2,
            network: resolvedNetwork as NetworkId,
            maxFeeRate: resolveMaxFeeRate({ config: resolvedConfig, network: resolvedNetwork })
          });
          actualFeeRate = estimated;
        }

        // AUD-17 (T-A17a/b): coin selection, mass and fee come from the upstream
        // Generator through the same service the SDK uses; the read snapshot taken
        // above (`vBefore`, `spendableUtxos`) is what the planner sees.
        const readSnapshot: UtxoProvider = {
          getUtxos: async () => spendableUtxos,
          getVirtualDaaScore: async () => vBefore.virtualDaaScore
        };
        const upstreamService = new TxPlanService(readSnapshot, { coinbaseMaturity: planCoinbaseMaturity });
        let candidate: TxPlanResult;
        try {
          candidate = await upstreamService.planTransactionUpstream({
            fromAddress,
            toAddress,
            amountSompi,
            feeRate: actualFeeRate,
            networkId: resolvedNetwork,
            ...(excludedOutpoints.size > 0 ? { excludeOutpoints: excludedOutpoints } : {}),
            ...(changeAddressResolved ? { changeAddress: changeAddressResolved } : {}),
            ...outputsRequest
          });
        } catch (plannerError: unknown) {
          // TX-BATCH-1: short of funds while the index still lists what earlier payments of this run spent: read
          // again once it releases them
          if (isInsufficientFunds(plannerError) && (await spentReleased(spentInRead, plannerError))) continue;
          // A planner refusal (invalid address, insufficient funds, Generator error) is
          // not a transport failure: it surfaces as itself, never as an RPC connection error.
          throw new UpstreamPlannerError(plannerError);
        }
        const candidatePlan = candidate.plan;

        // Demo-ready · E02 — planning validity is UTXO-scoped, not virtual-state-scoped.
        // Blocks arriving while the plan was built (a newer DAA score, virtual parents or
        // sink) do not invalidate it: the fingerprints before/after are evidence only.
        // What decides is the selected inputs, re-read at the end of the attempt: each must
        // still be in the address UTXO set, and the observed mempool of this same node must
        // not show a transaction spending it (maturity was established on the snapshot and
        // a later virtual state cannot undo it). Absence from this mempool does not prove
        // that nobody on the network is spending an input, and the race up to
        // submitTransaction remains: a competing spend after this check is refused by the
        // node, fail-closed. An invalidated attempt is retried; when the bounded retries run
        // out, SELECTED_UTXO_INVALIDATED.
        const confirmUtxos = await client.getUtxosByAddress(fromAddress);
        const observedPendingAfter = await observePendingSpends(client, fromAddress);
        const vAfter = await getVirtualFingerprint(client);

        const confirmSet = new Set(confirmUtxos.map((u) => utxoOutpointKey(u) ?? ""));
        const selected = candidatePlan.inputs.map((inp) => utxoOutpointKey(inp) ?? "");
        const missing = selected.filter((k) => !confirmSet.has(k));
        const pending = selected.filter((k) => observedPendingAfter.outpoints.has(k));

        if (missing.length > 0 || pending.length > 0) {
          lastInvalidation = { missing, pending, virtualDaaScore: vAfter.virtualDaaScore };
          attempt++;
          continue; // retry READ phase
        }

        planResult = candidate;
        pendingSpendEvidence = observedPending.evidence;
        planningWindow = {
          validity: "utxo-scoped",
          attempts: attempt + 1,
          before: { virtualDaaScore: vBefore.virtualDaaScore.toString(), virtualStateFingerprint: vBefore.hash },
          after: { virtualDaaScore: vAfter.virtualDaaScore.toString(), virtualStateFingerprint: vAfter.hash },
          revalidation: {
            scope: "observer-local",
            selectedInputs: selected.length,
            presentInUtxoSet: selected.length - missing.length,
            pendingInObservedMempool: pending.length
          }
        };
        planSuccess = true;
        // CLTV · where the node is, recorded with the lock time (its virtual DAA score and past median time)
        if (lockTime !== undefined) lockTimePoint = await readLockTimeChainPoint(client as any);
        break;
      }

      if (!planSuccess) {
        throw new SelectedUtxoInvalidatedError({
          address: fromAddress,
          attempts: MAX_PLAN_RETRIES,
          missing: lastInvalidation?.missing ?? [],
          pending: lastInvalidation?.pending ?? [],
          virtualDaaScore: lastInvalidation ? lastInvalidation.virtualDaaScore.toString() : "unknown"
        });
      }

    } catch (e: unknown) {
      if (e instanceof SelectedUtxoInvalidatedError) throw e;
      if (e instanceof UpstreamPlannerError) throw e;
      // NODE-NETWORK-IDENTITY-1: the wrong (or an unidentified) node is its own typed refusal, not a connection error
      const { isNodeNetworkIdentityError, isNodeSyncError } = await import("@hardkas/kaspa-rpc");
      if (isNodeNetworkIdentityError(e) || isNodeSyncError(e)) throw e;
      if (e instanceof PendingSpendEvidenceUnavailableError || e instanceof PendingSpendAllExcludedError) throw e;
      if (e instanceof HardkasError && e.code === "SPENT_OUTPOINTS_NOT_RELEASED") throw e;
      // HK-09 / CA-TX-01: a node fee rate out of bounds (or an invalid bound) is a fee refusal, not a connection error
      if ((e as any)?.code === "FEE_RATE_ABOVE_BOUND" || (e as any)?.code === "INVALID_FEE_RATE") throw e;
      if (e instanceof Error && (e.message.includes("No UTXOs found") || e.message.includes("Insufficient funds"))) throw e;

      const protocol = rpcUrl?.startsWith("ws") ? "WebSocket" : "JSON-RPC";
      const { RpcConnectionError, RpcSchemaError, classifyRpcError } =
        await import("../cli-errors.js");
      const errCode = classifyRpcError(e instanceof Error ? e : String(e));
      if (errCode === "RPC_SCHEMA_ERROR") {
        throw new RpcSchemaError({
          endpoint: rpcUrl || "unknown",
          method: "getUtxosByAddress",
          suspectedCause:
            "This endpoint might be running a node version that uses a different response schema for UTXOs.",
          rawError: e instanceof Error ? e.message : String(e)
        });
      }
      throw new RpcConnectionError({
        endpoint: rpcUrl || "unknown",
        network: resolvedNetwork,
        protocol,
        errorCode: errCode,
        rawError: ((e instanceof Error) ? ((e instanceof Error) ? e.message : String(e)) : String(e))
      });
    } finally {
      await release?.();
    }
  }

  let resolvedAssumptionLevel = assumptionLevel;
  if (!resolvedAssumptionLevel) {
    if (backend === "simulator") {
      resolvedAssumptionLevel = "local-simulated";
    } else if (mode === "kaspa-rpc" && resolvedNetwork === "simnet") {
      resolvedAssumptionLevel = "local-rpc";
    } else {
      const { name: resolvedName, target } = resolveExecutionTarget({
        network: resolvedNetwork,
        config: resolvedConfig
      });
      resolvedAssumptionLevel = resolvedName;
    }
  }

  if (!planResult) {
    throw new Error("PLANNER_NO_RESULT: no plan was produced");
  }
  // TX-FEE-GUARD-1 / TX-05: the planned fee within the lower of --max-fee and the workspace's networks[<net>].maxFeeSompi,
  // or HardKAS's default limit when neither is set
  assertFeeWithinLimitInForce(
    BigInt(planResult.plan.estimatedFeeSompi),
    feeLimitInForce({ planMaxFeeSompi, config: resolvedConfig, network: resolvedNetwork }),
    "plan",
    resolvedNetwork
  );

  const artifact = createTxPlanArtifact({
    networkId: resolvedNetwork as NetworkId,
    mode: mode === "simulator" ? "simulator" : (mode === "kaspa-rpc" ? "rpc" : "localnet"),
    ...(rpcUrl ? { rpcUrl } : {}),
    from: { input: from, address: fromAddress },
    to: { input: to, address: toAddress },
    amountSompi,
    plan: planResult.plan,
    ...(planMaxFeeSompi !== undefined ? { maxFeeSompi: planMaxFeeSompi } : {}),
    ctx: {
      ...systemRuntimeContext,
      ...(workflowId ? { workflowId } : {}),
      assumptionLevel: resolvedAssumptionLevel,
      utxoSelection: planResult.utxoSelection,
      // AUD-17: the authority the planner actually established, never synthesised.
      ...(planResult.plannerAuthority ? { plannerAuthority: planResult.plannerAuthority } : {}),
      ...(planResult.plannerAuthorityDetail ? { plannerAuthorityDetail: planResult.plannerAuthorityDetail } : {}),
      ...(pendingSpendEvidence ? { pendingSpendEvidence } : {}),
      ...(planningWindow ? { planningWindow } : {})
    }
  }) as unknown as TxPlanArtifact;

  // CLTV · the typed lock time, with where the node was, authenticated with the plan (sealed again). A lock more than
  // about a day past the node's position needs --confirm-distant-lock-time (a DAA score taken for a time, or computed on
  // another network's rate, locks the funds far longer than meant); one the node position cannot place is refused too.
  if (lockTime !== undefined) {
    const value = lockTimeValueOf(lockTime);
    const distance = lockTimeDistance(value, lockTimePoint);
    const limit = "daaScore" in lockTime ? DISTANT_LOCK_DAA : DISTANT_LOCK_MS;
    if (!input.confirmDistantLockTime && (distance === undefined || distance > limit)) {
      const where = "daaScore" in lockTime ? `virtual DAA score ${lockTimePoint.virtualDaaScore ?? "unknown"}` : `past median time ${lockTimePoint.pastMedianTimeMs ?? "unknown"} ms`;
      throw new HardkasError(
        "LOCK_TIME_DISTANT_UNCONFIRMED",
        `the lock time ${describeLockTime(value)} is ${distance === undefined ? "at an unknown distance" : `${distance} ${"daaScore" in lockTime ? "DAA" : "ms"}`} past the node's ${where}, ` +
          `more than about a day (${limit} ${"daaScore" in lockTime ? "DAA at 10 DAA per second" : "ms"}): the funds stay unspendable by this transaction until then. ` +
          "Check the value and pass --confirm-distant-lock-time to plan it. Nothing was planned.",
        { metadata: { lockTime: value.toString(), ...(distance !== undefined ? { distance: distance.toString() } : {}) } }
      );
    }
    (artifact as any).lockTime = planLockTimeRecord(lockTime, lockTimePoint);
    finalizeTxPlanIdentity(artifact as any);
  }

  // EVENT-LEDGER-2 (EVENT-EMISSION-1): the raw `workflow.plan.created` object this runner handed to normalizeAndEmit
  // was discarded by it (no envelope, no correlation). It is gone: the formal `workflow.plan.created` belongs to the
  // owner of a workflow (tx-flow emits it under its workflowId), and a plan `tx plan` writes is announced as
  // `artifact.written` by the command, under the plan's own workflowId (D4).
  return artifact;
}
