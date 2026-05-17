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
  assert.match(
    appSource,
    /const reviewTarget = !hasLibraryItems \? "collections" : placedLibraryCount > 0 \? "portal" : "layers";/
  );
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
  assert.match(
    appSource,
    /Choose bottles from the collections below before building a customer layer\./
  );
  assert.match(appSource, /Select one and place it into the active layer\./);
  assert.match(appSource, /Review the portal flow before sharing\./);
  assert.match(appSource, /No bottles yet/);
  assert.match(appSource, /No layer placement yet/);
});

test('Torti customer library review styling and cache-busters are wired', () => {
  assert.match(cssSource, /\.library-review-strip\s*\{/);
  assert.match(cssSource, /\.library-review-kicker\s*\{/);
  assert.match(cssSource, /background: rgba\(252, 248, 244, 0\.88\);/);
  assert.match(htmlSource, /styles\.css\?v=20260517-current-notice-status/);
  assert.match(htmlSource, /app\.js\?v=20260517-current-notice-status/);
});

test('Torti portal viewed badge uses every persisted viewed signal', () => {
  assert.match(appSource, /const portalViewedEvent = portalEvents\.find/);
  assert.match(appSource, /eventType === "customer viewed"/);
  assert.match(appSource, /eventType === "version viewed"/);
  assert.match(appSource, /const portalViewedAt =/);
  assert.match(appSource, /normalizeText\(record\.viewedAt\)/);
  assert.match(appSource, /normalizeText\(record\.lastViewedAt\)/);
  assert.match(appSource, /normalizeText\(latestVersion && latestVersion\.viewedAt\)/);
  assert.match(
    appSource,
    /portalViewedAt \? `Seen \$\{formatPortalMoment\(portalViewedAt\)\}` : "Not opened yet"/
  );
});

test('Torti portal workspace has one directed flow and hides build tools in customer view', () => {
  assert.match(appSource, /const ownerPortalFlowSteps = \[/);
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

test('Torti customer portal uses a compact two-column customer-only layout', () => {
  assert.match(appSource, /const customerPortalFlowSteps = ownerPortalFlowSteps\.filter/);
  assert.match(appSource, /customerOnlyView\s*\?\s*sharedPortalEvents\.slice\(0, 3\)/);
  assert.match(
    appSource,
    /const portalFlowSteps = customerOnlyView \? customerPortalFlowSteps : ownerPortalFlowSteps;/
  );
  assert.match(cssSource, /\.sheet-app\.is-customer-portal-view \.portal-panel\s*\{/);
  assert.match(cssSource, /grid-template-columns: minmax\(0, 1\.36fr\) minmax\(320px, 0\.64fr\);/);
  assert.match(cssSource, /\.sheet-app\.is-customer-portal-view \.portal-activity\s*\{/);
  assert.match(cssSource, /\.sheet-app\.is-customer-portal-view \.portal-flow-steps\s*\{/);
  assert.match(cssSource, /grid-template-columns: repeat\(3, minmax\(0, 1fr\)\);/);
});

test('Torti owner flow uses the desktop width before the document surface', () => {
  assert.match(cssSource, /\.composition-strip\s*\{/);
  assert.match(cssSource, /grid-template-columns: minmax\(0, 1\.35fr\) minmax\(320px, 0\.65fr\);/);
  assert.match(cssSource, /\.customer-library\s*\{[\s\S]*grid-column: 1;/);
  assert.match(cssSource, /\.layers-panel\s*\{[\s\S]*grid-column: 2;/);
  assert.match(cssSource, /\.zone-editor\s*\{[\s\S]*grid-column: 1 \/ -1;/);
  assert.match(cssSource, /\.portal-panel\s*\{[\s\S]*grid-column: 1 \/ -1;/);
  assert.match(cssSource, /\.layers-stack\s*\{[\s\S]*grid-template-columns: minmax\(0, 1fr\);/);
});

test('Torti portal navigation can restore the build workspace from customer view', () => {
  assert.match(appSource, /function updatePortalViewRoute\(portalView\)/);
  assert.match(appSource, /url\.searchParams\.delete\("portalView"\)/);
  assert.match(appSource, /function setPortalWorkspaceView\(portalView, scrollSelector\)/);
  assert.match(appSource, /state\.portalView = portalView === "customer" \? "customer" : "split";/);
  assert.match(appSource, /setPortalWorkspaceView\("split", "\.library-strip"\)/);
  assert.match(appSource, /setPortalWorkspaceView\("split", "\[data-layers-panel\]"\)/);
  assert.match(appSource, /restoredBuildView: wasCustomerPortalView/);
});

test('Torti Build layers handoff focuses the first owned bottle before scrolling to planner', () => {
  assert.match(appSource, /function prepareLibraryBuildHandoff\(ownedItems\)/);
  assert.match(appSource, /focusLibraryCatalog\(ownedItems\[0\]\.id\)/);
  assert.match(appSource, /const preparedBuildHandoff = target === "layers" \? prepareLibraryBuildHandoff\(ownedItems\) : false;/);
  assert.match(appSource, /preparedBuildHandoff\s*\?\s*"\[data-selected-bottle-panel\]"/);
  assert.match(appSource, /preparedBuildHandoff,/);
});

test('Torti zone planner exposes a compact portal handoff after spray areas are selected', () => {
  assert.match(appSource, /function jumpToPortalFlow\(source\)/);
  assert.match(appSource, /source,\s*\n\s*scrolled: didScroll/);
  assert.match(appSource, /const selectedZoneCount = activeBottle && Array\.isArray\(activeBottle\.zones\) \? activeBottle\.zones\.length : 0;/);
  assert.match(appSource, /data-zone-review-portal/);
  assert.match(appSource, /jumpToPortalFlow\("zone-planner"\)/);
  assert.match(cssSource, /\.zone-editor-actions\s*\{/);
  assert.match(cssSource, /\.zone-editor-actions-label\s*\{/);
});

test('Torti customer portal open persists the viewed signal without a manual owner click', () => {
  assert.match(appSource, /function markPortalViewedFromCustomerOpen\(snapshot, record\)/);
  assert.match(appSource, /const alreadyViewed = Boolean\(/);
  assert.match(appSource, /record\.lastViewedAt = now;/);
  assert.match(appSource, /latestVersion\.viewedAt = now;/);
  assert.match(appSource, /syncPortalRemoteAction\("viewed", snapshot\)/);
  assert.match(appSource, /if \(customerOnlyView\) \{\s*\n\s*markPortalViewedFromCustomerOpen\(snapshot, record\);/);
});

test('Torti customer portal lets the customer acknowledge the latest notice', () => {
  assert.match(appSource, /portal-card-actions portal-card-actions--customer/);
  assert.match(appSource, /data-ack-portal-notification\$\{currentUnreadCount > 0 \? "" : " disabled"\}>Acknowledge latest/);
  assert.match(appSource, /function getLatestUnreadPortalNotification\(record\)/);
  assert.match(appSource, /function getLatestPortalNotification\(record\)/);
  assert.match(appSource, /function getLatestPortalVersion\(record\)/);
  assert.match(appSource, /Date\.parse\(normalizeText\(right\.createdAt\)\) \|\| 0;/);
  assert.match(appSource, /Date\.parse\(normalizeText\(right\.publishedAt\) \|\| normalizeText\(right\.createdAt\)\) \|\| 0;/);
  assert.match(appSource, /Number\(right\.versionNumber\) \|\| 0/);
  assert.match(appSource, /const latestNotification = getLatestPortalNotification\(record\);/);
  assert.match(appSource, /const currentUnreadCount = latestNotification && !latestNotification\.readAt \? 1 : 0;/);
  assert.match(appSource, /const ackButton = portalPanel\.querySelector\("\[data-ack-portal-notification\]"\);/);
  assert.match(appSource, /const latestUnread = getLatestUnreadPortalNotification\(record\);/);
  assert.match(appSource, /const latestVersion = getLatestPortalVersion\(record\);/);
  assert.match(appSource, /acknowledgeLatestPortalNotification\(\);/);
  assert.match(cssSource, /\.portal-card-actions--customer\s*\{/);
});
