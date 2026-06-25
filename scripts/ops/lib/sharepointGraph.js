'use strict';

const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: path.resolve(__dirname, '../../../.env'), quiet: true });

const DRIVE_ID =
  process.env.ARCANA_SHAREPOINT_DRIVE_ID ||
  'b!J9ysU7x080-442YSpY3ck-umNLLDGMRNtOxNUKIJiFmCSMH3wxTSTYHwSsJ7Gy2C';

const BASE = `https://graph.microsoft.com/v1.0/drives/${DRIVE_ID}`;

async function getToken() {
  const tenantId = process.env.ARCANA_GRAPH_TENANT_ID;
  const clientId = process.env.ARCANA_GRAPH_CLIENT_ID;
  const clientSecret = process.env.ARCANA_GRAPH_CLIENT_SECRET;
  if (!tenantId || !clientId || !clientSecret) {
    return null;
  }
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials',
  });
  const res = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const json = await res.json();
  if (!res.ok || !json.access_token) {
    throw new Error(`Graph token misslyckades: ${json.error || res.status}`);
  }
  return json.access_token;
}

async function graphGet(url, token) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Graph GET ${url} → ${res.status}: ${text.slice(0, 400)}`);
  }
  return res.json();
}

function encodeItemPath(relativePath) {
  return relativePath
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

async function getItemByPath(token, relativeFolder, fileName) {
  const itemPath = `${relativeFolder}/${fileName}`.replace(/\/+/g, '/');
  const url = `${BASE}/root:/${encodeItemPath(itemPath)}`;
  return graphGet(url, token);
}

async function listChildren(token, relativeFolder) {
  const url = `${BASE}/root:/${encodeItemPath(relativeFolder)}:/children?$select=id,name,size,lastModifiedDateTime,file,webUrl`;
  const json = await graphGet(url, token);
  return json.value || [];
}

async function downloadItemContent(token, itemId, destPath) {
  const url = `${BASE}/items/${itemId}/content`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    throw new Error(`Graph download ${itemId} → ${res.status}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  fs.writeFileSync(destPath, buf);
  return buf;
}

module.exports = {
  DRIVE_ID,
  getToken,
  getItemByPath,
  listChildren,
  downloadItemContent,
};
