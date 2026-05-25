import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useHardKas } from "../provider.js";
import { useHardKasSession } from "./session.js";
import { useHardKasHealth } from "./health.js";

export function useIgraAccount() {
  const { data: session } = useHardKasSession();
  const { walletAddress , apiFetch } = useHardKas();

  const address = (walletAddress || session?.l2.address) as `0x${string}` | undefined;

  return {
    name: walletAddress ? "Browser Wallet" : session?.l2.account,
    address,
    isWallet: !!walletAddress,
    isLoading: !session && !walletAddress
  };
}

export function useIgraWallet() {
  const {
    providers,
    activeProvider,
    walletAddress,
    walletChainId,
    connectWallet,
    disconnectWallet,
    switchChain
  , apiFetch } = useHardKas();

  return {
    providers,
    activeProvider,
    walletAddress,
    walletChainId,
    connectWallet,
    disconnectWallet,
    switchChain,
    isConnected: !!walletAddress
  };
}

export function useIgraBalance(options: { refetchInterval?: number } = {}) {
  const { igraClient, config, subscribe , apiFetch } = useHardKas();
  const queryClient = useQueryClient();
  const { address } = useIgraAccount();

  useEffect(() => {
    const sync = () => queryClient.invalidateQueries({ queryKey: ["igra", "balance"] });
    return subscribe((event) => {
      if (["query-synced", "session-changed"].includes(event.type)) {
        sync();
      }
    });
  }, [queryClient, subscribe]);

  const { data: session } = useHardKasSession();
  const { data: health } = useHardKasHealth();

  const l2Status = (health as any)?.igra?.status || health?.l2?.status;
  const isL2Online = l2Status === "healthy" ||
    l2Status === "ok" ||
    l2Status === "running" ||
    l2Status === "online" ||
    (!!address && (address.startsWith("0xsim_") || address.startsWith("kaspa:sim_") || !address.startsWith("0x")));

  return useQuery({
    queryKey: ["igra", "balance", address, config.igraRpcUrl, session?.name],
    queryFn: async () => {
      if (!address) return 0n;

      if (address.startsWith("0xsim_") || !address.startsWith("0x") || l2Status === "simulated-mode") {
        try {
          const baseUrl = config.devServerUrl || "";
          const fetchUrl = baseUrl ? (baseUrl.endsWith("/") ? `${baseUrl}api/accounts` : `${baseUrl}/api/accounts`) : "/api/accounts";
          const res = await apiFetch(fetchUrl);
          if (res.ok) {
            const data = await res.json();
            // Try matching either address or name
            const match = (data.accounts || []).find((a: any) => 
              a.address.toLowerCase() === address.toLowerCase() || 
              a.name.toLowerCase() === address.toLowerCase()
            );
            if (match) {
              return BigInt(match.balanceSompi || match.balance || "0");
            }
          }
        } catch (e) {
          console.warn("Failed to fetch derived simulated L2 balance, falling back to 0:", e);
        }
        return 0n;
      }

      try {
        return await igraClient.getBalance({ address });
      } catch (e) {
        // Gracefully catch offline local L2 RPC connection errors
        return 0n;
      }
    },
    enabled: !!address && isL2Online,
    refetchInterval: options.refetchInterval ?? false
  });
}
