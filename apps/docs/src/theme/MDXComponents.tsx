// BETA-FIX W4 · the pages are plain Markdown in docs/ (no MDX imports), so the components they may use are registered
// here. `<!-- qualification: <id> -->` in a page becomes <QualificationContext capabilityId="<id>" /> (plugins/markdown.mjs).
import MDXComponents from '@theme-original/MDXComponents';
import QualificationContext from '@site/src/components/QualificationContext';

export default {
  ...MDXComponents,
  QualificationContext,
};
