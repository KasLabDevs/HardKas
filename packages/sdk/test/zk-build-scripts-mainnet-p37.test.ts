// ESCALÓN 4 · P37 · MAINNET TOTAL LOCKDOWN at lock construction. buildR0Groth16Scripts returned, for
// addressNetworks ["mainnet"] + acknowledgeImageIdOnlyLock, a lock's mainnet P2SH address together with its signature
// script, and a ZK lock's signature script IS the authorization of its spend (a ZK spend carries no signature). Every
// mainnet spelling, and a bound payout or change address of mainnet, now throws MAINNET_SIGNING_DISABLED before the
// receipt is read: no mainnet address, no signature script. The spend guard (H5) is unchanged. Offline: kaspa-wasm only,
// no node and no network.
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadManagedKaspaWasmSync } from "@hardkas/core";
import { HardkasZk, buildR0Groth16Scripts, buildR0Groth16Transaction } from "../src/index.js";

function repoRoot(): string {
  let current = path.dirname(fileURLToPath(import.meta.url));
  while (current !== path.dirname(current)) {
    if (fs.existsSync(path.join(current, "pnpm-workspace.yaml"))) return current;
    current = path.dirname(current);
  }
  throw new Error("repo root not found");
}

const R0 = path.join(repoRoot(), "fixtures", "toccata-v2", "zk", "r0-groth16-official");
const IMAGE = "75641a540ee2ad9ee5902bcdcdb8b55c0bef4a28287309b858f97b1356c6c2e0";
const JOURNAL = "5df6e0e2761359d30a8275058e299fcc0381534545f55cf43e41983f5d4c9456";
const RECEIPT = fs.readFileSync(path.join(R0, "receipt.hex"), "utf8").trim();

const kaspa = loadManagedKaspaWasmSync();
const addr = (seed: string, net = "simnet") => new kaspa.PrivateKey(seed.repeat(32)).toKeypair().toAddress(net).toString();
const SPELLINGS = ["mainnet", "mainnet-1", "kaspa", "kaspa-mainnet", "MAINNET", " Mainnet ", "KASPA-MAINNET-1"];
const base = { imageId: IMAGE, journalHash: JOURNAL, receiptHex: RECEIPT };
const codes = (r: { issues: Array<{ code: string }> }) => r.issues.map((i) => i.code);

/** The refusal's code; when nothing is thrown, what came back instead. */
function outcomeOf(fn: () => any): string {
  try {
    const r = fn();
    if (r?.ok && typeof r.sigScript === "string" && r.sigScript !== "") return "LOCK_BUILT";
    return `RETURNED_ISSUES: ${(r?.issues ?? []).map((i: any) => i.code).join(",")}`;
  } catch (e: any) {
    return String(e?.code ?? `THREW_UNTYPED: ${e?.message}`);
  }
}

describe("P37 · buildR0Groth16Scripts builds no mainnet lock (MAINNET TOTAL LOCKDOWN)", () => {
  it("every mainnet spelling in addressNetworks is MAINNET_SIGNING_DISABLED, acknowledged or not, alone or with testnet-10", () => {
    for (const net of SPELLINGS) {
      for (const acknowledgeImageIdOnlyLock of [true, false]) {
        expect(outcomeOf(() => buildR0Groth16Scripts({ ...base, addressNetworks: [net as any], acknowledgeImageIdOnlyLock })), `${net} ack=${acknowledgeImageIdOnlyLock}`).toBe(
          "MAINNET_SIGNING_DISABLED"
        );
      }
      expect(outcomeOf(() => buildR0Groth16Scripts({ ...base, addressNetworks: ["testnet-10", net as any], acknowledgeImageIdOnlyLock: true })), net).toBe(
        "MAINNET_SIGNING_DISABLED"
      );
    }
  });

  it("the refusal comes before the receipt, the image id or the journal is read, and says nothing was signed", () => {
    const params = new Proxy({ addressNetworks: ["mainnet"] } as Record<string, unknown>, {
      get(target, key) {
        if (key === "addressNetworks" || key === "bindingPolicy") return target[key as string];
        throw new Error(`READ_${String(key)}`);
      }
    });
    expect(outcomeOf(() => buildR0Groth16Scripts(params as any))).toBe("MAINNET_SIGNING_DISABLED");
    let error: any;
    try {
      buildR0Groth16Scripts({ ...base, addressNetworks: ["kaspa"] as any, acknowledgeImageIdOnlyLock: true });
    } catch (e) {
      error = e;
    }
    expect(error?.metadata?.operation).toBe("sign");
    expect(String(error?.message)).toMatch(/Nothing was signed or recorded/);
  });

  it("a lock bound to a mainnet payout or change address is refused the same way (an indirect mainnet request)", () => {
    const mainnetPayout = { mode: "proof-and-output-bound" as const, payout: { address: addr("11", "mainnet"), amountSompi: 100000000n } };
    expect(outcomeOf(() => buildR0Groth16Scripts({ ...base, bindingPolicy: mainnetPayout }))).toBe("MAINNET_SIGNING_DISABLED");
    const upper = { ...mainnetPayout, payout: { ...mainnetPayout.payout, address: ` ${addr("11", "mainnet").toUpperCase()} ` } };
    expect(outcomeOf(() => buildR0Groth16Scripts({ ...base, bindingPolicy: upper }))).toBe("MAINNET_SIGNING_DISABLED");
    const mainnetChange = {
      mode: "proof-and-output-bound" as const,
      payout: { address: addr("11"), amountSompi: 100000000n },
      change: { address: addr("22", "mainnet"), amountSompi: 15000000n }
    };
    expect(outcomeOf(() => buildR0Groth16Scripts({ ...base, bindingPolicy: mainnetChange }))).toBe("MAINNET_SIGNING_DISABLED");
  });

  it("the SDK facade (sdk.zk.toccata.buildScripts) is the same guarded function", () => {
    const zk = new HardkasZk({} as any);
    expect(outcomeOf(() => zk.toccata.buildScripts({ ...base, addressNetworks: ["mainnet"], acknowledgeImageIdOnlyLock: true }))).toBe("MAINNET_SIGNING_DISABLED");
  });

  it("control: simnet still builds the node-accepted lock; testnet-10 keeps its issue-based answers; devnet stays unsupported", () => {
    const sim = buildR0Groth16Scripts(base);
    expect(sim.ok).toBe(true);
    expect(sim.p2shAddresses.simnet).toMatch(/^kaspasim:p/);
    expect(sim.sigScript.length).toBeGreaterThan(0);
    const bound = buildR0Groth16Scripts({ ...base, bindingPolicy: { mode: "proof-and-output-bound", payout: { address: addr("11"), amountSompi: 100000000n } } });
    expect(bound.ok).toBe(true);
    expect(bound.consensusEnforced).toBe(true);
    // testnet-10 is decided by the HK-16 issues, never by the mainnet guard (and the public vector gets no testnet address)
    const tnNoAck = buildR0Groth16Scripts({ ...base, addressNetworks: ["testnet-10"] });
    expect(codes(tnNoAck)).toContain("ZK_IMAGE_ID_ONLY_LOCK_NOT_ACKNOWLEDGED");
    const tnAck = buildR0Groth16Scripts({ ...base, addressNetworks: ["testnet-10"], acknowledgeImageIdOnlyLock: true });
    expect(codes(tnAck)).toContain("ZK_PUBLIC_VECTOR_PUBLIC_NETWORK_REFUSED");
    expect(tnAck.p2shAddresses.testnet10).toBeUndefined();
    const tnBound = buildR0Groth16Scripts({
      ...base,
      bindingPolicy: { mode: "proof-and-output-bound", payout: { address: addr("11", "testnet-10"), amountSompi: 100000000n } }
    });
    expect(tnBound.ok).toBe(true);
    expect(codes(buildR0Groth16Scripts({ ...base, addressNetworks: ["devnet" as any] }))).toContain("ZK_ADDRESS_NETWORK_UNSUPPORTED");
  });

  it("control: the spend guard (H5) is untouched: a mainnet spend of a simnet lock still throws MAINNET_SIGNING_DISABLED", () => {
    const sim = buildR0Groth16Scripts(base);
    expect(
      outcomeOf(() =>
        buildR0Groth16Transaction({
          scripts: sim,
          utxo: { transactionId: "11".repeat(32), index: 0, amountSompi: 200000000n },
          destinationAddress: addr("33", "mainnet"),
          networkId: "mainnet"
        } as any)
      )
    ).toBe("MAINNET_SIGNING_DISABLED");
  });
});
