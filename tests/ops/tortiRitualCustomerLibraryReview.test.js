const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '../..');
const appSource = fs.readFileSync(path.join(ROOT, 'public/torti-ritual/app.js'), 'utf8');
const cssSource = fs.readFileSync(path.join(ROOT, 'public/torti-ritual/styles.css'), 'utf8');
const htmlSource = fs.readFileSync(path.join(ROOT, 'public/torti-ritual/index.html'), 'utf8');

test('Torti customer library review CTA covers empty, layer-build and portal-review states', () => {
  assert.match(appSource, /const placedLibraryCount = ownedItems\.filter/);
  assert.match(appSource, /const reviewTarget = !hasLibraryItems \? "collections" : placedLibraryCount > 0 \? "portal" : "layers";/);
  assert.match(appSource, /\? "Browse bottles"/);
  assert.match(appSource, /\? "Review portal"/);
  assert.match(appSource, /: "Build layers";/);
  assert.match(appSource, /data-review-library-target="\$\{escapeHtml\(reviewTarget\)\}"/);
  assert.match(appSource, /target === "collections"[\s\S]*\? "\.library-strip"/);
  assert.match(appSource, /target === "portal"[\s\S]*\? "\[data-portal-panel\]"/);
  assert.match(appSource, /placedCount: placedLibraryCount/);
});

test('Torti customer library review strip has distinct copy for all review states', () => {
  assert.match(appSource, /Start with the purchased bottles/);
  assert.match(appSource, /Build from the customer library/);
  assert.match(appSource, /Layer draft is ready to review/);
  assert.match(appSource, /Choose bottles from the collections below before building a customer layer\./);
  assert.match(appSource, /Select one and place it into the active layer\./);
  assert.match(appSource, /Review the portal flow before sharing\./);
  assert.match(appSource, /No bottles yet/);
  assert.match(appSource, /No layer placement yet/);
});

test('Torti customer library review styling and cache-busters are wired', () => {
  assert.match(cssSource, /\.library-review-strip\s*\{/);
  assert.match(cssSource, /\.library-review-kicker\s*\{/);
  assert.match(cssSource, /background: rgba\(252, 248, 244, 0\.88\);/);
  assert.match(htmlSource, /styles\.css\?v=20260516-portal-flow-cleanup/);
  assert.match(htmlSource, /app\.js\?v=20260516-portal-flow-cleanup/);
});

test('Torti portal viewed badge uses every persisted viewed signal', () => {
  assert.match(appSource, /const portalViewedEvent = portalEvents\.find/);
  assert.match(appSource, /eventType === "customer viewed"/);
  assert.match(appSource, /eventType === "version viewed"/);
  assert.match(appSource, /const portalViewedAt =/);
  assert.match(appSource, /normalizeText\(record\.viewedAt\)/);
  assert.match(appSource, /normalizeText\(record\.lastViewedAt\)/);
  assert.match(appSource, /normalizeText\(latestVersion && latestVersion\.viewedAt\)/);
  assert.match(appSource, /portalViewedAt \? `Seen \$\{formatPortalMoment\(portalViewedAt\)\}` : "Not opened yet"/);
});

test('Torti portal workspace has one directed flow and hides build tools in customer view', () => {
  assert.match(appSource, /const portalFlowSteps = \[/);
  assert.match(appSource, /label: "Build"/);
  assert.match(appSource, /label: "Published"/);
  assert.match(appSource, /label: "Seen"/);
  assert.match(appSource, /label: "Acknowledged"/);
  assert.match(appSource, /data-return-build/);
  assert.match(appSource, /portal return build/);
  assert.match(appSource, /Review and share/);
  assert.match(appSource, /Customer status/);
  assert.match(cssSource, /\.portal-flow-steps\s*\{/);
  assert.match(cssSource, /\.portal-flow-step\.is-current\s*\{/);
  assert.match(cssSource, /\.sheet-app\.is-customer-portal-view \.library-strip/);
});
