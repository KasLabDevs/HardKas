import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useHardKas } from "../provider.js";

export interface DeploymentSummary {
  artifactId: string;
  label: string;
  networkId: string;
  status: string;
  txId?: string;
  deployedAt: string;
  deployedAddresses: string[];
  deployer?: string;
  notes?: string;
}

export function useDeployments() {
  const { config, subscribe } = useHardKas();
  const queryClient = useQueryClient();

  useEffect(() => {
    const sync = () => queryClient.invalidateQueries({ queryKey: ["hardkas", "deployments"] });
    
    return subscribe((event) => {
      if (["query-synced", "session-changed"].includes(event.type)) {
        sync();
      }
    });
  }, [queryClient, subscribe]);

  return useQuery({
    queryKey: ["hardkas", "deployments"],
    queryFn: async (): Promise<DeploymentSummary[]> => {
      try {
        const baseUrl = config.devServerUrl || "";
        const url = baseUrl ? (baseUrl.endsWith("/") ? `${baseUrl}api/deployments` : `${baseUrl}/api/deployments`) : "/api/deployments";
        const response = await fetch(url);
        if (!response.ok) return [];
        const data = await response.json();
        return data.deployments || [];
      } catch (e) {
        console.error("Failed to fetch deployments from dev server:", e);
        return [];
      }
    },
    staleTime: 30000,
  });
}
