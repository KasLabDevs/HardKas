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
    /** P0-1A: on TX_SEND_OUTCOME_UNKNOWN, the key that makes a repeated request for the same payment safe. */
    idempotencyKey?: string;
  };
  warnings: string[];
  meta: {
    workspace: string;
    network: string;
    mode?: string;
  };
}

/**
 * P0-TX-SAFETY-1A: a request that can broadcast a transaction (`POST /api/tx/send`) is sent ONCE. Its failure here —
 * no answer, a lost connection, an answer that cannot be read — does not say whether the dev server planned, signed or
 * broadcast anything, so it is never retried: the caller gets `TX_SEND_OUTCOME_UNKNOWN` with the request's
 * idempotency key. Repeating the request with that key returns the dev server's recorded result instead of a new
 * transaction; the outcome itself is resolved by observing the transaction, never by sending again.
 */
type FetchMode = { kind: "retry" } | { kind: "broadcast"; idempotencyKey: string };

function newIdempotencyKey(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  return `hk-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
}

export function createHardkasClient(options: HardkasClientOptions = {}) {
  const baseUrl = options.baseUrl || "http://127.0.0.1:7420";
  const defaultHeaders = {
    "Content-Type": "application/json",
    "X-Hardkas-Request": "true"
  };
  const failureMeta = () => ({
    workspace: "unknown",
    network: options.network || "simulated",
    mode: "unknown"
  });

  async function fetchApi<T>(
    path: string,
    init?: RequestInit,
    mode: FetchMode = { kind: "retry" }
  ): Promise<ClientEnvelope<T>> {
    if (mode.kind === "broadcast") {
      try {
        const response = await fetch(`${baseUrl}${path}`, {
          ...init,
          headers: { ...defaultHeaders, ...init?.headers }
        });
        const data = await response.json();
        return data as ClientEnvelope<T>;
      } catch (e: unknown) {
        return {
          ok: false,
          error: {
            code: "TX_SEND_OUTCOME_UNKNOWN",
            message:
              `The send request got no readable answer (${e instanceof Error ? e.message : String(e)}): whether the dev server ` +
              `broadcast a transaction is unknown, so it was not sent again. Check the transaction (GET /api/tx/receipt/<txId>, ` +
              `\`hardkas tx wait <txId>\`) before paying again; repeating the request with idempotencyKey ` +
              `${mode.idempotencyKey} returns the recorded result instead of a new transaction.`,
            idempotencyKey: mode.idempotencyKey
          },
          warnings: [],
          meta: failureMeta()
        };
      }
    }
    const maxRetries = 3;
    let attempt = 0;
    while (true) {
      try {
        const response = await fetch(`${baseUrl}${path}`, {
          ...init,
          headers: { ...defaultHeaders, ...init?.headers }
        });
        const data = await response.json();
        return data as ClientEnvelope<T>;
      } catch (e: unknown) {
        attempt++;
        if (attempt > maxRetries) {
          return {
            ok: false,
            error: { code: "LOCALNET_RPC_RETRY_EXHAUSTED", message: ((e instanceof Error) ? ((e instanceof Error) ? e.message : String(e)) : String(e)) },
            warnings: [],
            meta: failureMeta()
          };
        }
        // Backoff with jitter
        const jitter = Math.floor(Math.random() * 200) + 100;
        await new Promise(r => setTimeout(r, attempt * jitter));
      }
    }
  }

  // P0-TX-SAFETY-1A: every send carries an idempotency key (the caller's, else a fresh one) and is sent once
  function sendOnce<T>(params: Record<string, unknown> & { idempotencyKey?: string }) {
    const idempotencyKey =
      typeof params.idempotencyKey === "string" && params.idempotencyKey.length > 0 ? params.idempotencyKey : newIdempotencyKey();
    return fetchApi<T>(
      "/api/tx/send",
      { method: "POST", body: JSON.stringify({ ...params, idempotencyKey }) },
      { kind: "broadcast", idempotencyKey }
    );
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
        idempotencyKey?: string;
        allowNewPaymentAfterUnknown?: boolean;
      }) => sendOnce<any>(params),
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
        idempotencyKey?: string;
        allowNewPaymentAfterUnknown?: boolean;
      }) => sendOnce<any>(params)
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
