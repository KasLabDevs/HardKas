export function createCommandOutput(options) {
    const stdout = options.stdout || process.stdout;
    const stderr = options.stderr || process.stderr;
    const mode = options.mode;
    return {
        mode,
        write(message) {
            if (mode === "human") {
                stdout.write(message);
            }
            else if (mode === "json") {
                // In json mode, write/writeLine goes to stderr to prevent corrupting pure JSON stdout.
                stderr.write(message);
            }
            // silent suppresses normal write
        },
        writeLine(message) {
            if (mode === "human") {
                stdout.write(message + "\n");
            }
            else if (mode === "json") {
                stderr.write(message + "\n");
            }
        },
        jsonWritten: false,
        writeJson(value) {
            const replacer = (k, v) => typeof v === "bigint" ? v.toString() : v;
            if (mode === "human") {
                stdout.write(JSON.stringify(value, replacer, 2) + "\n");
            }
            else if (mode === "json") {
                stdout.write(JSON.stringify(value, replacer, 2) + "\n");
            }
            this.jsonWritten = true;
        },
        warn(message) {
            if (mode !== "silent") {
                stderr.write(message + "\n");
            }
        },
        error(message) {
            // Errors always go to stderr, even in silent mode.
            stderr.write(message + "\n");
        }
    };
}
// ============================================================================
// TEMPORARY GLOBAL BRIDGE (CLI ONLY)
// Do not expose this to SDK/Core. This is a stopgap until all CLI commands
// are refactored to accept CommandOutput explicitly.
// ============================================================================
let globalOutput = createCommandOutput({ mode: "human" });
export function setGlobalOutput(out) {
    globalOutput = out;
}
export function getOutput() {
    return globalOutput;
}
//# sourceMappingURL=output.js.map