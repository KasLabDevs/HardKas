import path from 'node:path';
import {themes as prismThemes} from 'prism-react-renderer';
import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';
import {remarkDocsSource, rehypeStaticImages} from './plugins/markdown.mjs';
import {qualificationData} from './docs-data/qualification';

// BETA-FIX W4 · one source. The hand-written pages are the repository's docs/ (read on GitHub too); this app only
// renders them, plus the generated references kept here: reference/cli (scripts/cli-reference.mts) and
// reference/sdk (TypeDoc). Each generated set is its own docs instance with its own base path: an instance at
// /reference would match /reference/errors (a docs/ page) first and render it as not found.
const SITE_DIR = __dirname;
const REPO_ROOT = path.resolve(SITE_DIR, '../..');
const DOCS_ROOT = path.join(REPO_ROOT, 'docs');
const BASE_URL = '/docs/';

// docs/ folders that are not published on the site (still on GitHub): local audits (internal, gitignored), the
// rc.1 community kit (a dated report with placeholders), design proposals, and the .ts samples of examples/.
// docs/reference/cli.md is the one-page CLI reference for GitHub and npm readers; on the site its URL is the
// generated per-group reference (links to it are mapped there).
const UNPUBLISHED = ['internal', 'community', 'proposals', 'examples'];
const DEFAULT_EXCLUDE = ['**/_*.{js,jsx,ts,tsx,md,mdx}', '**/_*/**', '**/*.test.{js,jsx,ts,tsx}', '**/__tests__/**'];

// The preset installs the docs plugin; the generated references are two more instances of the same package.
const DOCS_PLUGIN = require.resolve('@docusaurus/plugin-content-docs', {
  paths: [require.resolve('@docusaurus/preset-classic')],
});

const config: Config = {
  title: 'HardKAS',
  tagline: 'Kaspa L1 Development Framework & IDE',
  favicon: 'img/favicon.ico',
  url: 'https://hardkas.dev',
  baseUrl: BASE_URL,
  onBrokenLinks: 'throw',
  // docs/ is CommonMark written for GitHub: .md pages are parsed as Markdown, not MDX.
  markdown: {
    format: 'detect',
    hooks: { onBrokenMarkdownLinks: 'throw', onBrokenMarkdownImages: 'throw' },
    // HTML comments stay html nodes (no page is MDX), so plugins/markdown.mjs sees `<!-- qualification: <id> -->`;
    // the MDX 1 compatibility parser would drop every comment before any plugin runs.
    mdx1Compat: { comments: false },
  },
  i18n: { defaultLocale: 'en', locales: ['en'] },
  plugins: [
    [
      DOCS_PLUGIN,
      {
        id: 'cli',
        path: 'reference/cli',
        routeBasePath: 'reference/cli',
        numberPrefixParser: false,
      },
    ],
    [
      DOCS_PLUGIN,
      {
        id: 'sdk',
        path: 'reference/sdk',
        routeBasePath: 'reference/sdk',
        numberPrefixParser: false,
      },
    ],
    ['./plugins/redirects.mjs', { file: path.join(SITE_DIR, 'redirects.json') }],
  ],
  presets: [
    [
      'classic',
      {
        docs: {
          path: DOCS_ROOT,
          routeBasePath: '/', // Serve docs at root
          sidebarPath: './sidebars.ts',
          exclude: [...DEFAULT_EXCLUDE, ...UNPUBLISHED.map((d) => `${d}/**`), 'reference/cli.md'],
          numberPrefixParser: false,
          beforeDefaultRemarkPlugins: [
            [
              remarkDocsSource,
              {
                docsRoot: DOCS_ROOT,
                repoRoot: REPO_ROOT,
                repoUrl: 'https://github.com/KasLabDevs/HardKas',
                unpublished: UNPUBLISHED,
                cliPagesDir: path.join(SITE_DIR, 'reference', 'cli'),
                generatedRefDir: path.join(SITE_DIR, 'reference'),
                qualificationIds: Object.keys(qualificationData),
              },
            ],
          ],
          rehypePlugins: [[rehypeStaticImages, { staticDirs: [path.join(SITE_DIR, 'static')], baseUrl: BASE_URL }]],
        },
        blog: false, // Disabled
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],
  themeConfig: {
    colorMode: {
      defaultMode: 'dark',
      disableSwitch: false,
      respectPrefersColorScheme: false,
    },
    navbar: {
      title: '',
      logo: {
        alt: 'HardKas — Kaspa Developer Toolkit',
        src: 'img/logo.png',
        srcDark: 'img/logo.png',
        height: 26,
        href: 'https://hardkas.dev/',
        target: '_self',
      },
      items: [
        { href: 'https://hardkas.dev/ide/', position: 'left', label: 'IDE', target: '_self' },
        { to: '/', position: 'left', label: 'Docs' },
        { href: 'https://hardkas.dev/#cli', position: 'left', label: 'CLI', target: '_self' },
        { href: 'https://hardkas.dev/#packages', position: 'left', label: 'SDK', target: '_self' },
        { href: 'https://hardkas.dev/#examples', position: 'left', label: 'Examples', target: '_self' },
        { href: 'https://hardkas.dev/#security', position: 'left', label: 'Security', target: '_self' },
        {
          href: 'https://github.com/KasLabDevs/HardKas',
          position: 'right',
          className: 'header-github-link',
          'aria-label': 'GitHub repository',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Product',
          items: [
            { label: 'HardKAS Home', href: 'https://hardkas.dev/', target: '_self' },
            { label: 'HardKAS IDE', href: 'https://hardkas.dev/ide/', target: '_self' },
            { label: 'CLI Reference', href: 'https://hardkas.dev/#cli', target: '_self' },
            { label: 'SDK Packages', href: 'https://hardkas.dev/#packages', target: '_self' },
          ],
        },
        {
          title: 'Documentation',
          items: [
            { label: 'Overview', to: '/' },
            { label: 'IDE Guide', to: '/ide/' },
            { label: 'Examples', href: 'https://hardkas.dev/#examples', target: '_self' },
            { label: 'Security', href: 'https://hardkas.dev/#security', target: '_self' },
          ],
        },
        {
          title: 'Community',
          items: [
            { label: 'Discord', href: 'https://discord.gg/bFCVymNHnu' },
            { label: 'X (Twitter)', href: 'https://x.com/HardKASOfficial' },
            { label: 'YouTube', href: 'https://www.youtube.com/@kaslabdevs' },
            { label: 'GitHub', href: 'https://github.com/KasLabDevs/HardKas' },
          ],
        },
      ],
      copyright: `<div class="docs-footer-meta">HardKAS 0.13.0-rc.3 · MIT License · Local-first Kaspa developer tooling</div>`,
    },
    prism: { theme: prismThemes.github, darkTheme: prismThemes.dracula },
  } satisfies Preset.ThemeConfig,
};

export default config;
