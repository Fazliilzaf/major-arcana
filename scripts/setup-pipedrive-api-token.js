#!/usr/bin/env node
'use strict';

require('dotenv').config({ quiet: true });

const fs = require('node:fs');
const path = require('node:path');

function upsertEnvLine(content, key, value) {
  const line = `${key}=${value}`;
  const re = new RegExp(`^${key}=.*$`, 'm');
  if (re.test(content)) return content.replace(re, line);
  const trimmed = content.replace(/\s*$/, '');
  return `${trimmed}${trimmed.endsWith('\n') || !trimmed ? '' : '\n'}${line}\n`;
}

function parseArgs(argv) {
  const args = {
    token: '',
    domain: 'hairtpclinic2',
    envPath: path.join(process.cwd(), '.env'),
    secondary: false,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--token') args.token = argv[++i];
    else if (token === '--domain') args.domain = argv[++i];
    else if (token === '--env') args.envPath = argv[++i];
    else if (token === '--secondary') args.secondary = true;
  }
  return args;
}

async function validateToken(token, domain) {
  const url = new URL(`https://${domain}.pipedrive.com/api/v1/users/me`);
  url.searchParams.set('api_token', token);
  const res = await fetch(url);
  const payload = await res.json().catch(() => ({}));
  if (!res.ok || payload.success === false) {
    throw new Error(payload.error || payload.error_info || `HTTP ${res.status}`);
  }
  return payload.data;
}

async function main() {
  const args = parseArgs(process.argv);
  let token = args.token.trim();
  if (!token) {
    token = fs.readFileSync(0, 'utf8').trim();
  }
  if (!token) {
    throw new Error('Saknar token. Använd --token <token> eller pipe stdin.');
  }
  const user = await validateToken(token, args.domain);
  const envRaw = fs.existsSync(args.envPath) ? fs.readFileSync(args.envPath, 'utf8') : '';
  const key = args.secondary ? 'PIPEDRIVE_API_TOKEN_SECONDARY' : 'PIPEDRIVE_API_TOKEN';
  let next = upsertEnvLine(envRaw, key, token);
  next = upsertEnvLine(next, 'PIPEDRIVE_COMPANY_DOMAIN', args.domain);
  fs.writeFileSync(args.envPath, next, 'utf8');
  console.log(`OK — ${key} för ${user.name} <${user.email}> (user_id=${user.id})`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
