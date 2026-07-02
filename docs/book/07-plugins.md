# Chapter 7: Plugins

HardKAS allows extending its capabilities securely through Plugins. A Plugin can add custom Tasks or define Hooks that observe or block transactions.

```bash execute
hardkas init plugin-project
cd plugin-project
```

Let's define an inline plugin in `hardkas.config.ts`:

```bash execute
cat << 'EOF' > plugin-project/hardkas.config.ts
import { defineHardkasConfig } from "@hardkas/config";
import { task, types, HardkasPlugin } from "@hardkas/core";

const myPlugin: HardkasPlugin = {
  name: "MyCustomPlugin",
  version: "1.0.0",
  hardkasVersion: "0.11.2",
  hooks: {
    onBeforeTxSign: async (ctx) => {
      console.log(`Plugin intercepting sign for account: ${ctx.account}`);
    }
  },
  tasks: {
    "plugin-task": task("plugin-task", "A task injected by a plugin")
      .action(async () => {
        return { message: "Hello from Plugin!" };
      })
  }
};

export default defineHardkasConfig({
  plugins: [myPlugin]
});
EOF
```

Run the plugin task seamlessly:

```bash execute
cd plugin-project
hardkas task plugin-task --json
```
