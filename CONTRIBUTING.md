# Contributing to HardKAS

Thank you for your interest in HardKAS! As an alpha-stage project, we appreciate community feedback, bug reports, and contributions.

## Development Workflow

HardKAS is a monorepo managed with **pnpm** and **Turbo**.

### Prerequisites
- Node.js (v20+)
- pnpm (v9+)

### Setup
```bash
git clone https://github.com/jrodrg92/Hardkas.git
cd Hardkas
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
