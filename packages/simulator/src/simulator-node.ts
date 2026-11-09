import { UtxoLedger } from "./ledger/utxo-ledger.js";
import { Mempool, DEFAULT_MIN_FEE_RATE, computeTransactionId } from "./mempool/mempool.js";
import { DagChain, DEFAULT_BLOCK_REWARD_SOMPI } from "./dag/dag-chain.js";
import { SimulatorRpcClient } from "./rpc/simulator-rpc.js";
import { SnapshotManager } from "./snapshots.js";
import {
  createDefaultDevAccounts,
  signInputForAccount,
  type DevAccountName,
  getNetworkPrefix
} from "./crypto/accounts.js";
import { decodeKaspaAddress } from "./crypto/bech32.js";
import { KaspaHasher, bytesToHex } from "./crypto/kaspa-sighash.js";
import { extractAddressFromScriptPublicKey } from "./ledger/script-engine.js";
import { measureTransactionMass, minimumRelayFee } from "./mass.js";
import { CONSENSUS_COINBASE_MATURITY } from "./params.js";
import type { DevAccount, NetworkId, SimulatorConfig, KaspaRpcTransaction, SimulatorBlock, SimulatorUtxo } from "./types.js";

export const SOMPI_PER_KAS = 100_000_000n;

function simulatorError(code: string, message: string): Error {
  const err = new Error(`${code}: ${message}`);
  (err as any).code = code;
  return err;
}

/**
 * SIM-15: the script public key a Kaspa address pays to (rusty-kaspa `pay_to_address_script`): version 0 (Schnorr,
 * 32 bytes) → `20 <pk> ac`, version 1 (ECDSA, 33 bytes) → `21 <pk> ab`, version 8 (script hash, 32 bytes) → `aa 20 <h> 87`.
 * Any other address, or one of another network, is refused; it used to become a P2PK of its payload or a burn script.
 */
export function scriptPublicKeyForAddress(address: string, networkId: NetworkId): string {
  const dec = decodeKaspaAddress(address);
  if (!dec) throw simulatorError("SIMULATOR_ADDRESS_INVALID", `'${address}' is not a Kaspa address`);
  const prefix = getNetworkPrefix(networkId);
  if (dec.prefix !== prefix) {
    throw simulatorError("SIMULATOR_ADDRESS_NETWORK_MISMATCH", `'${address}' is a ${dec.prefix} address; this simulator runs ${networkId} (${prefix})`);
  }
  const payload = bytesToHex(dec.payload);
  if (dec.version === 0 && dec.payload.length === 32) return `20${payload}ac`;
  if (dec.version === 1 && dec.payload.length === 33) return `21${payload}ab`;
  if (dec.version === 8 && dec.payload.length === 32) return `aa20${payload}87`;
  throw simulatorError("SIMULATOR_ADDRESS_UNSUPPORTED", `'${address}' (version ${dec.version}, ${dec.payload.length} bytes) has no standard script`);
}

function hexToBytes(s: string): Uint8Array {
  const bytes = new Uint8Array(s.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(s.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

export class KaspaSimulatorNode {
  public readonly accounts: Record<DevAccountName, DevAccount>;
  public readonly ledger: UtxoLedger;
  public readonly mempool: Mempool;
  public readonly dag: DagChain;
  public get dagChain(): DagChain {
    return this.dag;
  }
  public readonly rpc: SimulatorRpcClient;
  public readonly snapshots: SnapshotManager;
  public baseSnapshotId?: string;
  public readonly networkId: NetworkId;

  constructor(config?: SimulatorConfig) {
    this.networkId = config?.networkId ?? "simnet";
    // SIM-16: the dev accounts' keys derive from a public seed, so a mainnet simulator would print `kaspa:` addresses
    // anyone can spend from. The simulator runs simnet, devnet or a testnet only.
    if (this.networkId === "mainnet") {
      throw simulatorError(
        "SIMULATOR_MAINNET_REFUSED",
        "the simulator does not run as mainnet: its dev accounts derive from a public seed (use simnet, devnet or testnet-10)"
      );
    }
    this.accounts = createDefaultDevAccounts(this.networkId);

    // The node's coinbase maturity (1000 DAA scores at 10 BPS) unless a test sets its own.
    const coinbaseMaturity = config?.coinbaseMaturity ?? CONSENSUS_COINBASE_MATURITY;
    this.ledger = new UtxoLedger(coinbaseMaturity);

    const feeRate = config?.defaultFeeRate ?? DEFAULT_MIN_FEE_RATE;
    this.mempool = new Mempool(feeRate);

    this.dag = new DagChain({
      ...(config?.k !== undefined ? { k: config.k } : {}),
      networkId: this.networkId,
      initialDaaScore: config?.initialDaaScore ?? 1n,
      blockRewardSompi: config?.defaultBlockRewardSompi ?? DEFAULT_BLOCK_REWARD_SOMPI
    });

    const automine = config?.automine ?? true;
    this.rpc = new SimulatorRpcClient(
      this.ledger,
      this.mempool,
      this.dag,
      this.accounts.miner,
      this.networkId,
      automine
    );

    this.snapshots = new SnapshotManager(this.ledger, this.mempool, this.dag);
    this.baseSnapshotId = this.snapshots.snapshot();
    if (config?.bootstrapDevAccounts) {
      this.bootstrapDevAccounts();
    }
  }

  public getDevAccounts(): DevAccount[] {
    return Object.values(this.accounts);
  }

  private faucetCounter = 0;

  /**
   * Instantly funds an address or dev account with Sompi.
   */
  public fund(addressOrDevAccount: string | DevAccount, amountSompi: bigint): string {
    const targetAddress = typeof addressOrDevAccount === "string" ? addressOrDevAccount : addressOrDevAccount.address;

    if (typeof amountSompi !== "bigint" || amountSompi <= 0n) {
      throw simulatorError("SIMULATOR_FUND_AMOUNT_INVALID", `fund amount must be a positive bigint of sompi, got ${String(amountSompi)}`);
    }
    // SIM-15: the script the address really pays to (P2PK Schnorr, P2PK ECDSA or P2SH), or a refusal
    const targetSpk =
      typeof addressOrDevAccount !== "string"
        ? addressOrDevAccount.scriptPublicKey
        : scriptPublicKeyForAddress(targetAddress, this.networkId);

    const daa = this.dag.getVirtualDaaScore();
    this.faucetCounter += 1;
    const h = new KaspaHasher("TransactionID");
    h.u64(BigInt(this.faucetCounter)).u64(daa).u64(amountSompi);
    const faucetTxId = bytesToHex(h.digest());

    this.ledger.addUtxo({
      transactionId: faucetTxId,
      index: 0,
      address: targetAddress,
      amountSompi,
      scriptPublicKey: targetSpk,
      blockDaaScore: daa,
      isCoinbase: false
    });

    return faucetTxId;
  }

  /**
   * Pre-funds standard dev accounts (Alice, Bob, Carol, Dave, Erin) with 1000 KAS each.
   */
  public bootstrapDevAccounts(amountKas: bigint = 1000n): void {
    const amountSompi = amountKas * SOMPI_PER_KAS;
    this.fund(this.accounts.alice, amountSompi);
    this.fund(this.accounts.bob, amountSompi);
    this.fund(this.accounts.carol, amountSompi);
    this.fund(this.accounts.dave, amountSompi);
    this.fund(this.accounts.erin, amountSompi);
    this.baseSnapshotId = this.snapshots.snapshot();
  }

  private minerTimer: NodeJS.Timeout | null = null;

  /**
   * Mines a given number of blocks manually.
   */
  public mine(count: number = 1, minerAddress?: string, minerSpk?: string, explicitParents?: string[]): SimulatorBlock[] {
    const addr = minerAddress ?? this.accounts.miner.address;
    const spk = minerSpk ?? this.accounts.miner.scriptPublicKey;
    const blocks: SimulatorBlock[] = [];

    for (let i = 0; i < count; i++) {
      const b = this.dag.mineBlock(addr, spk, this.mempool, this.ledger, explicitParents);
      blocks.push(b);
      this.rpc.notifyBlockMined(b);
    }
    return blocks;
  }

  public startMiner(intervalMs: number = 25): void {
    if (this.minerTimer) return;
    this.minerTimer = setInterval(() => {
      try {
        this.mine(1);
      } catch {
        // ignore
      }
    }, intervalMs);
  }

  public stopMiner(): void {
    if (this.minerTimer) {
      clearInterval(this.minerTimer);
      this.minerTimer = null;
    }
  }

  public isMinerRunning(): boolean {
    return this.minerTimer !== null;
  }

  public close(): void {
    this.stopMiner();
    this.rpc.close();
  }

  public snapshot(): string {
    return this.snapshots.snapshot();
  }

  public revert(snapshotId: string): boolean {
    return this.snapshots.revert(snapshotId);
  }

  /**
   * Reorganizes the simulator state to a specific DAG tip.
   * Rebuilds the UTXO ledger along the selected chain from the base snapshot to targetTipHash.
   * Any transactions on competing/abandoned branches that are not on this selected chain are reverted.
   */
  public reorganizeToTip(targetTipHash: string, baseSnapshotId?: string): boolean {
    const snapId = baseSnapshotId ?? this.baseSnapshotId;
    const targetBlock = this.dag.getBlock(targetTipHash);
    if (!targetBlock) return false;

    // 1. Restore UTXO ledger to base state (without wiping dag blocks)
    if (snapId) {
      const snap = this.snapshots.getSnapshot(snapId);
      if (snap) {
        this.ledger.restoreFrom(snap.utxos);
      }
    } else {
      this.ledger.clear();
    }
    this.mempool.clear();

    // 2. Obtain selected chain from target tip back to Genesis
    const selectedChain = this.dag.getSelectedChain(targetTipHash);

    // 3. Re-apply blocks along the selected chain to ledger
    const prefix = getNetworkPrefix(this.networkId);
    for (const block of selectedChain) {
      for (const [txIndex, tx] of block.transactions.entries()) {
        if (tx.payload === "coinbase" || tx.inputs.length === 0) {
          for (let i = 0; i < tx.outputs.length; i++) {
            const out = tx.outputs[i]!;
            const spk = out.scriptPublicKey.scriptPublicKey;
            const addr = (out as any).address || extractAddressFromScriptPublicKey(spk, prefix) || "";
            const cbUtxo: SimulatorUtxo = {
              transactionId: bytesToHex(
                new KaspaHasher("TransactionID")
                  .u64(block.header.daaScore)
                  .bytes(hexToBytes(block.header.hash))
                  .digest()
              ),
              index: i,
              address: addr,
              amountSompi: BigInt(out.amount),
              scriptPublicKey: spk,
              blockDaaScore: block.header.daaScore,
              isCoinbase: true
            };
            this.ledger.addUtxo(cbUtxo);
          }
        } else {
          for (const inp of tx.inputs) {
            this.ledger.spendUtxo(inp.previousOutpoint.transactionId, inp.previousOutpoint.index);
          }
          // the id the block recorded when it was mined (the one its outputs were indexed under)
          const txId = block.transactionIds?.[txIndex] ?? computeTransactionId(tx);
          for (let i = 0; i < tx.outputs.length; i++) {
            const out = tx.outputs[i]!;
            const spk = out.scriptPublicKey.scriptPublicKey;
            const addr = (out as any).address || extractAddressFromScriptPublicKey(spk, prefix) || "";
            this.ledger.addUtxo({
              transactionId: txId,
              index: i,
              address: addr,
              amountSompi: BigInt(out.amount),
              scriptPublicKey: spk,
              blockDaaScore: block.header.daaScore,
              isCoinbase: false,
              ...(out.scriptPublicKey.version ? { scriptPublicKeyVersion: Number(out.scriptPublicKey.version) } : {}),
              ...((out as any).covenant ? { covenant: (out as any).covenant } : {})
            });
          }
        }
      }
    }

    // 4. Update virtual DAA score to tip DAA score + 1
    (this.dag as any).virtualDaaScore = targetBlock.header.daaScore + 1n;

    // 5. Ensure target tip is the primary sink
    const currentTips = [...this.dag.getTipHashes()];
    const filteredTips = currentTips.filter((t) => t !== targetTipHash);
    filteredTips.unshift(targetTipHash);
    (this.dag as any).tipHashes = filteredTips;

    return true;
  }

  public setAutomine(enabled: boolean): void {
    this.rpc.setAutomine(enabled);
  }

  /**
   * Helper to build, sign, and submit a payment from a DevAccount.
   */
  public async transfer(params: {
    from: DevAccount;
    to: string | DevAccount;
    amountSompi: bigint;
    feeSompi?: bigint;
  }): Promise<{ transactionId: string; feeSompi: bigint }> {
    // SIM-15: the destination's real script (an unknown address used to receive a burn script)
    const toSpk = typeof params.to === "string" ? scriptPublicKeyForAddress(params.to, this.networkId) : params.to.scriptPublicKey;

    // SIM-08: by default the node's minimum relay fee for this very transaction (it was a fixed 40 000 sompi, below the
    // 100 sompi/gram floor of rusty-kaspad 2.1.0), measured on a candidate with a P2PK signature per input.
    const utxos = this.ledger.getUtxosByAddress(params.from.address, this.dag.getVirtualDaaScore());
    const SIG_SCRIPT_PLACEHOLDER = "41" + "00".repeat(65);
    const feeFor = (inputs: typeof utxos, withChange: boolean): bigint => {
      const candidate: KaspaRpcTransaction = {
        version: 0,
        inputs: inputs.map((u) => ({ previousOutpoint: { transactionId: u.transactionId, index: u.index }, signatureScript: SIG_SCRIPT_PLACEHOLDER, sequence: 0n, sigOpCount: 1 })),
        outputs: [
          { amount: params.amountSompi, scriptPublicKey: { version: 0, scriptPublicKey: toSpk } },
          ...(withChange ? [{ amount: 1n, scriptPublicKey: { version: 0, scriptPublicKey: params.from.scriptPublicKey } }] : [])
        ],
        lockTime: 0n,
        subnetworkId: "00".repeat(20),
        gas: 0n,
        payload: ""
      };
      return minimumRelayFee(measureTransactionMass(candidate, inputs).feeMass, this.mempool.getMinimumFeeRate());
    };

    let selectedSompi = 0n;
    const selectedUtxos: typeof utxos = [];
    let fee = params.feeSompi ?? 0n;
    for (const u of utxos) {
      selectedUtxos.push(u);
      selectedSompi += u.amountSompi;
      if (params.feeSompi === undefined) fee = feeFor(selectedUtxos, true);
      if (selectedSompi >= params.amountSompi + fee) break;
    }

    const needed = params.amountSompi + fee;
    if (selectedSompi < needed) {
      throw new Error(`Insufficient funds: ${params.from.name} has ${selectedSompi} sompi, needed ${needed} sompi`);
    }

    const change = selectedSompi - needed;

    const outputs: Array<{ amount: bigint; scriptPublicKey: { version: number; scriptPublicKey: string } }> = [
      {
        amount: params.amountSompi,
        scriptPublicKey: { version: 0, scriptPublicKey: toSpk }
      }
    ];

    if (change > 0n) {
      outputs.push({
        amount: change,
        scriptPublicKey: { version: 0, scriptPublicKey: params.from.scriptPublicKey }
      });
    }

    const unsignedTx: KaspaRpcTransaction = {
      version: 0,
      inputs: selectedUtxos.map((u) => ({
        previousOutpoint: { transactionId: u.transactionId, index: u.index },
        signatureScript: "",
        sequence: 0n,
        sigOpCount: 1
      })),
      outputs,
      lockTime: 0n,
      subnetworkId: "00".repeat(20),
      gas: 0n,
      payload: ""
    };

    // Sign each input
    const sighashTx = {
      version: 0,
      inputs: selectedUtxos.map((u) => ({
        transactionId: u.transactionId,
        index: u.index,
        sequence: 0n,
        sigOpCount: 1
      })),
      outputs: outputs.map((o) => ({
        value: o.amount,
        scriptPublicKey: { version: 0, script: o.scriptPublicKey.scriptPublicKey.replace(/^0000/, "") }
      })),
      lockTime: 0n,
      subnetworkId: "00".repeat(20),
      gas: 0n,
      payload: ""
    };

    const signedInputs = selectedUtxos.map((u, idx) => {
      const sigScript = signInputForAccount(params.from, sighashTx, idx, {
        amount: u.amountSompi,
        scriptPublicKey: { version: 0, script: u.scriptPublicKey.replace(/^0000/, "") }
      });
      return {
        previousOutpoint: { transactionId: u.transactionId, index: u.index },
        signatureScript: sigScript,
        sequence: 0n,
        sigOpCount: 1
      };
    });

    const signedTx: KaspaRpcTransaction = {
      ...unsignedTx,
      inputs: signedInputs
    };

    const res = await this.rpc.submitTransaction(signedTx);
    return { transactionId: res.transactionId, feeSompi: fee };
  }
}

/**
 * Creates and initializes a new Kaspa simulator instance.
 */
export function createKaspaSimulator(config?: SimulatorConfig): KaspaSimulatorNode {
  return new KaspaSimulatorNode(config);
}
