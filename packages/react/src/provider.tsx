import React, { createContext, useContext, useMemo } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createPublicClient, http, PublicClient } from "viem";

export interface EIP6963ProviderInfo {
  uuid: string;
  name: string;
  icon: string;
  rdns: string;
}

export interface EIP6963ProviderDetail {
  info: EIP6963ProviderInfo;
  provider: any;
}

export interface EIP6963AnnounceProviderEvent extends Event {
  detail: EIP6963ProviderDetail;
}

export interface HardKasReactConfig {
  readonly kaspaRpcUrl?: string;
  readonly igraRpcUrl?: string;
  readonly workspacePath?: string;
  readonly sessionName?: string;
  readonly localOnly?: boolean;
  readonly devServerUrl?: string;
}

export type SSEStatus = "connecting" | "connected" | "disconnected" | "reconnecting" | "failed";

export interface RuntimeEvent {
  type: string;
  payload?: any;
  timestamp: string;
}

export type EventCallback = (event: RuntimeEvent) => void;

export interface HardKasContextValue {
  readonly config: HardKasReactConfig;
  readonly igraClient: PublicClient;
  readonly queryClient: QueryClient;
  readonly sseStatus: SSEStatus;
  readonly lastEvent: RuntimeEvent | null;
  readonly subscribe: (callback: EventCallback) => () => void;
  readonly providers: EIP6963ProviderDetail[];
  readonly activeProvider: EIP6963ProviderDetail | null;
  readonly walletAddress: string | null;
  readonly walletChainId: number | null;
  readonly connectWallet: (detail: EIP6963ProviderDetail) => Promise<void>;
  readonly disconnectWallet: () => void;
  readonly switchChain: (chainId: number) => Promise<void>;
}

const HardKasContext = createContext<HardKasContextValue | undefined>(undefined);

export interface HardKasProviderProps {
  readonly config: HardKasReactConfig;
  readonly children: React.ReactNode;
  readonly queryClient?: QueryClient;
}

export function HardKasProvider({ config, children, queryClient: externalQueryClient }: HardKasProviderProps) {
  const queryClient = useMemo(() => externalQueryClient ?? new QueryClient(), [externalQueryClient]);
  const [sseStatus, setSseStatus] = React.useState<SSEStatus>("disconnected");
  const [lastEvent, setLastEvent] = React.useState<RuntimeEvent | null>(null);
  const listeners = React.useRef<Set<EventCallback>>(new Set());
  const eventSource = React.useRef<EventSource | null>(null);
  const reconnectTimer = React.useRef<any>(null);
  const backoffMs = React.useRef(500);

  // EIP-6963 Multi-wallet states
  const [providers, setProviders] = React.useState<EIP6963ProviderDetail[]>([]);
  const [activeProvider, setActiveProvider] = React.useState<EIP6963ProviderDetail | null>(null);
  const [walletAddress, setWalletAddress] = React.useState<string | null>(null);
  const [walletChainId, setWalletChainId] = React.useState<number | null>(null);

  const subscribe = React.useCallback((callback: EventCallback) => {
    listeners.current.add(callback);
    return () => listeners.current.delete(callback);
  }, []);

  const connect = React.useCallback(() => {
    if (typeof window === "undefined") return;
    if (!config.devServerUrl) {
      setSseStatus("disconnected");
      return;
    }
    if (typeof EventSource === "undefined") {
      setSseStatus("failed");
      return;
    }
    if (eventSource.current) {
      eventSource.current.close();
    }

    setSseStatus("connecting");
    const baseUrl = config.devServerUrl;
    const url = baseUrl.endsWith("/") ? `${baseUrl}api/stream` : `${baseUrl}/api/stream`;
    const es = new EventSource(url);
    eventSource.current = es;

    es.onopen = () => {
      setSseStatus("connected");
      backoffMs.current = 500;
    };

    es.onerror = () => {
      es.close();
      eventSource.current = null;
      setSseStatus("reconnecting");
      
      const nextBackoff = Math.min(backoffMs.current * 2, 10000);
      backoffMs.current = nextBackoff;
      
      reconnectTimer.current = setTimeout(() => {
        connect();
      }, nextBackoff);
    };

    es.onmessage = (e) => {
      const event: RuntimeEvent = {
        type: "message",
        payload: e.data,
        timestamp: new Date().toISOString()
      };
      setLastEvent(event);
      listeners.current.forEach(l => l(event));
    };

    // Listen for named events if the server sends them
    const namedEvents = [
      "session-changed",
      "session-created",
      "session-deleted",
      "health-changed",
      "sandbox-session-created",
      "sandbox-session-paired",
      "sandbox-session-expired",
      "sandbox-session-disconnected"
    ];
    namedEvents.forEach(type => {
      es.addEventListener(type, (e: any) => {
        const event: RuntimeEvent = {
          type,
          payload: e.data ? JSON.parse(e.data) : undefined,
          timestamp: new Date().toISOString()
        };
        setLastEvent(event);
        listeners.current.forEach(l => l(event));
      });
    });
  }, [config.devServerUrl]);

  React.useEffect(() => {
    connect();
    return () => {
      if (eventSource.current) {
        eventSource.current.close();
        eventSource.current = null;
      }
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current);
      }
    };
  }, [connect]);

  // EIP-6963 Discovery Loop
  React.useEffect(() => {
    if (typeof window === "undefined") return;

    const handleAnnounce = (event: Event) => {
      const detail = (event as any).detail as EIP6963ProviderDetail;
      if (!detail || !detail.info || !detail.provider) return;
      
      setProviders(prev => {
        if (prev.some(p => p.info.rdns === detail.info.rdns)) return prev;
        return [...prev, detail];
      });
    };

    window.addEventListener("eip6963:announceProvider", handleAnnounce as any);
    window.dispatchEvent(new Event("eip6963:requestProvider"));

    return () => {
      window.removeEventListener("eip6963:announceProvider", handleAnnounce as any);
    };
  }, []);

  // Wallet Actions
  const connectWallet = React.useCallback(async (detail: EIP6963ProviderDetail) => {
    try {
      const accounts = await detail.provider.request({ method: "eth_requestAccounts" });
      const chainIdHex = await detail.provider.request({ method: "eth_chainId" });
      const chainId = typeof chainIdHex === "string" ? parseInt(chainIdHex, 16) : Number(chainIdHex);

      setActiveProvider(detail);
      if (accounts && accounts[0]) {
        setWalletAddress(accounts[0]);
      }
      setWalletChainId(chainId);
      
      if (typeof window !== "undefined") {
        window.localStorage.setItem("hardkas:active-wallet", detail.info.rdns);
      }
    } catch (err) {
      console.error("Failed to connect wallet:", err);
      throw err;
    }
  }, []);

  const disconnectWallet = React.useCallback(() => {
    setActiveProvider(null);
    setWalletAddress(null);
    setWalletChainId(null);
    if (typeof window !== "undefined") {
      window.localStorage.removeItem("hardkas:active-wallet");
    }
  }, []);

  const switchChain = React.useCallback(async (targetChainId: number) => {
    if (!activeProvider) {
      throw new Error("No active wallet connected");
    }
    const hexChainId = `0x${targetChainId.toString(16)}`;
    try {
      await activeProvider.provider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: hexChainId }],
      });
      setWalletChainId(targetChainId);
    } catch (err: any) {
      // 4902 is the error code for unrecognized chain
      if (err.code === 4902) {
        if (targetChainId === 19416) {
          // Add Igra Local Default
          await activeProvider.provider.request({
            method: "wallet_addEthereumChain",
            params: [{
              chainId: hexChainId,
              chainName: "Igra Local",
              nativeCurrency: { name: "Igra Kaspa", symbol: "iKAS", decimals: 18 },
              rpcUrls: [config.igraRpcUrl || "http://127.0.0.1:8545"],
            }],
          });
          setWalletChainId(targetChainId);
        } else {
          throw err;
        }
      } else {
        throw err;
      }
    }
  }, [activeProvider, config.igraRpcUrl]);

  // SSR hydration-safe auto-reconnect logic
  React.useEffect(() => {
    if (typeof window === "undefined" || providers.length === 0 || activeProvider) return;
    const savedRdns = window.localStorage.getItem("hardkas:active-wallet");
    if (savedRdns) {
      const match = providers.find(p => p.info.rdns === savedRdns);
      if (match) {
        connectWallet(match).catch(() => {});
      }
    }
  }, [providers, activeProvider, connectWallet]);

  // Handle active provider account or chain changes
  React.useEffect(() => {
    if (!activeProvider) {
      setWalletAddress(null);
      setWalletChainId(null);
      return;
    }

    const provider = activeProvider.provider;

    const handleAccountsChanged = (accounts: string[]) => {
      if (accounts && accounts[0]) {
        setWalletAddress(accounts[0]);
      } else {
        // User disconnected their account manually
        setActiveProvider(null);
        setWalletAddress(null);
        setWalletChainId(null);
        if (typeof window !== "undefined") {
          window.localStorage.removeItem("hardkas:active-wallet");
        }
      }
    };

    const handleChainChanged = (chainIdHex: string) => {
      const chainId = typeof chainIdHex === "string" ? parseInt(chainIdHex, 16) : Number(chainIdHex);
      setWalletChainId(chainId);
    };

    const handleDisconnect = () => {
      setActiveProvider(null);
      setWalletAddress(null);
      setWalletChainId(null);
      if (typeof window !== "undefined") {
        window.localStorage.removeItem("hardkas:active-wallet");
      }
    };

    if (provider.on) {
      provider.on("accountsChanged", handleAccountsChanged);
      provider.on("chainChanged", handleChainChanged);
      provider.on("disconnect", handleDisconnect);
    }

    return () => {
      if (provider.removeListener) {
        provider.removeListener("accountsChanged", handleAccountsChanged);
        provider.removeListener("chainChanged", handleChainChanged);
        provider.removeListener("disconnect", handleDisconnect);
      }
    };
  }, [activeProvider]);

  const igraClient = useMemo(() => {
    return createPublicClient({
      chain: {
        id: 19416, // Igra Local Default
        name: "Igra Local",
        nativeCurrency: { name: "Igra Kaspa", symbol: "iKAS", decimals: 18 },
        rpcUrls: {
          default: { http: [config.igraRpcUrl || "http://127.0.0.1:8545"] },
        },
      },
      transport: http(config.igraRpcUrl || "http://127.0.0.1:8545"),
    });
  }, [config.igraRpcUrl]);

  const value = useMemo(() => ({
    config: {
      ...config,
      localOnly: config.localOnly ?? true
    },
    igraClient,
    queryClient,
    sseStatus,
    lastEvent,
    subscribe,
    providers,
    activeProvider,
    walletAddress,
    walletChainId,
    connectWallet,
    disconnectWallet,
    switchChain
  }), [
    config,
    igraClient,
    queryClient,
    sseStatus,
    lastEvent,
    subscribe,
    providers,
    activeProvider,
    walletAddress,
    walletChainId,
    connectWallet,
    disconnectWallet,
    switchChain
  ]);

  return (
    <HardKasContext.Provider value={value}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </HardKasContext.Provider>
  );
}

export function useHardKas() {
  const context = useContext(HardKasContext);
  if (!context) {
    throw new Error("useHardKas must be used within a HardKasProvider");
  }
  return context;
}
