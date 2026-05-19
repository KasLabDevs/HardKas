import { useQuery } from "@tanstack/react-query";
import { useHardKas } from "../provider.js";
import { useHardKasSession } from "./session.js";
import { useHardKasHealth } from "./health.js";

export function useIgraAccount() {
  const { data: session } = useHardKasSession();
  const { walletAddress } = useHardKas();

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
  } = useHardKas();

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
  const { igraClient } = useHardKas();
  const { address } = useIgraAccount();

  const { data: session } = useHardKasSession();
  const { config } = useHardKas();
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
        return 500000000000000000000n; // 500 iKAS
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
