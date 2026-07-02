import fs from 'fs';
import path from 'path';

const repoRoot = process.cwd();

const groups = {
  A: [] as string[],
  B: [] as string[],
  C: [] as string[],
  D: [] as string[],
  kept: [] as string[]
};

// Patterns for group A (safe to delete)
const groupAPatterns = [
  /coverage[\/\\]/,
  /\.nyc_output[\/\\]/,
  /playwright-report[\/\\]/,
  /test-results[\/\\]/,
  /dist[\/\\]/,
  /build[\/\\]/,
  /\.tsbuildinfo$/,
  /\.log$/,
  /^stdout\.log$/,
  /^stderr\.log$/,
  /^audit.*\.log$/,
  /^DEBUG.*\.log$/,
  /(^|[\/\\])tmp[\/\\]/,
  /(^|[\/\\])temp[\/\\]/,
  /(^|[\/\\])\.tmp/,
  /(^|[\/\\])\.benchmark-workspace/,
  /(^|[\/\\])\.smoke-workspace/,
  /(^|[\/\\])\.crash-workspace/,
  /(^|[\/\\])\.fuzz-workspace/,
  /(^|[\/\\])\.post-release-gauntlet/,
  /examples[\/\\].*node_modules/,
  /evidence\.json$/,
  /coverage-summary\.json$/,
  /FULL_ECOSYSTEM_COVERAGE_REPORT\.md$/,
  /PACKAGE_USAGE_MATRIX\.md$/,
  /PUBLIC_API_COVERAGE_MATRIX\.md$/,
  /SHOWCASE_EXECUTION_REPORT\.md$/,
  /API_DEAD_ZONE_REPORT\.md$/,
  /TESTNET_SOAK_REPORT\.json$/
];

// Patterns for group C (historical evidence)
const groupCPatterns = [
  /_READY\.md$/,
  /_VALIDATED\.md$/,
  /_COMPLETED\.md$/,
  /_REPORT\.md$/,
  /_EVIDENCE\.md$/,
  /walkthrough\.md$/,
  /task\.md$/,
  /implementation_plan\.md$/
];

// Patterns for group D (suspicious)
const groupDPatterns = [
  /^fix.*\.js$/,
  /^test-.*\.js$/,
  /^scratch.*\.ts$/,
  /^debug.*\.ts$/,
  /(^|[\/\\])examples[\/\\]my-test-project/,
  /(^|[\/\\])my-app/,
  /(^|[\/\\])tmp-audit/,
  /(^|[\/\\])experimental/
];

// E is implicitly anything else in packages/*/src, etc.

function shouldIgnoreDir(dir: string) {
  if (dir.includes('.git') || dir.includes('node_modules') && !dir.includes('examples')) {
    return true; // Skip traversing top-level node_modules or .git for speed
  }
  return false;
}

function traverse(dir: string) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (e) {
    return;
  }
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relPath = path.relative(repoRoot, fullPath).replace(/\\/g, '/');

    if (entry.isDirectory()) {
      if (shouldIgnoreDir(fullPath)) continue;
      
      let matchedA = false;
      for (const p of groupAPatterns) {
        if (p.test(relPath + '/')) {
          groups.A.push(relPath);
          matchedA = true;
          break;
        }
      }
      for (const p of groupDPatterns) {
        if (!matchedA && p.test(relPath + '/')) {
          groups.D.push(relPath);
          matchedA = true; // prevent traversal
          break;
        }
      }
      
      if (!matchedA) {
        traverse(fullPath);
      }
    } else {
      let categorized = false;
      
      // Group A Check
      for (const p of groupAPatterns) {
        if (p.test(relPath)) {
          groups.A.push(relPath);
          categorized = true;
          break;
        }
      }
      
      if (categorized) continue;

      // Group B Check (leftover js/d.ts next to ts inside src/test)
      if (relPath.includes('src/') || relPath.includes('test/')) {
        if (entry.name.endsWith('.js') || entry.name.endsWith('.js.map') || entry.name.endsWith('.d.ts') || entry.name.endsWith('.d.ts.map')) {
          groups.B.push(relPath);
          categorized = true;
        }
      }

      if (categorized) continue;

      // Group C Check
      for (const p of groupCPatterns) {
        if (p.test(relPath)) {
          groups.C.push(relPath);
          categorized = true;
          break;
        }
      }

      if (categorized) continue;

      // Group D Check
      for (const p of groupDPatterns) {
        if (p.test(relPath)) {
          groups.D.push(relPath);
          categorized = true;
          break;
        }
      }
    }
  }
}

traverse(repoRoot);
fs.writeFileSync('cleanup-dry-run.json', JSON.stringify(groups, null, 2));
console.log('Dry run completed. Output written to cleanup-dry-run.json');
