export interface TortureMatrixOptions {
    iterations: number;
    seed: string | number;
    report?: string | undefined;
    bucket?: string | undefined;
    profile?: string | undefined;
    debugStack?: boolean | undefined;
}
export interface TortureReplayOptions {
    seed: number;
    caseId: string;
    profile?: string;
}
export declare function runTortureMatrix(options: TortureMatrixOptions): Promise<void>;
export declare function runTortureReplay(options: TortureReplayOptions): Promise<void>;
//# sourceMappingURL=torture-runner.d.ts.map