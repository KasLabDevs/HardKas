# Contributing to HardKAS

Thank you for your interest in HardKAS! As an alpha-stage project, we appreciate community feedback, bug reports, and contributions.

## Development Workflow

HardKAS is a monorepo managed with **pnpm** and **Turbo**.

### Prerequisites
- Node.js (v20+)
- pnpm (v9+)

## Getting Started

### For Users
If you just want to use HardKAS in your project, install it via npm:
```bash
# Install the SDK
npm install @hardkas/sdk

# Use the CLI globally
npm install -g @hardkas/cli
```

### For Contributors (Core Development)
If you want to contribute to the core or run examples from source:

1. **Clone the repository**
   ```bash
   git clone https://github.com/KasLabDevs/HardKas.git
   cd Hardkas
   ```

2. **Install & Build**
   ```bash
   pnpm install
   pnpm build
   ```

### Testing
```bash
pnpm test
```

## Pull Requests

1. Fork the repository.
2. Create a feature branch.
3. Ensure all tests pass.
4. Keep PRs focused and well-documented.
5. If you are making architectural changes, please open an issue first to discuss the design.

## Coding Standards

- **TypeScript**: Strict type safety is mandatory.
- **Artifacts**: New features should respect the deterministic artifact model.
- **Formatting**: We use Prettier for consistent styling.

## Security

Please refer to [SECURITY.md](SECURITY.md) for vulnerability reporting.

## License

By contributing to HardKAS, you agree that your contributions will be licensed under the MIT License.
