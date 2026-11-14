/**
 * LOCALNET-FUND-BOUNDED-READ-1 · the funding state of an address without reading every UTXO it holds.
 *
 * `localnet fund` used to list every UTXO of the funded address (getUtxosByAddresses) just to add up its total and its
 * mature balance. On a localnet that has mined to that address for a long time (the miner's account, `--keep-miner`),
 * the address holds one coinbase output per block, more than a million of them: that read never finishes in time (and
 * past ~277k entries it exceeds the WebSocket message limit), so fund failed before funding anything.
 *
 * What rusty-kaspa v2.1.0 offers instead, and what this reads:
 *  - the total: `getBalancesByAddresses` — the node adds up the address's UTXO index entries itself and answers one
 *    number, whatever their count;
 *  - the immature part: only coinbase outputs can be immature (`virtualDaaScore − blockDaaScore < coinbase maturity`),
 *    and the node refuses to spend them while they are, so every one of them is still in the UTXO set. They are the
 *    outputs to this address of the coinbases accepted within the last `maturity` DAA scores, which are found by
 *    walking the selected chain back from the sink with `getBlock` (header DAA score, selected parent, transactions).
 *    As consensus does it (calculate_utxo_state, consensus/src/pipeline/virtual_processor/utxo_validation.rs), a
 *    chain block accepts its selected parent's coinbase (`transactions[0]`) at its own DAA score, and the virtual
 *    accepts the sink's at the virtual DAA score. The walk ends at the first coinbase that is already mature (or at
 *    the genesis), so it reads about `maturity + margin + 1` blocks; blocks never change, so a reader keeps them and
 *    later reads only fetch the blocks added since. Checked against a real rusty-kaspad v2.1.0 simnet
 *    (packages/cli/test/localnet-funding-state.simnet.test.ts).
 *
 * `mature = total − immature`. Exact whenever the address receives no new coinbase while it is read (the funded
 * address while no miner pays it, a settled chain). While a miner pays it, the two reads cannot be one snapshot: the
 * read order then decides the side the error falls on (see FundingReadOrder).
 *
 * The UTXO COUNTS are not known this way: no v2.1.0 RPC counts an address's UTXOs without listing them all.
 */

export interface FundingStateRpc {
  getBlockDagInfo(): Promise<{ virtualDaaScore?: bigint | undefined; sink?: string | undefined }>;
  getBalanceByAddress(address: string): Promise<{ balanceSompi: bigint }>;
  call<T = unknown>(method: string, params?: unknown): Promise<T>;
}

/**
 * The order of the two reads when the address may be receiving coinbases meanwhile:
 *  - "balance-then-dag": the total first. The UTXO index follows consensus, so every coinbase the total holds is on
 *    the chain the walk starts from: the mature balance is never above the node's (a wait on it never ends early).
 *  - "dag-then-balance": the chain first. Coinbases accepted after it are counted as mature: the mature balance leans
 *    high (a target computed from it asks for at least the amount requested).
 */
export type FundingReadOrder = "balance-then-dag" | "dag-then-balance";

export interface FundingSnapshot {
  balanceSompi: bigint;
  /** `balanceSompi` minus the outputs to the address of the coinbases still immature at `virtualDaaScore` (+ margin). */
  matureBalanceSompi: bigint;
  immatureCoinbaseSompi: bigint;
  immatureCoinbaseCount: number;
  virtualDaaScore: bigint;
  sink: string;
}

/** The `before` / `after` record of `localnet fund --json` (LocalnetFundingV1): same fields as always. */
export interface FundingStateJson {
  balanceSompi: bigint;
  matureBalanceSompi: bigint;
  /** Not counted: counting means listing every UTXO, the read this module avoids. */
  utxoCount: null;
  matureUtxoCount: null;
  virtualDaaScore: string;
}

export function fundingStateJson(s: FundingSnapshot): FundingStateJson {
  return {
    balanceSompi: s.balanceSompi,
    matureBalanceSompi: s.matureBalanceSompi,
    utxoCount: null,
    matureUtxoCount: null,
    virtualDaaScore: s.virtualDaaScore.toString()
  };
}

interface ChainBlock {
  daaScore: bigint;
  /** Empty for the genesis (its selected parent is consensus ORIGIN, which is no block). */
  selectedParent: string;
  /** Outputs of this block's coinbase (`transactions[0]`) that pay the address. */
  paidSompi: bigint;
  paidCount: number;
}

const NO_BLOCK = new Set(["", "0".repeat(64), "f".repeat(64), "fe".repeat(32)]);

function fundingStateError(message: string): Error {
  return Object.assign(new Error(`LOCALNET_FUNDING_STATE_UNREADABLE: ${message}`), { code: "LOCALNET_FUNDING_STATE_UNREADABLE" });
}

function u64(value: unknown, what: string): bigint {
  if (typeof value === "bigint") return value;
  if ((typeof value === "number" && Number.isInteger(value)) || (typeof value === "string" && /^\d+$/.test(value))) return BigInt(value);
  throw fundingStateError(`${what} is not an unsigned integer (${String(value)})`);
}

export interface FundingStateReader {
  readonly address: string;
  read(rpc: FundingStateRpc, options: { order: FundingReadOrder; marginDaa?: bigint }): Promise<FundingSnapshot>;
}

/**
 * A reader for one address. `coinbaseMaturity` is the network's (simnet: from the pinned kaspa-wasm network params).
 * The reader keeps the chain blocks it has read; they are the same on every client of the same node.
 */
export function createFundingStateReader(address: string, coinbaseMaturity: bigint): FundingStateReader {
  const blocks = new Map<string, ChainBlock>();

  async function chainBlock(rpc: FundingStateRpc, hash: string): Promise<ChainBlock> {
    const known = blocks.get(hash);
    if (known) return known;
    const raw: any = await rpc.call("getBlock", { hash, includeTransactions: true });
    const block = raw?.block ?? raw?.getBlockResponse?.block ?? raw;
    const header = block?.header;
    if (!header) throw fundingStateError(`the node returned no header for block ${hash}`);
    const coinbase = Array.isArray(block?.transactions) ? block.transactions[0] : undefined;
    if (!coinbase) throw fundingStateError(`the node returned block ${hash} without its transactions`);
    let paidSompi = 0n;
    let paidCount = 0;
    for (const output of Array.isArray(coinbase.outputs) ? coinbase.outputs : []) {
      if (output?.verboseData?.scriptPublicKeyAddress !== address) continue;
      paidSompi += u64(output.value ?? output.amount, `an output value of block ${hash}'s coinbase`);
      paidCount++;
    }
    const levelZero = Array.isArray(header.parentsByLevel) ? header.parentsByLevel[0] : undefined;
    const isGenesis = Array.isArray(header.parentsByLevel) && (!Array.isArray(levelZero) || levelZero.length === 0);
    const parent = String(block?.verboseData?.selectedParentHash ?? "").toLowerCase();
    const facts: ChainBlock = {
      daaScore: u64(header.daaScore, `block ${hash}'s DAA score`),
      selectedParent: isGenesis || NO_BLOCK.has(parent) ? "" : parent,
      paidSompi,
      paidCount
    };
    blocks.set(hash, facts);
    return facts;
  }

  return {
    address,
    async read(rpc, { order, marginDaa = 0n }) {
      let dag: { virtualDaaScore?: bigint | undefined; sink?: string | undefined };
      let balance: { balanceSompi: bigint };
      if (order === "balance-then-dag") {
        balance = await rpc.getBalanceByAddress(address);
        dag = await rpc.getBlockDagInfo();
      } else {
        dag = await rpc.getBlockDagInfo();
        balance = await rpc.getBalanceByAddress(address);
      }
      const virtualDaaScore = u64(dag?.virtualDaaScore, "the node's virtual DAA score");
      const sink = String(dag?.sink ?? "").toLowerCase();
      if (NO_BLOCK.has(sink)) throw fundingStateError("the node's getBlockDagInfo named no sink");

      // A coinbase is immature while virtualDaaScore − (DAA score it was accepted at) < maturity + margin.
      const window = coinbaseMaturity + marginDaa;
      let immatureCoinbaseSompi = 0n;
      let immatureCoinbaseCount = 0;
      let hash = sink;
      let acceptedAt = virtualDaaScore; // the virtual accepts the sink's coinbase
      // Down the chain a block's DAA score is its selected parent's plus its mergeset blocks inside the DAA window: one
      // or more per step (the genesis's child, on rusty-kaspa simnet, has the genesis's own score). So the walk takes
      // about window + 1 steps; the bound below only stops a node that answers no chain at all.
      for (let steps = 0; hash && virtualDaaScore - acceptedAt < window; steps++) {
        if (BigInt(steps) > window + 64n) throw fundingStateError(`the chain below ${sink} does not reach the maturity boundary`);
        const b = await chainBlock(rpc, hash);
        immatureCoinbaseSompi += b.paidSompi;
        immatureCoinbaseCount += b.paidCount;
        if (b.daaScore > acceptedAt) throw fundingStateError(`block ${hash}'s DAA score is above its chain child's`);
        acceptedAt = b.daaScore; // this block accepts its selected parent's coinbase
        hash = b.selectedParent;
      }

      const balanceSompi = BigInt(balance.balanceSompi);
      const mature = balanceSompi - immatureCoinbaseSompi;
      return {
        balanceSompi,
        matureBalanceSompi: mature > 0n ? mature : 0n,
        immatureCoinbaseSompi,
        immatureCoinbaseCount,
        virtualDaaScore,
        sink
      };
    }
  };
}
