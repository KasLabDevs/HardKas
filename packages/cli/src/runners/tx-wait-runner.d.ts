import { HardkasConfig } from "@hardkas/config";
export interface TxWaitRunnerInput {
    txId: string;
    config: HardkasConfig;
    url?: string;
    provider?: string;
    network?: string;
    timeoutMs?: number;
    address?: string;
}
export declare function runTxWait(input: TxWaitRunnerInput): Promise<void>;
//# sourceMappingURL=tx-wait-runner.d.ts.map