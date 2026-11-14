---
title: Install and first start
description: Install the HardKAS IDE on Windows, macOS or Linux, get past the unsigned-installer warnings and start it for the first time.
sidebar_label: Install and first start
sidebar_position: 1
---

# Install and first start

## Download

Every release is on the [GitHub releases page](https://github.com/KasLabDevs/HardKasIDE/releases/latest) of `KasLabDevs/HardKasIDE`. Download the IDE only from there.

| System | File | Notes |
| --- | --- | --- |
| Windows 10 / 11 (x64) | `HardKas-IDE-setup.exe` | Installs for your user only, with no admin rights. Needs the WebView2 runtime, which Windows 10 and 11 already have. |
| macOS 10.13 or later | `.dmg` | Drag the app to Applications. |
| Linux | `.AppImage` or `.deb` | The `.deb` depends on WebKitGTK (`libwebkit2gtk-4.1-0` or `libwebkit2gtk-4.0-37`) and `libayatana-appindicator3-1`. Make the AppImage executable (`chmod +x`) before you run it. |

The Windows installer always has the same name, so this link gets the latest one: [HardKas-IDE-setup.exe](https://github.com/KasLabDevs/HardKasIDE/releases/latest/download/HardKas-IDE-setup.exe).

## The installers are not signed yet

None of the installers is code-signed, so your system warns you the first time:

- **Windows:** SmartScreen may say "Windows protected your PC". Choose **More info**, then **Run anyway**.
- **macOS:** macOS refuses to open the app the first time. Control-click (or right-click) the app and choose **Open**, or allow it under **System Settings → Privacy & Security**.

macOS signing and notarization are prepared in the release workflow but not switched on yet. Windows signing is not set up yet.

## How releases are built

- The installers are built on GitHub by the IDE repository's release workflow, for Windows, macOS and Linux, from the tagged code. The workflow stops before building anything if the tag does not match the version written in the code.
- Every pull request also builds the app on all three systems and starts it, so a break on one of them shows up before a release.

## Before you start it

- Install **Node.js 24.22.1 with npm** and make sure both are on the `PATH`. The app has its own Node runtime for its server, but it creates projects with npm and runs the `hardkas` CLI through your Node.
- Install **Docker Desktop** if you want the local node. You can skip it and use the simulator.

## First start

1. The window opens on a short splash page while the app starts its server on `http://127.0.0.1:7421`.
2. The IDE then shows the **Home** screen. From there you create or open a project: see [Projects and workbench](./projects-and-workbench.md).

Good to know:

- **Port 7421 in use.** If something already answers on port 7421 (for example a second copy of the IDE server), the app uses it instead of starting its own.
- **Server errors.** If the server does not start, the splash page says "The IDE server did not start" with the reason. If the IDE loses its server later, it shows "IDE server not reachable" with a **Retry** button. That screen also suggests `pnpm dev:server`, which only applies when you run the IDE from source.
- **Links.** Links to outside pages (release notes, docs, downloads) open in your system browser, not inside the IDE.
- **Offline.** The editor works offline: it is part of the app and loads nothing from the web.
- **Closing the app.** Closing the window stops the IDE server, its terminals and any job it was running. The local node runs in Docker and keeps running until you stop it from the [Servers view](./local-node-and-accounts.md).

## Where the IDE keeps its files

- **Your project:** everything HardKAS writes stays in the project's `.hardkas/` folder. The IDE adds `.hardkas/ide/` for its own state there (test results, plugins installed from npm, argument files for contract calls).
- **Your user folder:** the IDE's own settings live in `~/.hardkas-ide/`:
  - `recents.json`: recent projects.
  - `assistant.json`: assistant settings.
  - `opencode/`: the bundled OpenCode agent's home.
  - `vsx/`: installed extensions.
  - `cache/`: cached Kaspa docs.

## Updates

The IDE does not update itself. When a new release is out, an **Update** button appears in the title bar and offers the installer for your system: see [Settings and updates](./settings-and-updates.md).
