import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useHardKas } from "../provider.js";

export interface HealthInfo {
  status: "ok" | "error" | "warning";
  timestamp: string;
  l1?: {
    status: string;
    networkId: string;
    daaScore: number | string;
    rpcUrl: string;
  };
  l2?: {
    status: string;
    chainId: number;
    blockHeight: number;
    rpcUrl: string;
  };
  warnings: string[];
}

export function useHardKasHealth() {
  const { config, subscribe } = useHardKas();
  const queryClient = useQueryClient();

  useEffect(() => {
    const sync = () => queryClient.invalidateQueries({ queryKey: ["hardkas", "health"] });
    
    return subscribe((event) => {
      if (["health-changed", "session-changed"].includes(event.type)) {
        sync();
      }
    });
  }, [queryClient, subscribe]);

  return useQuery({
    queryKey: ["hardkas", "health"],
    queryFn: async (): Promise<HealthInfo | null> => {
      try {
        const baseUrl = config.devServerUrl || "";
        const url = baseUrl ? (baseUrl.endsWith("/") ? `${baseUrl}api/health` : `${baseUrl}/api/health`) : "/api/health";
        const res = await fetch(url);
        if (!res || !res.ok) {
          throw new Error("Failed to fetch health from dev server");
        }
        return await res.json();
      } catch (e) {
        console.error("Failed to fetch health from dev server:", e);
        throw e; // Let react-query handle the error state
      }
    },
    refetchInterval: 30000, // Background poll as fallback
    retry: 2
  });
}
