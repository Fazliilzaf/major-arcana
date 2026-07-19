const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const serverSource = fs.readFileSync(path.join(__dirname, '..', '..', 'server.js'), 'utf8');

test('prod-safe mail ingestion uses deferred facade during startup instead of eager store load', () => {
  assert.match(serverSource, /createDeferredCcoMailIngestionStore/);
  assert.match(serverSource, /prod_safe_deferred_boot/);
  assert.match(
    serverSource,
    /startup\sheal\suppskjuten:\sprod-safe\sdeferred\sstore\sladdas\sinte\svid\sboot/
  );

  const blockStart = serverSource.indexOf(
    "const ccoMailIngestionStore = await startupStep('ccoMailIngestionStore'"
  );
  const blockEnd = serverSource.indexOf(
    "const messageIntelligenceStore = await startupStep('messageIntelligenceStore'",
    blockStart
  );
  assert.notEqual(blockStart, -1, 'expected ccoMailIngestionStore startup block');
  assert.notEqual(blockEnd, -1, 'expected messageIntelligenceStore startup marker');
  const startupBlock = serverSource.slice(blockStart, blockEnd);
  assert.match(startupBlock, /prodSafeMode[\s\S]*createDeferredCcoMailIngestionStore/);
  assert.doesNotMatch(
    startupBlock,
    /prodSafeMode[\s\S]*createCcoMailIngestionStore\(\{[\s\S]*filePath: config\.ccoMailIngestionStorePath[\s\S]*\}\)[\s\S]*\?\s*createCcoMailIngestionStore/,
    'prod-safe branch must not eagerly materialize the heavy JSON store'
  );
});
