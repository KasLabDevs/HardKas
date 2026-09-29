import type { OfficialRpcClientLike, OfficialRpcFactory } from "../../src/upstream/session.js";

/** One call the code under test made on the stand-in official client. */
export interface FakeRpcCall {
  method: string;
  request: unknown;
}

export interface FakeOfficialRpc {
  factory: OfficialRpcFactory;
  calls: FakeRpcCall[];
  /** URLs the factory was asked for, in order (one per official client created). */
  urls: string[];
  connects: number;
  /** Deliver a notification the way the official client does: `{ type, data }` to listeners of `type`. */
  emit(event: string, data: unknown): void;
  /** The node goes away: every official client created so far reports `isConnected === false`. */
  drop(): void;
}

/**
 * A stand-in for the official kaspa-wasm RpcClient: each method answers from
 * `handlers` (throw inside a handler to play a node error, e.g. the official
 * "RPC Server (remote error) -> code:0  message:`…` data:None"). No network.
 */
export function fakeOfficialRpc(
  handlers: Record<string, (request: any) => unknown>,
  options: { connectError?: unknown } = {}
): FakeOfficialRpc {
  const calls: FakeRpcCall[] = [];
  const urls: string[] = [];
  const listeners = new Map<string, Set<(event: any) => void>>();
  const state = { connects: 0 };
  const disconnectors: Array<() => void> = [];
  const fake: FakeOfficialRpc = {
    calls,
    urls,
    get connects() {
      return state.connects;
    },
    emit(event, data) {
      for (const cb of listeners.get(event) ?? []) cb({ type: event, data });
    },
    drop() {
      for (const d of disconnectors) d();
    },
    factory: (url) => {
      urls.push(url);
      let connected = false;
      disconnectors.push(() => {
        connected = false;
      });
      const base: Record<string, unknown> = {
        get isConnected() {
          return connected;
        },
        async connect() {
          state.connects++;
          if (options.connectError !== undefined) throw options.connectError;
          connected = true;
        },
        async disconnect() {
          connected = false;
        },
        addEventListener(event: string, cb: (event: any) => void) {
          if (!listeners.has(event)) listeners.set(event, new Set());
          listeners.get(event)!.add(cb);
        },
        removeEventListener(event: string, cb?: (event: any) => void) {
          if (cb) listeners.get(event)?.delete(cb);
          else listeners.delete(event);
        }
      };
      return new Proxy(base, {
        get(target, prop) {
          if (typeof prop === "string" && prop in target) return (target as any)[prop];
          if (typeof prop === "string" && Object.prototype.hasOwnProperty.call(handlers, prop)) {
            return async (request: unknown) => {
              calls.push({ method: prop, request });
              return handlers[prop]!(request);
            };
          }
          return undefined;
        }
      }) as OfficialRpcClientLike;
    }
  };
  return fake;
}

/** The official client's wording for an error the node returned. */
export const nodeError = (message: string) => new Error(`RPC Server (remote error) -> code:0  message:\`${message}\` data:None`);
