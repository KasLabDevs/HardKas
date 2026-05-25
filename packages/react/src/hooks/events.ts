import { useQuery } from "@tanstack/react-query";
import { useHardKas } from "../provider.js";
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

export interface HardKasEventInfo {
  eventId: string;
  kind: string;
  domain: string;
  workflowId: string;
  correlationId: string;
  causationId: string | null;
  txId: string | null;
  artifactId: string | null;
  networkId: string;
  timestamp: string | null;
  payload: any;
}

export interface UseEventsResponse {
  events: HardKasEventInfo[];
  observabilityDrift?: boolean;
  reason?: string;
}

export function useEvents(kind?: string, txId?: string) {
  const { config, subscribe , apiFetch } = useHardKas();
  const queryClient = useQueryClient();
  const queryKey = ["hardkas", "events", kind, txId];

  useEffect(() => {
    return subscribe((event) => {
      // Whenever a new event arrives, invalidate the events query so we re-fetch
      queryClient.invalidateQueries({ queryKey: ["hardkas", "events"] });
    });
  }, [queryClient, subscribe]);

  return useQuery({
    queryKey,
    queryFn: async (): Promise<UseEventsResponse> => {
      try {
        const baseUrl = config.devServerUrl || "";
        const queryParams = new URLSearchParams();
        if (kind) queryParams.append("kind", kind);
        if (txId) queryParams.append("txId", txId);
        const queryStr = queryParams.toString() ? `?${queryParams.toString()}` : "";
        
        const url = baseUrl 
          ? (baseUrl.endsWith("/") ? `${baseUrl}api/events${queryStr}` : `${baseUrl}/api/events${queryStr}`) 
          : `/api/events${queryStr}`;
          
        const response = await apiFetch(url);
        if (!response.ok) return { events: [] };
        const data = await response.json();
        return {
          events: data.events || [],
          observabilityDrift: data.observabilityDrift,
          reason: data.reason
        };
      } catch (e) {
        console.error("Failed to fetch events from dev server:", e);
        return { events: [] };
      }
    },
    staleTime: 5000,
  });
}
