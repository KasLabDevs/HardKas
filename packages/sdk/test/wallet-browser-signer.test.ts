import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  checkWalletSignedTransaction,
  connectBrowserWallet,
  describeBrowserWallet,
  detectBrowserWallets,
  normalizeWalletMessageSignature,
  WALLET_SIGN_REQUEST_SCHEMA,
  type BrowserWalletKind,
  type WalletSignRequest
} from "../src/wallets/index.js";

// -----------------------------------------------------------------------------
// R3-C · the browser wallet signer against FAITHFUL FAKES of window.kasware / window.kastle / window.kaspire, built from
// the shapes of the third-party field notes (NOTES-CROSSCHECK §2.3) — one test per trap. The fakes are not the
// extensions: the live behaviour is UNVERIFIED until the owner runs the probe page. No kaspa-wasm, no network: the
// structural half of the check (the cryptographic half is wallet-signatures.test.ts and the simnet test).
// -----------------------------------------------------------------------------

const TESTNET_ADDR = "kaspatest:qr0lr4ml9fn3chekrqmjdkergxl93l4wrk3dankcgvjq776s9wn9jjqzg2g6";
const OTHER_ADDR = "kaspatest:qpzt5j5wpkcnmqzz9j5fljy5jvd7ttqzmlg3r3xdenfmxs2v8p85zuvlmlagx";
const MAINNET_ADDR = "kaspa:qr0lr4ml9fn3chekrqmjdkergxl93l4wrk3dankcgvjq776s9wn9jeadh9sjw";
const SPK = "000020dff1d77f2a671c5f36183726db2341be58feae1da2deced843240f7b502ba659ac";
const SIG = "ab".repeat(64);

/** The safe JSON kaspa-wasm 2.1.0 writes for a two-input v0 payment (shape taken from the SDK's own output). */
function unsignedTx(): Record<string, any> {
  const input = (n: number) => ({
    transactionId: String(n).repeat(64).slice(0, 64),
    index: n,
    sequence: "0",
    sigOpCount: 1,
    computeBudget: 0,
    signatureScript: "",
    utxo: { address: TESTNET_ADDR, amount: "500000000", scriptPublicKey: SPK, blockDaaScore: "10", isCoinbase: false, covenantId: null }
  });
  return {
    id: "ed".repeat(32),
    version: 0,
    inputs: [input(1), input(2)],
    outputs: [
      { value: "400000000", scriptPublicKey: SPK, covenant: null },
      { value: "599990000", scriptPublicKey: SPK, covenant: null }
    ],
    subnetworkId: "0000000000000000000000000000000000000000",
    lockTime: "0",
    gas: "0",
    storageMass: "0",
    payload: ""
  };
}
const TX_JSON = JSON.stringify(unsignedTx());

function request(over: Partial<WalletSignRequest> = {}): WalletSignRequest {
  return {
    schema: WALLET_SIGN_REQUEST_SCHEMA,
    purpose: "payment",
    networkId: "testnet-10",
    address: TESTNET_ADDR,
    publicKey: "df".repeat(32),
    txJsonString: TX_JSON,
    txId: "ed".repeat(32),
    signInputs: [
      { index: 0, sighashType: 1 },
      { index: 1, sighashType: 1 }
    ],
    autoFinalized: true,
    planArtifactId: "00".repeat(32),
    ...over
  };
}

interface FakeOptions {
  address?: string;
  network?: string;
  locked?: boolean;
  /** What each signed input's signature script becomes (default 41 <64-byte signature> 01). */
  script?: (index: number) => string;
  /** Changes the transaction before it is returned (a wallet that signs something else). */
  mutate?: (tx: any) => void;
  /** Runs while the "popup" is open, before the wallet returns. */
  duringSign?: (fake: Fake) => void;
  /** Returns the transaction as an object (with numbers), not a string. */
  asObject?: boolean;
  /** What signMessage answers (default per the notes: KasWare 0.11 128 hex, Kaspire { address, signature }). */
  messageAnswer?: (message: string, address: string) => unknown;
}

interface Fake {
  readonly provider: Record<string, any>;
  readonly calls: Array<{ method: string; args: unknown[] }>;
  state: { address: string; network: string; locked: boolean };
  emit(event: string, payload: unknown): void;
}

/**
 * A fake extension object as the notes describe it. signPskt crashes like KasWare on the two-argument form ("Cannot read
 * properties of undefined (reading 'length')"); Kaspire rejects at once when locked and wants `sender`; Kastle takes the
 * network in connect() and answers getAccount(). Broadcast methods exist, and are recorded, so a test can show that they
 * are never called.
 */
function fakeWallet(kind: BrowserWalletKind, o: FakeOptions = {}): Fake {
  const calls: Fake["calls"] = [];
  const handlers = new Map<string, Set<(p: unknown) => void>>();
  const state = { address: o.address ?? TESTNET_ADDR, network: o.network ?? "kaspa_testnet_10", locked: o.locked ?? false };
  const fake: Fake = {
    provider: {},
    calls,
    state,
    emit: (event, payload) => {
      for (const h of handlers.get(event) ?? []) h(payload);
    }
  };
  const record = (method: string, args: unknown[]) => calls.push({ method, args });
  const lockedGuard = () => {
    if (state.locked) throw Object.assign(new Error("Wallet is locked"), { code: 4100 });
  };
  const p: Record<string, any> = {
    on: (event: string, h: (p: unknown) => void) => {
      record("on", [event]);
      if (!handlers.has(event)) handlers.set(event, new Set());
      handlers.get(event)!.add(h);
    },
    removeListener: (event: string, h: (p: unknown) => void) => {
      record("removeListener", [event]);
      handlers.get(event)?.delete(h);
    },
    getPublicKey: async () => (record("getPublicKey", []), "02" + "df".repeat(32)),
    async signPskt(...args: unknown[]) {
      record("signPskt", args);
      const [arg, second] = args as [any, any];
      // KasWare: the two-argument form reads `.length` of what it expected inside the first argument
      if (args.length > 1 || second !== undefined || !Array.isArray(arg?.options?.signInputs)) {
        throw new TypeError("Cannot read properties of undefined (reading 'length')");
      }
      lockedGuard();
      if (kind === "kaspire" && arg.sender !== state.address) throw new Error("sender is not the active account");
      const tx = JSON.parse(arg.txJsonString);
      for (const { index } of arg.options.signInputs) tx.inputs[index].signatureScript = o.script ? o.script(index) : `41${SIG}01`;
      o.mutate?.(tx);
      o.duringSign?.(fake);
      return o.asObject ? tx : JSON.stringify(tx);
    },
    async signMessage(...args: unknown[]) {
      record("signMessage", args);
      lockedGuard();
      o.duringSign?.(fake);
      const sig = "cd".repeat(64);
      return o.messageAnswer ? o.messageAnswer(String(args[0]), state.address) : kind === "kaspire" ? { address: state.address, signature: sig } : sig;
    },
    sendKaspa: async (...a: unknown[]) => record("sendKaspa", a),
    pushTx: async (...a: unknown[]) => record("pushTx", a),
    signAndBroadcastTx: async (...a: unknown[]) => record("signAndBroadcastTx", a)
  };
  if (kind === "kastle") {
    p.connect = async (...a: unknown[]) => (record("connect", a), lockedGuard(), true);
    p.getAccount = async () => (record("getAccount", []), lockedGuard(), { address: state.address, publicKey: "02" + "df".repeat(32) });
  } else {
    p.requestAccounts = async () => (record("requestAccounts", []), lockedGuard(), [state.address]);
    p.getAccounts = async () => (record("getAccounts", []), lockedGuard(), [state.address]);
    if (kind === "kasware") p.getNetwork = async () => (record("getNetwork", []), state.network);
  }
  (fake as any).provider = p;
  return fake;
}

const win = (kind: BrowserWalletKind, fake: Fake) => ({ [kind]: fake.provider });
const settle = (p: Promise<unknown>) => p.then((v) => ({ code: "RESOLVED", value: v as any }), (e: any) => ({ code: String(e?.code ?? "UNCODED"), message: String(e?.message ?? e), value: undefined as any }));
const signCalls = (f: Fake) => f.calls.filter((c) => c.method === "signPskt");
const BROADCASTS = ["sendKaspa", "pushTx", "signAndBroadcastTx"];

describe("R3-C · detection on the click, not only at load", () => {
  it("an extension injected after the page loaded is found when asked; the methods it offers are listed", () => {
    const w: Record<string, unknown> = {};
    expect(detectBrowserWallets(w)).toEqual([]);
    w.kasware = fakeWallet("kasware").provider;
    expect(detectBrowserWallets(w)).toEqual(["kasware"]);
    expect(describeBrowserWallet("kasware", w)).toEqual(expect.arrayContaining(["getNetwork", "requestAccounts", "signPskt"]));
    expect(describeBrowserWallet("kastle", w)).toBeUndefined();
  });
});

describe("R3-C · KasWare: one object to signPskt, exactly the inputs HardKAS chose, SIGHASH_ALL, nothing broadcast", () => {
  it("connects on testnet-10, signs inputs 0 and 1 with ONE argument of the notes' shape, and hands back the checked signatures", async () => {
    const f = fakeWallet("kasware");
    const s = await connectBrowserWallet("kasware", { networkId: "testnet-10", window: win("kasware", f) });
    expect([s.address, s.networkId, s.networkEvidence, s.active]).toEqual([TESTNET_ADDR, "testnet-10", "wallet", true]);
    const out = await s.signTransaction(request());
    const [c] = signCalls(f);
    expect(c!.args).toHaveLength(1);
    expect(c!.args[0]).toEqual({ txJsonString: TX_JSON, options: { signInputs: [{ index: 0, sighashType: 1 }, { index: 1, sighashType: 1 }] } });
    expect(out.check.signatures).toEqual({ 0: `${SIG}01`, 1: `${SIG}01` });
    expect(out.check.signatureScripts[0]).toBe(`41${SIG}01`);
    expect(f.calls.filter((x) => BROADCASTS.includes(x.method)), "a wallet never broadcasts for HardKAS").toEqual([]);
  });

  it("trap 1 · the fake crashes on the two-argument form like KasWare does; HardKAS never calls it that way", async () => {
    const f = fakeWallet("kasware");
    await expect(f.provider.signPskt(TX_JSON, { signInputs: [{ index: 0, sighashType: 1 }] })).rejects.toThrow("Cannot read properties of undefined (reading 'length')");
    const s = await connectBrowserWallet("kasware", { networkId: "testnet-10", window: win("kasware", f) });
    const r = await settle(s.signTransaction(request()));
    expect(r.code).toBe("RESOLVED");
    expect(signCalls(f).slice(1).every((c) => c.args.length === 1)).toBe(true);
  });

  it("contract inputs ask for autoFinalized: false (the bare 41 <sig> 01 comes back; HardKAS assembles the unlock)", async () => {
    const f = fakeWallet("kasware");
    const s = await connectBrowserWallet("kasware", { networkId: "testnet-10", window: win("kasware", f) });
    await s.signTransaction(request({ purpose: "contract", autoFinalized: false, signInputs: [{ index: 1, sighashType: 1 }] }));
    expect(signCalls(f)[0]!.args[0]).toEqual({ txJsonString: TX_JSON, options: { signInputs: [{ index: 1, sighashType: 1 }], autoFinalized: false } });
  });

  it("Kaspire gets the same object plus `sender`; its network is its address prefix", async () => {
    const f = fakeWallet("kaspire");
    const s = await connectBrowserWallet("kaspire", { networkId: "testnet-10", window: win("kaspire", f) });
    expect(s.networkEvidence).toBe("address-prefix");
    await s.signTransaction(request());
    expect((signCalls(f)[0]!.args[0] as any).sender).toBe(TESTNET_ADDR);
  });

  it("Kastle takes the network in connect(); a contract request is refused before Kastle is asked (it could not sign covenant inputs)", async () => {
    const f = fakeWallet("kastle");
    const s = await connectBrowserWallet("kastle", { networkId: "testnet-10", window: win("kastle", f) });
    expect(f.calls.find((c) => c.method === "connect")!.args).toEqual(["testnet-10"]);
    expect(s.networkEvidence).toBe("connect");
    const r = await settle(s.signTransaction(request({ purpose: "contract", autoFinalized: false })));
    expect(r.code).toBe("WALLET_COVENANT_SIGNING_UNSUPPORTED");
    expect(signCalls(f)).toEqual([]);
  });
});

describe("R3-C · what comes back is checked: empty signature, changed transaction, wrong sighash", () => {
  async function signWith(o: FakeOptions, req = request()) {
    const f = fakeWallet("kasware", o);
    const s = await connectBrowserWallet("kasware", { networkId: "testnet-10", window: win("kasware", f) });
    return settle(s.signTransaction(req));
  }

  it("trap 4 · an empty signature script with no error (Kastle did this) is refused: WALLET_SIGNATURE_MISSING", async () => {
    const f = fakeWallet("kasware", { script: (i) => (i === 1 ? "" : `41${SIG}01`) });
    const s = await connectBrowserWallet("kasware", { networkId: "testnet-10", window: win("kasware", f) });
    const e: any = await s.signTransaction(request()).catch((x) => x);
    expect(e.code).toBe("WALLET_SIGNATURE_MISSING");
    expect(e.message).toMatch(/Input 1 .*empty signature script/);
    // what the wallet returned stays on the refusal for a probe to show, never enumerable (not logged by accident)
    expect(JSON.parse(e.walletReturned).inputs[1].signatureScript).toBe("");
    expect(Object.keys(e)).not.toContain("walletReturned");
  });

  it("a zeroed signature, a short one, and a sighash byte other than SIGHASH_ALL are refused", async () => {
    expect((await signWith({ script: () => `41${"00".repeat(64)}01` })).code).toBe("WALLET_SIGNATURE_MISSING");
    expect((await signWith({ script: () => `40${"ab".repeat(64)}` })).code).toBe("WALLET_SIGNATURE_MISSING");
    const anyone = await signWith({ script: () => `41${SIG}81` });
    expect(anyone.code).toBe("WALLET_SIGNATURE_MISSING");
    expect(anyone.message).toMatch(/0x81, not SIGHASH_ALL/);
  });

  it("trap 4 · a changed output value, an added output, another lock time, another outpoint: WALLET_SIGNED_TRANSACTION_CHANGED", async () => {
    const value = await signWith({ mutate: (tx) => (tx.outputs[0].value = "400000001") });
    expect([value.code, value.message.includes("output 0")]).toEqual(["WALLET_SIGNED_TRANSACTION_CHANGED", true]);
    expect((await signWith({ mutate: (tx) => tx.outputs.push({ value: "1", scriptPublicKey: SPK }) })).code).toBe("WALLET_SIGNED_TRANSACTION_CHANGED");
    expect((await signWith({ mutate: (tx) => (tx.lockTime = "5") })).code).toBe("WALLET_SIGNED_TRANSACTION_CHANGED");
    expect((await signWith({ mutate: (tx) => (tx.inputs[0].index = 7) })).code).toBe("WALLET_SIGNED_TRANSACTION_CHANGED");
    expect((await signWith({ mutate: (tx) => (tx.inputs[0].utxo.amount = "1") })).code).toBe("WALLET_SIGNED_TRANSACTION_CHANGED");
    expect((await signWith({ mutate: (tx) => (tx.extra = "x") })).code).toBe("WALLET_SIGNED_TRANSACTION_CHANGED");
  });

  it("a signature on an input HardKAS did not ask for is a change", async () => {
    const r = await signWith({ mutate: (tx) => (tx.inputs[1].signatureScript = `41${SIG}01`) }, request({ signInputs: [{ index: 0, sighashType: 1 }] }));
    expect(r.code).toBe("WALLET_SIGNED_TRANSACTION_CHANGED");
    expect(r.message).toMatch(/input 1/);
  });

  it("trap 2 · the serializer's spellings and Toccata fields: numbers for strings, a script object, the Toccata fields left out — the same transaction", async () => {
    const r = await signWith({
      asObject: true,
      mutate: (tx) => {
        tx.lockTime = 0;
        tx.gas = 0;
        delete tx.storageMass;
        tx.outputs[0].value = 400000000;
        tx.outputs[1].scriptPublicKey = { version: 0, script: SPK.slice(4) };
        for (const i of tx.inputs) {
          delete i.computeBudget;
          delete i.utxo.covenantId;
          i.sequence = 0;
        }
        for (const o of tx.outputs) delete o.covenant;
      }
    });
    expect(r.code).toBe("RESOLVED");
    // a Toccata field set to something else is not a spelling: a storage mass is compared
    expect((await signWith({ mutate: (tx) => (tx.storageMass = "1234") })).code).toBe("WALLET_SIGNED_TRANSACTION_CHANGED");
    expect((await signWith({ mutate: (tx) => (tx.inputs[0].computeBudget = 10) })).code).toBe("WALLET_SIGNED_TRANSACTION_CHANGED");
  });

  it("an answer that is no transaction: WALLET_SIGNED_PAYLOAD_UNREADABLE", () => {
    for (const bad of [undefined, "", "not json", { hello: 1 }, "[]"]) {
      expect(() => checkWalletSignedTransaction(TX_JSON, bad, [0])).toThrow(expect.objectContaining({ code: "WALLET_SIGNED_PAYLOAD_UNREADABLE" }));
    }
  });
});

describe("R3-C · network: wrong network, unknown network, mainnet (refused before the wallet is touched)", () => {
  it("trap 6 · KasWare on testnet-11 for a testnet-10 plan, on an L2-looking network, a simnet address for testnet: refused at connect", async () => {
    const eleven = fakeWallet("kasware", { network: "kaspa_testnet_11" });
    expect((await settle(connectBrowserWallet("kasware", { networkId: "testnet-10", window: win("kasware", eleven) }))).code).toBe("WALLET_NETWORK_MISMATCH");
    const l2 = fakeWallet("kasware", { network: "igra_mainnet_l2" });
    expect((await settle(connectBrowserWallet("kasware", { networkId: "testnet-10", window: win("kasware", l2) }))).code).toBe("MAINNET_SIGNING_DISABLED");
    const unknown = fakeWallet("kasware", { network: "igra_testnet" });
    expect((await settle(connectBrowserWallet("kasware", { networkId: "testnet-10", window: win("kasware", unknown) }))).code).toBe("WALLET_NETWORK_UNKNOWN");
    const sim = fakeWallet("kaspire", { address: "kaspasim:qr0lr4ml9fn3chekrqmjdkergxl93l4wrk3dankcgvjq776s9wn9jeadh9sjw" });
    expect((await settle(connectBrowserWallet("kaspire", { networkId: "testnet-10", window: win("kaspire", sim) }))).code).toBe("WALLET_NETWORK_MISMATCH");
  });

  it("the wallet's network changed after connect (no event): the re-read before the request refuses it, signPskt is never called", async () => {
    const f = fakeWallet("kasware");
    const s = await connectBrowserWallet("kasware", { networkId: "testnet-10", window: win("kasware", f) });
    f.state.network = "kaspa_testnet_11";
    expect((await settle(s.signTransaction(request()))).code).toBe("WALLET_NETWORK_MISMATCH");
    expect(signCalls(f)).toEqual([]);
    expect(s.active).toBe(false);
  });

  it("a request for another network than the session's is refused before the wallet is asked", async () => {
    const f = fakeWallet("kasware");
    const s = await connectBrowserWallet("kasware", { networkId: "testnet-10", window: win("kasware", f) });
    expect((await settle(s.signTransaction(request({ networkId: "simnet" })))).code).toBe("WALLET_NETWORK_MISMATCH");
    expect(signCalls(f)).toEqual([]);
  });

  it("mainnet: connect for mainnet touches nothing; a wallet on mainnet is refused; a mainnet request is never sent to the wallet", async () => {
    for (const kind of ["kasware", "kastle", "kaspire"] as const) {
      const f = fakeWallet(kind);
      for (const networkId of ["mainnet", "kaspa_mainnet", "Mainnet"]) {
        expect((await settle(connectBrowserWallet(kind, { networkId, window: win(kind, f) }))).code).toBe("MAINNET_SIGNING_DISABLED");
      }
      expect(f.calls, `${kind}: nothing was asked of the wallet`).toEqual([]);
    }
    const onMainnet = fakeWallet("kasware", { network: "kaspa_mainnet", address: MAINNET_ADDR });
    expect((await settle(connectBrowserWallet("kasware", { networkId: "testnet-10", window: win("kasware", onMainnet) }))).code).toBe("MAINNET_SIGNING_DISABLED");
    expect(signCalls(onMainnet)).toEqual([]);
    const prefixOnly = fakeWallet("kaspire", { address: MAINNET_ADDR });
    expect((await settle(connectBrowserWallet("kaspire", { networkId: "testnet-10", window: win("kaspire", prefixOnly) }))).code).toBe("MAINNET_SIGNING_DISABLED");
    const f = fakeWallet("kasware");
    const s = await connectBrowserWallet("kasware", { networkId: "testnet-10", window: win("kasware", f) });
    const before = f.calls.length;
    expect((await settle(s.signTransaction(request({ networkId: "mainnet" })))).code).toBe("MAINNET_SIGNING_DISABLED");
    expect(f.calls.length, "a mainnet request contacts nothing").toBe(before);
  });
});

describe("R3-C · trap 5 · the account switched mid-flow", () => {
  it("accountsChanged (array payload) before the request drops the session: refused, signPskt never called, listeners removed", async () => {
    const f = fakeWallet("kasware");
    const dropped: string[] = [];
    const s = await connectBrowserWallet("kasware", { networkId: "testnet-10", window: win("kasware", f), onDropped: (r) => dropped.push(r) });
    f.state.address = OTHER_ADDR;
    f.emit("accountsChanged", [OTHER_ADDR]);
    expect(s.active).toBe(false);
    expect(dropped).toHaveLength(1);
    expect((await settle(s.signTransaction(request()))).code).toBe("WALLET_ACCOUNT_CHANGED");
    expect(signCalls(f)).toEqual([]);
    expect(f.calls.filter((c) => c.method === "removeListener").length).toBeGreaterThan(0);
  });

  it("accountsChanged with the { address } payload while the popup is open: the signature that came back is not used", async () => {
    const f = fakeWallet("kaspire", {
      duringSign: (fake) => {
        fake.state.address = OTHER_ADDR;
        fake.emit("accountsChanged", { address: OTHER_ADDR });
      }
    });
    const s = await connectBrowserWallet("kaspire", { networkId: "testnet-10", window: win("kaspire", f) });
    const r = await settle(s.signTransaction(request()));
    expect(r.code).toBe("WALLET_ACCOUNT_CHANGED");
    expect(signCalls(f)).toHaveLength(1);
  });

  it("a switch with no event is caught by the re-read before (and after) every request", async () => {
    const f = fakeWallet("kasware");
    const s = await connectBrowserWallet("kasware", { networkId: "testnet-10", window: win("kasware", f) });
    f.state.address = OTHER_ADDR;
    expect((await settle(s.signTransaction(request()))).code).toBe("WALLET_ACCOUNT_CHANGED");
    expect(signCalls(f)).toEqual([]);
    const g = fakeWallet("kasware", { duringSign: (fake) => (fake.state.address = OTHER_ADDR) });
    const t = await connectBrowserWallet("kasware", { networkId: "testnet-10", window: win("kasware", g) });
    expect((await settle(t.signTransaction(request()))).code).toBe("WALLET_ACCOUNT_CHANGED");
  });

  it("a request for another address than the session's is refused before the wallet is asked", async () => {
    const f = fakeWallet("kasware");
    const s = await connectBrowserWallet("kasware", { networkId: "testnet-10", window: win("kasware", f) });
    expect((await settle(s.signTransaction(request({ address: OTHER_ADDR })))).code).toBe("WALLET_ACCOUNT_CHANGED");
    expect(signCalls(f)).toEqual([]);
  });
});

describe("R3-C · trap 8 · a locked wallet, a missing extension, a missing method", () => {
  it("Kaspire locked rejects at once: WALLET_REQUEST_REJECTED at connect", async () => {
    const f = fakeWallet("kaspire", { locked: true });
    const r = await settle(connectBrowserWallet("kaspire", { networkId: "testnet-10", window: win("kaspire", f) }));
    expect(r.code).toBe("WALLET_REQUEST_REJECTED");
    expect(r.message).toMatch(/locked/i);
  });

  it("KasWare locked after connect: the re-read before the request is refused, signPskt never called", async () => {
    const f = fakeWallet("kasware");
    const s = await connectBrowserWallet("kasware", { networkId: "testnet-10", window: win("kasware", f) });
    f.state.locked = true;
    expect((await settle(s.signTransaction(request()))).code).toBe("WALLET_REQUEST_REJECTED");
    expect(signCalls(f)).toEqual([]);
  });

  it("no extension: WALLET_NOT_FOUND; no signPskt: WALLET_METHOD_UNAVAILABLE", async () => {
    expect((await settle(connectBrowserWallet("kasware", { networkId: "testnet-10", window: {} }))).code).toBe("WALLET_NOT_FOUND");
    const f = fakeWallet("kasware");
    delete f.provider.signPskt;
    const s = await connectBrowserWallet("kasware", { networkId: "testnet-10", window: win("kasware", f) });
    expect((await settle(s.signTransaction(request()))).code).toBe("WALLET_METHOD_UNAVAILABLE");
  });

  it("a request that is not HardKAS's, or that asks another sighash type: refused before the wallet is asked", async () => {
    const f = fakeWallet("kasware");
    const s = await connectBrowserWallet("kasware", { networkId: "testnet-10", window: win("kasware", f) });
    expect((await settle(s.signTransaction({ ...request(), schema: "other" } as any))).code).toBe("WALLET_SIGN_REQUEST_INVALID");
    expect((await settle(s.signTransaction(request({ signInputs: [{ index: 0, sighashType: 0x81 as any }] })))).code).toBe("WALLET_SIGN_REQUEST_INVALID");
    expect(signCalls(f)).toEqual([]);
  });
});

describe("R3-C · trap 7 · signMessage: three answer shapes, normalized; the session's checks hold", () => {
  const HEX = "cd".repeat(64);
  const B64 = btoa(String.fromCharCode(...Array.from({ length: 64 }, () => 0xcd)));

  it("KasWare 0.11 (128 hex), older KasWare (88 base64), Kaspire ({ address, signature }): the same 64-byte signature", () => {
    expect(B64).toHaveLength(88);
    expect(normalizeWalletMessageSignature(HEX)).toEqual({ signatureHex: HEX, shape: "hex" });
    expect(normalizeWalletMessageSignature(HEX.toUpperCase())).toEqual({ signatureHex: HEX, shape: "hex" });
    expect(normalizeWalletMessageSignature(B64)).toEqual({ signatureHex: HEX, shape: "base64" });
    expect(normalizeWalletMessageSignature({ address: TESTNET_ADDR, signature: B64 })).toEqual({ signatureHex: HEX, shape: "object", statedAddress: TESTNET_ADDR });
  });

  it("an unknown shape is refused: WALLET_MESSAGE_SIGNATURE_UNREADABLE (a 65-byte base64 ECDSA one, short hex, zeros, a number, an object without signature)", () => {
    const b65 = btoa(String.fromCharCode(...Array.from({ length: 65 }, () => 0x1f)));
    expect(b65).toHaveLength(88);
    for (const bad of [b65, "ab".repeat(63), "00".repeat(64), 42, undefined, { address: TESTNET_ADDR }, ["x"], "not a signature"]) {
      expect(() => normalizeWalletMessageSignature(bad)).toThrow(expect.objectContaining({ code: "WALLET_MESSAGE_SIGNATURE_UNREADABLE" }));
    }
    expect(() => normalizeWalletMessageSignature(b65)).toThrow(/compact ECDSA/);
  });

  it("each wallet is asked with ONE argument after the account and network are re-read; the answer is normalized", async () => {
    for (const [kind, shape] of [["kasware", "hex"], ["kaspire", "object"], ["kastle", "hex"]] as const) {
      const f = fakeWallet(kind);
      const s = await connectBrowserWallet(kind, { networkId: "testnet-10", window: win(kind, f) });
      const before = f.calls.length;
      const out = await s.signMessage("hello");
      const after = f.calls.slice(before).map((c) => c.method);
      expect(after.indexOf("signMessage")).toBeGreaterThan(0);
      expect(f.calls.find((c) => c.method === "signMessage")!.args).toEqual(["hello"]);
      expect([out.signature.shape, out.signature.signatureHex, out.address]).toEqual([shape, HEX, TESTNET_ADDR]);
    }
    const old = fakeWallet("kasware", { messageAnswer: () => B64 });
    const s = await connectBrowserWallet("kasware", { networkId: "testnet-10", window: win("kasware", old) });
    expect((await s.signMessage("hello")).signature.shape).toBe("base64");
  });

  it("account switched while the popup is open, a locked wallet, an empty message, an unknown answer: refused", async () => {
    const f = fakeWallet("kasware", { duringSign: (fake) => fake.emit("accountsChanged", [OTHER_ADDR]) });
    const s = await connectBrowserWallet("kasware", { networkId: "testnet-10", window: win("kasware", f) });
    expect((await settle(s.signMessage("hello"))).code).toBe("WALLET_ACCOUNT_CHANGED");
    const g = fakeWallet("kaspire");
    const t = await connectBrowserWallet("kaspire", { networkId: "testnet-10", window: win("kaspire", g) });
    g.state.locked = true;
    expect((await settle(t.signMessage("hello"))).code).toBe("WALLET_REQUEST_REJECTED");
    expect(g.calls.filter((c) => c.method === "signMessage")).toEqual([]);
    g.state.locked = false;
    expect((await settle(t.signMessage(""))).code).toBe("WALLET_SIGN_REQUEST_INVALID");
    const h = fakeWallet("kasware", { messageAnswer: () => ({ sig: "x" }) });
    const u = await connectBrowserWallet("kasware", { networkId: "testnet-10", window: win("kasware", h) });
    const e: any = await u.signMessage("hello").catch((x) => x);
    expect(e.code).toBe("WALLET_MESSAGE_SIGNATURE_UNREADABLE");
    expect(e.walletReturned).toEqual({ sig: "x" });
  });
});

describe("R3-C · the browser half is browser-safe", () => {
  it("every module the browser entry reaches imports only its sibling browser modules, and names no Node module or global", () => {
    const dir = path.join(__dirname, "..", "src", "wallets");
    const seen = new Set<string>();
    const visit = (file: string) => {
      if (seen.has(file)) return;
      seen.add(file);
      const text = fs.readFileSync(path.join(dir, file), "utf8");
      const code = text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
      for (const m of code.matchAll(/(?:import|export)[^"']*?from\s+["']([^"']+)["']/g)) {
        const spec = m[1]!;
        expect(spec, `${file} imports ${spec}`).toMatch(/^\.\/[a-z-]+\.js$/);
        visit(spec.slice(2).replace(/\.js$/, ".ts"));
      }
      expect(code, `${file} names no Node module or global`).not.toMatch(/\bBuffer\b|\bprocess\.|\brequire\(|node:|import\(/);
    };
    visit("index.ts");
    expect([...seen].sort()).toEqual(["browser-signer.ts", "canonical-json.ts", "errors.ts", "index.ts", "message-signature.ts", "networks.ts", "signed-transaction-check.ts"]);
    // and the SDK's browser entry (@hardkas/sdk/client) exports it
    expect(fs.readFileSync(path.join(__dirname, "..", "src", "client.ts"), "utf8")).toMatch(/export \* from "\.\/wallets\/index\.js";/);
  });
});
