# Quickstart

The fastest way to get started with HardKAS is to bootstrap a local React dApp environment.

### 1. Create a Project

Use the CLI to initialize a new workspace:

```bash
npx @hardkas/cli dev create my-dapp
cd my-dapp
```

### 2. Install Dependencies

```bash
pnpm install
```

### 3. Start the Runtime

In one terminal, start the HardKAS Dev-Server and Localnet:

```bash
pnpm hardkas dev
```

### 4. Start the Frontend

In another terminal, boot up Vite:

```bash
pnpm dev
```

You now have a fully integrated HardKAS React environment with built-in observational telemetry, account management, and transaction workflow capabilities.
