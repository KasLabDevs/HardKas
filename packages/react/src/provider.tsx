import React, { createContext, useContext, useMemo } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createPublicClient, http, PublicClient } from "viem";

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
    subscribe
  }), [config, igraClient, queryClient, sseStatus, lastEvent, subscribe]);

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
