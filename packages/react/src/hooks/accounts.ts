import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useHardKas } from "../provider.js";

export interface HardKasAccountInfo {
  name: string;
  kind: string;
  address: string;
  balance: string;
  privateKeyEnv?: string;
  walletId?: string;
}

export interface HardKasAccountsResponse {
  accounts: HardKasAccountInfo[];
  provenance?: {
    authority: string;
    derivedFrom?: string;
    originalPath?: string;
    integrity: "verified" | "corrupted" | "invalid_json" | "unknown";
    replayScope: "local-only" | "global" | "unknown";
    consensusValidated: boolean;
  };
}

export function useAccounts() {
  const { config, subscribe } = useHardKas();
  const queryClient = useQueryClient();

  useEffect(() => {
    const sync = () => queryClient.invalidateQueries({ queryKey: ["hardkas", "accounts"] });
    
    return subscribe((event) => {
      if (["query-synced", "session-changed"].includes(event.type)) {
        sync();
      }
    });
  }, [queryClient, subscribe]);

  return useQuery({
    queryKey: ["hardkas", "accounts"],
    queryFn: async (): Promise<HardKasAccountsResponse> => {
      try {
        const baseUrl = config.devServerUrl || "";
        const url = baseUrl ? (baseUrl.endsWith("/") ? `${baseUrl}api/accounts` : `${baseUrl}/api/accounts`) : "/api/accounts";
        const response = await fetch(url);
        if (!response.ok) return { accounts: [] };
        const data = await response.json();
        return data || { accounts: [] };
      } catch (e) {
        console.error("Failed to fetch accounts from dev server:", e);
        return { accounts: [] };
      }
    },
    staleTime: 30000,
  });
}
