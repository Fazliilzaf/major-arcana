const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

function normalizeColor(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return trimmed;
  if (trimmed.startsWith('#')) return trimmed.toLowerCase();
  return trimmed.replace(/\s+/g, ' ');
}

function findStyleBlock(html) {
  const match = html.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
  if (!match) {
    throw new Error('Hittade inget <style>-block i public/admin.html');
  }
  return match[1];
}

function parseRootTokens(css) {
  const rootMatch = css.match(/:root\s*{([\s\S]*?)}/);
  if (!rootMatch) return [];
  const body = rootMatch[1];
  const tokenRegex = /--([A-Za-z0-9_-]+)\s*:\s*([^;]+);/g;
  const tokens = [];
  let match;
  while ((match = tokenRegex.exec(body))) {
    tokens.push({
      name: match[1],
      value: match[2].trim(),
    });
  }
  return tokens;
}

function parseCssUsage(css) {
  const lines = css.split('\n');
  const tokenUsage = new Map();
  const colorUsage = new Map();
  const stack = [];

  const pickCurrentSelector = () => {
    for (let index = stack.length - 1; index >= 0; index -= 1) {
      const selector = stack[index];
      if (!selector.startsWith('@')) return selector;
    }
    return stack[stack.length - 1] || 'global';
  };

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    const trimmed = line.trim();
    const lineNo = lineIndex + 1;

    if (trimmed.includes('{')) {
      const selector = trimmed.split('{')[0].trim();
      if (selector) {
        stack.push(selector);
      } else {
        stack.push(stack[stack.length - 1] || 'global');
      }
    }

    const selector = pickCurrentSelector();

    const varRegex = /var\(--([A-Za-z0-9_-]+)\)/g;
    let varMatch;
    while ((varMatch = varRegex.exec(line))) {
      const tokenName = varMatch[1];
      const current = tokenUsage.get(tokenName) || {
        count: 0,
        selectors: new Set(),
        lines: [],
      };
      current.count += 1;
      current.selectors.add(selector);
      if (current.lines.length < 10) {
        current.lines.push(lineNo);
      }
      tokenUsage.set(tokenName, current);
    }

    const colorRegex = /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]+\)|hsla?\([^)]+\)/g;
    let colorMatch;
    while ((colorMatch = colorRegex.exec(line))) {
      const color = normalizeColor(colorMatch[0]);
      const current = colorUsage.get(color) || {
        count: 0,
        selectors: new Set(),
        lines: [],
      };
      current.count += 1;
      current.selectors.add(selector);
      if (current.lines.length < 8) {
        current.lines.push(lineNo);
      }
      colorUsage.set(color, current);
    }

    if (trimmed.includes('}')) {
      const closeCount = (trimmed.match(/}/g) || []).length;
      for (let index = 0; index < closeCount; index += 1) {
        stack.pop();
      }
    }
  }

  return { tokenUsage, colorUsage };
}

function firstSelectors(selectors, limit = 5) {
  return Array.from(selectors)
    .map((value) => value.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .slice(0, limit)
    .join(', ') || '—';
}

function firstLines(lines, limit = 6) {
  return lines.slice(0, limit).join(', ');
}

function firstColorInValue(value) {
  const match = String(value || '').match(/#[0-9a-fA-F]{3,8}\b|rgba?\([^)]+\)|hsla?\([^)]+\)/);
  return match ? normalizeColor(match[0]) : null;
}

function escapePipe(value) {
  return String(value || '').replace(/\|/g, '\\|');
}

function createMarkdown({ timestamp, sourcePath, tokens, tokenUsage, colorUsage }) {
  const tokenRows = tokens.map((token) => {
    const usage = tokenUsage.get(token.name);
    const count = usage ? usage.count : 0;
    const selectors = usage ? firstSelectors(usage.selectors) : '—';
    return `| \`--${token.name}\` | \`${escapePipe(token.value)}\` | ${count} | ${escapePipe(selectors)} |`;
  });

  const colorRows = Array.from(colorUsage.entries())
    .sort((left, right) => right[1].count - left[1].count || left[0].localeCompare(right[0]))
    .map(([color, usage]) => {
      const selectors = firstSelectors(usage.selectors);
      const lines = firstLines(usage.lines);
      return `| \`${escapePipe(color)}\` | ${usage.count} | ${escapePipe(selectors)} | ${lines} |`;
    });

  return [
    '# Major Arcana – Färginventering',
    '',
    `- Genererad: ${timestamp}`,
    `- Källa: \`${sourcePath}\``,
    '- Scope: CSS i `public/admin.html` `<style>`-block',
    '',
    '## 1) Design tokens i :root',
    '',
    '| Token | Värde | `var()` träffar | Exempel på selektorer |',
    '|---|---|---:|---|',
    ...tokenRows,
    '',
    '## 2) Alla färgkoder som används (literals)',
    '',
    '| Färgkod | Antal träffar | Exempel på selektorer | Linjer (första 6) |',
    '|---|---:|---|---|',
    ...colorRows,
    '',
    '## 3) Visuell palett',
    '',
    '- SVG: `docs/major-arcana-color-palette.svg`',
    '- PNG: `docs/major-arcana-color-palette.png`',
  ].join('\n');
}

function createPaletteSvg(tokens) {
  const swatches = tokens
    .map((token) => {
      const fill = firstColorInValue(token.value) || '#111';
      return {
        name: `--${token.name}`,
        value: token.value,
        fill,
      };
    });

  const columns = 4;
  const cardWidth = 360;
  const cardHeight = 120;
  const margin = 24;
  const gap = 18;
  const rows = Math.ceil(swatches.length / columns);
  const width = (margin * 2) + (columns * cardWidth) + ((columns - 1) * gap);
  const headerHeight = 80;
  const height = headerHeight + (rows * cardHeight) + ((rows - 1) * gap) + (margin * 2);

  const cards = swatches.map((swatch, index) => {
    const row = Math.floor(index / columns);
    const col = index % columns;
    const x = margin + (col * (cardWidth + gap));
    const y = headerHeight + margin + (row * (cardHeight + gap));
    return `
      <g transform="translate(${x},${y})">
        <rect x="0" y="0" width="${cardWidth}" height="${cardHeight}" rx="16" fill="rgba(32,34,38,0.96)" stroke="rgba(255,255,255,0.12)" />
        <rect x="16" y="16" width="84" height="84" rx="12" fill="${swatch.fill}" stroke="rgba(255,255,255,0.38)" />
        <text x="116" y="44" fill="#f7f3ef" font-family="Jost, Inter, Arial" font-size="30" font-weight="600">${swatch.name}</text>
        <text x="116" y="82" fill="rgba(233,223,213,0.95)" font-family="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" font-size="24">${swatch.value.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</text>
      </g>
    `;
  }).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="bgGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#1f2024" />
      <stop offset="100%" stop-color="#17181c" />
    </linearGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#bgGrad)" />
  <text x="${margin}" y="52" fill="#f7f3ef" font-family="Jost, Inter, Arial" font-size="44" font-weight="700">Major Arcana – Färgpalett (Design Tokens)</text>
  ${cards}
</svg>`;
}

function commandExists(command) {
  try {
    execSync(`command -v ${command}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function main() {
  const root = process.cwd();
  const adminPath = path.join(root, 'public', 'admin.html');
  const docsDir = path.join(root, 'docs');
  const markdownPath = path.join(docsDir, 'major-arcana-color-inventory.md');
  const paletteSvgPath = path.join(docsDir, 'major-arcana-color-palette.svg');
  const palettePngPath = path.join(docsDir, 'major-arcana-color-palette.png');

  const html = fs.readFileSync(adminPath, 'utf8');
  const css = findStyleBlock(html);
  const tokens = parseRootTokens(css);
  const { tokenUsage, colorUsage } = parseCssUsage(css);

  fs.mkdirSync(docsDir, { recursive: true });

  const markdown = createMarkdown({
    timestamp: new Date().toISOString(),
    sourcePath: adminPath,
    tokens,
    tokenUsage,
    colorUsage,
  });
  fs.writeFileSync(markdownPath, `${markdown}\n`, 'utf8');

  const svg = createPaletteSvg(tokens);
  fs.writeFileSync(paletteSvgPath, svg, 'utf8');

  if (commandExists('sips')) {
    try {
      execSync(`sips -s format png "${paletteSvgPath}" --out "${palettePngPath}" >/dev/null`, {
        stdio: 'ignore',
      });
    } catch {
      if (!fs.existsSync(palettePngPath)) {
        fs.writeFileSync(palettePngPath, '');
      }
    }
  }

  console.log(`✅ Uppdaterat: ${path.relative(root, markdownPath)}`);
  console.log(`✅ Uppdaterat: ${path.relative(root, paletteSvgPath)}`);
  console.log(`✅ Uppdaterat: ${path.relative(root, palettePngPath)}`);
}

main();
