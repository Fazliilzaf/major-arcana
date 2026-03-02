function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function clampNumber(value, min, max, fallback = min) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, numeric));
}

function isValidEmail(value = '') {
  const normalized = normalizeText(value).toLowerCase();
  if (!normalized) return false;
  if (normalized.length > 320) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized);
}

function normalizeMailboxAddress(value = '') {
  return normalizeText(value).toLowerCase();
}

function sanitizeSentenceLength(value = '') {
  const normalized = normalizeText(value).toLowerCase();
  if (['short', 'medium', 'long'].includes(normalized)) return normalized;
  return 'medium';
}

function toWritingProfile(source = {}) {
  const safe = source && typeof source === 'object' && !Array.isArray(source) ? source : {};
  return {
    greetingStyle: normalizeText(safe.greetingStyle) || 'Hej,',
    closingStyle: normalizeText(safe.closingStyle) || 'Vänliga hälsningar',
    formalityLevel: clampNumber(safe.formalityLevel, 0, 10, 5),
    ctaStyle: normalizeText(safe.ctaStyle) || 'balanced',
    sentenceLength: sanitizeSentenceLength(safe.sentenceLength),
    emojiUsage: safe.emojiUsage === true,
    warmthIndex: clampNumber(safe.warmthIndex, 0, 10, 5),
  };
}

// Temporary placeholder source until profiles are fully persisted via analysis-store.
const KNOWN_WRITING_PROFILES = Object.freeze({
  'contact@hairtpclinic.com': Object.freeze(
    toWritingProfile({
      greetingStyle: 'Hej,',
      closingStyle: 'Bästa hälsningar',
      formalityLevel: 7,
      ctaStyle: 'structured',
      sentenceLength: 'medium',
      emojiUsage: false,
      warmthIndex: 6,
    })
  ),
  'egzona@hairtpclinic.com': Object.freeze(
    toWritingProfile({
      greetingStyle: 'Hej,',
      closingStyle: 'Bästa hälsningar',
      formalityLevel: 7,
      ctaStyle: 'calm-guiding',
      sentenceLength: 'medium',
      emojiUsage: false,
      warmthIndex: 7,
    })
  ),
  'fazli@hairtpclinic.com': Object.freeze(
    toWritingProfile({
      greetingStyle: 'Hej,',
      closingStyle: 'Vänliga hälsningar',
      formalityLevel: 8,
      ctaStyle: 'direct-structured',
      sentenceLength: 'short',
      emojiUsage: false,
      warmthIndex: 5,
    })
  ),
  'kons@hairtpclinic.com': Object.freeze(
    toWritingProfile({
      greetingStyle: 'Hej,',
      closingStyle: 'Vänliga hälsningar',
      formalityLevel: 8,
      ctaStyle: 'direct',
      sentenceLength: 'short',
      emojiUsage: false,
      warmthIndex: 4,
    })
  ),
});

function deriveTenantToneStyleProfile(tenantToneStyle = '') {
  const normalized = normalizeText(tenantToneStyle).toLowerCase();
  if (!normalized) return null;
  if (/(varm|empatisk|omhändertagande|omhandertagande)/.test(normalized)) {
    return toWritingProfile({
      formalityLevel: 5,
      ctaStyle: 'calm-guiding',
      sentenceLength: 'medium',
      warmthIndex: 7,
    });
  }
  if (/(kort|koncis|direkt)/.test(normalized)) {
    return toWritingProfile({
      formalityLevel: 7,
      ctaStyle: 'direct',
      sentenceLength: 'short',
      warmthIndex: 4,
    });
  }
  if (/(professionell|formell|saklig)/.test(normalized)) {
    return toWritingProfile({
      formalityLevel: 8,
      ctaStyle: 'structured',
      sentenceLength: 'medium',
      warmthIndex: 5,
    });
  }
  return toWritingProfile({
    formalityLevel: 6,
    ctaStyle: 'balanced',
    sentenceLength: 'medium',
    warmthIndex: 5,
  });
}

function toIdentityObject(identityInput = '') {
  if (identityInput && typeof identityInput === 'object' && !Array.isArray(identityInput)) {
    return identityInput;
  }
  return {
    mailboxAddress: identityInput,
    userPrincipalName: '',
    mailboxId: identityInput,
  };
}

function resolveMailboxIdentityKey(identityInput = '') {
  const identity = toIdentityObject(identityInput);
  const mailboxAddress = normalizeMailboxAddress(
    identity.mailboxAddress ||
      identity.fromAddress ||
      identity.mailbox ||
      identity.mailboxEmail ||
      identity.mailAddress ||
      identity.email
  );
  if (isValidEmail(mailboxAddress)) return mailboxAddress;

  const userPrincipalName = normalizeMailboxAddress(
    identity.userPrincipalName || identity.upn
  );
  if (isValidEmail(userPrincipalName)) return userPrincipalName;

  const mailboxId = normalizeMailboxAddress(
    identity.mailboxId || identity.id || identity.sourceMailboxId
  );
  if (isValidEmail(mailboxId)) return mailboxId;

  return null;
}

function resolveOverrideProfile(identityInput = '', overrides = null) {
  const mailbox = resolveMailboxIdentityKey(identityInput);
  if (!mailbox || !overrides || typeof overrides !== 'object') return null;

  if (!Array.isArray(overrides)) {
    const profileMap = overrides.profilesByMailbox;
    if (profileMap && typeof profileMap === 'object' && !Array.isArray(profileMap)) {
      const mapped = profileMap[mailbox];
      if (mapped && typeof mapped === 'object' && !Array.isArray(mapped)) {
        return toWritingProfile(mapped.profile || mapped);
      }
    }
    const direct = overrides[mailbox];
    if (direct && typeof direct === 'object' && !Array.isArray(direct)) {
      return toWritingProfile(direct.profile || direct);
    }
  }

  if (Array.isArray(overrides)) {
    for (const item of overrides) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
      const candidateAddress = resolveMailboxIdentityKey(item);
      if (!candidateAddress || candidateAddress !== mailbox) continue;
      return toWritingProfile(item.profile || item);
    }
  }

  return null;
}

function resolveWritingIdentityProfile(identityInput = '', options = {}) {
  const mailbox = resolveMailboxIdentityKey(identityInput);
  const overrideProfile = resolveOverrideProfile(identityInput, options?.overrides);
  if (overrideProfile) return overrideProfile;

  if (mailbox && KNOWN_WRITING_PROFILES[mailbox]) {
    return KNOWN_WRITING_PROFILES[mailbox];
  }

  if (options?.fallbackToTenantToneStyle === true) {
    return deriveTenantToneStyleProfile(options?.tenantToneStyle);
  }

  return null;
}

module.exports = {
  KNOWN_WRITING_PROFILES,
  deriveTenantToneStyleProfile,
  isValidEmail,
  normalizeMailboxAddress,
  resolveMailboxIdentityKey,
  resolveWritingIdentityProfile,
  toWritingProfile,
};
