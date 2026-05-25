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

export interface UseReplayStatusResponse {
  replays: ReplaySummary[];
  pendingReplays: any[];
  pendingReplay: boolean;
  reason?: string;
}

export function useReplayStatus() {
  const { config, subscribe , apiFetch } = useHardKas();
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
    queryFn: async (): Promise<UseReplayStatusResponse> => {
      try {
        const baseUrl = config.devServerUrl || "";
        const url = baseUrl ? (baseUrl.endsWith("/") ? `${baseUrl}api/replay` : `${baseUrl}/api/replay`) : "/api/replay";
        const response = await apiFetch(url);
        if (!response.ok) return { replays: [], pendingReplays: [], pendingReplay: false };
        const data = await response.json();
        
        const formatReplay = (r: any): ReplaySummary => {
          return {
            artifactId: r.artifactId,
            txId: r.payload?.txId || r.txId,
            planOk: r.payload?.planOk ?? false,
            receiptOk: r.payload?.receiptOk ?? false,
            invariantsOk: r.payload?.invariantsOk ?? false,
            ok: (r.payload?.planOk && r.payload?.receiptOk && r.payload?.invariantsOk) ? true : false,
            checks: r.payload?.checks || {
              workflowDeterministic: "unknown",
              consensusValidation: "unknown",
              l2BridgeCorrectness: "unknown"
            },
            errors: r.payload?.errors || [],
            divergencesCount: r.payload?.divergencesCount || 0,
            createdAt: r.createdAt || r.timestamp || new Date().toISOString()
          };
        };
        
        return {
          replays: (data.replays || []).map(formatReplay),
          pendingReplays: data.pendingReplays || [],
          pendingReplay: data.pendingReplay || false,
          reason: data.reason
        };
      } catch (e) {
        console.error("Failed to fetch replay status from dev server:", e);
        return { replays: [], pendingReplays: [], pendingReplay: false };
      }
    },
    staleTime: 30000,
  });
}

export function useReplayDetail(txId: string) {
  const { config, subscribe , apiFetch } = useHardKas();
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
        const response = await apiFetch(url);
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
