import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useHardKas } from "../provider.js";

export interface OverviewStats {
  projectName: string;
  network: string;
  workspaceRoot: string;
  artifactDir: string;
  queryStorePath: string;
  runtimeState: "EMPTY" | "ACTIVE" | "PENDING" | "DEGRADED" | "CORRUPTED" | "VERIFIED";
  runtimeReason: string;
  recommendedAction: string;
  guarantees: {
    artifactIntegrity: "available" | "failed" | "not_checked";
    localReplay: "verified" | "failed" | "not_checked";
    consensusValidated: boolean;
    networkFinality: boolean;
  };
  counts: {
    artifacts: number;
    transactions: number;
    events: number;
    replays: number;
    pendingReplays: number;
    corruptedArtifacts: number;
    degradedProjections: number;
  };
}

export function useOverview() {
  const { config, subscribe, apiFetch } = useHardKas();
  const queryClient = useQueryClient();

  useEffect(() => {
    const sync = () =>
      queryClient.invalidateQueries({ queryKey: ["hardkas", "overview"] });

    return subscribe((event) => {
      if (["query-synced", "session-changed"].includes(event.type)) {
        sync();
      }
    });
  }, [queryClient, subscribe]);

  return useQuery({
    queryKey: ["hardkas", "overview"],
    queryFn: async (): Promise<OverviewStats | null> => {
      try {
        const baseUrl = config.devServerUrl || "";
        const url = baseUrl
          ? baseUrl.endsWith("/")
            ? `${baseUrl}api/overview`
            : `${baseUrl}/api/overview`
          : "/api/overview";
        const response = await apiFetch(url);
        if (!response.ok) return null;
        return await response.json();
      } catch (e) {
        console.error("Failed to fetch overview stats from dev server:", e);
        return null;
      }
    },
    staleTime: 60000
  });
}
