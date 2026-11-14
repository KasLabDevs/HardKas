---
title: Projects and workbench
description: Create or open a HardKAS project from the Home screen, then find your way around the workbench, the command palette and search.
sidebar_label: Projects and workbench
sidebar_position: 2
---

# Projects and workbench

## Home

The IDE opens on **Home**. It has three ways in:

- **New project…** opens the new-project wizard (below).
- **Open folder:** type the folder's absolute path and press **Open** or Enter. There is no folder picker yet, so paste the path.
- **Recent projects:** the last 12 projects you opened that still exist on disk, kept in `~/.hardkas-ide/recents.json`.

Home also shows which HardKAS CLI the IDE found, and the version it was tested with.

Any folder opens, but a HardKAS project is one with `hardkas.config.ts`. If the folder's `package.json` uses an `@hardkas/` package and has no `hardkas.config.ts`, the IDE writes one when it opens the folder. With no config at all, the Console warns you.

To go back to Home, click the logo at the left of the title bar. It asks first if you have unsaved changes. **File → Exit** also goes back to Home; close the window to quit the app.

## New project

The wizard has two pages. **Next >** shows a preview of the folder tree, and **Finish** creates the project.

| Field | What it does |
| --- | --- |
| Project name | The new folder's name: letters, digits, `.`, `_` and `-` only. |
| Use default location / Location | The parent folder. It must already exist, and the new folder must not. |
| Project layout | Separate folders for contracts, scripts and tests (`contracts/`, `scripts/`, `test/`), or the **full-stack layout**, which adds a frontend in `dapp/`. For full-stack, pick the frontend stack: React + TypeScript, Vue 3, Svelte, Next.js, vanilla TypeScript or vanilla JavaScript. |
| Install npm dependencies on finish | Installs `@hardkas/cli`, `@hardkas/sdk` and `@hardkas/testing` (and the `dapp/` packages) when the project is created. On by default. |
| Create starter SilverScript contract file | Adds a starter contract from a covenant blueprint: 1:N, 1:1, Escrow 2-of-3, Timelock or Basic, with a ratio (1:2 to 1:5) and a contract name. |

**Finish** shows each step as it runs:

1. `hardkas init` in the new folder.
2. It writes `package.json`, `hardkas.config.ts`, the starter contract and, for full-stack, the frontend in `dapp/`.
3. `npm install` in the project (if ticked).
4. `npm install` in `dapp/` (if there is one).

Then the IDE opens the new project.

**Watch out:**

- The default location is `hardkas-projects` in your user folder, and the IDE does not create it. Create it first or pick another folder, or Finish fails with "Parent folder does not exist".
- If Finish fails halfway, the folder is already there, and a second Finish fails with "Destination already exists". Delete the half-made folder or choose another name.
- On macOS and Linux, check the **Location** field before you click Finish.

## The workbench

```text
┌ title bar: logo · menus · Quick Open · Update · window buttons ─────────┐
├ environment bar: environment · node and Docker status · accounts ───────┤
│ rail │ side panel  │ editor tabs                       │ Outline        │
│      │ (Explorer,  │                                   │ Assistant      │
│      │  Servers…)  ├───────────────────────────────────┤                │
│      │             │ Console · Terminal · Search       │                │
├ status bar: project · file · Ln, Col · CLI version ─────────────────────┤
```

- **Title bar.** The logo (back to Home), the menus (**File, Edit, Search, Go, View, Run, Terminal, Help**), a search box that opens Quick Open, the **Update** button when a release is out, and the window buttons.
- **Environment bar.** The environment picker (Simulator, Local node, Public testnet), the node and Docker state with a **Start** button, and an accounts summary. Hover it for every account and balance; click to pin it open.
- **Icon rail.** One icon per view. Top group: Explorer, Servers, Accounts, SilverScript compiler, Deploy & Run, Artifacts, Tests, external plugins, Plugins. Below a separator are the views that open in the editor area: Run history, Covenant Graph, Lineage and Index. At the bottom: Assistant, side bar, Outline, console/terminal, Settings.
- **Side panel.** The view you picked in the rail.
- **Editor area.** File tabs and the larger views. With nothing open, it offers shortcuts to the Explorer, Deploy & Run, Lineage Graph, Index and Tests.
- **Right dock.** The Outline (for `.sil` files: constructor, entries, P2SH address and deploys) and the Assistant.
- **Bottom panel.** [Console and terminals](./console-and-terminal.md), and a Search tab after a search.
- **Status bar.** Project, active file, messages, cursor position (click it to go to a line) and the IDE and CLI versions.

Above the editor, breadcrumbs show folder ▸ file ▸ symbol, each with a picker, and a badge with the file's errors and warnings.

### Moving views

Each view's header has four buttons: **Dock left**, **Dock below the Explorer**, **Dock right (under Outline)** and **Open as a tab**. The Explorer stays where it is. The X on a docked view hides it; its rail icon brings it back.

If the layout gets confusing, use **View → Layout → Reset panel layout** (also in Settings). The IDE remembers the environment, where each view is docked, hidden views and the zoom level. It does not remember panel sizes.

### Tabs

- Middle-click closes a tab. Right-click offers Close, Close Others, Close Tabs to the Left or Right, Close All and **Detach**.
- **Detach** moves the tab into its own window with **Save** and **Dock back** buttons. Use **Dock back** to return it: closing that window another way does not bring the tab back, so you reopen the file.
- Closing a tab with unsaved changes asks first.

### Zoom

**Ctrl+=** and **Ctrl+-** zoom from 70 % to 200 % in steps of 10; **Ctrl+0** goes back to 110 %, the default.

## Command palette and Quick Open

| Keys | Opens |
| --- | --- |
| Ctrl+P | Files (Quick Open) |
| Ctrl+Shift+P or Ctrl+K | Commands |
| Ctrl+Shift+O | Symbols in the current file |
| Ctrl+G | Go to line |

Typing `file:line` in Quick Open opens the file at that line. Besides the IDE's own commands, the palette lists every HardKAS CLI command as **CLI: hardkas …**. Those run with `--json` and no other arguments; for arguments, type the command in the [Console](./console-and-terminal.md).

## Search

**Search → Search…** (Ctrl+H) opens the search dialog with three tabs: **File Search**, **SilverScript / Covenant Search** and **TypeScript / Symbol Search**. You can match case, use a regular expression or whole words, filter file names, and limit the scope to the workspace, open editors, the current file or a folder. Results open in the **Search** tab of the bottom panel. **Quick Search** (Ctrl+Alt+Shift+L) searches as you type and shows a preview.

Search skips `node_modules`, `.git`, `.turbo`, `dist` and `coverage`, files over 1 MB, and folders more than 8 levels deep.

**Watch out:** **Replace All** writes the changes to disk at once, with no confirmation. Save and commit your work first.

## New files

**File → New** (Ctrl+N for the wizard) creates a file from a template: an empty file or folder, a SilverScript contract, one of the covenant blueprints, a test suite, a SQL file, or a TypeScript class, interface, enum or record. If a file with that name already exists, it is overwritten without asking.

## Keyboard shortcuts

| Keys | Action |
| --- | --- |
| Ctrl+S / Ctrl+Shift+S | Save (while the editor has focus) / Save all |
| Ctrl+W / Ctrl+Shift+W | Close editor / close all editors |
| Ctrl+Enter | Compile the open `.sil` file |
| Ctrl+F / Ctrl+H | Find in file / search in files |
| Ctrl+/ | Toggle line comment |
| Shift+Alt+F | Format document |
| Ctrl+B | Show or hide the side bar |
| Ctrl+J or Ctrl+` | Show or hide the console and terminal panel |
| Ctrl+Shift+` | New terminal |
| F5, F9, F10, F11 | Debug tests (see [Tests and debugging](./tests-and-debugging.md)) |

F5 starts debugging only when a test file is open. Elsewhere the IDE does not use it, and the window may reload, so save first.
