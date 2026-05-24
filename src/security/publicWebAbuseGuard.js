function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function readHoneypotValue(body) {
  if (!body || typeof body !== 'object') return '';
  const candidates = [body.website, body.company_url, body.companyUrl, body.hp, body._hp];
  for (const value of candidates) {
    const normalized = normalizeText(value);
    if (normalized) return normalized;
  }
  return '';
}

function readTurnstileToken(body) {
  if (!body || typeof body !== 'object') return '';
  return normalizeText(body.turnstileToken || body.cfTurnstileResponse || body['cf-turnstile-response']);
}

async function verifyTurnstileToken({ secret, token, remoteIp = '' } = {}) {
  const normalizedSecret = normalizeText(secret);
  const normalizedToken = normalizeText(token);
  if (!normalizedSecret) {
    return { ok: true, mode: 'disabled' };
  }
  if (!normalizedToken) {
    return { ok: false, mode: 'required', error: 'turnstile_required' };
  }

  const params = new URLSearchParams();
  params.set('secret', normalizedSecret);
  params.set('response', normalizedToken);
  if (remoteIp) params.set('remoteip', remoteIp);

  try {
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    const payload = await response.json().catch(() => ({}));
    if (payload?.success === true) {
      return { ok: true, mode: 'verified' };
    }
    return {
      ok: false,
      mode: 'invalid',
      error: 'turnstile_failed',
      codes: Array.isArray(payload?.['error-codes']) ? payload['error-codes'] : [],
    };
  } catch (error) {
    return {
      ok: false,
      mode: 'error',
      error: 'turnstile_verify_error',
      detail: normalizeText(error?.message),
    };
  }
}

/**
 * Honeypot (alltid) + Cloudflare Turnstile (när TURNSTILE_SECRET är satt).
 * Returnerar { ok: true } eller { ok: false, status, error }.
 */
async function assertPublicWebAbuseGuard(req, body, { turnstileSecret = '' } = {}) {
  const honeypot = readHoneypotValue(body);
  if (honeypot) {
    return { ok: false, status: 400, error: 'abuse_detected' };
  }

  const secret = normalizeText(turnstileSecret || process.env.TURNSTILE_SECRET);
  if (!secret) {
    return { ok: true, turnstile: 'disabled' };
  }

  const remoteIp =
    normalizeText(req?.headers?.['cf-connecting-ip']) ||
    normalizeText(String(req?.ip || '')) ||
    normalizeText(String(req?.socket?.remoteAddress || ''));

  const turnstile = await verifyTurnstileToken({
    secret,
    token: readTurnstileToken(body),
    remoteIp,
  });
  if (!turnstile.ok) {
    return {
      ok: false,
      status: 400,
      error: turnstile.error || 'turnstile_failed',
      turnstile: turnstile.mode,
    };
  }

  return { ok: true, turnstile: turnstile.mode };
}

module.exports = {
  assertPublicWebAbuseGuard,
  readHoneypotValue,
  readTurnstileToken,
  verifyTurnstileToken,
};
