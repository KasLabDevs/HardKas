import { parseKasToSompi, systemRuntimeContext, NetworkId } from "@hardkas/core";
import {
  TxPlanService,
  observePendingSpends,
  utxoOutpointKey,
  PendingSpendAllExcludedError,
  PendingSpendEvidenceUnavailableError,
  type PendingSpendEvidence,
  type TxPlanResult,
  type UtxoProvider
} from "@hardkas/tx-builder";
import { createTxPlanArtifact, TxPlanArtifact } from "@hardkas/artifacts";
import { coreEvents, getCoinbaseMaturity, sha256hex, UtxoVirtualStateUnstableError } from "@hardkas/core";
import { resolveExecutionTarget, HardkasConfig } from "@hardkas/config";

// Wave 2(b) · AUD-17 (PLANNER-CONVERGENCE-1) / AUD-28 (CHANGEADDR): the CLI plans
// through the SAME canonical planner as the SDK — `planTransactionUpstream`
// (kaspa-wasm Generator, `plannerAuthority: KASPA_WASM_GENERATOR`) on a real
// network, `planTransactionSynthetic` (`SYNTHETIC_SIMULATOR`) in the simulator —
// and records that authority in the artifact. The CLI's safety layers around the
// network read (virtual fingerprint before/after, confirmation query of the
// selected inputs, bounded retries, RPC error classification) are unchanged.

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
  to: string;
  amount: string;
  networkId?: string;
  feeRate?: string;
  provider: string;
  config: HardkasConfig;
  url?: string;
  workspaceRoot?: string;
  workflowId?: string;
  assumptionLevel?: string;
  /** AUD-28: explicit change destination (account name or address); default = the sender. */
  changeAddress?: string;
}

/**
 * Reusable logic for transaction planning.
 */
export async function runTxPlan(input: TxPlanRunnerInput): Promise<TxPlanArtifact> {
  const {
    targetName,
    from,
    to,
    amount,
    networkId,
    feeRate,
    config,
    url,
    workspaceRoot,
    workflowId,
    assumptionLevel
  } = input;

  const resolvedConfig = workspaceRoot ? { ...config, cwd: workspaceRoot } : config;
  const amountSompi = parseKasToSompi(amount);
  const feeRateSompiPerMass = feeRate ? BigInt(feeRate) : undefined;

  const { resolveNewIntentTarget, resolveProvider } = await import("@hardkas/config");
  const { assertAccountCompatible, resolveHardkasAccount } = await import("@hardkas/accounts");

  if (!targetName && !networkId && !resolvedConfig.execution && !(resolvedConfig as any).defaultNetwork && !(resolvedConfig as any).defaultTarget) {
    throw new Error("EXECUTION_NETWORK_MISMATCH: No target or network specified, and no default target found in config.");
  }

  let explicitTarget: import("@hardkas/core").HardkasExecutionTarget | undefined = undefined;
  if (targetName) {
    if (resolvedConfig.execution && "targets" in resolvedConfig.execution) {
      explicitTarget = (resolvedConfig.execution.targets as any)[targetName];
    }
    if (!explicitTarget) {
      throw new Error(`Execution target '${targetName}' not found in hardkas.config.ts`);
    }
  } else if (networkId) {
    // If config has execution targets, find the target matching this networkId
    const execConfig = resolvedConfig.execution as any;
    if (execConfig?.targets) {
      const matchingTarget = Object.values(execConfig.targets).find(
        (t: any) => t.network === networkId
      ) as import("@hardkas/core").HardkasExecutionTarget | undefined;
      if (matchingTarget) {
        explicitTarget = matchingTarget;
      }
    }
    // Legacy fallback: infer mode from networkId name
    if (!explicitTarget) {
      let mode: "simulator" | "localnet" | "rpc" = "rpc";
      let domain: "kaspa-l1" | "evm-l2" = "kaspa-l1";
      if (networkId === "simulated") mode = "simulator";
      else if (networkId === "simnet" || networkId === "devnet") mode = "localnet";
      explicitTarget = { mode, domain, network: networkId };
    }
  }

  const execution = resolveNewIntentTarget({
    config: resolvedConfig,
    ...(explicitTarget ? { explicitTarget } : {})
  });

  const resolvedTargetName = targetName || execution.network;

  // Resolve and assert account compatibility BEFORE doing address validation
  const fromAccount = resolveHardkasAccount({ nameOrAddress: from, config: resolvedConfig, executionTarget: execution });
  assertAccountCompatible(fromAccount, execution);

  const toAccount = resolveHardkasAccount({ nameOrAddress: to, config: resolvedConfig, executionTarget: execution });
  assertAccountCompatible(toAccount, execution);

  const fromAddress = fromAccount.address as string;
  const toAddress = toAccount.address as string;

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

  let effectiveNetworkId = networkId;
  if (networkId === "simnet" && resolvedConfig.networks?.simnet?.kind === "simulated") {
    effectiveNetworkId = "simulated";
  }

  if (effectiveNetworkId && execution.network !== effectiveNetworkId) {
    throw new Error(`EXECUTION_NETWORK_MISMATCH: Target '${resolvedTargetName}' specifies network '${execution.network}', but command was called with legacy --network '${networkId}'.`);
  }

  const resolvedNetworkId = execution.network;
  const networkDef = config.networks?.[resolvedNetworkId];

  const configNetworkKind = typeof networkDef === "object" ? networkDef?.kind : undefined;

  const providerConfig = resolveProvider({
    network: resolvedNetworkId,
    provider: input.provider,
    url,
    configNetworkKind,
    executionMode: execution.mode
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
  let rpcUrl: string | undefined = providerConfig.endpoint;

  const planCoinbaseMaturity = getCoinbaseMaturity(
    resolvedNetwork as NetworkId,
    configNetworkKind === "kaspa-node" || configNetworkKind === "kaspa-rpc" || configNetworkKind === "simulated"
      ? (networkDef as any).consensusParams
      : undefined
  );

  let stateAddress: string | undefined;
  if (backend === "simulator") {
    const { loadOrCreateLocalnetState, getSpendableUtxos, resolveAccountAddressFromState } = await import(
      "@hardkas/localnet"
    );
    const localState = await loadOrCreateLocalnetState({
      cwd: workspaceRoot || process.cwd()
    });

    let queryAddress = fromAddress;
    if (fromAddress.startsWith("kaspasim:") && from !== fromAddress && !from.startsWith("kaspa")) {
      queryAddress = from;
    }
    stateAddress = resolveAccountAddressFromState(localState, queryAddress);
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
      throw new Error(
        `No UTXOs found for ${fromAddress} on network '${resolvedNetwork}'.\n  Hint: Run 'hardkas simulator fund ${from} --amount 1000' to create simulated UTXOs.`
      );
    }

    let actualFeeRate = feeRateSompiPerMass;
    if (actualFeeRate === undefined) {
      actualFeeRate = 1n; // Simulator defaults to 1 sompi/mass
    }

    // AUD-17 (T-A17c): the simulator plans through the canonical synthetic planner and
    // is labelled NON-AUTHORITATIVE (`SYNTHETIC_SIMULATOR`), exactly as the SDK does.
    const simulatorProvider: UtxoProvider = { getUtxos: async () => availableUtxos };
    const simulatorService = new TxPlanService(simulatorProvider, { coinbaseMaturity: planCoinbaseMaturity });
    const simulatorChange = changeAddressResolved ?? (stateAddress && stateAddress !== fromAddress ? stateAddress : undefined);
    planResult = await simulatorService.planTransactionSynthetic({
      fromAddress,
      toAddress,
      amountSompi,
      feeRate: actualFeeRate,
      networkId: resolvedNetwork,
      ...(simulatorChange ? { changeAddress: simulatorChange } : {})
    });

    mode = "simulator";
    rpcUrl = "simulated://local";
  } else {
    mode = execution.mode === "localnet" ? "kaspa-node" : "kaspa-rpc";
    try {
      const { JsonWrpcKaspaClient } = await import("@hardkas/kaspa-rpc");
      const { resolveRuntimeConfig } = await import("@hardkas/node-orchestrator");

      if (!rpcUrl) {
        rpcUrl = resolveRuntimeConfig({
          network: resolvedNetwork as "mainnet" | "testnet-10" | "simnet"
        }).rpcUrl;
      }
      if (!rpcUrl) throw new Error("Could not resolve RPC URL");

      const client = new JsonWrpcKaspaClient({ rpcUrl });
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

      for (let attempt = 0; attempt < MAX_PLAN_RETRIES; attempt++) {
        const vBefore = await getVirtualFingerprint(client);
        const rpcUtxos = await client.getUtxosByAddress(fromAddress);

        const matureUtxos = rpcUtxos.filter((u) => {
          if (!u.isCoinbase) return true;
          if (u.blockDaaScore === undefined) return false;
          return vBefore.virtualDaaScore - BigInt(u.blockDaaScore) > (planCoinbaseMaturity + 10n);
        }).map((u) => ({
          outpoint: u.outpoint,
          address: u.address,
          amountSompi: u.amountSompi,
          scriptPublicKey: u.scriptPublicKey || "unresolved",
          ...(u.blockDaaScore !== undefined ? { blockDaaScore: BigInt(u.blockDaaScore) } : {}),
          ...(u.isCoinbase !== undefined ? { isCoinbase: u.isCoinbase } : {})
        }));

        if (matureUtxos.length === 0) {
          throw new Error(`No UTXOs found for ${fromAddress} on network '${resolvedNetwork}'.`);
        }

        // --- Pending-spend exclusion (Wave 2(c) · AUD-19) ---
        // ONE mempool observation taken inside the same fingerprint bracket as the UTXO
        // read: every outpoint a mempool transaction of `fromAddress` is spending is
        // excluded before coin selection. No evidence ⇒ no plan (fail closed). This is
        // observer-local protection, never a statement about the network.
        const observedPending = await observePendingSpends(client, fromAddress, vBefore.virtualDaaScore);
        const pendingOutpoints = observedPending.outpoints;
        const spendableUtxos = matureUtxos.filter((u) => !pendingOutpoints.has(utxoOutpointKey(u) ?? ""));
        if (spendableUtxos.length === 0) {
          throw new PendingSpendAllExcludedError(observedPending.evidence, matureUtxos.length);
        }

        let actualFeeRate = feeRateSompiPerMass;
        if (actualFeeRate === undefined) {
          // Only the priority rate is taken from here; the plan's mass and fee are
          // computed by the upstream Generator over the real transaction. The
          // shape is therefore a representative one, not every spendable UTXO (which
          // would describe a transaction far above the standard mass limit).
          const { HardkasFees } = await import("@hardkas/sdk");
          const tempFees = new HardkasFees({ provider: { rpcUrl: rpcUrl! }, config: { cwd: workspaceRoot || process.cwd(), config: resolvedConfig } } as any);
          const { feeRate: estimated } = await tempFees.estimate({
            priority: "normal",
            inputs: 1,
            outputs: 2,
            version: 1,
            network: resolvedNetwork as NetworkId
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
            ...(pendingOutpoints.size > 0 ? { excludeOutpoints: pendingOutpoints } : {}),
            ...(changeAddressResolved ? { changeAddress: changeAddressResolved } : {})
          });
        } catch (plannerError: unknown) {
          // A planner refusal (invalid address, insufficient funds, Generator error) is
          // not a transport failure: it surfaces as itself, never as an RPC connection error.
          throw new UpstreamPlannerError(plannerError);
        }
        const candidatePlan = candidate.plan;

        // Confirmation query
        const confirmUtxos = await client.getUtxosByAddress(fromAddress);
        const vAfter = await getVirtualFingerprint(client);

        if (vBefore.hash !== vAfter.hash) {
          continue; // retry READ phase
        }

        const confirmSet = new Set(
          confirmUtxos.map(u => `${u.outpoint.transactionId}:${u.outpoint.index}`)
        );
        const allPresent = candidatePlan.inputs.every(inp =>
          confirmSet.has(`${inp.outpoint.transactionId}:${inp.outpoint.index}`)
        );

        if (!allPresent) {
          continue; // retry READ phase
        }

        planResult = candidate;
        pendingSpendEvidence = observedPending.evidence;
        planSuccess = true;
        break;
      }

      await client.close();

      if (!planSuccess) {
        throw new UtxoVirtualStateUnstableError({
          address: fromAddress,
          attempts: MAX_PLAN_RETRIES,
          virtualDaaScore: "unknown" // In loop, we could pass vAfter.virtualDaaScore, but it threw before
        });
      }

    } catch (e: unknown) {
      if (e instanceof UtxoVirtualStateUnstableError) throw e;
      if (e instanceof UpstreamPlannerError) throw e;
      if (e instanceof PendingSpendEvidenceUnavailableError || e instanceof PendingSpendAllExcludedError) throw e;
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

  const artifact = createTxPlanArtifact({
    networkId: resolvedNetwork as NetworkId,
    mode: mode === "simulator" ? "simulator" : (mode === "kaspa-rpc" ? "rpc" : "localnet"),
    ...(rpcUrl ? { rpcUrl } : {}),
    from: { input: from, address: fromAddress },
    to: { input: to, address: toAddress },
    amountSompi,
    plan: planResult.plan,
    ctx: {
      ...systemRuntimeContext,
      ...(workflowId ? { workflowId } : {}),
      assumptionLevel: resolvedAssumptionLevel,
      utxoSelection: planResult.utxoSelection,
      // AUD-17: the authority the planner actually established, never synthesised.
      ...(planResult.plannerAuthority ? { plannerAuthority: planResult.plannerAuthority } : {}),
      ...(planResult.plannerAuthorityDetail ? { plannerAuthorityDetail: planResult.plannerAuthorityDetail } : {}),
      ...(pendingSpendEvidence ? { pendingSpendEvidence } : {})
    }
  }) as unknown as TxPlanArtifact;

  coreEvents.normalizeAndEmit({
    kind: "workflow.plan.created",
    planId: artifact.planId,
    planHash: artifact.contentHash || "unknown",
    network: artifact.networkId,
    mode: artifact.mode
  });

  return artifact;
}
