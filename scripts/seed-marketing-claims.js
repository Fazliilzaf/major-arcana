#!/usr/bin/env node
'use strict';

const { config } = require('../src/config');
const { createMarketingClaimsWhitelistStore } = require('../src/ops/marketingClaimsWhitelistStore');

async function main() {
  const store = await createMarketingClaimsWhitelistStore({
    filePath: config.marketingClaimsWhitelistPath,
  });
  const result = await store.ensureSeedDefaults();
  const claims = await store.listClaims();
  console.log(
    `Marketing claims whitelist ${result.seeded ? 'seeded' : 'already present'} — ${claims.length} claims at ${store.filePath}`
  );
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exitCode = 1;
});
