export interface NormalizedSilverCompilerOutput {
    scriptHex?: string;
    scriptHash?: string;
    abi?: any;
}
export interface SilverCompilerOutput {
    rawCompilerOutput: string;
    normalized: NormalizedSilverCompilerOutput;
}
export declare class SilverCompilerOutputAdapter {
    /**
     * Normalizes raw compiler stdout/stderr into a structured format.
     * Tolerates missing fields gracefully since SilverScript is experimental.
     */
    static normalize(rawOutput: string): SilverCompilerOutput;
}
//# sourceMappingURL=silver-adapter.d.ts.map