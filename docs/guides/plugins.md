# Chapter 7: Plugins

HardKAS allows extending its capabilities securely through Plugins. A Plugin can add custom Tasks or define Hooks that observe or block transactions.

Create a project folder, initialize it, and run every command of the chapter from inside it:

```bash
mkdir plugin-project
cd plugin-project
```

```bash execute
hardkas init
```

The config below imports `@hardkas/config` and `@hardkas/core`. Install them, at the version of your CLI:

```bash
npm install @hardkas/config@0.13.0-rc.3 @hardkas/core@0.13.0-rc.3
```

Let's define an inline plugin in `hardkas.config.ts` (this replaces the file `init` wrote):

```bash execute
cat << 'EOF' > hardkas.config.ts
import { defineHardkasConfig } from "@hardkas/config";
import { task, types, HardkasPlugin } from "@hardkas/core";

const myPlugin: HardkasPlugin = {
  name: "MyCustomPlugin",
  version: "1.0.0",
  hardkasVersion: "0.13.0-rc.3",
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

Run the plugin task you registered in `hardkas.config.ts` above:

```bash execute
hardkas task plugin-task --json
```
