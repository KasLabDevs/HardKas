// A minimal stand-in for a simnet node, for the treasury tests (rc2 audit B2/B4/A10/B6): only the transport is fake.
// It keeps a UTXO set in the shape the real JsonWrpcKaspaClient returns (scriptPublicKey "<2-byte version><script>"
// hex, bigint amounts and DAA scores, isCoinbase), checks a submitted transaction's inputs (they exist, are not spent in
// its mempool, coinbases are mature) and its value (inputs >= outputs), answers like rusty-kaspa ("Rejected transaction
// <id>: ..."), and applies the mempool when it "mines" a block. It does not verify signatures: the real-node test does.
import { createHash } from "node:crypto";
import { loadManagedKaspaWasmSync } from "@hardkas/core";
import type { TreasuryBlockProducer, TreasuryRpc } from "../src/runners/localnet-treasury.js";

export const KAS = 100_000_000n;
export const SIMNET_COINBASE_MATURITY = 1_000n;
export const BLOCK_REWARD_SOMPI = 50n * KAS;

export interface FakeUtxo {
  outpoint: { transactionId: string; index: number };
  address: string;
  amountSompi: bigint;
  scriptPublicKey: string;
  blockDaaScore: bigint;
  isCoinbase: boolean;
  covenantId?: string;
}

export function scriptHexOf(address: string): string {
  const k: any = loadManagedKaspaWasmSync();
  const spk = k.payToAddressScript(address);
  return Number(spk.version).toString(16).padStart(4, "0") + String(spk.script);
}

export function fixtureAddress(seedByte: string): string {
  const k: any = loadManagedKaspaWasmSync();
  return String(new k.PrivateKey(seedByte.repeat(32)).toPublicKey().toAddress("simnet").toString());
}

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const keyOf = (o: { transactionId: string; index: number }) => `${o.transactionId.toLowerCase()}:${o.index}`;

export interface FakeSubmission {
  txId: string;
  raw: string;
  tx: any;
  inputsSompi: bigint;
  outputs: Array<{ address: string; amountSompi: bigint }>;
  feeSompi: bigint;
}

export class FakeLocalnet {
  daa: bigint;
  readonly utxos = new Map<string, FakeUtxo>();
  readonly scripts = new Map<string, string>();
  readonly mempool = new Map<string, any>();
  readonly submissions: FakeSubmission[] = [];
  readonly events: string[] = [];
  /** Overrides one submission: `deliver` puts it in the mempool first (the request reached the node), then the answer/error. */
  onSubmit?: (txId: string, n: number) => { deliver?: boolean; error?: unknown; answer?: unknown } | undefined;
  private counter = 0;

  constructor(daa = 5_000n) {
    this.daa = daa;
  }

  know(address: string): string {
    this.scripts.set(scriptHexOf(address), address);
    return address;
  }

  add(address: string, amountSompi: bigint, opts: { blockDaaScore?: bigint; isCoinbase?: boolean; covenantId?: string; transactionId?: string; index?: number } = {}): FakeUtxo {
    this.know(address);
    const u: FakeUtxo = {
      outpoint: { transactionId: opts.transactionId ?? sha(`utxo-${this.counter++}`), index: opts.index ?? 0 },
      address,
      amountSompi,
      scriptPublicKey: scriptHexOf(address),
      blockDaaScore: opts.blockDaaScore ?? this.daa,
      isCoinbase: opts.isCoinbase ?? false,
      ...(opts.covenantId ? { covenantId: opts.covenantId } : {})
    };
    this.utxos.set(keyOf(u.outpoint), u);
    return u;
  }

  utxosOf(address: string): FakeUtxo[] {
    return [...this.utxos.values()].filter((u) => u.address === address);
  }

  balance(address: string): bigint {
    return this.utxosOf(address).reduce((s, u) => s + u.amountSompi, 0n);
  }

  readonly rpc: TreasuryRpc = {
    getUtxosByAddress: async (a: string) => this.utxosOf(a).map((u) => ({ ...u, outpoint: { ...u.outpoint } })),
    getInfo: async () => ({ virtualDaaScore: this.daa }),
    getBalanceByAddress: async (a: string) => ({ balanceSompi: this.balance(a) }),
    submitTransaction: async (raw: any, options?: any) => this.submit(raw, options)
  };

  private outputsOf(tx: any): Array<{ address: string; amountSompi: bigint }> {
    return (tx.outputs ?? []).map((o: any) => {
      const spk = o.scriptPublicKey;
      const hex = Number(spk.version ?? 0).toString(16).padStart(4, "0") + String(spk.scriptPublicKey ?? spk.script ?? "");
      return { address: this.scripts.get(hex) ?? `unknown:${hex}`, amountSompi: BigInt(o.amount ?? o.value) };
    });
  }

  private rejection(txId: string, tx: any): string | undefined {
    if (this.mempool.has(txId)) return `transaction ${txId} is already in the mempool`;
    let inputs = 0n;
    for (const i of tx.inputs ?? []) {
      const k = keyOf(i.previousOutpoint);
      const u = this.utxos.get(k);
      if (!u) return `transaction ${txId} is an orphan where orphan is disallowed`;
      for (const [other, m] of this.mempool) {
        if ((m.inputs ?? []).some((j: any) => keyOf(j.previousOutpoint) === k)) return `output ${k} already spent by transaction ${other} in the mempool`;
      }
      if (u.isCoinbase && this.daa - u.blockDaaScore < SIMNET_COINBASE_MATURITY) return `transaction ${txId} spends an immature coinbase ${k}`;
      if (!i.signatureScript) return `transaction ${txId} input ${k} has no signature script`;
      inputs += u.amountSompi;
    }
    const out = this.outputsOf(tx).reduce((s, o) => s + o.amountSompi, 0n);
    if (inputs < out) return `transaction ${txId} spends more than its inputs`;
    return undefined;
  }

  submit(raw: any, options?: any): unknown {
    const tx = typeof raw === "string" ? JSON.parse(raw) : raw;
    const txId = String(options?.expectedTxId ?? "").toLowerCase();
    const inputsSompi = (tx.inputs ?? []).reduce((s: bigint, i: any) => s + (this.utxos.get(keyOf(i.previousOutpoint))?.amountSompi ?? 0n), 0n);
    const outputs = this.outputsOf(tx);
    const n = this.submissions.length;
    this.submissions.push({ txId, raw: String(raw), tx, inputsSompi, outputs, feeSompi: inputsSompi - outputs.reduce((s, o) => s + o.amountSompi, 0n) });
    const override = this.onSubmit?.(txId, n);
    if (override?.deliver && !this.rejection(txId, tx)) this.mempool.set(txId, tx);
    if (override?.error !== undefined) throw override.error;
    if (override?.answer !== undefined) return override.answer;
    const reason = this.rejection(txId, tx);
    if (reason) throw new Error(`Rejected transaction ${txId}: ${reason}`);
    this.mempool.set(txId, tx);
    return { accepted: true, transactionId: txId };
  }

  /** One block per count: a coinbase to `rewardAddress`, and every mempool transaction accepted. */
  mine(count: number, rewardAddress: string): void {
    for (let b = 0; b < count; b++) {
      this.daa += 1n;
      this.add(rewardAddress, BLOCK_REWARD_SOMPI, { blockDaaScore: this.daa, isCoinbase: true });
      for (const [txId, tx] of this.mempool) {
        for (const i of tx.inputs ?? []) this.utxos.delete(keyOf(i.previousOutpoint));
        this.outputsOf(tx).forEach((o, index) => {
          this.utxos.set(`${txId}:${index}`, {
            outpoint: { transactionId: txId, index },
            address: o.address,
            amountSompi: o.amountSompi,
            scriptPublicKey: o.address.startsWith("unknown:") ? o.address.slice(8) : scriptHexOf(o.address),
            blockDaaScore: this.daa,
            isCoinbase: false
          });
        });
      }
      this.mempool.clear();
    }
  }

  /** A block producer on this node. `produces: false` = a miner that never produces a block. */
  producer(opts: { blocksPerStep?: number; produces?: boolean; liveness?: string } = {}): TreasuryBlockProducer {
    const step = opts.blocksPerStep ?? 1;
    const liveness = opts.liveness ?? fixtureAddress("0e");
    this.know(liveness);
    return {
      produceUntil: async (address, done, deadline) => {
        this.events.push(`produce:${address}`);
        try {
          while (Date.now() < deadline) {
            if (await done()) return { reached: true };
            if (opts.produces === false) await new Promise((r) => setTimeout(r, 10));
            else this.mine(step, address);
          }
          return { reached: await done() };
        } finally {
          this.events.push("stopped");
        }
      },
      livenessRewardAddress: async () => liveness,
      resumeLiveness: async (address) => {
        this.events.push(`resume:${address}`);
      },
      stop: async () => {
        this.events.push("stop");
      }
    };
  }
}
