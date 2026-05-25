'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.readonly';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const FILES_URL = 'https://www.googleapis.com/drive/v3/files';

function loadServiceAccountJson(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const parsed = JSON.parse(raw);
  if (!parsed.client_email || !parsed.private_key) {
    throw new Error('Service account JSON saknar client_email eller private_key.');
  }
  return parsed;
}

function base64Url(value) {
  return Buffer.from(value)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function createSignedJwt(serviceAccount) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = base64Url(
    JSON.stringify({
      iss: serviceAccount.client_email,
      scope: DRIVE_SCOPE,
      aud: TOKEN_URL,
      iat: now,
      exp: now + 3600,
    })
  );
  const unsigned = `${header}.${payload}`;
  const signature = crypto
    .createSign('RSA-SHA256')
    .update(unsigned)
    .sign(serviceAccount.private_key);
  return `${unsigned}.${base64Url(signature)}`;
}

async function getAccessToken(serviceAccount) {
  const assertion = createSignedJwt(serviceAccount);
  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion,
  });
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const payload = await response.json();
  if (!response.ok || !payload.access_token) {
    throw new Error(payload.error_description || payload.error || 'Kunde inte hämta Drive access token.');
  }
  return payload.access_token;
}

const DRIVE_FETCH_TIMEOUT_MS = Math.max(
  15000,
  Number.parseInt(process.env.ARCANA_DRIVE_API_FETCH_TIMEOUT_MS || '120000', 10) || 120000
);

async function fetchWithTimeout(url, options = {}, timeoutMs = DRIVE_FETCH_TIMEOUT_MS) {
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timeoutId = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    return await fetch(url, controller ? { ...options, signal: controller.signal } : options);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

async function listChildrenPage({ accessToken, folderId, pageToken = '' }) {
  const params = new URLSearchParams({
    q: `'${folderId}' in parents and trashed=false`,
    fields: 'nextPageToken,files(id,name,mimeType,webViewLink,modifiedTime,size)',
    pageSize: '1000',
    supportsAllDrives: 'true',
    includeItemsFromAllDrives: 'true',
  });
  if (pageToken) params.set('pageToken', pageToken);

  const response = await fetchWithTimeout(`${FILES_URL}?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const payload = await response.json();
  if (!response.ok) {
    const err = new Error(payload.error?.message || 'Drive files.list misslyckades.');
    err.status = response.status;
    err.authError =
      response.status === 401 ||
      payload.error?.message?.includes('invalid authentication credentials');
    throw err;
  }
  return payload;
}

async function listChildren({ accessToken, folderId, pageToken = '', serviceAccount = null }) {
  try {
    return await listChildrenPage({ accessToken, folderId, pageToken });
  } catch (error) {
    if (!serviceAccount || !error.authError) {
      throw error;
    }
    const freshToken = await getAccessToken(serviceAccount);
    return {
      ...(await listChildrenPage({ accessToken: freshToken, folderId, pageToken })),
      accessToken: freshToken,
    };
  }
}

async function getFolderMetadata({ accessToken, folderId }) {
  const params = new URLSearchParams({
    fields: 'id,name,mimeType,modifiedTime',
    supportsAllDrives: 'true',
  });
  const response = await fetch(`${FILES_URL}/${encodeURIComponent(folderId)}?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error?.message || 'Drive files.get misslyckades.');
  }

  const childPage = await listChildrenPage({ accessToken, folderId });
  return {
    id: payload.id,
    name: payload.name || '',
    mimeType: payload.mimeType || '',
    modifiedTime: payload.modifiedTime || '',
    childCount: Array.isArray(childPage.files) ? childPage.files.length : 0,
  };
}

async function listAllDriveFiles({
  accessToken,
  rootFolderId,
  onProgress,
  maxFolders = 0,
  serviceAccount = null,
}) {
  const files = [];
  const folders = [{ id: rootFolderId, relativePath: '' }];
  let folderCount = 0;
  let token = accessToken;
  let tokenFetchedAt = Date.now();

  async function ensureFreshToken() {
    if (!serviceAccount) return token;
    if (Date.now() - tokenFetchedAt < 50 * 60 * 1000) return token;
    token = await getAccessToken(serviceAccount);
    tokenFetchedAt = Date.now();
    return token;
  }

  while (folders.length) {
    const folder = folders.pop();
    folderCount += 1;
    if (maxFolders > 0 && folderCount > maxFolders) {
      break;
    }
    if (onProgress && folderCount % 25 === 0) {
      onProgress({ foldersScanned: folderCount, filesIndexed: files.length });
    }

    let pageToken = '';
    do {
      token = await ensureFreshToken();
      const page = await listChildren({
        accessToken: token,
        folderId: folder.id,
        pageToken,
        serviceAccount,
      });
      if (page.accessToken) {
        token = page.accessToken;
        tokenFetchedAt = Date.now();
      }
      for (const item of page.files || []) {
        const relativePath = folder.relativePath ? `${folder.relativePath}/${item.name}` : item.name;
        if (item.mimeType === 'application/vnd.google-apps.folder') {
          if (maxFolders <= 0 || folderCount < maxFolders) {
            folders.push({ id: item.id, relativePath });
          }
          continue;
        }
        files.push({
          driveFileId: item.id,
          relativePath,
          mimeType: item.mimeType || '',
          webViewLink: item.webViewLink || '',
          modifiedTime: item.modifiedTime || '',
          size: item.size || '',
        });
      }
      pageToken = page.nextPageToken || '';
    } while (pageToken);
  }

  return files;
}

async function openDriveFileReadStream({ accessToken, driveFileId }) {
  const params = new URLSearchParams({
    alt: 'media',
    supportsAllDrives: 'true',
  });
  const response = await fetch(`${FILES_URL}/${encodeURIComponent(driveFileId)}?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const err = new Error(payload.error?.message || `Drive files.get misslyckades (${response.status}).`);
    err.status = response.status;
    throw err;
  }
  if (!response.body) {
    throw new Error('Drive files.get returnerade ingen body.');
  }
  return response;
}

module.exports = {
  getAccessToken,
  getFolderMetadata,
  listAllDriveFiles,
  listChildren,
  listChildrenPage,
  loadServiceAccountJson,
  openDriveFileReadStream,
};
