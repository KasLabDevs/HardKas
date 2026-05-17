import { useQuery, useMutation } from "@tanstack/react-query";
import { useHardKas } from "../provider.js";
import { useIgraAccount } from "./igra.js";
import { useHardKasSession } from "./session.js";
import { Address } from "viem";

export function useIgraReadContract(options: {
  address: Address;
  abi: any;
  functionName: string;
  args?: any[];
  enabled?: boolean;
  refetchInterval?: number;
}) {
  const { igraClient, config } = useHardKas();
  const { data: session } = useHardKasSession();

  return useQuery({
    queryKey: ["igra", "read", options.address, options.functionName, options.args, config.igraRpcUrl, session?.name],
    queryFn: async () => {
      return await igraClient.readContract({
        address: options.address,
        abi: options.abi,
        functionName: options.functionName,
        args: options.args
      });
    },
    enabled: options.enabled ?? true,
    refetchInterval: options.refetchInterval ?? false
  });
}

export function useIgraWriteContract() {
  // Note: For local/dev only. In a real app, this would use a wallet client from a provider.
  // Here we just provide a placeholder that could be extended with a local signer.
  return useMutation({
    mutationFn: async (params: { 
      address: Address; 
      abi: any; 
      functionName: string; 
      args?: any[];
      walletClient?: any;
    }) => {
      if (!params.walletClient) {
        throw new Error("A wallet client is required to write to a contract.");
      }
      return await params.walletClient.writeContract({
        address: params.address,
        abi: params.abi,
        functionName: params.functionName,
        args: params.args
      });
    }
  });
}

export function useIgraWaitForReceipt() {
  const { igraClient } = useHardKas();

  return useMutation({
    mutationFn: async (hash: `0x${string}`) => {
      return await igraClient.waitForTransactionReceipt({ hash });
    }
  });
}
