import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useHardKas } from "../provider.js";

export interface ArtifactSummary {
  artifactId: string;
  contentHash: string;
  schema: string;
  version: string;
  kind: string;
  mode: string;
  networkId: string;
  txId?: string;
  createdAt: string;
  path: string;
}

export function useArtifacts(schemaFilter?: string) {
  const { config, subscribe , apiFetch } = useHardKas();
  const queryClient = useQueryClient();

  useEffect(() => {
    const sync = () => queryClient.invalidateQueries({ queryKey: ["hardkas", "artifacts", schemaFilter || "all"] });
    
    return subscribe((event) => {
      if (["query-synced", "session-changed"].includes(event.type)) {
        sync();
      }
    });
  }, [schemaFilter, queryClient, subscribe]);

  return useQuery({
    queryKey: ["hardkas", "artifacts", schemaFilter || "all"],
    queryFn: async (): Promise<ArtifactSummary[]> => {
      try {
        const baseUrl = config.devServerUrl || "";
        const queryParams = schemaFilter ? `?schema=${schemaFilter}` : "";
        const url = baseUrl ? (baseUrl.endsWith("/") ? `${baseUrl}api/artifacts${queryParams}` : `${baseUrl}/api/artifacts${queryParams}`) : `/api/artifacts${queryParams}`;
        const response = await apiFetch(url);
        if (!response.ok) return [];
        const data = await response.json();
        return data.artifacts || [];
      } catch (e) {
        console.error("Failed to fetch artifacts from dev server:", e);
        return [];
      }
    },
    staleTime: 30000,
  });
}

export function useArtifact(id: string) {
  const { config, subscribe , apiFetch } = useHardKas();
  const queryClient = useQueryClient();

  useEffect(() => {
    const sync = () => queryClient.invalidateQueries({ queryKey: ["hardkas", "artifact", id] });
    
    return subscribe((event) => {
      if (["query-synced", "session-changed"].includes(event.type)) {
        sync();
      }
    });
  }, [id, queryClient, subscribe]);

  return useQuery({
    queryKey: ["hardkas", "artifact", id],
    queryFn: async (): Promise<any | null> => {
      if (!id) return null;
      try {
        const baseUrl = config.devServerUrl || "";
        const url = baseUrl ? (baseUrl.endsWith("/") ? `${baseUrl}api/artifacts/${id}` : `${baseUrl}/api/artifacts/${id}`) : `/api/artifacts/${id}`;
        const response = await apiFetch(url);
        if (!response.ok) return null;
        const data = await response.json();
        return data.artifact || null;
      } catch (e) {
        console.error(`Failed to fetch artifact detail for '${id}':`, e);
        return null;
      }
    },
    enabled: !!id,
    staleTime: 30000,
  });
}

export function useExplain(id: string) {
  const { config, apiFetch } = useHardKas();
  return useQuery({
    queryKey: ["hardkas", "explain", id],
    queryFn: async (): Promise<any | null> => {
      if (!id) return null;
      try {
        const baseUrl = config.devServerUrl || "";
        const url = baseUrl ? (baseUrl.endsWith("/") ? `${baseUrl}api/artifacts/${id}/explain` : `${baseUrl}/api/artifacts/${id}/explain`) : `/api/artifacts/${id}/explain`;
        const response = await apiFetch(url);
        if (!response.ok) return null;
        const data = await response.json();
        return data.data || null;
      } catch (e) {
        console.error(`Failed to explain artifact '${id}':`, e);
        return null;
      }
    },
    enabled: !!id,
    staleTime: Infinity,
  });
}

export function useWorkflow(txId: string) {
  // A workflow is just a specialized artifact view or aggregation of tx-plan, signed-tx, tx-receipt
  return useArtifacts("all"); // To be fleshed out, mock for now
}
