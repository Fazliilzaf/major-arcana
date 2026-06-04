const { createCcoMailboxTruthStore } = require('./ccoMailboxTruthStore');
const { createCcoMailboxTruthShardedStore } = require('./ccoMailboxTruthShardedStore');

async function createConfiguredCcoMailboxTruthStore(config = {}) {
  if (config.ccoMailboxTruthSharded !== false) {
    return createCcoMailboxTruthShardedStore({
      baseDir: config.ccoMailboxTruthShardDir,
      legacyFilePath: config.ccoMailboxTruthStorePath,
      lazyPreload: config.ccoMailboxTruthLazyPreload !== false,
    });
  }
  return createCcoMailboxTruthStore({
    filePath: config.ccoMailboxTruthStorePath,
    deferConversationRebuild: true,
  });
}

module.exports = {
  createConfiguredCcoMailboxTruthStore,
};
