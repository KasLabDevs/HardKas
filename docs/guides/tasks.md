---
title: "Custom tasks"
sidebar_label: "Chapter 6: Custom Tasks"
description: "Custom HardKAS tasks: typed, auditable scripts that integrate with the evidence framework."
---

# Chapter 6: Custom Tasks

HardKAS tasks are more than just shell scripts; they are typed, auditable, and seamlessly integrate into the Evidence framework.

Create a project folder, initialize it, and run every command of the chapter from inside it:

```bash
mkdir tasks-project
cd tasks-project
```

```bash execute
hardkas init
```

The config below imports `@hardkas/config` and `@hardkas/core`. Install them, at the version of your CLI:

```bash
npm install @hardkas/config@0.13.0-rc.3 @hardkas/core@0.13.0-rc.3
```

Let's define a custom task in our `hardkas.config.ts` (this replaces the file `init` wrote):

```bash execute
cat << 'EOF' > hardkas.config.ts
import { defineHardkasConfig } from "@hardkas/config";
import { task, types } from "@hardkas/core";

export default defineHardkasConfig({
  tasks: {
    hello: task("hello", "prints hello")
      .param("name", "Name", types.string, "alice")
      .action(async (args, hk) => {
        return { hello: args.name };
      })
  }
});
EOF
```

You can now run the `hello` task you defined in `hardkas.config.ts` via the CLI. Tasks also support JSON output out of the box!

```bash execute
hardkas task hello --name bob --json
```

You can even run tasks and automatically collect evidence for them (`--evidence` writes `hello.hke.json`, which `hardkas evidence verify hello.hke.json` checks):

```bash execute
hardkas task hello --name carol --evidence
```
