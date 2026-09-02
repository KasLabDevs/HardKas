export type OutputMode = "human" | "json" | "silent";
export interface CommandOutputOptions {
    mode: OutputMode;
    stdout?: NodeJS.WriteStream | {
        write: (msg: string) => void;
    };
    stderr?: NodeJS.WriteStream | {
        write: (msg: string) => void;
    };
}
export interface CommandOutput {
    mode: OutputMode;
    jsonWritten: boolean;
    write(message: string): void;
    writeLine(message: string): void;
    writeJson(value: unknown): void;
    warn(message: string): void;
    error(message: string): void;
}
export declare function createCommandOutput(options: CommandOutputOptions): CommandOutput;
export declare function setGlobalOutput(out: CommandOutput): void;
export declare function getOutput(): CommandOutput;
//# sourceMappingURL=output.d.ts.map