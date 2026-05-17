import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useHardKas } from "../provider.js";

export type SandboxConnection = {
  id: string;
  createdAt: number;
  status: "pending" | "paired" | "expired" | "disconnected";
  sessionName?: string;
  l1Address?: string;
  l2Address?: `0x${string}`;
  transport: "local-sandbox";
  expiresAt: number;
};

export function useSandboxSessions() {
  const { config, subscribe } = useHardKas();
  const queryClient = useQueryClient();

  // SSE Sync via Shared Provider
  useEffect(() => {
    const sync = () => queryClient.invalidateQueries({ queryKey: ["sandbox", "sessions"] });
    
    return subscribe((event) => {
      if ([
        "sandbox-session-created",
        "sandbox-session-paired",
        "sandbox-session-expired",
        "sandbox-session-disconnected"
      ].includes(event.type)) {
        sync();
      }
    });
  }, [queryClient, subscribe]);

  return useQuery({
    queryKey: ["sandbox", "sessions"],
    queryFn: async () => {
      const baseUrl = config.devServerUrl || "";
      const url = baseUrl ? (baseUrl.endsWith("/") ? `${baseUrl}api/walletconnect/sandbox/sessions` : `${baseUrl}/api/walletconnect/sandbox/sessions`) : "/api/walletconnect/sandbox/sessions";
      const res = await fetch(url);
      const json = await res.json();
      return json.sessions as SandboxConnection[];
    }
  });
}

export function useCreateSandboxSession() {
  const { config } = useHardKas();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const baseUrl = config.devServerUrl || "";
      const url = baseUrl ? (baseUrl.endsWith("/") ? `${baseUrl}api/walletconnect/sandbox/create` : `${baseUrl}/api/walletconnect/sandbox/create`) : "/api/walletconnect/sandbox/create";
      const res = await fetch(url, { method: "POST" });
      return await res.json() as SandboxConnection;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sandbox", "sessions"] });
    }
  });
}

export function usePairSandboxSession() {
  const { config } = useHardKas();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const baseUrl = config.devServerUrl || "";
      const url = baseUrl ? (baseUrl.endsWith("/") ? `${baseUrl}api/walletconnect/sandbox/pair` : `${baseUrl}/api/walletconnect/sandbox/pair`) : "/api/walletconnect/sandbox/pair";
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id })
      });
      return await res.json() as SandboxConnection;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sandbox", "sessions"] });
    }
  });
}

export function useDisconnectSandboxSession() {
  const { config } = useHardKas();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const baseUrl = config.devServerUrl || "";
      const url = baseUrl ? (baseUrl.endsWith("/") ? `${baseUrl}api/walletconnect/sandbox/disconnect` : `${baseUrl}/api/walletconnect/sandbox/disconnect`) : "/api/walletconnect/sandbox/disconnect";
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id })
      });
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sandbox", "sessions"] });
    }
  });
}
