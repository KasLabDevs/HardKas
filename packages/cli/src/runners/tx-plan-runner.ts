import { 
  parseKasToSompi,
  systemRuntimeContext,
  NetworkId
} from "@hardkas/core";
import {
  resolveHardkasAccountAddress
} from "@hardkas/accounts";
import { 
  buildPaymentPlan, 
  createMockUtxo 
} from "@hardkas/tx-builder";
import { 
  createTxPlanArtifact, 
  TxPlanArtifact 
} from "@hardkas/artifacts";
import { coreEvents } from "@hardkas/core";
import { 
  resolveNetworkTarget, 
  HardkasConfig 
} from "@hardkas/config";

export interface TxPlanRunnerInput {
  from: string;
  to: string;
  amount: string;
  networkId: string;
  feeRate: string;
  config: HardkasConfig;
  url?: string;
  workspaceRoot?: string;
}

/**
 * Reusable logic for transaction planning.
 */
export async function runTxPlan(input: TxPlanRunnerInput): Promise<TxPlanArtifact> {
  const { from, to, amount, networkId, feeRate, config, url, workspaceRoot } = input;
  
  const fromAddress = resolveHardkasAccountAddress(from, config);
  const toAddress = resolveHardkasAccountAddress(to, config);
  const amountSompi = parseKasToSompi(amount);
  const feeRateSompiPerMass = BigInt(feeRate);

  const { target, name } = resolveNetworkTarget({ config, network: networkId });
  const resolvedNetwork = name;

  const isSimulatedSender = fromAddress.startsWith("kaspa:sim_") || fromAddress.startsWith("kaspasim:");
  const isSimulatedTarget = target.kind === "simulated" || resolvedNetwork === "simnet";

  if (isSimulatedSender && !isSimulatedTarget) {
    throw new Error("NETWORK_ACCOUNT_MISMATCH: Cannot use a simulated account on a real network.");
  }

  const backend: "simulated" | "rpc" = (isSimulatedTarget || isSimulatedSender) ? "simulated" : "rpc";

  let availableUtxos: any[] = [];
  let mode: "simulated" | "kaspa-node" | "kaspa-rpc" = "simulated";
  let rpcUrl: string | undefined;

  if (backend === "simulated") {
    const { loadOrCreateLocalnetState, getSpendableUtxos } = await import("@hardkas/localnet");
    const localState = await loadOrCreateLocalnetState(workspaceRoot ? { cwd: workspaceRoot } : {});
    const unspent = getSpendableUtxos(localState, fromAddress);
    
    availableUtxos = unspent.map(u => {
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
      
      const targetObj = target as unknown as Record<string, unknown>;
      rpcUrl = url || (typeof targetObj.rpcUrl === "string" ? targetObj.rpcUrl : undefined);
      if (!rpcUrl && target.kind === "kaspa-node") {
        rpcUrl = resolveRuntimeConfig({ 
          network: typeof targetObj.network === "string" ? (targetObj.network as "mainnet" | "testnet-10" | "simnet") : "simnet", 
          ...(target.dataDir ? { dataDir: target.dataDir } : {}) 
        }).rpcUrl;
      }

      if (!rpcUrl) throw new Error("Could not resolve RPC URL");

      const client = new JsonWrpcKaspaClient({ rpcUrl });
      const rpcUtxos = await client.getUtxosByAddress(fromAddress);
      await client.close();
      
      availableUtxos = rpcUtxos.map(u => ({
        outpoint: u.outpoint,
        address: u.address,
        amountSompi: u.amountSompi,
        scriptPublicKey: u.scriptPublicKey || "unresolved"
      }));
      mode = target.kind === "kaspa-node" ? "kaspa-node" : "kaspa-rpc";
    } catch (e: any) {
      const protocol = rpcUrl?.startsWith("ws") ? "WebSocket" : "JSON-RPC";
      const { RpcConnectionError, classifyRpcError } = await import("../cli-errors.js");
      throw new RpcConnectionError({
        endpoint: rpcUrl || "unknown",
        network: resolvedNetwork,
        protocol,
        errorCode: classifyRpcError(e),
        rawError: e.message
      });
    }
  }

  if (availableUtxos.length === 0) {
    throw new Error(`No UTXOs found for ${fromAddress} on network '${resolvedNetwork}'.`);
  }

  const plan = buildPaymentPlan({
    fromAddress,
    outputs: [{ address: toAddress, amountSompi }],
    availableUtxos,
    feeRateSompiPerMass
  });

  const artifact = createTxPlanArtifact({
    networkId: resolvedNetwork as NetworkId,
    mode: mode === "simulated" ? "simulated" : "real",
    ...(rpcUrl ? { rpcUrl } : {}),
    from: { input: from, address: fromAddress },
    to: { input: to, address: toAddress },
    amountSompi,
    plan,
    ctx: systemRuntimeContext
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
