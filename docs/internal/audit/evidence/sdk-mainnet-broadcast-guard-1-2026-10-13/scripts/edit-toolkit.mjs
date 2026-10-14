// MG · WalletToolkit explicit mainnet guard (D-MG-2): exact replacements with expected counts.
import fs from "node:fs";
const p = "C:/Users/jrodr/hkl1/mg/src/packages/toolkit/src/wallet.ts";
let s = fs.readFileSync(p, "utf8");
const eol = s.includes("\r\n") ? "\r\n" : "\n";
const n = (x) => (eol === "\r\n" ? x.replace(/\n/g, "\r\n") : x);
const edits = [
  [
    "import { calculateDynamicFeeRate, FeePriority } from './fee-estimator.js';\n",
    "import { calculateDynamicFeeRate, FeePriority } from './fee-estimator.js';\nimport { assertMainnetTransactionsDisabled } from '@hardkas/core';\n",
    1
  ],
  // the guard method, right before signAndBroadcast
  [
    "    private async signAndBroadcast(plan: any): Promise<{ txId: string; plan: any }> {\n",
    "    /**\n" +
      "     * SDK-MAINNET-BROADCAST-GUARD-1 (D-MG-2): the toolkit never signs or sends on mainnet. Decided before anything is\n" +
      "     * planned, signed or sent, from the wallet's declared network AND the node's own (a read, which is allowed) — not\n" +
      "     * left to an incompatible address failing later in the planner.\n" +
      "     */\n" +
      "    private async assertNotMainnet(operation: string): Promise<void> {\n" +
      "        let nodeNetwork: string | undefined;\n" +
      "        if (this.options.rpc?.getBlockDagInfo) {\n" +
      "            try {\n" +
      "                nodeNetwork = (await this.options.rpc.getBlockDagInfo())?.networkId;\n" +
      "            } catch {\n" +
      "                nodeNetwork = undefined;\n" +
      "            }\n" +
      "        }\n" +
      "        assertMainnetTransactionsDisabled(\"broadcast\", [this.options.network, nodeNetwork], `WalletToolkit.${operation}`);\n" +
      "    }\n\n" +
      "    private async signAndBroadcast(plan: any): Promise<{ txId: string; plan: any }> {\n" +
      "        // defence in depth: every caller already asserted, and the signer is never reached on mainnet\n" +
      "        await this.assertNotMainnet(\"signAndBroadcast\");\n",
    1
  ],
  [
    "    public async payMany(opts: { outputs: { address: string; amount: bigint }[]; priority?: FeePriority; feeRate?: bigint; changeAddress?: string }) {\n        const addr = await this.receive();\n",
    "    public async payMany(opts: { outputs: { address: string; amount: bigint }[]; priority?: FeePriority; feeRate?: bigint; changeAddress?: string }) {\n        await this.assertNotMainnet(\"payMany\");\n        const addr = await this.receive();\n",
    1
  ],
  [
    "    public async sweep(opts: { to: string; priority?: FeePriority; feeRate?: bigint }) {\n        const addr = await this.receive();\n",
    "    public async sweep(opts: { to: string; priority?: FeePriority; feeRate?: bigint }) {\n        await this.assertNotMainnet(\"sweep\");\n        const addr = await this.receive();\n",
    1
  ],
  [
    "    public async consolidate(opts: { to?: string; priority?: FeePriority; feeRate?: bigint; maxUtxos?: number }) {\n        const addr = await this.receive();\n",
    "    public async consolidate(opts: { to?: string; priority?: FeePriority; feeRate?: bigint; maxUtxos?: number }) {\n        await this.assertNotMainnet(\"consolidate\");\n        const addr = await this.receive();\n",
    1
  ],
  [
    "        if (opts.outputsCount <= 0) throw new Error(\"outputsCount must be greater than 0\");\n        const addr = await this.receive();\n",
    "        if (opts.outputsCount <= 0) throw new Error(\"outputsCount must be greater than 0\");\n        await this.assertNotMainnet(\"split\");\n        const addr = await this.receive();\n",
    1
  ]
];
for (const [from, to, cnt] of edits) {
  const c = s.split(n(from)).length - 1;
  if (c !== cnt) {
    console.log(`ABORT: expected ${cnt}, found ${c} for ${JSON.stringify(from.slice(0, 80))}`);
    process.exit(1);
  }
  s = s.split(n(from)).join(n(to));
}
fs.writeFileSync(p, s);
console.log("ok wallet.ts");
