import { isMainnetNetworkId } from "@hardkas/core";
import { NodeNetworkIdentityError, RpcError } from "./errors.js";

/*
 * MAINNET-PERIMETER-1 (B1/B2) · the node's identity, decided right before a broadcast. A broadcast goes out only when
 * TWO of the node's own answers — getServerInfo.networkId and getBlockDagInfo.network (both the node's configured
 * network in rusty-kaspa, rpc/service) — name one network that is not of the mainnet type and, when the caller uses the
 * node as a given network, is exactly that network. A node that does not say, or whose answers disagree, gets nothing.
 * This holds whatever was verified when the connection opened (a node may change what it says) and whatever client
 * is used (the SDK's, one a caller injects, or an exported transport used directly).
 */

/**
 * A network id as the node and HardKAS spell it, compared exactly: case-insensitive, `kaspa-` prefix ignored. HardKAS's
 * `simulated` is its simnet world without a node (config `networks.simulated`, kind "simulated"): when a test seam gives
 * such an instance a node, that node must be simnet.
 */
export function canonicalNetworkId(id: string): string {
  const n = id.trim().toLowerCase().replace(/^kaspa-/, "");
  return n === "simulated" ? "simnet" : n;
}
const canonical = canonicalNetworkId;

/** A usable network name from one answer; "unknown" / empty / "undefined" say nothing. */
export function namedNetwork(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const v = value.trim();
  return v === "" || v === "undefined" || v.toLowerCase() === "unknown" ? undefined : v;
}

export interface BroadcastIdentityAnswers {
  /** getServerInfo.networkId, when the node gave one. */
  readonly server: string | undefined;
  /** getBlockDagInfo.network, when the node gave one. */
  readonly dag: string | undefined;
  /** The network the caller uses this node as, when it says. */
  readonly expected?: string | undefined;
  /** The endpoint, without credentials. */
  readonly endpoint: string;
}

/** Throws the typed refusal for a broadcast the node's identity does not allow; returns the node's network otherwise. */
export function decideBroadcastIdentity(a: BroadcastIdentityAnswers): string {
  const expected = a.expected ?? "a non-mainnet network";
  if (a.server === undefined || a.dag === undefined) {
    throw new NodeNetworkIdentityError(
      "NODE_NETWORK_UNKNOWN",
      `The node at ${a.endpoint} did not say which network it serves before a broadcast (getServerInfo: ${a.server ?? "none"}, ` +
        `getBlockDagInfo: ${a.dag ?? "none"}): HardKAS sends nothing to a node it cannot identify. Nothing was sent.`,
      { expected, ...(a.server ?? a.dag ? { observed: a.server ?? a.dag } : {}), endpoint: a.endpoint }
    );
  }
  if (canonical(a.server) !== canonical(a.dag)) {
    throw new NodeNetworkIdentityError(
      "NODE_NETWORK_MISMATCH",
      `The node at ${a.endpoint} names two networks (getServerInfo: ${a.server}, getBlockDagInfo: ${a.dag}): HardKAS sends nothing ` +
        `to a node whose identity is incoherent. Nothing was sent.`,
      { expected, observed: `${a.server} / ${a.dag}`, endpoint: a.endpoint }
    );
  }
  if (isMainnetNetworkId(a.server) || isMainnetNetworkId(a.expected)) {
    throw new NodeNetworkIdentityError(
      "MAINNET_BROADCAST_DISABLED",
      `Mainnet broadcast is disabled in HardKAS: the node at ${a.endpoint} serves ${a.server}` +
        `${a.expected !== undefined ? ` (used as ${a.expected})` : ""}. No flag, option or configuration enables it. Nothing was sent.`,
      { expected, observed: a.server, endpoint: a.endpoint }
    );
  }
  if (a.expected !== undefined && canonical(a.server) !== canonical(a.expected)) {
    throw new NodeNetworkIdentityError(
      "NODE_NETWORK_MISMATCH",
      `The node at ${a.endpoint} serves ${a.server}, not ${a.expected}: HardKAS refuses to send to it as ${a.expected}. Nothing was sent.`,
      { expected: a.expected, observed: a.server, endpoint: a.endpoint }
    );
  }
  return a.server;
}

/** The two reads a broadcast check needs, as the HardKAS client interface offers them. */
export interface BroadcastIdentitySource {
  getServerInfo(): Promise<unknown>;
  getBlockDagInfo(): Promise<unknown>;
}

/**
 * The same decision through a HardKAS client (the SDK's own, or one a caller injected): asks both questions now.
 * The client's own typed refusals (its connection-time identity check, a connection failure, a timeout) propagate as
 * they are; any other failure of a read says nothing (NODE_NETWORK_UNKNOWN). Neither is ever a reason to send.
 */
export async function assertBroadcastNodeIdentity(rpc: BroadcastIdentitySource, expected: string | undefined, endpoint: string): Promise<string> {
  const read = async <T>(f: () => Promise<T>): Promise<T | undefined> => {
    try {
      return await f();
    } catch (e) {
      if (e instanceof RpcError) throw e;
      return undefined;
    }
  };
  const server: any = typeof rpc?.getServerInfo === "function" ? await read(() => rpc.getServerInfo()) : undefined;
  const dag: any = typeof rpc?.getBlockDagInfo === "function" ? await read(() => rpc.getBlockDagInfo()) : undefined;
  return decideBroadcastIdentity({
    server: namedNetwork(server?.networkId),
    dag: namedNetwork(dag?.networkId ?? dag?.network ?? dag?.networkName),
    expected,
    endpoint
  });
}
