import { IgraTxSigner } from "@hardkas/l2";
export interface L2TxBuildOptions {
    network?: string;
    url?: string;
    from?: string;
    to: string;
    data?: string;
    value?: string;
    gasLimit?: string;
    gasPrice?: string;
    nonce?: string;
    chainId?: string | number;
    outDir?: string;
    json?: boolean;
}
export declare function runL2TxBuild(options: L2TxBuildOptions): Promise<void>;
export interface L2TxSignOptions {
    planPath: string;
    account?: string;
    outDir?: string;
    json?: boolean;
    signerOverride?: IgraTxSigner;
}
export declare function runL2TxSign(options: L2TxSignOptions): Promise<void>;
export interface L2TxSendOptions {
    signedPath: string;
    network?: string;
    url?: string;
    chainId?: string | number;
    yes?: boolean;
    json?: boolean;
}
export declare function runL2TxSend(options: L2TxSendOptions): Promise<void>;
export interface L2TxReceiptOptions {
    txHash: string;
    network?: string;
    url?: string;
    json?: boolean;
}
export declare function runL2TxReceipt(options: L2TxReceiptOptions): Promise<void>;
export interface L2TxReceiptsOptions {
    json?: boolean;
}
export declare function runL2TxReceipts(options: L2TxReceiptsOptions): Promise<void>;
export interface L2TxStatusOptions {
    txHash: string;
    network?: string;
    url?: string;
    json?: boolean;
}
export declare function runL2TxStatus(options: L2TxStatusOptions): Promise<void>;
//# sourceMappingURL=l2-tx-runners.d.ts.map