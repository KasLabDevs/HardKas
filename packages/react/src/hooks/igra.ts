import { useQuery } from "@tanstack/react-query";
import { useHardKas } from "../provider.js";
import { useHardKasSession } from "./session.js";

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

  return useQuery({
    queryKey: ["igra", "balance", address, config.igraRpcUrl, session?.name],
    queryFn: async () => {
      if (!address) return 0n;
      return await igraClient.getBalance({ address });
    },
    enabled: !!address,
    refetchInterval: options.refetchInterval ?? false
  });
}
