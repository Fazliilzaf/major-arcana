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
const jwt = h + '.' + c + '.' + sign.sign(sa.private_key, 'base64url');
https
  .request(
    'https://oauth2.googleapis.com/token',
    { method: 'POST', headers: { 'Content-Type': 'application/json' } },
    (r) => {
      let b = '';
      r.on('data', (d) => (b += d));
      r.on('end', () => {
        const tok = JSON.parse(b).access_token;
        https.get(
          'https://www.googleapis.com/drive/v3/files?q=%2717qIS-lo4e2Qy0VHfqneZEX7cdrhQuMVW%27+in+parents&pageSize=100&fields=files(id,name,mimeType,size)&supportsAllDrives=true&includeItemsFromAllDrives=true',
          { headers: { Authorization: 'Bearer ' + tok } },
          (r2) => {
            let b2 = '';
            r2.on('data', (d) => (b2 += d));
            r2.on('end', () => {
              const f = JSON.parse(b2).files;
              f.forEach((x) => console.log(x.id + ' | ' + x.name));
            });
          }
        );
      });
    }
  )
  .end(
    JSON.stringify({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt })
  );
