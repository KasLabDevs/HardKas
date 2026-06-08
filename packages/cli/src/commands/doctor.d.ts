import { Command } from "commander";
export declare function registerDoctorCommand(program: Command): void;
export declare function runDoctorChecks(root: string, opts: {
    json?: boolean;
    consistency?: boolean;
    strict?: boolean;
    quiet?: boolean;
}): Promise<boolean>;
//# sourceMappingURL=doctor.d.ts.map