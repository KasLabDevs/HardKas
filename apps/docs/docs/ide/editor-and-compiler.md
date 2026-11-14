---
title: Editor and compiler
description: The HardKAS IDE editor, its SilverScript support with live diagnostics, and the compiler panel that runs hardkas silver compile.
sidebar_label: Editor and compiler
sidebar_position: 3
---

# Editor and compiler

## The editor

The editor is Monaco, the editor of VS Code. It opens real files from the project folder, and **Ctrl+S** writes them to disk. There is no auto-save.

| Files | Language |
| --- | --- |
| `.sil` | SilverScript |
| `.ts`, `.mts`, `.tsx` | TypeScript |
| `.js`, `.mjs`, `.cjs` | JavaScript |
| `.json`, `.md`, `.yaml`, `.yml`, `.toml`, `.sh` | JSON, Markdown, YAML, INI, shell |

Every other file opens as plain text. Extensions from Open VSX can add languages, grammars and color themes: see [Plugins and extensions](./plugins-and-vsx.md).

### SilverScript support

- **Highlighting**, comments (`//` and `/* */`), auto-closing brackets and quotes, and folding on `// region` / `// endregion`.
- **Snippets** for `contract`, `entry`, `require`, `checkSig`, `checkMultiSig`, `checkDataSig`, `blake2b`, `sha256`, `tx.outputs`, `tx.lockTime` and `pragma`.
- **Hover help** for the common keywords and built-ins.
- **Outline and breadcrumbs** list the contracts and their entries.
- **Live diagnostics.** When you open a `.sil` file, stop typing or save, the IDE asks the real compiler to check it (`hardkas silver compile` on a temporary copy, which writes no record). Errors and warnings appear in the editor with the source `silverc`. The IDE also adds a few checks of its own, such as a missing `pragma` line. If the compiler cannot be reached, only those checks show.

Go to definition, rename, signature help and a SilverScript formatter are not available.

### Right-click on a `.sil` file

- **Compile SilverScript** (Ctrl+Enter).
- **Compile & Deploy…**: compiles, then opens Deploy & Run.
- **Open Compiler panel**.
- **Visualize in Covenant Graph**.

## The compiler panel

Open it from the rail (**SilverScript compiler**) or with **Open Compiler panel**.

| Part | What it does |
| --- | --- |
| **Contract (.sil)** | The file to compile. While a `.sil` file is the active tab, the panel compiles that one. |
| **Constructor arguments (JSON array)** | Values for the contract's constructor parameters. The IDE keeps them in `<name>.constructor-args.json` next to the source: it fills the box from that file and writes the box back to it when you compile. |
| **Auto-compile on save** | Compiles again shortly after you stop typing. It turns off when the IDE reloads. |
| **Compile `<file>`** | Saves the file if it is open, then runs `hardkas silver compile <file> --json`, with `--args <name>.constructor-args.json` when you gave arguments. |
| **Diagnostics** | The errors and warnings. Click one to jump to its line. |

Other ways to compile: **Ctrl+Enter** in a `.sil` file, **Run → Compile SilverScript file**, the command palette, and the Explorer's right-click menu.

A successful compile writes HardKAS' compile record, `.hardkas/artifacts/silver/silverCompile-*.json`. Deploy & Run, the Outline and the Covenant graph read it. The full CLI output goes to the Console, and the status bar says "Compiled X" or "Compilation failed: X".

### SilverScript QA & Verification

Four buttons run HardKAS' checks on the file and show their JSON output:

- **Audit Contract**: `hardkas silver audit <file>`. Its findings join the diagnostics list.
- **Preflight**: `hardkas silver preflight <file>`.
- **Fuzz Inputs**: `hardkas silver fuzz <file>`.
- **Silver Doctor**: `hardkas silver doctor`, which checks the compiler toolchain.

### Inspector, step view and environment notes

Below the compiler, the panel shows three helpers. All three are computed inside the IDE from the source text, without the compiler or a node:

- **TX v1 & Covenant Inspector**: an estimate of compute budget, script size, mass and a covenant id. These are rough figures, not what the node computes. Use the compile record and the node for real values.
- **SilverScript Source Debugger (cli-debugger)**: a step-through view of an entry, simulated in the IDE. It does not run the contract and only recognises some entry syntax. For real behaviour, deploy and spend on the local node, or run your tests.
- **Simulator vs. Real Node Differences**: a reminder that the simulator does not run contract scripts, while the local node runs the full covenant rules.

The compiler version badge (`silverc v1.0.0`) is a fixed label. `hardkas silver doctor` tells you which compiler is really installed.

## Watch out

- The live check fills in placeholder constructor arguments when you have none, so a file can look clean and still fail **Compile** until you enter real arguments.
- Deploying from Deploy & Run compiles again with the arguments entered there, and that overwrites `<name>.constructor-args.json`.
