export interface ChaosContext {
    workspaceDir: string;
    runId: number;
    runSeed: number;
}
export type ChaosActor = (ctx: ChaosContext) => Promise<{
    stdout: string;
    stderr: string;
    exitCode: number;
    action: string;
    expectedExitCodes?: number[];
}>;
export declare const LockHell: ChaosActor;
export declare const RotBot: ChaosActor;
export declare const DriftHunter: ChaosActor;
export declare const HumanChaos: ChaosActor;
//# sourceMappingURL=chaos-actors.d.ts.map