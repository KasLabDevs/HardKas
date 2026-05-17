import { useState, useEffect, useCallback } from "react";
import { createWalletClient, custom } from "viem";

declare global {
  interface Window {
    ethereum?: any;
  }
}

export type MetaMaskLocalState = {
  installed: boolean;
  connected: boolean;
  supported: boolean;
  account?: `0x${string}` | undefined;
  chainId?: number;
  localIgraDetected: boolean;
  errors: string[];
};

export function useMetaMaskLocal() {
  const [state, setState] = useState<MetaMaskLocalState>({
    installed: false,
    connected: false,
    supported: false,
    localIgraDetected: false,
    errors: []
  });

  const checkStatus = useCallback(async () => {
    if (typeof window === "undefined" || !window.ethereum) {
      setState(s => ({ ...s, installed: false }));
      return;
    }

    try {
      const provider = window.ethereum;
      const chainIdHex = await provider.request({ method: "eth_chainId" });
      const chainId = parseInt(chainIdHex as string, 16);
      const accounts = await provider.request({ method: "eth_accounts" }) as `0x${string}`[];
      
      setState({
        installed: true,
        connected: accounts.length > 0,
        supported: true,
        account: accounts[0] as `0x${string}` | undefined,
        chainId,
        localIgraDetected: chainId === 19416,
        errors: []
      });
    } catch (e: any) {
      setState(s => ({ ...s, errors: [e.message] }));
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !window.ethereum) return;
    
    const provider = window.ethereum;
    checkStatus();

    const handleChange = () => checkStatus();
    
    provider.on("accountsChanged", handleChange);
    provider.on("chainChanged", handleChange);
    provider.on("disconnect", handleChange);

    return () => {
      if (provider.removeListener) {
        provider.removeListener("accountsChanged", handleChange);
        provider.removeListener("chainChanged", handleChange);
        provider.removeListener("disconnect", handleChange);
      }
    };
  }, [checkStatus]);

  return { state, refresh: checkStatus };
}

export function useSwitchToLocalIgra() {
  const switchChain = async () => {
    if (typeof window === "undefined" || !window.ethereum) return;
    
    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: "0x4bd8" }] // 19416
      });
    } catch (e: any) {
      if (e.code === 4902) {
        // Add chain
        await window.ethereum.request({
          method: "wallet_addEthereumChain",
          params: [{
            chainId: "0x4bd8",
            chainName: "HardKas Igra Local",
            rpcUrls: ["http://127.0.0.1:8545"],
            nativeCurrency: { name: "iKAS", symbol: "iKAS", decimals: 18 }
          }]
        });
      }
    }
  };

  return { switchChain };
}

export function useIgraInjectedAccount(sessionL2Address?: string) {
  const { state } = useMetaMaskLocal();
  const matches = !!state.account && !!sessionL2Address && 
                  state.account.toLowerCase() === sessionL2Address.toLowerCase();

  return {
    injectedAddress: state.account,
    sessionAddress: sessionL2Address,
    matches
  };
}

export function useLocalIgraWalletClient() {
  const { state } = useMetaMaskLocal();

  const getClient = useCallback(() => {
    if (!state.connected || !window.ethereum) return null;
    return createWalletClient({
      account: state.account,
      transport: custom(window.ethereum)
    });
  }, [state.connected, state.account]);

  return { getClient };
}
