import fs from 'fs/promises';
import path from 'path';
import { JSDOM } from 'jsdom';
import TurndownService from 'turndown';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '../../../');
const SITE_HTML = path.join(ROOT_DIR, 'site/index.html');
const DOCS_DIR = path.join(__dirname, '../docs');

const turndownService = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced'
});

turndownService.addRule('pre', {
  filter: 'pre',
  replacement: function (content, node, options) {
    let code = node.textContent || '';
    
    let lang = 'typescript'; // default for HardKAS
    if (node.firstChild && node.firstChild.className) {
      const match = node.firstChild.className.match(/language-(\S+)/);
      if (match) lang = match[1];
    }
    
    return '\n\n```' + lang + '\n' + code.trim() + '\n```\n\n';
  }
});

// Also rule for the codebar so it's not rendered as random text
turndownService.addRule('codebar', {
  filter: function(node) {
    return node.classList && node.classList.contains('codebar');
  },
  replacement: function (content) {
    return `**${content.trim()}**\n\n`;
  }
});

// Rule for `<div class="note">`
turndownService.addRule('note', {
  filter: function(node) {
    return node.classList && node.classList.contains('note');
  },
  replacement: function(content) {
    return `\n:::note\n${content.trim()}\n:::\n\n`;
  }
});

// Rule for `<code>` blocks (inline code)
// Turndown usually handles this, but just to be sure.

const sectionMap = {
  'execution-safe development for kaspa.': 'getting-started/index.md',
  'the problem': 'getting-started/motivation.md',
  'execution contract': 'getting-started/execution-contract.md',
  'execution guard': 'getting-started/execution-guard.md',
  'artifacts': 'concepts/artifacts.md',
  'replay': 'concepts/replay.md',
  'execution environments': 'concepts/environments.md',
  'capability honesty': 'qualification/index.mdx',
  'toccata support': 'concepts/toccata.md',
  'architecture': 'reference/architecture.md',
  'quickstart': 'getting-started/quickstart.md',
  'examples & builder labs': 'tutorials/builder-labs.md',
  'security boundaries': 'getting-started/security.md',
  'dag simulation': 'how-to/dag-simulation.md',
  'query store': 'how-to/query-store.md',
  'operator commands': 'how-to/operator-commands.md',
  'event ledger and telemetry': 'how-to/telemetry.md',
  'chaos engine': 'how-to/chaos-engine.md',
  'kaspa l1 vs igra l2': 'concepts/l1-vs-l2.md',
  'bridge local simulation': 'how-to/bridge-local.md',
  'rpc diagnostics': 'how-to/rpc-diagnostics.md',
  'cli reference': 'reference/cli.md',
  'package map': 'reference/packages.md',
  'agent.md rules': 'reference/agent-rules.md',
  'faq': 'getting-started/faq.md'
};

const ledger = [];

async function main() {
  const html = await fs.readFile(SITE_HTML, 'utf-8');
  const dom = new JSDOM(html);
  const doc = dom.window.document;

  const containers = Array.from(doc.querySelectorAll('.hero-shell, section'));
  
  for (const container of containers) {
    const heading = container.querySelector('h1, h2');
    if (!heading) continue;
    
    let text = heading.textContent.trim().toLowerCase().replace(/experimental/g, '').trim();
    const file = sectionMap[text];
    
    if (!file) {
      continue;
    }

    const clone = container.cloneNode(true);
    const cloneHeading = clone.querySelector('h1, h2');
    const title = cloneHeading.textContent.replace(' EXPERIMENTAL', '').trim();
    cloneHeading.remove();
    
    let md = turndownService.turndown(clone.innerHTML);
    
    let finalContent = `---\ntitle: ${title}\n---\n\n${md}\n`;
    
    const fullPath = path.join(DOCS_DIR, file);
    
    let existing = '';
    try {
        existing = await fs.readFile(fullPath, 'utf-8');
    } catch(e) {}
    
    if (existing.includes('<QualificationContext')) {
        finalContent = `---\ntitle: ${title}\n---\n\nimport QualificationContext from '@site/src/components/QualificationContext';\n\n` + md;
    }
    
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, finalContent, 'utf-8');
    
    if (!ledger.some(l => l.file === file)) {
        ledger.push({ section: title, file: file });
    }
  }

  const ledgerMd = [
    '# DOCS-MIGRATION-1: Legacy Content Ledger',
    '',
    'This ledger tracks the extraction of legacy content from `site/index.html` to the new Docusaurus structure.',
    '',
    '| Legacy Section | Canonical MDX File |',
    '|---|---|',
    ...ledger.map(l => `| ${l.section} | \`/docs/${l.file}\` |`)
  ].join('\n');
  
  const ledgerPath = path.join(ROOT_DIR, 'hardkas-docs-migration-ledger.md');
  await fs.writeFile(ledgerPath, ledgerMd, 'utf-8');
}

main().catch(console.error);
