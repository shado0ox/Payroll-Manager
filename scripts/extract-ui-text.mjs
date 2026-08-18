import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const root = path.resolve('src');
const values = new Set();
const hasArabic = value => /[\u0600-\u06ff]/.test(value);
const add = value => {
  const normalized = String(value).replace(/\s+/g, ' ').trim();
  if (normalized && hasArabic(normalized) && normalized.length <= 500) values.add(normalized);
};
const walkFiles = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
  const full = path.join(dir, entry.name);
  return entry.isDirectory() ? walkFiles(full) : /\.(ts|tsx)$/.test(entry.name) && !full.includes('generatedTranslations') ? [full] : [];
});

for (const file of walkFiles(root)) {
  const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const visit = node => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isJsxText(node)) add(node.text);
    if (ts.isTemplateExpression(node)) {
      add(node.head.text);
      for (const span of node.templateSpans) add(span.literal.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
}

fs.writeFileSync('/tmp/masar-ui-arabic.json', JSON.stringify([...values].sort((a, b) => b.length - a.length), null, 2));
console.log(`Extracted ${values.size} Arabic UI text fragments`);
