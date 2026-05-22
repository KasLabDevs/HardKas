import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useHardKas } from "../provider.js";

export interface ReplaySummary {
  artifactId: string;
  txId: string;
  planOk: boolean;
  receiptOk: boolean;
  invariantsOk: boolean;
  ok: boolean;
  checks: {
    workflowDeterministic: string;
    consensusValidation: string;
    l2BridgeCorrectness: string;
  };
  errors: string[];
  divergencesCount: number;
  createdAt: string;
}

export function useReplayStatus() {
  const { config, subscribe } = useHardKas();
  const queryClient = useQueryClient();

  useEffect(() => {
    const sync = () => queryClient.invalidateQueries({ queryKey: ["hardkas", "replay"] });
    
    return subscribe((event) => {
      if (["query-synced", "session-changed"].includes(event.type)) {
        sync();
      }
    });
  }, [queryClient, subscribe]);

  return useQuery({
    queryKey: ["hardkas", "replay"],
    queryFn: async (): Promise<ReplaySummary[]> => {
      try {
        const baseUrl = config.devServerUrl || "";
        const url = baseUrl ? (baseUrl.endsWith("/") ? `${baseUrl}api/replay` : `${baseUrl}/api/replay`) : "/api/replay";
        const response = await fetch(url);
        if (!response.ok) return [];
        const data = await response.json();
        return data.replays || [];
      } catch (e) {
        console.error("Failed to fetch replay status from dev server:", e);
        return [];
      }
    },
    staleTime: 30000,
  });
}

export function useReplayDetail(txId: string) {
  const { config, subscribe } = useHardKas();
  const queryClient = useQueryClient();

  useEffect(() => {
    const sync = () => queryClient.invalidateQueries({ queryKey: ["hardkas", "replay", txId] });
    
    return subscribe((event) => {
      if (["query-synced", "session-changed"].includes(event.type)) {
        sync();
      }
    });
  }, [txId, queryClient, subscribe]);

  return useQuery({
    queryKey: ["hardkas", "replay", txId],
    queryFn: async (): Promise<any | null> => {
      if (!txId) return null;
      try {
        const baseUrl = config.devServerUrl || "";
        const url = baseUrl ? (baseUrl.endsWith("/") ? `${baseUrl}api/replay/${txId}` : `${baseUrl}/api/replay/${txId}`) : `/api/replay/${txId}`;
        const response = await fetch(url);
        if (!response.ok) return null;
        const data = await response.json();
        return data.replay || null;
      } catch (e) {
        console.error(`Failed to fetch replay details for transaction '${txId}':`, e);
        return null;
      }
    },
    enabled: !!txId,
    staleTime: 30000,
  });
}
