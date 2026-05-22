import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useHardKas } from "../provider.js";

export interface ActivityEvent {
  eventId: string;
  kind: string;
  domain: string;
  workflowId: string;
  txId?: string;
  artifactId?: string;
  networkId: string;
  timestamp: string;
  payload: any;
}

export function useActivity() {
  const { config, subscribe } = useHardKas();
  const queryClient = useQueryClient();

  useEffect(() => {
    const sync = () => queryClient.invalidateQueries({ queryKey: ["hardkas", "activity"] });
    
    return subscribe((event) => {
      // Invalidate on any query-synced event so that the activity feed updates immediately
      if (["query-synced", "session-changed"].includes(event.type)) {
        sync();
      }
    });
  }, [queryClient, subscribe]);

  return useQuery({
    queryKey: ["hardkas", "activity"],
    queryFn: async (): Promise<ActivityEvent[]> => {
      try {
        const baseUrl = config.devServerUrl || "";
        const url = baseUrl ? (baseUrl.endsWith("/") ? `${baseUrl}api/activity` : `${baseUrl}/api/activity`) : "/api/activity";
        const response = await fetch(url);
        if (!response.ok) return [];
        const data = await response.json();
        return data.activity || [];
      } catch (e) {
        console.error("Failed to fetch activity from dev server:", e);
        return [];
      }
    },
    staleTime: 5000, // Frequent updates safe because it's local dev
  });
}
