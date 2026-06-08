import { Command } from "commander";
export declare const ChaosExitCodes: {
    NO_FINDINGS: number;
    FINDINGS_RECOVERABLE: number;
    INVARIANT_VIOLATION: number;
    UNSAFE_CONFIG_REFUSED: number;
    INTERNAL_FAILURE: number;
};
export declare function registerChaosCommands(program: Command): void;
//# sourceMappingURL=chaos.d.ts.map