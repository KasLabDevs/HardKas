import { useState, useEffect, useCallback } from "react";

declare global {
  interface Window {
    kasware?: any;
  }
}

export type KasWareLocalState = {
  installed: boolean;
  connected: boolean;
  supported: boolean;
  address?: string;
  network?: string;
  localNetworkDetected: boolean;
  errors: string[];
};

export function useKasWareLocal() {
  const [state, setState] = useState<KasWareLocalState>({
    installed: false,
    connected: false,
    supported: false,
    localNetworkDetected: false,
    errors: []
  });

  const checkStatus = useCallback(async () => {
    if (typeof window === "undefined" || !window.kasware) {
      setState(s => ({ ...s, installed: false }));
      return;
    }

    try {
      const provider = window.kasware;
      const accounts = await provider.getAccounts();
      const network = await provider.getNetwork();
      
      setState({
        installed: true,
        connected: accounts.length > 0,
        supported: true,
        address: accounts[0],
        network,
        // Common local/dev network strings for KasWare
        localNetworkDetected: ["kasparegtest", "localnet", "simnet"].includes(network),
        errors: []
      });
    } catch (e: any) {
      setState(s => ({ ...s, errors: [e.message] }));
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !window.kasware) return;

    const provider = window.kasware;
    checkStatus();

    const handleChange = () => checkStatus();
    
    provider.on("accountsChanged", handleChange);
    provider.on("networkChanged", handleChange);
    provider.on("disconnect", handleChange);

    return () => {
      if (provider.removeListener) {
        provider.removeListener("accountsChanged", handleChange);
        provider.removeListener("networkChanged", handleChange);
        provider.removeListener("disconnect", handleChange);
      }
    };
  }, [checkStatus]);

  return { state, refresh: checkStatus };
}

export function useConnectKasWareLocal() {
  const { refresh } = useKasWareLocal();

  const connect = async () => {
    if (typeof window === "undefined" || !window.kasware) return null;
    try {
      const accounts = await window.kasware.requestAccounts();
      await refresh();
      return accounts[0];
    } catch (e) {
      console.error("KasWare connection failed:", e);
      return null;
    }
  };

  return { connect };
}

export type KasWareSessionMatch = {
  walletAddress?: string;
  sessionAddress?: string;
  matches: boolean;
  reason?: "not-installed" | "not-connected" | "network-mismatch" | "address-mismatch" | "no-session";
};

export function useKasWareSessionMatch(sessionL1Address?: string | null) {
  const { state } = useKasWareLocal();

  let matches = false;
  let reason: KasWareSessionMatch["reason"];

  if (!state.installed) {
    reason = "not-installed";
  } else if (!state.connected) {
    reason = "not-connected";
  } else if (!sessionL1Address) {
    reason = "no-session";
  } else if (!state.localNetworkDetected) {
    reason = "network-mismatch";
  } else {
    // Normalization: Ensure lowercase for comparison as prefixes and some address types are case-insensitive
    // but canonical representation in HardKAS is consistently prefixed.
    const normalizedWallet = state.address?.toLowerCase().trim();
    const normalizedSession = sessionL1Address?.toLowerCase().trim();
    
    matches = normalizedWallet === normalizedSession;
    if (!matches) reason = "address-mismatch";
  }

  return {
    walletAddress: state.address,
    sessionAddress: sessionL1Address || undefined,
    matches,
    reason
  };
}
