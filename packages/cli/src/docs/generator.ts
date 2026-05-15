import { Command } from "commander";

export interface CliOptionReference {
  flags: string;
  description: string;
  default: any;
  required: boolean;
  mandatory: boolean;
}

export interface CliCommandReference {
  path: string;
  name: string;
  aliases: string[];
  description: string;
  usage: string;
  arguments: Array<{ name: string; description: string }>;
  options: CliOptionReference[];
  subcommands: CliCommandReference[];
}

export interface CliReference {
  schema: "hardkas.cliReference.v1";
  generatedAt: string;
  commands: CliCommandReference[];
}

/**
 * Extracts metadata from a Commander command tree.
 */
export function extractCliReference(program: Command, options?: { deterministic?: boolean }): CliReference {
  return {
    schema: "hardkas.cliReference.v1",
    generatedAt: options?.deterministic ? "deterministic" : new Date().toISOString(),
    commands: program.commands.map(cmd => extractCommand(cmd, program.name())).sort((a, b) => a.path.localeCompare(b.path))
  };
}

function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\u001b\[\d+m/g, "");
}

function extractCommand(cmd: any, parentPath: string): CliCommandReference {
  const name = cmd.name();
  const currentPath = `${parentPath} ${name}`;
  
  // Commander internal structures are sometimes opaque, use public API as much as possible
  const usageStr = cmd.usage() || "[options]";
  const fullUsage = usageStr.startsWith(currentPath) ? usageStr : `${currentPath} ${usageStr}`;

  return {
    path: currentPath,
    name: name,
    aliases: (cmd as any)._aliases || [],
    description: stripAnsi(cmd.description()),
    usage: fullUsage,
    arguments: (cmd as any)._args.map((arg: any) => ({
      name: arg.name(),
      description: stripAnsi(arg.description || "")
    })),
    options: cmd.options.map((opt: any) => ({
      flags: opt.flags,
      description: stripAnsi(opt.description),
      default: opt.defaultValue !== undefined ? opt.defaultValue : null,
      required: opt.required || false,
      mandatory: opt.mandatory || false
    })),
    subcommands: cmd.commands.map((sub: any) => extractCommand(sub, currentPath)).sort((a: any, b: any) => a.path.localeCompare(b.path))
  };
}

/**
 * Generates Markdown representation of the CLI reference.
 */
export function generateCliMarkdown(ref: CliReference): string {
  let md = "# HardKAS CLI Reference\n\n";
  md += "Generated from the HardKAS Commander command tree.\n\n";
  md += "Do not edit command flags manually. Run:\n\n";
  md += "```bash\n";
  md += "pnpm docs:generate-cli\n";
  md += "```\n\n";

  const commands: string[] = [];

  const walk = (cmds: CliCommandReference[]) => {
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
      } else {
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
      } else {
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
