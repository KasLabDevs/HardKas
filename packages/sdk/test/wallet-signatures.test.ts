import { describe, it, expect, afterAll, beforeAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import net from "node:net";
import path from "node:path";
import { HardkasError, getSilContract, kaspaSighashInputsFromWasm, loadManagedKaspaWasmSync, parseSilAbiArtifact, silContractBytecodeHex, silverP2shLock } from "@hardkas/core";
import { finalizeSilverSpend, prepareSilverSpend } from "@hardkas/accounts";
import {
  Hardkas,
  WALLET_SIGN_REQUEST_SCHEMA,
  completeWalletPayment,
  prepareWalletPayment,
  silverSpendSignatureFromWallet,
  silverSpendWalletRequest,
  verifyWalletMessage,
  verifyWalletMessageSignature,
  verifyWalletSignedTransaction,
  walletPublicKeyOf,
  type WalletSignRequest
} from "../src/index.js";

// -----------------------------------------------------------------------------
// R3-C · the HardKAS half of a browser wallet's signature (hermetic: kaspa-wasm, no node). Each signature the wallet
// returns is verified against the key HardKAS expects over HardKAS's own signature hash: a well-formed signature by
// another key, or over another transaction, is refused (WALLET_SIGNATURE_INVALID). Mainnet is refused before any node is
// contacted (a loopback listener counts connections) — for payments and for v1 drafts.
// -----------------------------------------------------------------------------

let k: any;
const KEY_A = "b7e151628aed2a6abf7158809cf4f3c762e7160f38b4da56a784d9045190cfef";
const KEY_B = "c90fdaa22168c234c4c6628b80dc1cd129024e088a67cc74020bbea63b14e5c9";

beforeAll(() => {
  k = loadManagedKaspaWasmSync();
});

/** A two-input v0 payment from key A's simnet address, unsigned, as kaspa-wasm builds it. */
function unsigned(outputValue = 900_000_000n) {
  const a = new k.PrivateKey(KEY_A);
  const address = a.toPublicKey().toAddress("simnet");
  const spk = k.payToAddressScript(address);
  const input = (n: number) => ({
    previousOutpoint: { transactionId: String(n).repeat(64), index: n },
    signatureScript: "",
    sequence: 0n,
    sigOpCount: 1,
    utxo: { address, outpoint: { transactionId: String(n).repeat(64), index: n }, amount: 500_000_000n, scriptPublicKey: spk, blockDaaScore: 10n, isCoinbase: false }
  });
  const tx = new k.Transaction({
    version: 0,
    inputs: [input(1), input(2)],
    outputs: [{ value: outputValue, scriptPublicKey: spk }],
    lockTime: 0n,
    subnetworkId: "0000000000000000000000000000000000000000",
    gas: 0n,
    payload: ""
  });
  return { tx, address: String(address.toString()), json: String(tx.serializeToSafeJSON()), sighash: kaspaSighashInputsFromWasm(tx.serializeToObject()) };
}

/** A fake wallet's signature: the SDK's own deserializer and signer, over the JSON it was handed. */
function walletSign(json: string, key: string, inputs: number[]): string {
  const tx = k.Transaction.deserializeFromSafeJSON(json);
  const out = JSON.parse(json);
  for (const i of inputs) out.inputs[i].signatureScript = String(k.createInputSignature(tx, i, new k.PrivateKey(key), k.SighashType.All));
  return JSON.stringify(out);
}

function requestFor(u: ReturnType<typeof unsigned>): WalletSignRequest {
  return {
    schema: WALLET_SIGN_REQUEST_SCHEMA,
    purpose: "payment",
    networkId: "simnet",
    address: u.address,
    publicKey: walletPublicKeyOf(u.address),
    txJsonString: u.json,
    txId: String(u.tx.id),
    signInputs: [
      { index: 0, sighashType: 1 },
      { index: 1, sighashType: 1 }
    ],
    autoFinalized: true,
    planArtifactId: "00".repeat(32)
  };
}

const code = (f: () => unknown) => {
  try {
    f();
    return "RESOLVED";
  } catch (e: any) {
    expect(e).toBeInstanceOf(HardkasError);
    return String(e.code);
  }
};

describe("R3-C · every wallet signature is verified against the expected key over HardKAS's signature hash", () => {
  it("the SDK's signature by the address's key, over the JSON HardKAS sent: accepted; the 65-byte signatures handed on", () => {
    const u = unsigned();
    const check = verifyWalletSignedTransaction({ request: requestFor(u), returned: walletSign(u.json, KEY_A, [0, 1]), sighash: u.sighash });
    expect(Object.keys(check.signatures)).toEqual(["0", "1"]);
    expect(check.signatures[0]).toMatch(/^[0-9a-f]{128}01$/);
    expect(check.signatureScripts[1]).toBe(`41${check.signatures[1]}`);
  });

  it("a well-formed signature by another key: WALLET_SIGNATURE_INVALID", () => {
    const u = unsigned();
    expect(code(() => verifyWalletSignedTransaction({ request: requestFor(u), returned: walletSign(u.json, KEY_B, [0, 1]), sighash: u.sighash }))).toBe("WALLET_SIGNATURE_INVALID");
  });

  it("a valid signature over ANOTHER transaction, returned with HardKAS's outputs: WALLET_SIGNATURE_INVALID", () => {
    const u = unsigned();
    const other = unsigned(800_000_000n);
    const signedOther = JSON.parse(walletSign(other.json, KEY_A, [0, 1]));
    const sent = JSON.parse(u.json);
    sent.inputs.forEach((i: any, n: number) => (i.signatureScript = signedOther.inputs[n].signatureScript));
    expect(code(() => verifyWalletSignedTransaction({ request: requestFor(u), returned: JSON.stringify(sent), sighash: u.sighash }))).toBe("WALLET_SIGNATURE_INVALID");
  });

  it("the structural refusals come back as HardkasError with the browser codes", () => {
    const u = unsigned();
    const empty = JSON.parse(walletSign(u.json, KEY_A, [0]));
    expect(code(() => verifyWalletSignedTransaction({ request: requestFor(u), returned: JSON.stringify(empty), sighash: u.sighash }))).toBe("WALLET_SIGNATURE_MISSING");
    const changed = JSON.parse(walletSign(u.json, KEY_A, [0, 1]));
    changed.outputs[0].value = "1";
    expect(code(() => verifyWalletSignedTransaction({ request: requestFor(u), returned: JSON.stringify(changed), sighash: u.sighash }))).toBe("WALLET_SIGNED_TRANSACTION_CHANGED");
  });

  it("only a Schnorr P2PK address names the key a wallet signs with", () => {
    const pub = new k.PrivateKey(KEY_A).toPublicKey();
    expect(walletPublicKeyOf(String(pub.toAddress("simnet").toString()))).toBe(String(pub.toXOnlyPublicKey().toString()).toLowerCase());
    expect(code(() => walletPublicKeyOf(String(pub.toAddressECDSA("simnet").toString())))).toBe("WALLET_ADDRESS_UNSUPPORTED");
    expect(code(() => walletPublicKeyOf("kaspasim:not-an-address"))).toBe("WALLET_ADDRESS_UNSUPPORTED");
  });
});

// ------------------------------------------------------------------------------------------------ mainnet, decoy node
const made: string[] = [];
const servers: net.Server[] = [];

async function counter(): Promise<{ url: string; connections: () => number }> {
  let connections = 0;
  const server = net.createServer((s) => {
    connections++;
    s.destroy();
  });
  servers.push(server);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const port = (server.address() as net.AddressInfo).port;
  return { url: `ws://127.0.0.1:${port}`, connections: () => connections };
}

function workspace(key: string, declared: string, url: string): string {
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), "hk-r3c-wallet-mlk-"));
  made.push(ws);
  fs.mkdirSync(path.join(ws, ".hardkas"));
  const cfg = {
    execution: { default: "t", targets: { t: { mode: "rpc", domain: "kaspa-l1", network: key } } },
    networks: { [key]: { kind: "kaspa-rpc", network: declared, rpcUrl: url, allowMainnet: true } },
    experimental: true,
    network: { allowPublic: true }
  };
  fs.writeFileSync(path.join(ws, "hardkas.config.ts"), `export default ${JSON.stringify(cfg)};\n`);
  return ws;
}

afterAll(async () => {
  for (const s of servers) await new Promise<void>((r) => s.close(() => r()));
  for (const d of made) fs.rmSync(d, { recursive: true, force: true });
});

const settle = (p: Promise<unknown> | (() => unknown)) =>
  Promise.resolve()
    .then(() => (typeof p === "function" ? p() : p))
    .then(
      () => "RESOLVED",
      (e: any) => String(e?.code ?? "UNCODED")
    );

describe("R3-C · mainnet: refused before anything is planned, read or asked; nothing contacted", () => {
  for (const [key, declared] of [["mainnet", "mainnet"], ["prod", "mainnet"]] as const) {
    it(`network '${key}' (declares ${declared}): prepareWalletPayment, completeWalletPayment, walletDraftRequest, fillDraftFromWallet`, async () => {
      const node = await counter();
      const sdk = await Hardkas.open({ cwd: workspace(key, declared, node.url) });
      const mainnetAddr = String(new k.PrivateKey(KEY_A).toPublicKey().toAddress("mainnet").toString());
      try {
        const plan: any = { schema: "hardkas.txPlan", networkId: declared, contentHash: "00".repeat(32), inputs: [{}] };
        const request: any = { ...requestFor(unsigned()), networkId: declared, address: mainnetAddr };
        const draft: any = { schema: "hardkas.v1TxDraft", networkId: declared, slots: [], txId: "00".repeat(32), planArtifactId: "00".repeat(32), contentHash: "00".repeat(32) };
        expect(await settle(prepareWalletPayment(sdk, { address: mainnetAddr, to: mainnetAddr, amount: "1" }))).toBe("MAINNET_SIGNING_DISABLED");
        expect(await settle(completeWalletPayment(sdk, { plan, request, returned: "{}" }))).toBe("MAINNET_SIGNING_DISABLED");
        expect(await settle(sdk.covenants.walletDraftRequest(draft, plan, mainnetAddr))).toBe("MAINNET_SIGNING_DISABLED");
        expect(await settle(() => sdk.covenants.fillDraftFromWallet(draft, plan, { ...request, purpose: "contract" }, "{}"))).toBe("MAINNET_SIGNING_DISABLED");
        expect(node.connections(), "the mainnet endpoint was never contacted").toBe(0);
      } finally {
        await sdk.close();
      }
    });
  }

  it("a mainnet wallet address on a simnet instance is refused as mainnet, before the node is asked", async () => {
    const node = await counter();
    const sdk = await Hardkas.open({ cwd: workspace("simnet", "simnet", node.url) });
    const mainnetAddr = String(new k.PrivateKey(KEY_A).toPublicKey().toAddress("mainnet").toString());
    const testnetAddr = String(new k.PrivateKey(KEY_A).toPublicKey().toAddress("testnet-10").toString());
    try {
      expect(await settle(prepareWalletPayment(sdk, { address: mainnetAddr, to: mainnetAddr, amount: "1" }))).toBe("MAINNET_SIGNING_DISABLED");
      expect(await settle(prepareWalletPayment(sdk, { address: testnetAddr, to: testnetAddr, amount: "1" }))).toBe("WALLET_NETWORK_MISMATCH");
      expect(node.connections()).toBe(0);
    } finally {
      await sdk.close();
    }
  });
});

// ------------------------------------------------------------------------------------------- trap 7 · signMessage
describe("R3-C · trap 7 · a wallet's message signature verified with kaspa-wasm against the expected address", () => {
  const message = "HardKAS wallet probe";
  const setup = () => {
    const key = new k.PrivateKey(KEY_A);
    const address = String(key.toPublicKey().toAddress("testnet-10").toString());
    const hex = String(k.signMessage({ message, privateKey: key }));
    return { address, hex, b64: Buffer.from(hex, "hex").toString("base64") };
  };

  it("KasWare 0.11 hex, older KasWare base64, Kaspire { address, signature }: all verify; the page-side function with its own kaspa-wasm verifies too", () => {
    const { address, hex, b64 } = setup();
    expect(verifyWalletMessage({ address, message, returned: hex })).toMatchObject({ shape: "hex", signatureHex: hex, publicKey: walletPublicKeyOf(address) });
    expect(verifyWalletMessage({ address, message, returned: b64 }).shape).toBe("base64");
    expect(verifyWalletMessage({ address, message, returned: { address, signature: hex } }).shape).toBe("object");
    expect(verifyWalletMessageSignature({ kaspa: k, address, message, returned: hex }).shape).toBe("hex");
  });

  it("another key, another message, Kaspire naming another address, an unknown shape: typed refusals (HardkasError)", () => {
    const { address, hex } = setup();
    const other = String(new k.PrivateKey(KEY_B).toPublicKey().toAddress("testnet-10").toString());
    expect(code(() => verifyWalletMessage({ address: other, message, returned: hex }))).toBe("WALLET_MESSAGE_SIGNATURE_INVALID");
    expect(code(() => verifyWalletMessage({ address, message: message + "!", returned: hex }))).toBe("WALLET_MESSAGE_SIGNATURE_INVALID");
    expect(code(() => verifyWalletMessage({ address, message, returned: { address: other, signature: hex } }))).toBe("WALLET_MESSAGE_ADDRESS_MISMATCH");
    expect(code(() => verifyWalletMessage({ address, message, returned: 12345 }))).toBe("WALLET_MESSAGE_SIGNATURE_UNREADABLE");
    const ecdsa = String(new k.PrivateKey(KEY_A).toPublicKey().toAddressECDSA("testnet-10").toString());
    expect(code(() => verifyWalletMessage({ address: ecdsa, message, returned: hex }))).toBe("WALLET_ADDRESS_UNSUPPORTED");
  });

  it("a mainnet address is refused like every path", () => {
    const { hex } = setup();
    const mainnet = String(new k.PrivateKey(KEY_A).toPublicKey().toAddress("mainnet").toString());
    expect(code(() => verifyWalletMessage({ address: mainnet, message, returned: hex }))).toBe("MAINNET_SIGNING_DISABLED");
  });
});

// ---------------------------------------------------------------------------- item 2b · v0 SilverScript spend draft
describe("R3-C · a v0 SilverScript spend's sig argument from a wallet (hermetic: the corpus artifact, kaspa-wasm)", () => {
  const artifactPath = path.resolve(__dirname, "../../../fixtures/toccata-v2/silver/p2sh-transfer-with-timeout/contract.artifact.json");
  const draftOf = (networkId = "simnet") => {
    const artifact = parseSilAbiArtifact(JSON.parse(fs.readFileSync(artifactPath, "utf8")));
    const lock = silverP2shLock(silContractBytecodeHex(getSilContract(artifact, "TransferWithTimeout").contract));
    const wallet = String(new k.PrivateKey(KEY_A).toPublicKey().toAddress("simnet").toString());
    const args = [{ kind: "signer", signer: "wallet" }] as const;
    const draft = prepareSilverSpend({
      artifact,
      contractName: "TransferWithTimeout",
      entry: "transfer",
      args: args as any,
      utxo: { outpoint: { transactionId: "77".repeat(32), index: 0 }, amountSompi: 200_000_000n, scriptPublicKey: lock, blockDaaScore: 10n, isCoinbase: false },
      outputs: [{ amountSompi: 198_000_000n, address: wallet }],
      networkId
    });
    return { artifact, args, draft, wallet };
  };
  const walletSign = (json: string, key: string, mutate?: (tx: any) => void) => {
    const out = JSON.parse(json);
    mutate?.(out);
    const tx = k.Transaction.deserializeFromSafeJSON(JSON.stringify(out));
    const signed = JSON.parse(json);
    signed.inputs[0].signatureScript = String(k.createInputSignature(tx, 0, new k.PrivateKey(key), k.SighashType.All));
    if (mutate) mutate(signed);
    return JSON.stringify(signed);
  };

  it("the request is input 0 of the draft's own unsigned transaction, autoFinalized false; the wallet's signature becomes the sig argument finalizeSilverSpend assembles", () => {
    const { artifact, args, draft, wallet } = draftOf();
    const request = silverSpendWalletRequest(draft, wallet);
    expect([request.purpose, request.autoFinalized, request.signInputs, request.txId]).toEqual(["contract", false, [{ index: 0, sighashType: 1 }], draft.unsignedTxId]);
    const sig = silverSpendSignatureFromWallet(draft, request, walletSign(request.txJsonString, KEY_A));
    expect(sig).toMatch(/^[0-9a-f]{128}01$/);
    const final = finalizeSilverSpend(draft, artifact, args as any, { wallet: sig });
    expect(final.txId).toBe(draft.unsignedTxId);
  });

  it("another key: WALLET_SIGNATURE_INVALID; a changed output: WALLET_SIGNED_TRANSACTION_CHANGED; a signature over a changed output returned on the original: WALLET_SIGNATURE_INVALID; another draft's request: WALLET_REQUEST_MISMATCH", () => {
    const { draft, wallet } = draftOf();
    const request = silverSpendWalletRequest(draft, wallet);
    expect(code(() => silverSpendSignatureFromWallet(draft, request, walletSign(request.txJsonString, KEY_B)))).toBe("WALLET_SIGNATURE_INVALID");
    expect(code(() => silverSpendSignatureFromWallet(draft, request, walletSign(request.txJsonString, KEY_A, (tx) => (tx.outputs[0].value = "1"))))).toBe("WALLET_SIGNED_TRANSACTION_CHANGED");
    const overOther = JSON.parse(request.txJsonString);
    const changed = JSON.parse(request.txJsonString);
    changed.outputs[0].value = "197000000";
    overOther.inputs[0].signatureScript = String(k.createInputSignature(k.Transaction.deserializeFromSafeJSON(JSON.stringify(changed)), 0, new k.PrivateKey(KEY_A), k.SighashType.All));
    expect(code(() => silverSpendSignatureFromWallet(draft, request, JSON.stringify(overOther)))).toBe("WALLET_SIGNATURE_INVALID");
    expect(code(() => silverSpendSignatureFromWallet(draft, { ...request, txId: "00".repeat(32) }, walletSign(request.txJsonString, KEY_A)))).toBe("WALLET_REQUEST_MISMATCH");
  });

  it("mainnet: a mainnet draft and a mainnet address are refused before anything is built", () => {
    const { draft, wallet } = draftOf();
    const mainnet = String(new k.PrivateKey(KEY_A).toPublicKey().toAddress("mainnet").toString());
    expect(code(() => silverSpendWalletRequest({ ...draft, networkId: "mainnet" }, wallet))).toBe("MAINNET_SIGNING_DISABLED");
    expect(code(() => silverSpendWalletRequest(draft, mainnet))).toBe("MAINNET_SIGNING_DISABLED");
    const testnet = String(new k.PrivateKey(KEY_A).toPublicKey().toAddress("testnet-10").toString());
    expect(code(() => silverSpendWalletRequest(draft, testnet))).toBe("WALLET_NETWORK_MISMATCH");
  });
});
