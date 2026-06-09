import { parseKasToSompi, systemRuntimeContext, NetworkId } from "@hardkas/core";
import { resolveHardkasAccountAddress } from "@hardkas/accounts";
import { buildPaymentPlan, createMockUtxo } from "@hardkas/tx-builder";
import { createTxPlanArtifact, TxPlanArtifact } from "@hardkas/artifacts";
import { coreEvents } from "@hardkas/core";
import { resolveNetworkTarget, HardkasConfig } from "@hardkas/config";

export interface TxPlanRunnerInput {
  from: string;
  to: string;
  amount: string;
  networkId: string;
  feeRate: string;
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
  const { from, to, amount, networkId, feeRate, config, url, workspaceRoot, workflowId, assumptionLevel } = input;

  const fromAddress = await resolveHardkasAccountAddress(from, config);
  const toAddress = await resolveHardkasAccountAddress(to, config);
  const amountSompi = parseKasToSompi(amount);
  const feeRateSompiPerMass = BigInt(feeRate);

  const networkDef = config.networks?.[networkId];
  const configNetworkKind = typeof networkDef === "object" ? networkDef?.kind : undefined;

  const { resolveProvider } = await import("@hardkas/config");
  const providerConfig = resolveProvider({
    network: networkId,
    provider: input.provider,
    url,
    configNetworkKind
  });

  const resolvedNetwork = providerConfig.network;
  let backend = providerConfig.mode;

  // Guard: HardKAS simulated accounts (kaspa:sim_*) can only be used on simulated backends.
  const isHardkasSimulatedAccount = fromAddress.startsWith("kaspa:sim_");

  if (isHardkasSimulatedAccount && backend !== "simulated") {
    throw new Error(
      "NETWORK_ACCOUNT_MISMATCH: Cannot use a simulated account with a real network or RPC provider."
    );
  }

  let availableUtxos: any[] = [];
  let mode: "simulated" | "kaspa-node" | "kaspa-rpc" = "simulated";
  let rpcUrl: string | undefined = providerConfig.endpoint;

  if (backend === "simulated") {
    const { loadOrCreateLocalnetState, getSpendableUtxos } =
      await import("@hardkas/localnet");
    const localState = await loadOrCreateLocalnetState(
      workspaceRoot ? { cwd: workspaceRoot } : {}
    );
    const unspent = getSpendableUtxos(localState, fromAddress);

    availableUtxos = unspent.map((u) => {
      const parts = u.id.split(":");
      const index = Number(parts[parts.length - 1]);
      const transactionId = parts.slice(0, -1).join(":");
      return {
        outpoint: { transactionId, index },
        address: u.address,
        amountSompi: BigInt(u.amountSompi),
        scriptPublicKey: "mock-script"
      };
    });

    mode = "simulated";
    rpcUrl = "simulated://local";
  } else {
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
      const info = await client.getInfo();
      const rpcUtxos = await client.getUtxosByAddress(fromAddress);
      await client.close();

      availableUtxos = rpcUtxos
        .filter((u) => {
          if (!u.isCoinbase) return true;
          if (info.virtualDaaScore === undefined || u.blockDaaScore === undefined) return false;
          return (info.virtualDaaScore - BigInt(u.blockDaaScore)) >= 1000n;
        })
        .map((u) => ({
          outpoint: u.outpoint,
          address: u.address,
          amountSompi: u.amountSompi,
          scriptPublicKey: u.scriptPublicKey || "unresolved",
          ...(u.blockDaaScore !== undefined ? { blockDaaScore: BigInt(u.blockDaaScore) } : {}),
          ...(u.isCoinbase !== undefined ? { isCoinbase: u.isCoinbase } : {})
        }));
      mode = "kaspa-rpc";
    } catch (e: any) {
      const protocol = rpcUrl?.startsWith("ws") ? "WebSocket" : "JSON-RPC";
      const { RpcConnectionError, RpcSchemaError, classifyRpcError } = await import("../cli-errors.js");
      const errCode = classifyRpcError(e);
      if (errCode === "RPC_SCHEMA_ERROR") {
        throw new RpcSchemaError({
          endpoint: rpcUrl || "unknown",
          method: "getUtxosByAddress",
          suspectedCause: "Invalid Kaspa address format/checksum or incompatible node version",
          rawError: e.message
        });
      }
      throw new RpcConnectionError({
        endpoint: rpcUrl || "unknown",
        network: resolvedNetwork,
        protocol,
        errorCode: errCode,
        rawError: e.message
      });
    }
  }

  if (availableUtxos.length === 0) {
    const hint =
      backend === "simulated"
        ? `\n  Hint: Run 'hardkas accounts fund ${from} --amount 1000' to create simulated UTXOs,\n  or re-initialize with 'hardkas init --force'.`
        : `\n  Hint: Ensure the account has received funds on the '${resolvedNetwork}' network.`;
    throw new Error(
      `No UTXOs found for ${fromAddress} on network '${resolvedNetwork}'.${hint}`
    );
  }

  const plan = buildPaymentPlan({
    fromAddress,
    outputs: [{ address: toAddress, amountSompi }],
    availableUtxos,
    feeRateSompiPerMass
  });

  let resolvedAssumptionLevel = assumptionLevel;
  if (!resolvedAssumptionLevel) {
    if (mode === "simulated") {
      resolvedAssumptionLevel = "local-simulated";
    } else if (mode === "kaspa-rpc" && resolvedNetwork === "simnet") {
      resolvedAssumptionLevel = "local-rpc";
    } else {
      resolvedAssumptionLevel = resolvedNetwork;
    }
  }

  const artifact = createTxPlanArtifact({
    networkId: resolvedNetwork as NetworkId,
    mode: mode === "simulated" ? "simulated" : "real",
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
