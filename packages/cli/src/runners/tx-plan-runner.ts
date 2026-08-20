import { parseKasToSompi, systemRuntimeContext, NetworkId } from "@hardkas/core";
import { resolveHardkasAccountAddress } from "@hardkas/accounts";
import { buildPaymentPlan, createMockUtxo } from "@hardkas/tx-builder";
import { createTxPlanArtifact, TxPlanArtifact } from "@hardkas/artifacts";
import { coreEvents, getCoinbaseMaturity, sha256hex, UtxoVirtualStateUnstableError } from "@hardkas/core";
import { resolveExecutionTarget, HardkasConfig } from "@hardkas/config";

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
  const fromAddress = await resolveHardkasAccountAddress(from, resolvedConfig);
  const toAddress = await resolveHardkasAccountAddress(to, resolvedConfig);
  const amountSompi = parseKasToSompi(amount);
  const feeRateSompiPerMass = feeRate ? BigInt(feeRate) : undefined;

  const { resolveExecutionTarget, resolveProvider } = await import("@hardkas/config");

  if (!targetName && !networkId && !resolvedConfig.defaultTarget) {
    throw new Error("EXECUTION_NETWORK_MISMATCH: No target or network specified, and no default target found in config.");
  }

  const { execution, name: resolvedTargetName } = resolveExecutionTarget({
    config: resolvedConfig,
    ...(targetName !== undefined ? { targetName } : {})
  });

  if (networkId && execution.network !== networkId) {
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
  let plan: ReturnType<typeof buildPaymentPlan>;
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

    plan = buildPaymentPlan({
      fromAddress,
      outputs: [{ address: toAddress, amountSompi }],
      availableUtxos,
      feeRateSompiPerMass: actualFeeRate,
      coinbaseMaturity: planCoinbaseMaturity,
      ...(stateAddress && stateAddress !== fromAddress ? { changeAddress: stateAddress } : {})
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

        let actualFeeRate = feeRateSompiPerMass;
        if (actualFeeRate === undefined) {
          const { HardkasFees } = await import("@hardkas/sdk");
          const tempFees = new HardkasFees({ provider: { rpcUrl: rpcUrl! }, config: resolvedConfig });
          const { feeRate: estimated } = await tempFees.estimate({
            priority: "normal",
            inputs: matureUtxos.length,
            outputs: 2,
            version: 1,
            network: resolvedNetwork as NetworkId
          });
          actualFeeRate = estimated;
        }

        const candidatePlan = buildPaymentPlan({
          fromAddress,
          outputs: [{ address: toAddress, amountSompi }],
          availableUtxos: matureUtxos,
          feeRateSompiPerMass: actualFeeRate,
          coinbaseMaturity: planCoinbaseMaturity,
          virtualDaaScore: vBefore.virtualDaaScore,
          ...(stateAddress && stateAddress !== fromAddress ? { changeAddress: stateAddress } : {})
        });

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

        plan = candidatePlan;
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
      if (e instanceof Error && e.message.includes("No UTXOs found")) throw e;

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

  const artifact = createTxPlanArtifact({
    networkId: resolvedNetwork as NetworkId,
    mode: mode === "simulator" ? "simulator" : (mode === "kaspa-rpc" ? "rpc" : "localnet"),
    ...(rpcUrl ? { rpcUrl } : {}),
    from: { input: from, address: fromAddress },
    to: { input: to, address: toAddress },
    amountSompi,
    plan,
    ctx: {
      ...systemRuntimeContext,
      ...(workflowId ? { workflowId } : {}),
      assumptionLevel: resolvedAssumptionLevel
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
