'use strict';

/**
 * ccoCriiptoIdToken — verifierar Criiptos `id_token` (RS256 JWT) mot JWKS innan
 * vi litar på personnumret. Utan detta kan ett förfalskat id_token teoretiskt
 * kringgå BankID-verifieringen. Se docs/cco-kundportal-bankid-criipto-runbook.md.
 *
 * Kontroller:
 *   - alg = RS256, kid finns i JWKS
 *   - signaturen validerar mot publik nyckel (JWK → RSA-SHA256)
 *   - iss === förväntad issuer (https://<domain>)
 *   - aud innehåller client_id
 *   - exp i framtiden (med liten klock-skew)
 *   - nonce === förväntad nonce (state-cookiens nonce)
 *
 * JWKS-hämtningen är injicerbar (`fetchJwks`) → enkel att enhetstesta utan nät.
 */

const crypto = require('node:crypto');

const CLOCK_SKEW_MS = 60 * 1000;

function text(v) {
  return typeof v === 'string' ? v.trim() : '';
}
function b64urlToString(str) {
  return Buffer.from(String(str), 'base64url').toString('utf8');
}
function decodeSegment(seg) {
  try {
    return JSON.parse(b64urlToString(seg));
  } catch {
    return null;
  }
}

/** Default JWKS-hämtare mot Criiptos OIDC-discovery. */
async function defaultFetchJwks(domain) {
  const host = text(domain)
    .replace(/^https?:\/\//, '')
    .replace(/\/+$/, '');
  const disc = await fetch(`https://${host}/.well-known/openid-configuration`);
  if (!disc.ok) throw new Error(`oidc_discovery_${disc.status}`);
  const config = await disc.json();
  const jwksUri = text(config.jwks_uri) || `https://${host}/.well-known/jwks`;
  const resp = await fetch(jwksUri);
  if (!resp.ok) throw new Error(`jwks_${resp.status}`);
  return resp.json();
}

function findJwk(jwks, kid) {
  const keys = Array.isArray(jwks && jwks.keys) ? jwks.keys : [];
  if (kid) {
    // kid angivet i headern → kräv exakt träff (fall inte tillbaka, det
    // skulle försvaga kid-kontrollen).
    return keys.find((k) => text(k.kid) === kid) || null;
  }
  // Bara när headern saknar kid: acceptera den enda RSA-nyckeln.
  const rsa = keys.filter((k) => text(k.kty) === 'RSA');
  return rsa.length === 1 ? rsa[0] : null;
}

function verifySignature(signingInput, signatureB64url, jwk) {
  try {
    const key = crypto.createPublicKey({ key: jwk, format: 'jwk' });
    return crypto.verify(
      'RSA-SHA256',
      Buffer.from(signingInput),
      key,
      Buffer.from(signatureB64url, 'base64url')
    );
  } catch {
    return false;
  }
}

function audienceMatches(aud, clientId) {
  if (Array.isArray(aud)) return aud.map(text).includes(clientId);
  return text(aud) === clientId;
}

/**
 * @param {string} idToken
 * @param {object} opts
 * @param {string} opts.domain          Criipto-domän (→ förväntad issuer)
 * @param {string} opts.clientId        förväntad aud
 * @param {string} [opts.nonce]         förväntad nonce (state-cookiens)
 * @param {string} [opts.expectedIssuer] override; default https://<domain>
 * @param {object} [opts.jwks]          injicerad JWKS (test)
 * @param {function} [opts.fetchJwks]   async (domain) => jwks
 * @param {number} [opts.nowMs]
 * @returns {Promise<{valid:boolean, reason?:string, claims?:object}>}
 */
async function verifyCriiptoIdToken(idToken, opts = {}) {
  const token = text(idToken);
  const clientId = text(opts.clientId);
  const domain = text(opts.domain)
    .replace(/^https?:\/\//, '')
    .replace(/\/+$/, '');
  const nowMs = Number.isFinite(opts.nowMs) ? opts.nowMs : Date.now();

  const parts = token.split('.');
  if (parts.length !== 3) return { valid: false, reason: 'malformed' };
  const header = decodeSegment(parts[0]);
  const claims = decodeSegment(parts[1]);
  if (!header || !claims) return { valid: false, reason: 'malformed' };
  if (text(header.alg) !== 'RS256') return { valid: false, reason: 'alg_not_rs256' };

  let jwks = opts.jwks;
  if (!jwks) {
    const fetcher = typeof opts.fetchJwks === 'function' ? opts.fetchJwks : defaultFetchJwks;
    try {
      jwks = await fetcher(domain);
    } catch (err) {
      return { valid: false, reason: `jwks_fetch_failed:${err.message}` };
    }
  }
  const jwk = findJwk(jwks, text(header.kid));
  if (!jwk) return { valid: false, reason: 'kid_not_found' };

  if (!verifySignature(`${parts[0]}.${parts[1]}`, parts[2], jwk)) {
    return { valid: false, reason: 'bad_signature' };
  }

  const expectedIssuer = text(opts.expectedIssuer) || `https://${domain}`;
  if (text(claims.iss) !== expectedIssuer) return { valid: false, reason: 'iss_mismatch' };
  if (clientId && !audienceMatches(claims.aud, clientId)) {
    return { valid: false, reason: 'aud_mismatch' };
  }
  const expMs = Number(claims.exp) * 1000;
  if (!Number.isFinite(expMs) || expMs + CLOCK_SKEW_MS < nowMs) {
    return { valid: false, reason: 'expired' };
  }
  if (text(opts.nonce) && text(claims.nonce) !== text(opts.nonce)) {
    return { valid: false, reason: 'nonce_mismatch' };
  }

  return { valid: true, claims };
}

module.exports = { verifyCriiptoIdToken, defaultFetchJwks, findJwk };
