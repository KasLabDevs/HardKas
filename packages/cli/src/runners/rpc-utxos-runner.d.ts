import { KaspaRpcUtxo } from "@hardkas/kaspa-rpc";
export interface RpcUtxosOptions {
    address: string;
    url?: string;
}
export declare function runRpcUtxos(options: RpcUtxosOptions): Promise<{
    utxos: KaspaRpcUtxo[];
    formatted: string;
}>;
//# sourceMappingURL=rpc-utxos-runner.d.ts.map