# Chapter 2: Install and Init

To start a new project with HardKAS, you use the `init` command. It will scaffold a default `hardkas.config.ts`, a `package.json`, and set up the `tests` directory.

```bash execute
hardkas init my-project
```

Once the project is initialized, you can inspect the created configuration. Note that `init` creates a `hardkas.config.ts` if none exists.

```bash execute
cd my-project
hardkas config show
```
