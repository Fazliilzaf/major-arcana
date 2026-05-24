const test = require('node:test');
const assert = require('node:assert/strict');
const { describeMigrationFileStreamability } = require('../../scripts/migration/lib/migrationUtils');

test('describeMigrationFileStreamability — driveFileId gör fil streambar när Drive är konfigurerad', () => {
  const result = describeMigrationFileStreamability(
    { driveFileId: 'abc123', zipName: '' },
    { driveConfigured: true }
  );
  assert.equal(result.streamable, true);
  assert.equal(result.driveLinkMissing, false);
});

test('describeMigrationFileStreamability — saknar driveFileId flaggas när Drive är konfigurerad', () => {
  const result = describeMigrationFileStreamability(
    { driveFileId: '', zipName: 'legacy.zip' },
    { driveConfigured: true }
  );
  assert.equal(result.streamable, true);
  assert.equal(result.driveLinkMissing, true);
});

test('describeMigrationFileStreamability — folder-källa utan driveFileId är streambar', () => {
  const result = describeMigrationFileStreamability(
    { source: 'folder', folderRoot: '/tmp/journal', driveFileId: '' },
    { driveConfigured: true }
  );
  assert.equal(result.streamable, true);
  assert.equal(result.driveLinkMissing, false);
});
