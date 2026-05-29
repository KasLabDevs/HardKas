export interface HardkasClientOptions {
  baseUrl?: string;
  network?: string;
}

export interface ClientEnvelope<T> {
  ok: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
  warnings: string[];
  meta: {
    workspace: string;
    network: string;
    mode?: string;
  };
}

export function createHardkasClient(options: HardkasClientOptions = {}) {
  const baseUrl = options.baseUrl || "http://127.0.0.1:7420";
  const defaultHeaders = {
    "Content-Type": "application/json",
    "X-Hardkas-Request": "true"
  };

  async function fetchApi<T>(
    path: string,
    init?: RequestInit
  ): Promise<ClientEnvelope<T>> {
    try {
      const response = await fetch(`${baseUrl}${path}`, {
        ...init,
        headers: { ...defaultHeaders, ...init?.headers }
      });
      const data = await response.json();
      return data as ClientEnvelope<T>;
    } catch (e: any) {
      return {
        ok: false,
        error: { code: "FETCH_FAILED", message: e.message },
        warnings: [],
        meta: {
          workspace: "unknown",
          network: options.network || "simulated",
          mode: "unknown"
        }
      };
    }
  }

  return {
    accounts: {
      list: () => fetchApi<any[]>("/api/accounts")
    },
    tx: {
      plan: (params: {
        from: string;
        to: string;
        amountSompi: string;
        feeRate?: string;
      }) =>
        fetchApi<any>("/api/tx/plan", { method: "POST", body: JSON.stringify(params) }),
      sign: (params: { planId: string; account: string }) =>
        fetchApi<any>("/api/tx/sign", { method: "POST", body: JSON.stringify(params) }),
      send: (params: {
        signedTxId?: string;
        from?: string;
        to?: string;
        amountSompi?: string;
        feeRate?: string;
        allowDevAutoSign?: boolean;
      }) =>
        fetchApi<any>("/api/tx/send", { method: "POST", body: JSON.stringify(params) }),
      receipt: (id: string) => fetchApi<any>(`/api/tx/receipt/${id}`)
    },
    artifacts: {
      explain: (id: string) => fetchApi<any>(`/api/artifacts/${id}/explain`),
      replay: (id: string) =>
        fetchApi<any>(`/api/artifacts/${id}/replay`, { method: "POST" }),
      watch: (
        callback: (artifact: any) => void,
        options?: {
          type?: string;
          lineage?: boolean;
          replay?: boolean;
          transport?: "sse" | "poll";
          intervalMs?: number;
        }
      ) => {
        const transport = options?.transport || "sse";
        const intervalMs = options?.intervalMs || 2000;
        let active = true;
        let cleanup = () => {
          active = false;
        };

        if (transport === "sse" && typeof EventSource !== "undefined") {
          try {
            let queryParams = "";
            const queryParts = [];
            if (options?.type) queryParts.push(`type=${options.type}`);
            if (options?.lineage) queryParts.push(`lineage=true`);
            if (options?.replay) queryParts.push(`replay=true`);
            if (queryParts.length > 0) queryParams = `?${queryParts.join("&")}`;

            const es = new EventSource(`${baseUrl}/api/artifacts/stream${queryParams}`);
            es.onmessage = (e) => {
              try {
                callback(JSON.parse(e.data));
              } catch (err) {}
            };
            cleanup = () => {
              active = false;
              es.close();
            };
            return cleanup;
          } catch (e) {
            // Fallback to polling
          }
        }

        // Polling fallback
        const poll = async () => {
          // This is a naive polling fallback. In a real app, you'd track a cursor.
          // For now, we'll just let the caller handle deduplication or we fetch recent.
          // Since there's no native 'recent' endpoint, polling fallback is observational.
          while (active) {
            await new Promise((r) => setTimeout(r, intervalMs));
            // A real fallback would poll /api/artifacts?since=cursor
            // But we keep it simple for the DX sprint.
          }
        };
        poll();
        return cleanup;
      }
    },
    workflow: {
      transfer: (params: {
        from: string;
        to: string;
        amountSompi: string;
        feeRate?: string;
        allowDevAutoSign?: boolean;
      }) => {
        return fetchApi<any>("/api/tx/send", {
          method: "POST",
          body: JSON.stringify(params)
        });
      }
    },
    localnet: {
      status: () => fetchApi<any>("/api/localnet/status")
    },
    dev: {
      status: () => fetchApi<any>("/api/dev/status")
    },
    session: {
      start: () => fetchApi<any>("/api/session/start", { method: "POST" }),
      snapshot: () => fetchApi<any>("/api/session/snapshot", { method: "POST" }),
      replay: (options?: { untilArtifact?: string; strict?: boolean }) =>
        fetchApi<any>("/api/session/replay", {
          method: "POST",
          body: JSON.stringify(options || {})
        }),
      diffReplay: (artifactId: string) =>
        fetchApi<any>(`/api/session/diff-replay/${artifactId}`, { method: "POST" }),
      timeTravel: (artifactId: string) =>
        fetchApi<any>("/api/session/time-travel", {
          method: "POST",
          body: JSON.stringify({ artifactId })
        }),
      export: () => fetchApi<any>("/api/session/export"),
      import: (data: any, force?: boolean) =>
        fetchApi<any>("/api/session/import", {
          method: "POST",
          body: JSON.stringify({ data, force })
        })
    }
  };
}
