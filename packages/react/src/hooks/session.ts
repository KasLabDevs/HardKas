import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useHardKas } from "../provider.js";

export interface SessionInfo {
  readonly name: string;
  readonly l1: {
    readonly wallet: string;
    readonly address?: string;
  };
  readonly l2: {
    readonly account: string;
    readonly address?: string;
  };
  readonly bridge: {
    readonly mode: string;
  };
  readonly health: {
    readonly isHealthy: boolean;
    readonly warnings: string[];
  };
  readonly diagnostics?: string[];
}

export function useHardKasSession(name?: string) {
  const { config, subscribe } = useHardKas();
  const queryClient = useQueryClient();
  const sessionToResolve = name || config.sessionName;

  // SSE Sync via Shared Provider
  useEffect(() => {
    const sync = () => queryClient.invalidateQueries({ queryKey: ["hardkas", "session"] });
    
    return subscribe((event) => {
      if (["session-changed", "session-created", "session-deleted"].includes(event.type)) {
        sync();
      }
    });
  }, [queryClient, subscribe]);

  return useQuery({
    queryKey: ["hardkas", "session", sessionToResolve || "active"],
    queryFn: async (): Promise<SessionInfo | null> => {
      try {
        const baseUrl = config.devServerUrl || "";
        const url = baseUrl ? (baseUrl.endsWith("/") ? `${baseUrl}api/session` : `${baseUrl}/api/session`) : "/api/session";
        const response = await fetch(url);
        const json = await response.json();
        const active = json.active;
        if (!active) return null;

        // Redact any potential secrets and ensure structured response
        return {
          name: active.name,
          l1: { wallet: active.l1?.wallet, address: active.l1?.address },
          l2: { account: active.l2?.account, address: active.l2?.address },
          bridge: { mode: active.bridge?.mode },
          health: active.health || { isHealthy: true, warnings: [] },
          diagnostics: json.diagnostics || []
        };
      } catch (e) {
        console.error("Failed to fetch session from dev server:", e);
        return null;
      }
    },
    staleTime: 30000, // Rely on SSE for updates
  });
}
