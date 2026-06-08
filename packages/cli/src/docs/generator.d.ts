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
    arguments: Array<{
        name: string;
        description: string;
    }>;
    options: CliOptionReference[];
    subcommands: CliCommandReference[];
}
export interface CliReference {
    schema: "hardkas.cliReference.v1";
    generatedAt: string;
    totalCommands: number;
    flatSurface: string[];
    commands: CliCommandReference[];
}
/**
 * Extracts metadata from a Commander command tree.
 */
export declare function extractCliReference(program: Command, options?: {
    deterministic?: boolean;
}): CliReference;
/**
 * Generates Markdown representation of the CLI reference.
 */
export declare function generateCliMarkdown(ref: CliReference): string;
//# sourceMappingURL=generator.d.ts.map