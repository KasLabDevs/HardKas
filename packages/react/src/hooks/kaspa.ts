import { useQuery } from "@tanstack/react-query";
import { useHardKas } from "../provider.js";
import { useHardKasSession } from "./session.js";

export function useKaspaWallet() {
  const { data: session } = useHardKasSession();
  return {
    name: session?.l1.wallet,
    address: session?.l1.address,
    isLoading: !session
  };
}

export function useKaspaBalance(options: { refetchInterval?: number } = {}) {
  const { config } = useHardKas();
  const { address, name } = useKaspaWallet();

  return useQuery({
    queryKey: ["kaspa", "balance", address, config.kaspaRpcUrl, name],
    queryFn: async () => {
      if (!address) return 0n;
      
      const url = config.kaspaRpcUrl || "http://127.0.0.1:16110";
      try {
        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "getBalanceByAddressRequest",
            params: { address }
          })
        });
        const json = await response.json();
        return BigInt(json.result?.balance || 0);
      } catch (e) {
        console.error("Failed to fetch Kaspa balance:", e);
        return 0n;
      }
    },
    enabled: !!address,
    refetchInterval: options.refetchInterval ?? false
  });
}
