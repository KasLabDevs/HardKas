import { deterministicCompare } from "@hardkas/core";
/**
 * Extracts metadata from a Commander command tree.
 */
export function extractCliReference(program, options) {
    const commands = program.commands
        .map((cmd) => extractCommand(cmd, program.name()))
        .sort((a, b) => deterministicCompare(a.path, b.path));
    const flatSurface = [];
    const walk = (cmds) => {
        for (const c of cmds) {
            flatSurface.push(c.path);
            walk(c.subcommands);
        }
    };
    walk(commands);
    return {
        schema: "hardkas.cliReference.v1",
        generatedAt: options?.deterministic ? "deterministic" : new Date().toISOString(),
        totalCommands: flatSurface.length,
        flatSurface,
        commands
    };
}
function stripAnsi(str) {
    // eslint-disable-next-line no-control-regex
    return str.replace(/\u001b\[\d+m/g, "");
}
function extractCommand(cmd, parentPath) {
    const name = cmd.name();
    const currentPath = `${parentPath} ${name}`;
    // Commander internal structures are sometimes opaque, use public API as much as possible
    const usageStr = cmd.usage() || "[options]";
    const fullUsage = usageStr.startsWith(currentPath)
        ? usageStr
        : `${currentPath} ${usageStr}`;
    return {
        path: currentPath,
        name: name,
        aliases: cmd._aliases || [],
        description: stripAnsi(cmd.description()),
        usage: fullUsage,
        arguments: cmd._args.map((arg) => ({
            name: arg.name(),
            description: stripAnsi(arg.description || "")
        })),
        options: cmd.options.map((opt) => ({
            flags: opt.flags,
            description: stripAnsi(opt.description),
            default: opt.defaultValue !== undefined ? opt.defaultValue : null,
            required: opt.required || false,
            mandatory: opt.mandatory || false
        })),
        subcommands: cmd.commands
            .map((sub) => extractCommand(sub, currentPath))
            .sort((a, b) => deterministicCompare(a.path, b.path))
    };
}
/**
 * Generates Markdown representation of the CLI reference.
 */
export function generateCliMarkdown(ref) {
    let md = "# HardKAS CLI Reference\n\n";
    md += "Generated from the HardKAS Commander command tree.\n\n";
    md += "Do not edit command flags manually. Run:\n\n";
    md += "```bash\n";
    md += "pnpm docs:generate-cli\n";
    md += "```\n\n";
    const commands = [];
    const walk = (cmds) => {
        for (const cmd of cmds) {
            let cmdMd = `## ${cmd.path}\n\n`;
            if (cmd.aliases.length > 0) {
                cmdMd += `**Aliases:** ${cmd.aliases.join(", ")}\n\n`;
            }
            cmdMd += `${cmd.description}\n\n`;
            cmdMd += "### Usage\n\n";
            cmdMd += "```bash\n";
            cmdMd += `${cmd.usage}\n`;
            cmdMd += "```\n\n";
            cmdMd += "### Options\n\n";
            if (cmd.options.length > 0) {
                cmdMd += "| Flag | Description | Default |\n";
                cmdMd += "| :--- | :--- | :--- |\n";
                for (const opt of cmd.options) {
                    const def = opt.default !== null ? String(opt.default) : "";
                    cmdMd += `| \`${opt.flags}\` | ${opt.description} | ${def} |\n`;
                }
            }
            else {
                cmdMd += "No options.\n";
            }
            cmdMd += "\n";
            cmdMd += "### Arguments\n\n";
            if (cmd.arguments.length > 0) {
                cmdMd += "| Argument | Description |\n";
                cmdMd += "| :--- | :--- |\n";
                for (const arg of cmd.arguments) {
                    cmdMd += `| \`${arg.name}\` | ${arg.description} |\n`;
                }
            }
            else {
                cmdMd += "No arguments.\n";
            }
            cmdMd += "\n";
            if (cmd.subcommands.length > 0) {
                cmdMd += "### Subcommands\n\n";
                for (const sub of cmd.subcommands) {
                    cmdMd += `- [${sub.path}](#${sub.path.toLowerCase().replace(/\s+/g, "-")})\n`;
                }
                cmdMd += "\n";
            }
            commands.push(cmdMd);
            walk(cmd.subcommands);
        }
    };
    walk(ref.commands);
    return md + commands.join("---\n\n");
}
//# sourceMappingURL=generator.js.map