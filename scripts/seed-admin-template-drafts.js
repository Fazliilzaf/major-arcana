#!/usr/bin/env node
'use strict';

const path = require('node:path');

const config = require('../src/config');
const { createTemplateStore } = require('../src/templates/store');
const { ensureAdminTemplateDrafts } = require('../src/ops/adminTemplateSeeds');

async function main() {
  const tenantId = process.env.ARCANA_SEED_TENANT_ID || 'default';
  const templatePath =
    config.templateStorePath ||
    path.join(__dirname, '..', 'data', 'templates.json');
  const templateStore = await createTemplateStore({
    filePath: path.resolve(templatePath),
  });
  const result = await ensureAdminTemplateDrafts({
    templateStore,
    tenantId,
    createdBy: 'seed-admin-template-drafts',
  });
  console.log(JSON.stringify({ ok: true, tenantId, ...result }, null, 2));
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
