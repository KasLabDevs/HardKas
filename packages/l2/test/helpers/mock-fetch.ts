import { vi } from "vitest";

/**
 * Builds a fetch mock that speaks JSON-RPC 2.0 correctly (echoes the request id).
 * `handler` returns `{ result }`, `{ error }`, or `{ raw, status }` for a malformed reply.
 */
export function rpcFetcher(
  handler: (
    method: string,
    params: unknown[]
  ) => { result: unknown } | { error: { code: number; message: string } } | { raw: string; status?: number }
) {
  return vi.fn().mockImplementation(async (_url: string, init: any) => {
    const body = JSON.parse(init.body);
    const reply = handler(body.method, body.params ?? []);
    if ("raw" in reply) {
      const status = reply.status ?? 200;
      return {
        ok: status >= 200 && status < 300,
        status,
        statusText: "mock",
        text: async () => reply.raw
      };
    }
    const payload = "error" in reply
      ? { jsonrpc: "2.0", id: body.id, error: reply.error }
      : { jsonrpc: "2.0", id: body.id, result: reply.result };
    return { ok: true, status: 200, statusText: "OK", text: async () => JSON.stringify(payload) };
  });
}
