import { HardkasError } from "./errors.js";

// ENDPOINT-VALIDATION-1: the shape a Kaspa node endpoint must have before anything connects to it.
//   - with a scheme: ws://, wss://, http:// or https:// (http(s) are mapped to ws(s) by the RPC clients), a host, and a
//     port in 1..65535 when one is given; a path and a query are allowed (public nodes serve wRPC under a path);
//   - without a scheme: exactly `host:port` or `[ipv6]:port` (no path, no query) — the bare form a local node is given;
//   - no whitespace anywhere.
// Anything else is refused with NETWORK_ENDPOINT_INVALID. It used to be rewritten to `ws://<text>` and connected to.

const NODE_SCHEMES = new Set(["ws:", "wss:", "http:", "https:"]);

function invalid(context: string, why: string): HardkasError {
  // The refused endpoint is never repeated — not in the message, not in metadata: a malformed URL cannot be parsed
  // reliably enough to redact, and it may carry a user, a password or a token (EVIDENCE-TRUST-1). The context names
  // where it came from (--url, networks[id].rpcUrl), and `why` names the defect without quoting the text.
  return new HardkasError(
    "NETWORK_ENDPOINT_INVALID",
    `${context} is not a valid node endpoint (${why}). Use ws://host:port, wss://host[:port][/path], ` +
      `http(s)://host[:port][/path] or host:port. Nothing was contacted.`,
    { metadata: { reason: why } }
  );
}

/** Whether `url` is a well-formed node endpoint (see above); the reason when it is not. */
export function nodeEndpointProblem(url: unknown): string | undefined {
  if (typeof url !== "string" || url === "") return "it is empty";
  if (/\s/.test(url)) return "it contains whitespace";
  const scheme = /^([A-Za-z][A-Za-z0-9+.-]*):/.exec(url)?.[1];
  let parsed: URL;
  if (scheme !== undefined && /^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(url)) {
    try {
      parsed = new URL(url);
    } catch {
      return "it does not parse as a URL";
    }
    if (!NODE_SCHEMES.has(parsed.protocol)) return `the scheme ${parsed.protocol.slice(0, -1)}:// is not a node scheme`;
  } else {
    // no "<scheme>://": only the bare host:port form is accepted (which also catches "http//…" and "localhost")
    if (!/^(\[[0-9A-Fa-f:.]+\]|[A-Za-z0-9.-]+):(\d+)$/.test(url)) {
      return url.includes("/") ? "a path needs a scheme (ws://, wss://, http:// or https://)" : "a bare endpoint must be host:port";
    }
    try {
      parsed = new URL(`ws://${url}`);
    } catch {
      return "it does not parse as host:port";
    }
  }
  if (parsed.hostname === "") return "it has no host";
  // the URL parser drops a scheme's default port and refuses ports above 65535; port 0 is refused here
  if (parsed.port !== "") {
    const n = Number(parsed.port);
    if (!Number.isInteger(n) || n < 1 || n > 65535) return `the port ${parsed.port} is outside 1..65535`;
  }
  return undefined;
}

/** NETWORK_ENDPOINT_INVALID unless `url` is a well-formed node endpoint; returns it unchanged. */
export function assertValidNodeEndpoint(url: unknown, context = "node endpoint"): string {
  const problem = nodeEndpointProblem(url);
  if (problem !== undefined) throw invalid(context, problem);
  return url as string;
}
