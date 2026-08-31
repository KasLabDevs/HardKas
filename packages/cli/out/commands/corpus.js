import path from "node:path";
export function registerCorpusCommands(program) {
    const corpus = program.command("corpus").description("Verify release fixture corpora");
    corpus
        .command("verify <path>")
        .description("Verify a HardKAS golden corpus")
        .option("--json", "Output results as JSON", false)
        .option("--workspace <path>", "Override workspace root directory")
        .action(async (targetPath, options) => {
        const { runCorpusVerify } = await import("../runners/corpus-verify-runner.js");
        const workspaceRoot = options.workspace
            ? path.resolve(options.workspace)
            : process.cwd();
        await runCorpusVerify({
            path: targetPath,
            json: options.json,
            workspaceRoot
        });
    });
}
//# sourceMappingURL=corpus.js.map