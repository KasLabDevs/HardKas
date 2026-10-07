import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JsonWrpcKaspaClient, KaspaJsonRpcClient, LoadBalancedRpcProvider, MockKaspaRpcClient } from "../src/index.js";
import { OfficialRpcSession } from "../src/upstream/session.js";

/*
 * Surface Cut 3c-2. `KaspaRpcClient` carried a notification API: `subscribeToUtxosChanged`,
 * `subscribeToVirtualChainChanged`, `on`, `off` and the types `UtxosChangedEvent`,
 * `VirtualChainChangedEvent`, `RpcAcceptedTransactionIds` and `KaspaSubscription`, implemented by
 * every client and re-attached by the session on each new connection. Its only caller was the
 * toolkit's subscription manager, removed in 3c-1. Watching addresses is kaspa-wasm's
 * UtxoContext behind `WalletToolkit.watch()` (3b), and `tx wait`/`tx status` poll. This keeps
 * `KaspaRpcClient` request/response only.
 */

const PKG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPO = path.resolve(PKG, "../..");
const ROOTS = ["packages", "examples", "labs", "apps", "scripts"];
const SKIP = new Set(["node_modules", "dist", "out", "build", "coverage", ".turbo", ".hardkas", ".docusaurus", "target"]);
const CODE = /\.(ts|tsx|mts|cts|js|mjs|cjs)$/;
const SURFACE =
  /\b(subscribeToUtxosChanged|subscribeToVirtualChainChanged|UtxosChangedEvent|VirtualChainChangedEvent|RpcAcceptedTransactionIds|KaspaSubscription|OFFICIAL_EVENTS|RPC_SUBSCRIPTIONS_UNSUPPORTED)\b/;
// A listener on a node notification by name, through any `on`/`off`.
const RAW_EVENT =
  /\.(on|off)\(\s*["'`](utxos-changed|virtual-chain-changed|block-added|sink-blue-score-changed|virtual-daa-score-changed|finality-conflict|finality-conflict-resolved|new-block-template|pruning-point-utxo-set-override|utxosChangedNotification|virtualChainChangedNotification|blockAddedNotification|sinkBlueScoreChangedNotification|virtualDaaScoreChangedNotification|finalityConflictNotification|finalityConflictResolvedNotification|newBlockTemplateNotification|pruningPointUtxoSetOverrideNotification)["'`]/;
const MEMBERS = ["subscribeToUtxosChanged", "subscribeToVirtualChainChanged", "on", "off"];
// This test and its localnet counterpart name the API on purpose.
const REGRESSIONS = ["packages/kaspa-rpc/test/surface-cut-subscriptions.test.ts", "packages/localnet/test/surface-cut-subscriptions.test.ts"];
// 3b's tests hand watch() an object with a `subscribeToUtxosChanged` spy to prove it never subscribes.
const WATCH_TEST = "packages/toolkit/test/wallet-watch-utxocontext.test.ts";
// The API itself: its declaration, its five implementations and its own tests.
const OWN = [
  "packages/kaspa-rpc/src/index.ts",
  "packages/kaspa-rpc/src/json-rpc-client.ts",
  "packages/kaspa-rpc/src/provider.ts",
  "packages/localnet/src/provider.ts",
  "packages/kaspa-rpc/test/subscriptions.test.ts",
  WATCH_TEST,
  ...REGRESSIONS
];

function codeFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isSymbolicLink() || SKIP.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) codeFiles(full, out);
    else if (CODE.test(entry.name)) out.push(full);
  }
  return out;
}

describe("Surface Cut 3c-2: KaspaRpcClient is request/response only", () => {
  const mentions = ROOTS.flatMap((root) => {
    const dir = path.join(REPO, root);
    return fs.existsSync(dir) ? codeFiles(dir) : [];
  })
    .filter((file) => {
      const text = fs.readFileSync(file, "utf8");
      return SURFACE.test(text) || RAW_EVENT.test(text);
    })
    .map((file) => path.relative(REPO, file).split(path.sep).join("/"));

  it("no kaspa-rpc client has subscribeTo*, on or off", () => {
    const present = Object.fromEntries(
      [JsonWrpcKaspaClient, KaspaJsonRpcClient, LoadBalancedRpcProvider, MockKaspaRpcClient].map((cls) => [
        cls.name,
        MEMBERS.filter((member) => member in cls.prototype)
      ])
    );
    expect(present).toEqual({ JsonWrpcKaspaClient: [], KaspaJsonRpcClient: [], LoadBalancedRpcProvider: [], MockKaspaRpcClient: [] });
  });

  it("the session does not re-attach listeners on a new connection", () => {
    expect("onConnect" in OfficialRpcSession.prototype).toBe(false);
  });

  it("no code outside the API's own files uses it", () => {
    expect(mentions.filter((rel) => !OWN.includes(rel))).toEqual([]);
  });

  it("stays deleted", () => {
    expect(mentions.filter((rel) => !REGRESSIONS.includes(rel) && rel !== WATCH_TEST)).toEqual([]);
  });
});
