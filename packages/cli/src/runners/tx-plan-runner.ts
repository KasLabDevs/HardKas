import { 
  parseKasToSompi 
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
}

/**
 * Reusable logic for transaction planning.
 */
export async function runTxPlan(input: TxPlanRunnerInput): Promise<TxPlanArtifact> {
  const { from, to, amount, networkId, feeRate, config, url } = input;
  
  const fromAddress = resolveHardkasAccountAddress(from, config);
  const toAddress = resolveHardkasAccountAddress(to, config);
  const amountSompi = parseKasToSompi(amount);
  const feeRateSompiPerMass = BigInt(feeRate);

  let availableUtxos: any[] = [];
  let mode: "simulated" | "kaspa-node" | "kaspa-rpc" = "simulated";
  let rpcUrl: string | undefined;
  let resolvedNetwork = networkId;

  try {
    const { target, name } = resolveNetworkTarget({ config, network: networkId });
    resolvedNetwork = name;

    if (target.kind === "simulated") {
      const { loadOrCreateLocalnetState, getSpendableUtxos } = await import("@hardkas/localnet");
      const localState = await loadOrCreateLocalnetState();
      const unspent = getSpendableUtxos(localState, fromAddress);
      
      availableUtxos = unspent.map(u => ({
        outpoint: {
          transactionId: u.id.split(":")[0],
          index: Number(u.id.split(":")[2]) || 0
        },
        address: u.address,
        amountSompi: BigInt(u.amountSompi),
        scriptPublicKey: "mock-script"
      }));

      mode = "simulated";
    } else if (target.kind === "kaspa-node" || target.kind === "kaspa-rpc") {
      const { JsonWrpcKaspaClient } = await import("@hardkas/kaspa-rpc");
      const { resolveRuntimeConfig } = await import("@hardkas/node-orchestrator");
      
      rpcUrl = url || target.rpcUrl;
      if (!rpcUrl && target.kind === "kaspa-node") {
        rpcUrl = resolveRuntimeConfig({ 
          network: target.network as any, 
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
      mode = target.kind;
    }
  } catch (e) {
    if (url || networkId !== "simnet") {
      const { JsonWrpcKaspaClient } = await import("@hardkas/kaspa-rpc");
      const { resolveRuntimeConfig } = await import("@hardkas/node-orchestrator");
      rpcUrl = url;
      if (!rpcUrl) {
        rpcUrl = resolveRuntimeConfig({ network: networkId as any }).rpcUrl;
      }
      const client = new JsonWrpcKaspaClient({ rpcUrl });
      const rpcUtxos = await client.getUtxosByAddress(fromAddress);
      await client.close();
      
      availableUtxos = rpcUtxos.map(u => ({
        outpoint: u.outpoint,
        address: u.address,
        amountSompi: u.amountSompi,
        scriptPublicKey: u.scriptPublicKey || "unresolved"
      }));
      mode = "kaspa-rpc";
    } else {
      throw e;
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
    networkId: resolvedNetwork as any,
    mode: mode === "simulated" ? "simulated" : "real",
    ...(rpcUrl ? { rpcUrl } : {}),
    from: { input: from, address: fromAddress },
    to: { input: to, address: toAddress },
    amountSompi,
    plan
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
