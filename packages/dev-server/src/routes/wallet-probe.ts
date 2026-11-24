import { Hono } from "hono";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { declaredNetworkIdOf } from "@hardkas/core";
import { Hardkas, completeWalletPayment, prepareWalletPayment, verifyWalletMessage, type WalletSignRequest } from "@hardkas/sdk";
import { isMainnetDevServerNetwork } from "./dev-autosign.js";
import { AMOUNT_SOMPI_RULE, exactSompiOf } from "./sompi.js";

/*
 * R3-C · the wallet probe: a page the owner opens with his real browser wallet (KasWare, Kaspire, Kastle) to check what
 * each one does on simnet or Testnet-10 (run on Testnet-10 on 21-nov-2026 with all three; Kastle's payment path, its
 * signTx, is new since and waits for the next run). It shows the exact call the session makes (walletSignCallOf).
 * LOOPBACK ONLY (a request from any other address is refused, whatever
 * the server's host settings). Nothing is sent unless the owner presses the separate send button, which goes through
 * HardKAS's own send route (POST /api/tx/send: send guard, one submission per txId, the records).
 *
 *   GET  /wallet-probe                 the page (no secret in it; the API needs the token of .hardkas/dev-server-token)
 *   GET  /wallet-probe/sdk/<file>.js   the SDK's browser entry (@hardkas/sdk/client: the browser wallet signer) and its
 *                                      chunks, read from the installed package's dist; nothing else is served
 *   GET  /api/wallet-probe/network     the network this server's workspace runs on (mainnet: refused)
 *   POST /api/wallet-probe/payment     { address, to, amountSompi }: HardKAS plans a P2PK payment from the wallet's
 *                                      address (prepareWalletPayment) and answers the request the wallet signs
 *   POST /api/wallet-probe/complete    { txId, returned }: HardKAS checks what the wallet returned in full (every
 *                                      signature against the address's key over its own signature hash) and signs the
 *                                      plan with it (completeWalletPayment; the signed artifact stored). Nothing is sent.
 *   POST /api/wallet-probe/verify-message  { address, message, returned }: the wallet's signMessage answer (any of the
 *                                      three shapes of the notes) verified with kaspa-wasm against the address.
 */

export interface WalletProbeRoutesOptions {
  /** Where the SDK's browser entry is (default: the dist directory of the installed @hardkas/sdk). */
  readonly sdkDistDir?: string | undefined;
  /** The SDK instance for a request (default: the workspace's, HARDKAS_ROOT or the working directory). */
  readonly openSdk?: (() => Promise<Hardkas>) | undefined;
}

const LOOPBACK = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);
const SERVED_FILE = /^(?:client|chunk-[A-Za-z0-9_-]+)\.js$/;
const MAX_PENDING = 16;

/** The peer of a request (@hono/node-server's socket), or undefined when the runtime does not say. */
function remoteAddressOf(c: any): string | undefined {
  const a = c?.env?.incoming?.socket?.remoteAddress;
  return typeof a === "string" ? a : undefined;
}

function defaultSdkDistDir(): string | undefined {
  try {
    return path.dirname(createRequire(import.meta.url).resolve("@hardkas/sdk/client"));
  } catch {
    return undefined;
  }
}

const errorBody = (code: string, message: string) => ({ ok: false, error: { code, message } });
const codeOf = (e: unknown) => (typeof (e as any)?.code === "string" ? (e as any).code : "HARDKAS_DEV_ERROR");
const messageOf = (e: unknown) => (e instanceof Error ? e.message : String(e));
const json = (v: unknown) => JSON.parse(JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x)));

export function createWalletProbeRoutes(options: WalletProbeRoutesOptions = {}) {
  const routes = new Hono();
  const pending = new Map<string, { plan: any; request: WalletSignRequest }>();
  const openSdk = options.openSdk ?? (() => Hardkas.create({ cwd: process.env.HARDKAS_ROOT || process.cwd() }));

  // loopback only, decided on the peer's address (fail closed when the runtime does not name one)
  routes.use("/wallet-probe/*", async (c, next) => {
    const peer = remoteAddressOf(c);
    if (peer === undefined || !LOOPBACK.has(peer)) return c.json(errorBody("WALLET_PROBE_LOOPBACK_ONLY", "The wallet probe answers loopback requests only."), 403);
    await next();
  });
  routes.use("/wallet-probe", async (c, next) => {
    const peer = remoteAddressOf(c);
    if (peer === undefined || !LOOPBACK.has(peer)) return c.json(errorBody("WALLET_PROBE_LOOPBACK_ONLY", "The wallet probe answers loopback requests only."), 403);
    await next();
  });
  routes.use("/api/wallet-probe/*", async (c, next) => {
    const peer = remoteAddressOf(c);
    if (peer === undefined || !LOOPBACK.has(peer)) return c.json(errorBody("WALLET_PROBE_LOOPBACK_ONLY", "The wallet probe answers loopback requests only."), 403);
    await next();
  });

  routes.get("/wallet-probe", (c) => c.html(PROBE_PAGE));

  routes.get("/wallet-probe/sdk/:file", (c) => {
    const file = c.req.param("file");
    const dir = options.sdkDistDir ?? defaultSdkDistDir();
    if (!SERVED_FILE.test(file) || dir === undefined) return c.text("not found", 404);
    const full = path.join(dir, file);
    if (path.dirname(full) !== path.resolve(dir) || !fs.existsSync(full)) return c.text("not found", 404);
    const body = fs.readFileSync(full, "utf8");
    if (file === "client.js" && !body.includes("connectBrowserWallet")) {
      return c.text("// this @hardkas/sdk build has no browser wallet signer (connectBrowserWallet): rebuild @hardkas/sdk", 503);
    }
    return c.body(body, 200, { "Content-Type": "text/javascript; charset=utf-8" });
  });

  /** The SDK of this request, refused on mainnet (any spelling, or an alias that declares it) before anything else. */
  async function withSdk<T>(f: (sdk: Hardkas, networkId: string) => Promise<T>): Promise<T> {
    const sdk = await openSdk();
    try {
      const network = String(sdk.network);
      if (isMainnetDevServerNetwork(network, (sdk as any).sdkConfig ?? sdk.config?.config)) {
        throw Object.assign(new Error("The wallet probe never plans, signs or sends on mainnet. Nothing was planned."), { code: "MAINNET_SIGNING_DISABLED" });
      }
      return await f(sdk, declaredNetworkIdOf(sdk.config.config, network) ?? network);
    } finally {
      await sdk.close?.();
    }
  }

  routes.get("/api/wallet-probe/network", async (c) => {
    try {
      return c.json({ ok: true, data: await withSdk(async (sdk, networkId) => ({ network: String(sdk.network), networkId, mode: sdk.execution.mode })) });
    } catch (e) {
      return c.json(errorBody(codeOf(e), messageOf(e)), 400);
    }
  });

  routes.post("/api/wallet-probe/payment", async (c) => {
    let body: any;
    try {
      body = await c.req.json();
    } catch {
      return c.json(errorBody("BAD_REQUEST", "a JSON body { address, to, amountSompi } is required"), 400);
    }
    // BETA-FIX: the amount read exactly (a JSON number past 2^53 - 1 is refused, never rounded)
    const amountSompi = exactSompiOf(body?.amountSompi);
    if (typeof body?.address !== "string" || typeof body?.to !== "string" || amountSompi === undefined) {
      return c.json(errorBody("BAD_REQUEST", `address and to are required; ${AMOUNT_SOMPI_RULE}`), 400);
    }
    try {
      const data = await withSdk(async (sdk) => {
        const { plan, request } = await prepareWalletPayment(sdk, { address: body.address, to: body.to, amount: amountSompi });
        pending.set(request.txId, { plan, request });
        while (pending.size > MAX_PENDING) pending.delete(pending.keys().next().value as string);
        return {
          request,
          plan: {
            artifactId: (plan as any).contentHash,
            networkId: (plan as any).networkId,
            from: (plan as any).from?.address,
            to: (plan as any).to?.address,
            amountSompi: String((plan as any).amountSompi),
            feeSompi: String((plan as any).estimatedFeeSompi),
            inputs: ((plan as any).inputs ?? []).length,
            change: (plan as any).change ? String((plan as any).change.amountSompi) : "0"
          }
        };
      });
      return c.json({ ok: true, data: json(data) });
    } catch (e) {
      return c.json(errorBody(codeOf(e), messageOf(e)), 400);
    }
  });

  routes.post("/api/wallet-probe/complete", async (c) => {
    let body: any;
    try {
      body = await c.req.json();
    } catch {
      return c.json(errorBody("BAD_REQUEST", "a JSON body { txId, returned } is required"), 400);
    }
    const entry = typeof body?.txId === "string" ? pending.get(body.txId) : undefined;
    if (!entry) return c.json(errorBody("WALLET_REQUEST_MISMATCH", "no payment this server planned has that txId (plan it again). Nothing was signed."), 400);
    try {
      const data = await withSdk(async (sdk) => {
        const { signed, txId, check } = await completeWalletPayment(sdk, { plan: entry.plan, request: entry.request, returned: body.returned });
        return { verdict: "VERIFIED", txId, signedArtifactId: (signed as any).contentHash, signed, signatures: check.signatures };
      });
      return c.json({ ok: true, data: json(data) });
    } catch (e) {
      return c.json(errorBody(codeOf(e), messageOf(e)), 400);
    }
  });

  routes.post("/api/wallet-probe/verify-message", async (c) => {
    let body: any;
    try {
      body = await c.req.json();
    } catch {
      return c.json(errorBody("BAD_REQUEST", "a JSON body { address, message, returned } is required"), 400);
    }
    if (typeof body?.address !== "string" || typeof body?.message !== "string") {
      return c.json(errorBody("BAD_REQUEST", "address and message (strings) are required"), 400);
    }
    try {
      // mainnet refused for the server's network too (the address's own prefix is refused by the verification)
      const data = await withSdk(async () => {
        const v = verifyWalletMessage({ address: body.address, message: body.message, returned: body.returned });
        return { verdict: "VERIFIED", shape: v.shape, publicKey: v.publicKey, signatureHex: v.signatureHex, ...(v.statedAddress ? { statedAddress: v.statedAddress } : {}) };
      });
      return c.json({ ok: true, data });
    } catch (e) {
      return c.json(errorBody(codeOf(e), messageOf(e)), 400);
    }
  });

  return routes;
}

export const walletProbeRoutes = createWalletProbeRoutes();

/** The probe page. Plain HTML and one module script; the SDK's browser entry is loaded from this server. */
const PROBE_PAGE = String.raw`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>HardKAS wallet probe</title>
<style>
  body { font: 14px/1.45 system-ui, sans-serif; margin: 0 auto; max-width: 960px; padding: 16px; }
  fieldset { margin: 12px 0; border: 1px solid #999; }
  pre { white-space: pre-wrap; word-break: break-all; background: #f3f3f3; padding: 8px; max-height: 280px; overflow: auto; }
  .ok { color: #11692b; font-weight: 600; } .bad { color: #a40e0e; font-weight: 600; }
  input[type=text] { width: 100%; box-sizing: border-box; }
  button { margin: 4px 4px 4px 0; }
</style>
</head>
<body>
<h1>HardKAS wallet probe</h1>
<p>Loopback only. HardKAS plans, the wallet signs, HardKAS checks. Nothing is sent unless you press <b>Send through HardKAS</b>.</p>
<fieldset><legend>0 · Dev server token</legend>
  <input id="token" type="text" placeholder="paste the content of .hardkas/dev-server-token">
  <button id="network">Read the server's network</button> <span id="net"></span>
</fieldset>
<fieldset><legend>1 · Wallet</legend>
  <button id="detect">Detect wallets</button>
  <select id="kind"><option>kasware</option><option>kaspire</option><option>kastle</option></select>
  <button id="connect">Connect</button>
  <pre id="wallet">-</pre>
</fieldset>
<fieldset><legend>2 · A small payment HardKAS plans</legend>
  <label>To <input id="to" type="text" placeholder="recipient address of the same network"></label>
  <label>Amount (sompi) <input id="amount" type="text" value="100000000"></label>
  <button id="sign">Plan and ask the wallet to sign</button>
  <pre id="request">-</pre>
  <pre id="verdict">-</pre>
</fieldset>
<fieldset><legend>3 · Send (optional, separate)</legend>
  <button id="send" disabled>Send through HardKAS</button>
  <pre id="sent">-</pre>
</fieldset>
<fieldset><legend>4 · Sign a message (nothing on chain)</legend>
  <label>Message <input id="message" type="text" value="HardKAS wallet probe"></label>
  <button id="signmsg">Ask the wallet to sign the message</button>
  <pre id="msgverdict">-</pre>
</fieldset>
<fieldset><legend>Wallet events</legend><pre id="events"></pre></fieldset>
<script type="module">
import { connectBrowserWallet, describeBrowserWallet, detectBrowserWallets, walletNetworkIdOf } from "/wallet-probe/sdk/client.js";
// read by name: an older SDK build without walletSignCallOf still loads the page
import * as sdkClient from "/wallet-probe/sdk/client.js";
const $ = (id) => document.getElementById(id);
const show = (id, v) => ($(id).textContent = typeof v === "string" ? v : JSON.stringify(v, null, 2));
const tokenBox = $("token");
try { tokenBox.value = sessionStorage.getItem("hk-probe-token") || ""; } catch {}
tokenBox.addEventListener("change", () => { try { sessionStorage.setItem("hk-probe-token", tokenBox.value.trim()); } catch {} });
async function api(method, url, body) {
  const headers = { Authorization: "Bearer " + tokenBox.value.trim(), "X-Hardkas-Request": "true" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const r = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  return r.json();
}
let networkId, session, planned, verified;
const log = (line) => ($("events").textContent += new Date().toISOString() + "  " + line + "\n");
$("network").onclick = async () => {
  const r = await api("GET", "/api/wallet-probe/network");
  if (!r.ok) return show("net", r.error.code + ": " + r.error.message);
  networkId = r.data.networkId;
  show("net", "server network: " + r.data.network + " (" + networkId + ", " + r.data.mode + ")");
};
$("detect").onclick = () => {
  const found = detectBrowserWallets(window);
  show("wallet", { injected: found, methods: Object.fromEntries(found.map((k) => [k, describeBrowserWallet(k, window)])) });
};
$("connect").onclick = async () => {
  if (!networkId) return show("wallet", "read the server's network first (step 0)");
  const kind = $("kind").value;
  const p = window[kind];
  try {
    if (p && typeof p.on === "function") {
      p.on("accountsChanged", (x) => log(kind + " accountsChanged " + JSON.stringify(x)));
      p.on("networkChanged", (x) => log(kind + " networkChanged " + JSON.stringify(x)));
    }
    let raw = {};
    try { if (typeof p?.getNetwork === "function") raw.getNetwork = await p.getNetwork(); } catch (e) { raw.getNetwork = "threw: " + (e?.message || e); }
    session = await connectBrowserWallet(kind, { networkId, window, onDropped: (r) => log("session dropped: " + r) });
    show("wallet", { kind, address: session.address, networkId: session.networkId, networkEvidence: session.networkEvidence, statedPublicKey: session.statedPublicKey, walletRaw: raw, hardkasReadsWalletNetworkAs: walletNetworkIdOf(raw.getNetwork) ?? null });
    if (!$("to").value) $("to").value = session.address;
  } catch (e) {
    show("wallet", { refused: e.code || "ERROR", message: e.message });
  }
};
$("sign").onclick = async () => {
  $("send").disabled = true; verified = undefined;
  if (!session || !session.active) return show("request", "connect a wallet first");
  const r = await api("POST", "/api/wallet-probe/payment", { address: session.address, to: $("to").value.trim(), amountSompi: $("amount").value.trim() });
  if (!r.ok) return show("request", { refused: r.error.code, message: r.error.message });
  planned = r.data;
  // the call the session makes: KasWare and Kaspire signPskt with one object, Kastle signTx(networkId, txJson, scripts)
  const walletCall = typeof sdkClient.walletSignCallOf === "function"
    ? sdkClient.walletSignCallOf(session.kind, planned.request, session.address)
    : { method: "signPskt", args: [{ txJsonString: planned.request.txJsonString, options: { signInputs: planned.request.signInputs } }] };
  show("request", { plan: planned.plan, walletCall: { wallet: session.kind, method: walletCall.method, args: walletCall.args } });
  let signed;
  try {
    signed = await session.signTransaction(planned.request);
  } catch (e) {
    const back = e.walletReturned === undefined ? undefined : typeof e.walletReturned === "string" ? e.walletReturned : JSON.stringify(e.walletReturned);
    return show("verdict", { browserCheck: "REFUSED", code: e.code || "ERROR", message: e.message, walletReturnedType: typeof e.walletReturned, walletReturned: back === undefined ? null : back.slice(0, 4000) });
  }
  const c = await api("POST", "/api/wallet-probe/complete", { txId: planned.request.txId, returned: signed.returned });
  const raw = typeof signed.returned === "string" ? signed.returned : JSON.stringify(signed.returned);
  if (!c.ok) return show("verdict", { browserCheck: "PASSED", hardkasCheck: "REFUSED", code: c.error.code, message: c.error.message, walletReturnedType: typeof signed.returned, walletReturned: raw.slice(0, 4000) });
  verified = c.data;
  show("verdict", { browserCheck: "PASSED", hardkasCheck: c.data.verdict, txId: c.data.txId, signedArtifactId: c.data.signedArtifactId, signatureScripts: signed.check.signatureScripts, walletReturnedType: typeof signed.returned, walletReturned: raw.slice(0, 4000) });
  $("send").disabled = false;
};
$("signmsg").onclick = async () => {
  if (!session || !session.active) return show("msgverdict", "connect a wallet first");
  const message = $("message").value;
  let signed;
  try {
    signed = await session.signMessage(message);
  } catch (e) {
    const back = e.walletReturned === undefined ? null : typeof e.walletReturned === "string" ? e.walletReturned : JSON.stringify(e.walletReturned);
    return show("msgverdict", { browserCheck: "REFUSED", code: e.code || "ERROR", message: e.message, walletReturnedType: typeof e.walletReturned, walletReturned: back });
  }
  const v = await api("POST", "/api/wallet-probe/verify-message", { address: session.address, message, returned: signed.returned });
  const raw = typeof signed.returned === "string" ? signed.returned : JSON.stringify(signed.returned);
  show("msgverdict", v.ok
    ? { browserShape: signed.signature.shape, hardkasCheck: v.data.verdict, publicKey: v.data.publicKey, walletReturnedType: typeof signed.returned, walletReturned: raw }
    : { browserShape: signed.signature.shape, hardkasCheck: "REFUSED", code: v.error.code, message: v.error.message, walletReturnedType: typeof signed.returned, walletReturned: raw });
};
$("send").onclick = async () => {
  if (!verified) return;
  $("send").disabled = true;
  const idempotencyKey = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now())) + "-wallet-probe";
  const r = await api("POST", "/api/tx/send", { signedTx: verified.signed, idempotencyKey });
  show("sent", r.ok ? { outcome: r.data.outcome, txId: r.data.receipt?.txId ?? verified.txId, warnings: r.data.warnings } : { refused: r.error.code, message: r.error.message });
};
</script>
</body>
</html>`;
