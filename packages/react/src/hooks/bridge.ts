/**
 * WARNING: ALPHA-ONLY LOCAL-RUNTIME COUPLING
 * 
 * This file directly imports `@hardkas/bridge-local` to perform local bridge simulation.
 * This puts local simulation logic and heavy CPU simulation directly into the React package,
 * meaning it is NOT browser-production safe without polyfills or is intended exclusively
 * for the local developer preview context.
 * 
 * TODO: In a future release, decouple this simulation code from the core `@hardkas/react` library.
 * The hooks should ideally make dev-server REST/SSE HTTP calls, or be extracted into a separate
 * package `@hardkas/react-local` to maintain clean, production-safe boundaries.
 */

import { useQuery, useMutation } from "@tanstack/react-query";
import { planBridgeEntry, simulatePrefixMining } from "@hardkas/bridge-local";
import { useHardKas } from "../provider.js";
import { useHardKasSession } from "./session.js";

export function useBridgeLocalPlan(options: { amountSompi: bigint; toIgra?: string } | null) {
  const { data: session } = useHardKasSession();
  const { config } = useHardKas();

  return useQuery({
    queryKey: ["bridge", "plan", session?.name, options?.amountSompi.toString(), options?.toIgra, config.localOnly],
    queryFn: async () => {
      if (!session || !options) return null;

      const targetAddress = options.toIgra || session.l2.address;
      if (!targetAddress) throw new Error("Target Igra address is required.");

      return planBridgeEntry({
        fromAddress: session.l1.address!,
        targetEvmAddress: targetAddress,
        amountSompi: options.amountSompi,
        networkId: "simnet", // Fixed for local simulation
        availableUtxos: [
          { 
            outpoint: { transactionId: "mock-utxo", index: 0 }, 
            address: session.l1.address!, 
            amountSompi: options.amountSompi * 2n, 
            scriptPublicKey: "mock-script" 
          }
        ]
      });
    },
    enabled: !!session && !!options,
  });
}

export function useBridgeLocalSimulation() {
  return useMutation({
    mutationFn: async (params: { payloadBase: any; prefix: string }) => {
      return simulatePrefixMining(params.payloadBase, params.prefix, { timeoutMs: 10000 });
    }
  });
}
