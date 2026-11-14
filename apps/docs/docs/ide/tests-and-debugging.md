---
title: Tests and debugging
description: Run a HardKAS project's vitest tests from the IDE, read the results, and debug them with breakpoints, stepping, variables and watches.
sidebar_label: Tests and debugging
sidebar_position: 8
---

# Tests and debugging

The IDE runs the project's own **vitest** tests. HardKAS project templates ship vitest; the project needs its Node dependencies installed (`npm install`).

## Running tests

Open **Tests** from the rail or **View → Tests**. It also opens by itself when a run starts.

Start a run from:

- **Run all** in the Tests view;
- **Run → Run all tests** or **Run → Run tests in this file** (on a `.test` or `.spec` file);
- right-click in a test file → **Run tests in this file** or **Run all tests**;
- right-click a file in the Explorer → **Run As**;
- the command palette.

The IDE runs `npx vitest run [files] --reporter=json --outputFile=.hardkas/ide/test-results.json --reporter=default` in the Console. A project with nested sub-projects (their own `package.json` or vitest config) has each one run from its own folder, and the results are merged.

There is no keyboard shortcut for a run and no button to stop one.

## Reading the results

- The bar at the top shows runs, failures, skipped tests and time, in green or red.
- Files expand into their tests (`describe › title`, with the duration). Double-click a row to open the file at that test.
- Select a failing test for its full name, duration, a **file:line** button, the failure message, **Debug this test** and **Fix with AI** (which hands the failure to the [assistant's agent](./assistant.md)).
- The Console sums up each run ("Tests: N failed, M passed").

If vitest does not produce a report, the view says so and suggests `npm install`.

## Debugging tests

The test debugger stops on breakpoints in your own `.ts` files and lets you step, read variables and watch expressions. It runs vitest under the Node inspector.

1. Open a test file and click the gutter next to a line number, or press **F9** on the line. A red dot marks the breakpoint.
2. Press **F5**, or use **Run → Debug tests in this file**, right-click in the file → **Debug tests in this file**, the Explorer's **Debug As** menu, or the bug buttons in the Tests view. **Debug this test** runs only the selected test.
3. When a breakpoint is hit, the editor opens at that line and the **Tests** view shows the debugger.

| Keys | Action |
| --- | --- |
| F5 | Start (on a test file) / Continue |
| F10 | Step over |
| F11 | Step into |
| Shift+F11 | Step out |
| Shift+F5 | Stop |
| F9 | Toggle breakpoint on the cursor line |

While paused, the Tests view shows the controls (continue, step over, into and out, restart, stop), the call stack (click a frame to jump to it), the variables of the selected frame and your watch expressions, evaluated at every stop. It also lists the breakpoints, offers **Pause when an exception is thrown** (for your own code only) and shows the test output.

**Run → Debug all tests** debugs the whole suite; **Run → Remove all breakpoints** clears them.

### Good to know

- Breakpoints are kept per project and follow their lines while you edit. A breakpoint on a line with no code moves to the next line that has code; the Tests view shows where it really stops.
- Test timeouts are off while debugging, so a paused test does not fail with "Test timed out".
- Stepping skips library code (`node_modules` and Node internals).
- **Debug this test** selects by test title, so tests with the same title in other `describe` blocks run too.
- A debug run does not update the results tree. Its output is in the **Test output** section of the debugger.
- Watch expressions and the exception option are not kept after a reload.
- Debugger keys do nothing while a terminal has focus.
- Only one debug session runs at a time.
