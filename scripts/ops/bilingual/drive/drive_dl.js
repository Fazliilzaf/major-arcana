const fs = require('fs'),
  crypto = require('crypto'),
  https = require('https');
const sa = JSON.parse(fs.readFileSync('/Users/fazlikrasniqi/secrets/arcana-drive-sa.json', 'utf8'));
const now = Math.floor(Date.now() / 1000);
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt =
  b64({ alg: 'RS256', typ: 'JWT', kid: sa.private_key_id }) +
  '.' +
  b64({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/drive.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  });
const sign = crypto.createSign('RSA-SHA256');
sign.update(jwt.split('.')[0] + '.' + jwt.split('.')[1]);
sign.end();
const full = jwt + '.' + sign.sign(sa.private_key, 'base64url');
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
          'https://www.googleapis.com/drive/v3/files/' + process.argv[2] + '?alt=media',
          { headers: { Authorization: 'Bearer ' + tok } },
          (r2) => {
            const out = fs.createWriteStream(process.argv[3]);
            r2.pipe(out);
            out.on('finish', () =>
              console.log('nedladdad', process.argv[3], fs.statSync(process.argv[3]).size)
            );
          }
        );
      });
    }
  )
  .end(
    JSON.stringify({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: full })
  );
