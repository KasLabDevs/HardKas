---
title: "Your first test scenario"
sidebar_label: "Chapter 3: Your First Scenario"
description: "Write test scenarios that verify Kaspa logic with the scenario-driven Vitest integration of HardKAS."
---

# Chapter 3: Your First Scenario

HardKAS brings scenario-driven testing via a custom Vitest integration.
You can write test scenarios that verify Kaspa logic.

Create a project folder, initialize it, and run every command of the chapter from inside it:

```bash
mkdir first-scenario
cd first-scenario
```

```bash execute
hardkas init
```

`init` writes `test/payment.test.ts` and a `package.json` that declares Vitest and `@hardkas/testing`. Install them:

```bash
npm install
```

Now write a test of your own in `test/`:

```bash execute
cat << 'EOF' > test/hello.test.ts
import { describe, it, expect } from "vitest";

describe("First Scenario", () => {
  it("should run successfully", () => {
    expect(true).toBe(true);
  });
});
EOF
```

Run it:

```bash execute
hardkas test test/hello.test.ts
```

`hardkas test` without a file runs every test under `test/`, the generated payment scenario included.
