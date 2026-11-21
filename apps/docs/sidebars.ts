import type {SidebarsConfig} from '@docusaurus/plugin-content-docs';

// BETA-FIX W4 · the agreed order (docs/internal/docs-migration-ledger.md): Install → Getting Started → Guides →
// Concepts → Reference → Help. The pages are the repository's docs/ (ids are their paths there); the generated CLI and
// SDK references are their own docs instances, reached by link.
const doc = (id: string, label?: string) => (label ? {type: 'doc' as const, id, label} : id);

const sidebars: SidebarsConfig = {
  docs: [
    doc('README', 'Overview'),
    {
      type: 'category',
      label: 'Install',
      collapsed: false,
      items: ['start/installation', 'start/install-and-init', 'start/configuration'],
    },
    {
      type: 'category',
      label: 'Getting Started',
      collapsed: false,
      items: [
        'start/quickstart',
        'start/first-transaction',
        'start/build-on-simnet',
        'start/simnet-node',
        'start/quickstart-simnet',
        'start/silverscript-covenants',
        'start/receipts-and-levels',
        'start/testnet-10',
        'start/browser-wallets',
        'start/first-scenario',
        'start/what-works',
        'start/common-errors',
      ],
    },
    {
      type: 'category',
      label: 'Guides',
      items: [
        {
          type: 'category',
          label: 'Testing',
          items: ['guides/your-first-test', 'guides/tasks', 'guides/plugins', 'guides/testing-kaspa-covenants'],
        },
        {
          type: 'category',
          label: 'Accounts and transactions',
          items: [
            'guides/accounts',
            'guides/transactions/plan-sign-send',
            'guides/transactions/fees-and-mass',
            'guides/large-wallet-consolidation',
            'guides/wallet-utxos',
            'guides/sdk-wallet',
          ],
        },
        {
          type: 'category',
          label: 'SilverScript and covenants',
          link: {type: 'doc', id: 'guides/silverscript-covenants/index'},
          items: [
            'guides/silverscript-covenants/compile-and-verify',
            'guides/silverscript-covenants/covenant-model',
            'guides/silverscript-covenants/tx-v1-and-compute-budget',
            'guides/silverscript-covenants/covenant-genesis-and-transition',
            'guides/silverscript-covenants/zk-and-sequencing',
            'guides/zk-l1-verification-and-settlement',
            'guides/silverscript-ide-and-local-development',
          ],
        },
        {
          type: 'category',
          label: 'Evidence',
          items: ['guides/artifact-auditing', 'guides/replay-verification', 'guides/query-store'],
        },
        {
          type: 'category',
          label: 'Debugging and operations',
          items: [
            'guides/debugging',
            'guides/runtime-docker',
            'guides/operator-commands',
            'guides/telemetry',
            'guides/snapshot-time-travel',
            'guides/jobs',
            'guides/chaos-engine',
            'guides/dag-simulation',
          ],
        },
        {
          type: 'category',
          label: 'CLI and SDK',
          items: ['guides/cli', 'guides/sdk', 'guides/hardhat-for-kaspa'],
        },
        {
          type: 'category',
          label: 'Build on Kaspa with AI',
          link: {type: 'doc', id: 'ai/index'},
          items: ['ai/workflows', 'ai/troubleshooting', 'ai/claude-code-and-cursor'],
        },
        {
          type: 'category',
          label: 'HardKAS IDE',
          link: {type: 'doc', id: 'ide/index'},
          items: [
            'ide/install',
            'ide/projects-and-workbench',
            'ide/editor-and-compiler',
            'ide/deploy-and-run',
            'ide/local-node-and-accounts',
            'ide/artifacts-and-index',
            'ide/covenant-graph',
            'ide/tests-and-debugging',
            'ide/console-and-terminal',
            'ide/assistant',
            'ide/plugins-and-vsx',
            'ide/settings-and-updates',
          ],
        },
      ],
    },
    {
      type: 'category',
      label: 'Concepts',
      items: [
        'concepts/why-hardkas',
        'concepts/hardkas-vs-kaspa-wasm',
        'concepts/transaction-lifecycle',
        'concepts/execution-worlds',
        'concepts/artifact-lifecycle',
        'concepts/security-model',
        'concepts/accounts',
        'concepts/correct-vs-incorrect-flows',
        'concepts/artifacts-and-evidence',
        'concepts/localnet-and-boundaries',
        'concepts/kaspa-node',
        'concepts/toolkit-layer',
        'concepts/kaspa-l1-development-framework',
        'concepts/kaspa-developer-tools-and-ecosystem',
        {
          type: 'category',
          label: 'Layer 2, vProgs and PSKT',
          items: [
            'concepts/layer-2/boundaries',
            'concepts/vprogs/what-is-vprogs',
            'concepts/vprogs/architecture',
            'concepts/vprogs/proving-pipeline',
            'concepts/pskt/index',
          ],
        },
      ],
    },
    {
      type: 'category',
      label: 'Reference',
      items: [
        {type: 'link', label: 'CLI commands (generated)', href: '/reference/cli/'},
        {type: 'link', label: 'SDK API (generated)', href: '/reference/sdk/generated/'},
        'reference/errors',
        'reference/artifact-schema',
        'reference/kcc',
        'reference/client',
        'status/claims.generated',
        'status/send-routes-security',
        'status/security-claims',
        'status/multinode-read',
        'status/dependency-licenses',
      ],
    },
    {
      type: 'category',
      label: 'Help',
      items: [
        'help/faq',
        'guides/troubleshooting',
        'status/limitations',
        'status/versioning',
        {
          type: 'category',
          label: 'Migrations',
          items: ['migrations/0.12-to-0.13', 'migrations/0.11-to-0.12', 'migrations/0.12'],
        },
        {
          type: 'category',
          label: 'Release notes',
          items: ['release/0.13.0-rc.3-notes', 'release/0.13.0-rc.2-notes', 'release/0.13.0-rc.1-notes'],
        },
        {
          type: 'category',
          label: 'Status pages',
          items: [
            'status/capability-matrix',
            'status/release-claims',
            'status/covenants-status',
            'status/tx-v1-status',
            'status/tx-version-compatibility',
            'status/programmability-surface',
          ],
        },
        {
          type: 'category',
          label: 'Contributing',
          items: ['contributing/testing', 'contributing/evidence-levels'],
        },
        {
          type: 'category',
          label: 'App Toolkit material (not on the main path)',
          items: [
            'guides/building-apps',
            'guides/templates',
            'tutorials/wallet-app',
            'tutorials/merchant-checkout',
            'tutorials/payment-service',
            'tutorials/full-stack-demo',
          ],
        },
      ],
    },
  ],
};

export default sidebars;
