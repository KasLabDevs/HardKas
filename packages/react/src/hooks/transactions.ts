import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useHardKas } from "../provider.js";

export interface TransactionSummary {
  id: string;
  txId?: string;
  planId?: string;
  signedId?: string;
  status: string;
  from: string;
  to: string;
  amountSompi: string;
  amount: string;
  feeSompi?: string;
  timestamp: string;
  mode: string;
  networkId: string;
  layer: "L1" | "L2";
}

export interface LineageNode {
  id: string;
  label: string;
  schema: string;
}

export interface LineageEdge {
  from: string;
  to: string;
  label: string;
}

export interface TransactionDetail {
  id: string;
  plan: any;
  signed: any;
  receipt: any;
  trace: any;
  replay: any;
  lineage: {
    nodes: LineageNode[];
    edges: LineageEdge[];
  };
}

export function useTransactions() {
  const { config, subscribe, apiFetch } = useHardKas();
  const queryClient = useQueryClient();

  useEffect(() => {
    const sync = () =>
      queryClient.invalidateQueries({ queryKey: ["hardkas", "transactions"] });

    return subscribe((event) => {
      if (["query-synced", "session-changed"].includes(event.type)) {
        sync();
      }
    });
  }, [queryClient, subscribe]);

  return useQuery({
    queryKey: ["hardkas", "transactions"],
    queryFn: async (): Promise<TransactionSummary[]> => {
      try {
        const baseUrl = config.devServerUrl || "";
        const url = baseUrl
          ? baseUrl.endsWith("/")
            ? `${baseUrl}api/transactions`
            : `${baseUrl}/api/transactions`
          : "/api/transactions";
        const response = await apiFetch(url);
        if (!response.ok) return [];
        const data = await response.json();
        return data.transactions || [];
      } catch (e) {
        console.error("Failed to fetch transactions from dev server:", e);
        return [];
      }
    },
    staleTime: 10000
  });
}

export function useTransaction(id: string) {
  const { config, subscribe, apiFetch } = useHardKas();
  const queryClient = useQueryClient();

  useEffect(() => {
    const sync = () =>
      queryClient.invalidateQueries({ queryKey: ["hardkas", "transaction", id] });

    return subscribe((event) => {
      if (["query-synced", "session-changed"].includes(event.type)) {
        sync();
      }
    });
  }, [id, queryClient, subscribe]);

  return useQuery({
    queryKey: ["hardkas", "transaction", id],
    queryFn: async (): Promise<TransactionDetail | null> => {
      if (!id) return null;
      try {
        const baseUrl = config.devServerUrl || "";
        const url = baseUrl
          ? baseUrl.endsWith("/")
            ? `${baseUrl}api/transactions/${id}`
            : `${baseUrl}/api/transactions/${id}`
          : `/api/transactions/${id}`;
        const response = await apiFetch(url);
        if (!response.ok) return null;
        return await response.json();
      } catch (e) {
        console.error(`Failed to fetch transaction detail for '${id}':`, e);
        return null;
      }
    },
    enabled: !!id,
    staleTime: 10000
  });
}
