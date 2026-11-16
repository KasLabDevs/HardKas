import {themes as prismThemes} from 'prism-react-renderer';
import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const config: Config = {
  title: 'HardKAS',
  tagline: 'Kaspa L1 Development Framework & IDE',
  favicon: 'img/favicon.ico',
  url: 'https://hardkas.dev',
  baseUrl: '/docs/',
  onBrokenLinks: 'throw',
  onBrokenMarkdownLinks: 'throw',
  i18n: { defaultLocale: 'en', locales: ['en'] },
  presets: [
    [
      'classic',
      {
        docs: {
          routeBasePath: '/', // Serve docs at root
          sidebarPath: './sidebars.ts',
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
