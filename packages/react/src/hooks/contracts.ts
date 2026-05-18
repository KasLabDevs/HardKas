import { useQuery, useMutation } from "@tanstack/react-query";
import { useHardKas } from "../provider.js";
import { useHardKasSession } from "./session.js";
import { Address, createWalletClient, custom } from "viem";

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
  const { activeProvider, walletAddress, igraClient } = useHardKas();

  return useMutation({
    mutationFn: async (params: { 
      address: Address; 
      abi: any; 
      functionName: string; 
      args?: any[];
      walletClient?: any;
    }) => {
      let client = params.walletClient;
      if (!client) {
        if (!activeProvider) {
          throw new Error("No active browser wallet connected and no walletClient was provided.");
        }
        if (!walletAddress) {
          throw new Error("No active account address available on connected wallet.");
        }
        client = createWalletClient({
          account: walletAddress as `0x${string}`,
          chain: igraClient.chain,
          transport: custom(activeProvider.provider)
        });
      }
      return await client.writeContract({
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
