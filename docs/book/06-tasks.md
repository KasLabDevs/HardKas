# Chapter 6: Custom Tasks

HardKAS tasks are more than just shell scripts; they are typed, auditable, and seamlessly integrate into the Evidence framework.

```bash execute
hardkas init tasks-project
cd tasks-project
```

Let's define a custom task in our `hardkas.config.ts`:

```bash execute
cat << 'EOF' > tasks-project/hardkas.config.ts
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

You can now run this task via the CLI. Tasks also support JSON output out of the box!

```bash execute
cd tasks-project
hardkas task hello --name bob --json
```

You can even run tasks and automatically collect evidence for them:

```bash execute
cd tasks-project
hardkas task hello --name carol --evidence
```
