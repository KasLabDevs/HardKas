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
    prism: { theme: prismThemes.github, darkTheme: prismThemes.dracula },
  } satisfies Preset.ThemeConfig,
};

export default config;
