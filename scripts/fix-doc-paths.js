#!/usr/bin/env node
/**
 * Ersätt stale Desktop/Arcana-sökvägar med repo-relativa paths i docs/.
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const DOCS = path.join(ROOT, 'docs');

function walkMd(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) walkMd(full, out);
    else if (name.endsWith('.md')) out.push(full);
  }
  return out;
}

function repoRel(fromFile, targetPath) {
  const rel = path.relative(path.dirname(fromFile), path.join(ROOT, targetPath)).replace(/\\/g, '/');
  return rel.startsWith('.') ? rel : `./${rel}`;
}

function fixContent(file, content) {
  let next = content;

  next = next.replace(/\/Users\/fazlikrasniqi\/Desktop\/Arcana\//g, '');
  next = next.replace(
    /\/Users\/fazlikrasniqi\/Library\/Mobile Documents\/com~apple~CloudDocs\/Hairtpclinic webb\/next-app\//g,
    'hairtpclinic-web (extern Next.js-repo, Vercel) — '
  );
  next = next.replace(
    /\/Users\/fazlikrasniqi\/Desktop\/Arcana-archive\//g,
    'extern arkiv (ej i repo): '
  );

  // Markdown-länkar till filer i repot → relativt från aktuell doc.
  next = next.replace(/\]\(((?:public|src|vendor|tests|docs|server\.js)[^)]*)\)/g, (match, target) => {
    const normalized = target.replace(/^\.\//, '');
    if (normalized.startsWith('http')) return match;
    return `](${repoRel(file, normalized)})`;
  });

  // [`path`](path) med samma repo-root path
  next = next.replace(
    /\[(`(?:public|src|vendor|tests|docs|server\.js)[^`]*`)\]\(([^)]+)\)/g,
    (match, label, target) => {
      const normalized = target.replace(/^\.\//, '');
      if (normalized.startsWith('http')) return match;
      return `[${label}](${repoRel(file, normalized)})`;
    }
  );

  // docs/strategy/foo.md länkar från docs/strategy/ → ./foo.md
  if (file.includes(`${path.sep}docs${path.sep}strategy${path.sep}`)) {
    next = next.replace(
      /\]\(\.\.\/\.\.\/docs\/strategy\/([^)]+)\)/g,
      '](./$1)'
    );
  }

  // docs/foo.md länkar från docs/ root
  if (path.dirname(file) === DOCS) {
    next = next.replace(/\]\(\.\.\/docs\/([^)]+)\)/g, '](./$1)');
  }

  return next;
}

const files = walkMd(DOCS);
let changed = 0;
for (const file of files) {
  const before = fs.readFileSync(file, 'utf8');
  const after = fixContent(file, before);
  if (after !== before) {
    fs.writeFileSync(file, after);
    changed += 1;
    console.log(path.relative(ROOT, file));
  }
}
console.log(`\n✅ ${changed} fil(er) uppdaterade`);
