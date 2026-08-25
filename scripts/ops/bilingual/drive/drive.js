const fs = require('fs'),
  crypto = require('crypto'),
  https = require('https');
const sa = JSON.parse(fs.readFileSync('/Users/fazlikrasniqi/secrets/arcana-drive-sa.json', 'utf8'));
const now = Math.floor(Date.now() / 1000);
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const h = b64({ alg: 'RS256', typ: 'JWT', kid: sa.private_key_id });
const c = b64({
  iss: sa.client_email,
  scope: 'https://www.googleapis.com/auth/drive.readonly',
  aud: 'https://oauth2.googleapis.com/token',
  iat: now,
  exp: now + 3600,
});
const sign = crypto.createSign('RSA-SHA256');
sign.update(h + '.' + c);
sign.end();
const sig = sign.sign(sa.private_key, 'base64url');
const jwt = h + '.' + c + '.' + sig;
const q = (method, path, body) =>
  new Promise((res, rej) => {
    const data = body ? JSON.stringify(body) : null;
    const req = https.request(
      'https://oauth2.googleapis.com' + path,
      {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
        },
      },
      (r) => {
        let b = '';
        r.on('data', (d) => (b += d));
        r.on('end', () => res({ status: r.statusCode, body: JSON.parse(b || '{}') }));
      }
    );
    req.on('error', rej);
    if (data) req.write(data);
    req.end();
  });
(async () => {
  const t = await q('POST', '/token', {
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion: jwt,
  });
  const tok = t.body.access_token;
  if (!tok) {
    console.log('TOKEN-FEL', t.status, JSON.stringify(t.body).slice(0, 200));
    return;
  }
  const l = await new Promise((res, rej) => {
    const qq =
      '/drive/v3/files?q=%2717qIS-lo4e2Qy0VHfqneZEX7cdrhQuMVW%27+in+parents&pageSize=100&fields=files(id,name,mimeType,size)&supportsAllDrives=true&includeItemsFromAllDrives=true';
    https
      .get(
        'https://www.googleapis.com' + qq,
        { headers: { Authorization: 'Bearer ' + tok } },
        (r) => {
          let b = '';
          r.on('data', (d) => (b += d));
          r.on('end', () => res(JSON.parse(b)));
        }
      )
      .on('error', rej);
  });
  const files = l.files || [];
  console.log('antal filer (Färdiga):', files.length);
  for (const f of files) console.log(' -', f.name, '|', f.mimeType, '|', f.size);
})();
