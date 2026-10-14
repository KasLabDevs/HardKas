import { toWrpcUrl } from "./upstream/session.js";

/*
 * ENDPOINT-AUTHORITY-1 · the identity of an RPC endpoint, as HardKAS records and compares it.
 *
 * Two spellings name the same endpoint only when they name the same effective destination of a client: the wRPC URL
 * the session connects to (http(s):// is used as ws(s)://, a bare host:port gets ws://), with the URL standard's own
 * normalisation (scheme and host case, a default port, an empty path). Nothing else is assumed: another host name for
 * the same machine (localhost vs 127.0.0.1), another port, path or query is another endpoint.
 */

/** The canonical form of an endpoint URL, for comparison only (it keeps userinfo and query: never record it as is). */
export function canonicalRpcEndpoint(url: string): string {
  const ws = toWrpcUrl(url.trim());
  try {
    const u = new URL(ws);
    const auth = u.username || u.password ? `${u.username}${u.password ? `:${u.password}` : ""}@` : "";
    const port = u.port ? `:${u.port}` : "";
    const path = u.pathname === "/" ? "" : u.pathname;
    return `${u.protocol}//${auth}${u.hostname.toLowerCase()}${port}${path}${u.search}`;
  } catch {
    return ws;
  }
}

/** Whether two endpoint URLs name the same effective destination. */
export function sameRpcEndpoint(a: string, b: string): boolean {
  return canonicalRpcEndpoint(a) === canonicalRpcEndpoint(b);
}

/**
 * The endpoint a client really talks to, as the client itself reports it (`url`, or `getUrl()`), or undefined when
 * the client does not say (a stand-in, a provider without an endpoint): an unknown endpoint is never guessed.
 */
export function rpcEndpointOf(client: unknown): string | undefined {
  const c = client as { url?: unknown; getUrl?: unknown } | null | undefined;
  if (!c) return undefined;
  if (typeof c.url === "string" && c.url.trim() !== "") return c.url;
  if (typeof c.getUrl === "function") {
    try {
      const u = (c.getUrl as () => unknown).call(c);
      if (typeof u === "string" && u.trim() !== "") return u;
    } catch {
      return undefined;
    }
  }
  return undefined;
}
