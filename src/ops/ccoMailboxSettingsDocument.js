const { normalizeMailboxAddress } = require('../intelligence/writingIdentityRegistry');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function safeObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value;
}

function normalizeMailboxId(value) {
  return normalizeMailboxAddress(value || '');
}

function isApprovedSignatureMailboxIdentity(value = {}) {
  const mailbox = safeObject(value);
  const approvedTokens = new Set([
    'fazli',
    'fazli krasniqi',
    'fazli@hairtpclinic.com',
    'egzona',
    'egzona krasniqi',
    'egzona@hairtpclinic.com',
  ]);
  const tokens = [
    normalizeKey(mailbox?.key || mailbox?.id),
    normalizeKey(mailbox?.label),
    normalizeKey(mailbox?.fullName),
    normalizeKey(mailbox?.name),
    normalizeMailboxId(mailbox?.email || mailbox?.senderMailboxId || mailbox?.mailboxId),
    normalizeMailboxId(mailbox?.senderMailboxId || mailbox?.email || mailbox?.mailboxId).split('@')[0],
  ].filter(Boolean);
  return tokens.some((token) => approvedTokens.has(token));
}

const CCO_DEFAULT_SENDER_MAILBOX =
  normalizeMailboxId(process.env.ARCANA_CCO_DEFAULT_SENDER_MAILBOX) ||
  'contact@hairtpclinic.com';
const CCO_SIGNATURE_PUBLIC_BASE_URL =
  normalizeText(process.env.PUBLIC_BASE_URL || process.env.ARCANA_PUBLIC_BASE_URL).replace(
    /\/+$/,
    ''
  ) || 'https://arcana.hairtpclinic.se';
const CCO_APPROVED_HAIR_TP_SIGNATURE_LOGO_URL =
  'https://img2.gimm.io/9e99c2fb-11b4-402b-8a43-6022ede8aa2b/image.png';
const CCO_APPROVED_FAZLI_SIGNATURE_HTML = `<!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml"><head><meta http-equiv="Content-Type" content="text/html;charset=utf-8"/></head><body><table id="zs-output-sig" border="0" cellpadding="0" cellspacing="0" role="presentation" style="font-family:Arial,Helvetica,sans-serif;line-height:0px;font-size:1px;padding:0px!important;border-spacing:0px;margin:0px;border-collapse:collapse; width:516px;"><tbody><tr><td style="padding: 0px !important; width: inherit; height: inherit;"><table id="inner-table" border="0" cellpadding="0" cellspacing="0" role="presentation" style="font-family:Arial,Helvetica,sans-serif;line-height:0px;font-size:1px;padding:0px!important;border-spacing:0px;margin:0px;border-collapse:collapse;"><tbody><tr><td style="border-collapse: collapse; font-family: Helvetica, Arial, sans-serif; font-size: 12px; font-style: normal; line-height: 14px; font-weight: 400; padding-bottom: 16px; width: inherit; height: inherit;"><p style="margin: 0.04px;"><span style="font-family:Helvetica,Arial,sans-serif;font-size:12px;font-style:normal;line-height:14px;font-weight:400;color:#4A4946;display:inline;">Bästa hälsningar,</span></p></td></tr></tbody></table></td></tr><tr><td style="padding: 0px !important; width: inherit; height: inherit;"><table id="inner-table" border="0" cellpadding="0" cellspacing="0" role="presentation" style="font-family:Arial,Helvetica,sans-serif;line-height:0px;font-size:1px;padding:0px!important;border-spacing:0px;margin:0px;border-collapse:collapse;"><tbody><tr><td width="75" style="padding-right: 16px; width: inherit; height: inherit;"><table border="0" cellpadding="0" cellspacing="0" role="presentation" style="font-family:Arial,Helvetica,sans-serif;line-height:0px;font-size:1px;padding:0px!important;border-spacing:0px;margin:0px;border-collapse:collapse;"><tbody><tr><td style="border-collapse: collapse; line-height: 0px; padding-right: 1px; width: inherit; height: inherit;"><p style="margin: 0.04px;"><img height="94" width="75" alt="" border="0" src="https://img2.gimm.io/9e99c2fb-11b4-402b-8a43-6022ede8aa2b/image.png"></p></td></tr></tbody></table></td><td style="border-collapse: collapse; background-color: rgb(215, 202, 193); width: 3px; vertical-align: super; padding: 0px !important; height: inherit;"></td><td style="border-collapse: collapse; padding-right: 16px; width: inherit; height: inherit;"></td><td style="padding: 0px !important; width: inherit; height: inherit;"><table border="0" cellpadding="0" cellspacing="0" role="presentation" style="font-family:Arial,Helvetica,sans-serif;line-height:0px;font-size:1px;padding:0px!important;border-spacing:0px;margin:0px;border-collapse:collapse;"><tbody><tr><td style="border-collapse: collapse; font-family: Helvetica, Arial, sans-serif; font-size: 12px; font-style: normal; line-height: 14px; font-weight: 700; padding-bottom: 6px; width: inherit; height: inherit;"><p style="margin: 0.04px;"><span style="font-family:Helvetica,Arial,sans-serif;font-size:12px;font-style:normal;line-height:14px;font-weight:700;color:#C2AA9C;display:inline;">Fazli Krasniqi</span></p></td></tr><tr><td style="border-collapse: collapse; font-family: Helvetica, Arial, sans-serif; font-size: 12px; font-style: normal; line-height: 14px; font-weight: 700; padding-bottom: 4px; width: inherit; height: inherit;"><p style="margin: 0.04px;"><span style="font-family:Helvetica,Arial,sans-serif;font-size:12px;font-style:normal;line-height:14px;font-weight:700;color:#303030;display:inline;">Hårspecialist | Hårtransplantationer & PRP-injektioner</span></p></td></tr></tbody></table><table border="0" cellpadding="0" cellspacing="0" role="presentation" style="font-family:Arial,Helvetica,sans-serif;line-height:0px;font-size:1px;padding:0px!important;border-spacing:0px;margin:0px;border-collapse:collapse;"><tbody><tr><td style="border-collapse: collapse; font-family: Helvetica, Arial, sans-serif; font-size: 12px; font-style: normal; line-height: 14px; font-weight: 400; padding: 0px !important; width: inherit; height: inherit;"><p style="margin: 0.04px;"><span><a target="_blank" rel="nofollow" href="tel:031881166" style="font-family:Helvetica,Arial,sans-serif;font-size:12px;font-style:normal;line-height:14px;font-weight:400;color:#303030;display:inline;text-decoration:none;"> 031-88 11 66&nbsp; </a></span></p></td></tr></tbody></table><table border="0" cellpadding="0" cellspacing="0" role="presentation" style="font-family:Arial,Helvetica,sans-serif;line-height:0px;font-size:1px;padding:0px!important;border-spacing:0px;margin:0px;border-collapse:collapse;"><tbody><tr><td style="border-collapse: collapse; font-family: Helvetica, Arial, sans-serif; font-size: 12px; font-style: normal; line-height: 14px; font-weight: 400; padding: 0px !important; width: inherit; height: inherit;"><p style="margin: 0.04px;"><span><a target="_blank" rel="nofollow" href="mailto:contact@hairtpclinic.com" style="font-family:Helvetica,Arial,sans-serif;font-size:12px;font-style:normal;line-height:14px;font-weight:400;color:#303030;display:inline;text-decoration:none;"> contact@hairtpclinic.com </a></span></p></td></tr><tr><td style="border-collapse: collapse; font-family: Helvetica, Arial, sans-serif; font-size: 12px; font-style: normal; line-height: 14px; font-weight: 400; padding-bottom: 8px; width: inherit; height: inherit;"><p style="margin: 0.04px;"><span style="font-family:Helvetica,Arial,sans-serif;font-size:12px;font-style:normal;line-height:14px;font-weight:400;color:#303030;display:inline;">Vasaplatsen 2, 411 34 Göteborg</span></p></td></tr></tbody></table><table border="0" cellpadding="0" cellspacing="0" role="presentation" style="font-family:Arial,Helvetica,sans-serif;line-height:0px;font-size:1px;padding:0px!important;border-spacing:0px;margin:0px;border-collapse:collapse;"><tbody><tr><td style="padding-right: 10px; width: inherit; height: inherit;"><p style="margin: 0.04px;"><a style="font-size:0px;line-height:0px;" target="_blank" rel="nofollow" href="https://hairtpclinic.se/"><img height="24" width="24" alt="Visit website" border="0" src="data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2024%2024%22%20width%3D%2224%22%20height%3D%2224%22%20fill%3D%22none%22%3E%0A%20%20%3Ccircle%20cx%3D%2212%22%20cy%3D%2212%22%20r%3D%228.5%22%20stroke%3D%22%23B9A89D%22%20stroke-width%3D%221.9%22%2F%3E%0A%20%20%3Cpath%20d%3D%22M4%2012h16%22%20stroke%3D%22%23B9A89D%22%20stroke-width%3D%221.9%22%20stroke-linecap%3D%22round%22%2F%3E%0A%20%20%3Cpath%20d%3D%22M12%203.5c2.6%202.5%204%205.34%204%208.5s-1.4%206-4%208.5c-2.6-2.5-4-5.34-4-8.5s1.4-6%204-8.5Z%22%20stroke%3D%22%23B9A89D%22%20stroke-width%3D%221.9%22%20stroke-linejoin%3D%22round%22%2F%3E%0A%3C%2Fsvg%3E%0A"></a></p></td><td style="padding-right: 10px; width: inherit; height: inherit;"><p style="margin: 0.04px;"><a style="font-size:0px;line-height:0px;" target="_blank" rel="nofollow" href="https://www.instagram.com/hairtpclinic/"><img height="24" width="24" alt="Visit instagram" border="0" src="data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2024%2024%22%20width%3D%2224%22%20height%3D%2224%22%20fill%3D%22none%22%3E%0A%20%20%3Crect%20x%3D%224.5%22%20y%3D%224.5%22%20width%3D%2215%22%20height%3D%2215%22%20rx%3D%224%22%20stroke%3D%22%23B9A89D%22%20stroke-width%3D%221.9%22%2F%3E%0A%20%20%3Ccircle%20cx%3D%2212%22%20cy%3D%2212%22%20r%3D%223.3%22%20stroke%3D%22%23B9A89D%22%20stroke-width%3D%221.9%22%2F%3E%0A%20%20%3Ccircle%20cx%3D%2216.7%22%20cy%3D%227.3%22%20r%3D%221.15%22%20fill%3D%22%23B9A89D%22%2F%3E%0A%3C%2Fsvg%3E%0A"></a></p></td><td style="padding: 0px !important; width: inherit; height: inherit;"><p style="margin: 0.04px;"><a style="font-size:0px;line-height:0px;" target="_blank" rel="nofollow" href="https://www.facebook.com/hairtpclinic/"><img height="24" width="24" alt="Visit facebook" border="0" src="data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2024%2024%22%20width%3D%2224%22%20height%3D%2224%22%20fill%3D%22none%22%3E%0A%20%20%3Cpath%20d%3D%22M13.2%2020v-7h2.35l.45-2.7H13.2V8.6c0-.95.4-1.6%201.8-1.6H16V4.55c-.4-.05-1.15-.15-2.2-.15-2.2%200-3.7%201.35-3.7%203.8v2.1H7.75V13h2.35v7h3.1Z%22%20fill%3D%22%23B9A89D%22%2F%3E%0A%3C%2Fsvg%3E%0A"></a></p></td><td style="padding: 0px !important; width: inherit; height: inherit;"></td></tr></tbody></table></td></tr></tbody></table></td></tr><tr><td style="border-collapse: collapse; padding-bottom: 16px; width: inherit; height: inherit;"><span></span></td></tr></tbody></table></body></html>`;

function rewriteApprovedSignatureAssetUrls(
  html = '',
  { publicBaseUrl = CCO_SIGNATURE_PUBLIC_BASE_URL } = {}
) {
  const normalizedBaseUrl = normalizeText(publicBaseUrl).replace(/\/+$/, '');
  const assetBaseUrl = normalizedBaseUrl || CCO_SIGNATURE_PUBLIC_BASE_URL;
  return normalizeText(html)
    .replace(/https:\/\/img2\.gimm\.io\/9e99c2fb-11b4-402b-8a43-6022ede8aa2b\/image\.png/gi, CCO_APPROVED_HAIR_TP_SIGNATURE_LOGO_URL)
    .replace(/https?:\/\/(?:127\.0\.0\.1|localhost):3000(?=\/assets\/hair-tp-clinic\/)/gi, assetBaseUrl);
}

function buildApprovedFazliSignatureHtml({
  publicBaseUrl = CCO_SIGNATURE_PUBLIC_BASE_URL,
} = {}) {
  return rewriteApprovedSignatureAssetUrls(CCO_APPROVED_FAZLI_SIGNATURE_HTML, {
    publicBaseUrl,
  });
}

function buildApprovedEgzonaSignatureHtml({
  publicBaseUrl = CCO_SIGNATURE_PUBLIC_BASE_URL,
} = {}) {
  const egzonaHtml = CCO_APPROVED_FAZLI_SIGNATURE_HTML
    .replace('Fazli Krasniqi', 'Egzona Krasniqi')
    .replace('mailto:contact@hairtpclinic.com', 'mailto:egzona@hairtpclinic.com')
    .replace(' contact@hairtpclinic.com ', ' egzona@hairtpclinic.com ');
  return rewriteApprovedSignatureAssetUrls(egzonaHtml, {
    publicBaseUrl,
  });
}

const CCO_BASE_SIGNATURE_PROFILES = Object.freeze([
  Object.freeze({
    key: 'fazli',
    label: 'Fazli Krasniqi',
    fullName: 'Fazli Krasniqi',
    title: 'Hårspecialist | Hårtransplantationer & PRP-injektioner',
    senderMailboxId: 'fazli@hairtpclinic.com',
    displayEmail: 'contact@hairtpclinic.com',
    html: buildApprovedFazliSignatureHtml(),
    preferProvidedHtml: true,
    source: 'base_profile',
  }),
  Object.freeze({
    key: 'egzona',
    label: 'Egzona Krasniqi',
    fullName: 'Egzona Krasniqi',
    title: 'Hårspecialist | Hårtransplantationer & PRP-injektioner',
    senderMailboxId: 'egzona@hairtpclinic.com',
    displayEmail: 'egzona@hairtpclinic.com',
    html: buildApprovedEgzonaSignatureHtml(),
    preferProvidedHtml: true,
    source: 'base_profile',
  }),
]);

function mailboxLabelFromId(mailboxId = '') {
  const normalizedMailboxId = normalizeMailboxId(mailboxId);
  const localPart = normalizedMailboxId.split('@')[0] || '';
  return localPart ? localPart.charAt(0).toUpperCase() + localPart.slice(1) : 'Mailbox';
}

function normalizeMailboxIdentityTokens(value = '') {
  const normalizedValue = normalizeMailboxId(value) || normalizeKey(value);
  if (!normalizedValue) return [];
  const tokens = [normalizedValue];
  if (normalizedValue.includes('@')) {
    const localPart = normalizeMailboxId(normalizedValue.split('@')[0]);
    if (localPart) tokens.push(localPart);
  }
  return Array.from(new Set(tokens.filter(Boolean)));
}

function buildSignatureProfileIdentityTokens(profile = {}) {
  return Array.from(
    new Set(
      [
        normalizeKey(profile?.key || profile?.id),
        normalizeMailboxId(profile?.senderMailboxId),
        normalizeMailboxId(profile?.email),
        normalizeMailboxId(profile?.mailboxId),
        ...normalizeMailboxIdentityTokens(profile?.senderMailboxId),
        ...normalizeMailboxIdentityTokens(profile?.email),
        ...normalizeMailboxIdentityTokens(profile?.mailboxId),
        ...asArray(profile?.aliases).map((alias) => normalizeKey(alias) || normalizeMailboxId(alias)),
      ].filter(Boolean)
    )
  );
}

function withSignatureProfileAliases(profile = {}) {
  const normalizedProfile = {
    key: normalizeText(profile?.key || profile?.id),
    label: normalizeText(profile?.label) || normalizeText(profile?.fullName) || 'Signatur',
    fullName: normalizeText(profile?.fullName) || normalizeText(profile?.label) || '',
    title: normalizeText(profile?.title),
    senderMailboxId:
      normalizeMailboxId(profile?.senderMailboxId || profile?.email || profile?.mailboxId) ||
      CCO_DEFAULT_SENDER_MAILBOX,
    email:
      normalizeMailboxId(profile?.email || profile?.senderMailboxId || profile?.mailboxId) ||
      CCO_DEFAULT_SENDER_MAILBOX,
    mailboxId:
      normalizeMailboxId(profile?.mailboxId || profile?.senderMailboxId || profile?.email) || null,
    html: normalizeText(profile?.html || profile?.bodyHtml || profile?.body_html),
    preferProvidedHtml: profile?.preferProvidedHtml === true,
    source: normalizeText(profile?.source) || 'profile',
  };
  if (!normalizedProfile.key) {
    normalizedProfile.key = normalizeKey(normalizedProfile.senderMailboxId) || 'fazli';
  }
  return {
    ...normalizedProfile,
    aliases: buildSignatureProfileIdentityTokens({
      ...normalizedProfile,
      aliases: profile?.aliases,
    }),
  };
}

function normalizeCustomMailboxSignature(signature = {}, mailbox = {}) {
  const label = normalizeText(signature?.label || signature?.name || mailbox.label);
  const fullName = normalizeText(signature?.fullName || signature?.displayName || mailbox.label);
  const isApprovedMailbox = isApprovedSignatureMailboxIdentity({
    ...mailbox,
    ...signature,
    label,
    fullName,
  });
  return {
    label: label || mailbox.label || mailboxLabelFromId(mailbox.email || mailbox.id),
    fullName: fullName || mailbox.label || mailboxLabelFromId(mailbox.email || mailbox.id),
    title: normalizeText(signature?.title || signature?.line),
    html: isApprovedMailbox ? normalizeText(signature?.html || signature?.body) : '',
    preferProvidedHtml: signature?.preferProvidedHtml === true,
  };
}

function normalizeCustomMailboxDefinition(mailbox = {}, index = 0) {
  const source = safeObject(mailbox);
  const email = normalizeMailboxId(source.email || source.id);
  if (!email) return null;
  const label = normalizeText(source.label || source.name) || mailboxLabelFromId(email);
  const id =
    normalizeMailboxId(source.id) ||
    normalizeMailboxId(source.mailboxId) ||
    normalizeMailboxId(email) ||
    `mailbox-${index + 1}`;
  return {
    id,
    mailboxId: id,
    email,
    label,
    owner: normalizeText(source.owner) || 'Team',
    toneClass: normalizeText(source.toneClass),
    signature: normalizeCustomMailboxSignature(source.signature || source, {
      id,
      email,
      label,
    }),
    source: normalizeText(source.source) || 'mailbox_admin',
  };
}

function buildCustomMailboxSignatureProfile(mailbox = {}, index = 0) {
  const normalizedMailbox = normalizeCustomMailboxDefinition(mailbox, index);
  if (!normalizedMailbox) return null;
  if (!isApprovedSignatureMailboxIdentity(normalizedMailbox)) return null;
  const profileKey = `mailbox-signature:${normalizeMailboxId(
    normalizedMailbox.mailboxId || normalizedMailbox.email
  )}`;
  return withSignatureProfileAliases({
    key: profileKey,
    label: normalizedMailbox.signature.label,
    fullName: normalizedMailbox.signature.fullName,
    title: normalizedMailbox.signature.title,
    senderMailboxId: normalizedMailbox.email,
    email: normalizedMailbox.email,
    mailboxId: normalizedMailbox.mailboxId,
    html: normalizedMailbox.signature.html,
    preferProvidedHtml: normalizedMailbox.signature.preferProvidedHtml === true,
    source: 'mailbox_admin',
    aliases: [
      profileKey,
      normalizedMailbox.id,
      normalizedMailbox.mailboxId,
      normalizedMailbox.email,
      normalizedMailbox.label,
      normalizedMailbox.signature.label,
      normalizedMailbox.signature.fullName,
      normalizeMailboxId(normalizedMailbox.email.split('@')[0]),
    ],
  });
}

function parseMailboxIds(value) {
  if (Array.isArray(value)) {
    return Array.from(
      new Set(
        value
          .map((item) => normalizeMailboxId(item))
          .filter(Boolean)
      )
    );
  }
  return Array.from(
    new Set(
      String(value || '')
        .split(',')
        .map((item) => normalizeMailboxId(item))
        .filter(Boolean)
    )
  );
}

function normalizeMailFoundationDefaults(input = {}) {
  const source = safeObject(input);
  return {
    senderMailboxId: normalizeMailboxId(source.senderMailboxId || source.defaultSenderMailboxId) || '',
    composeSenderMailboxId: normalizeMailboxId(source.composeSenderMailboxId) || '',
    replySenderMailboxId: normalizeMailboxId(source.replySenderMailboxId) || '',
    signatureProfileId: normalizeText(source.signatureProfileId || source.defaultSignatureProfileId),
  };
}

function normalizeCcoMailFoundation(input = {}) {
  const source = safeObject(input);
  return {
    defaults: normalizeMailFoundationDefaults(source.defaults),
    customMailboxes: asArray(source.customMailboxes)
      .map((mailbox, index) => normalizeCustomMailboxDefinition(mailbox, index))
      .filter(Boolean),
  };
}

function addUniqueProfiles(profiles = []) {
  const nextProfiles = [];
  const seenTokens = new Set();
  asArray(profiles).forEach((profile) => {
    const normalizedProfile = withSignatureProfileAliases(profile);
    const identityTokens = buildSignatureProfileIdentityTokens(normalizedProfile);
    if (!identityTokens.length || identityTokens.some((token) => seenTokens.has(token))) {
      return;
    }
    identityTokens.forEach((token) => seenTokens.add(token));
    nextProfiles.push(normalizedProfile);
  });
  return nextProfiles;
}

function profileMatchesCandidate(profile = {}, candidate = '') {
  const normalizedCandidate = normalizeMailboxId(candidate) || normalizeKey(candidate);
  if (!normalizedCandidate) return false;
  return buildSignatureProfileIdentityTokens(profile).includes(normalizedCandidate);
}

function resolveCcoMailboxSignatureProfile(
  mailboxSettingsDocument = {},
  rawProfile = '',
  { fallbackMailboxIds = [] } = {}
) {
  const profiles = asArray(mailboxSettingsDocument?.signatureProfiles);
  const defaults = safeObject(mailboxSettingsDocument?.defaults);
  const candidateValues = [
    rawProfile,
    ...asArray(fallbackMailboxIds),
    defaults.signatureProfileId,
    defaults.composeSenderMailboxId,
    defaults.replySenderMailboxId,
    defaults.senderMailboxId,
    CCO_DEFAULT_SENDER_MAILBOX,
  ];
  for (const candidate of candidateValues) {
    const match = profiles.find((profile) => profileMatchesCandidate(profile, candidate));
    if (match) return match;
  }
  const approvedProfiles = addUniqueProfiles(CCO_BASE_SIGNATURE_PROFILES);
  return (
    approvedProfiles.find((profile) => normalizeKey(profile?.key) === 'fazli') ||
    approvedProfiles[0] ||
    null
  );
}

function buildMailboxTokenSet(values = []) {
  return new Set(
    asArray(values)
      .flatMap((mailboxId) => normalizeMailboxIdentityTokens(mailboxId))
      .filter(Boolean)
  );
}

function chooseDefaultSenderMailbox({
  requestedMailboxId = '',
  senderMailboxOptions = [],
  fallbackMailboxId = CCO_DEFAULT_SENDER_MAILBOX,
}) {
  const normalizedRequestedMailboxId = normalizeMailboxId(requestedMailboxId);
  const normalizedFallbackMailboxId = normalizeMailboxId(fallbackMailboxId) || CCO_DEFAULT_SENDER_MAILBOX;
  const normalizedSenderMailboxOptions = parseMailboxIds(senderMailboxOptions);
  if (!normalizedSenderMailboxOptions.length) {
    return normalizedRequestedMailboxId || normalizedFallbackMailboxId;
  }
  const senderMailboxTokenSet = buildMailboxTokenSet(normalizedSenderMailboxOptions);
  if (
    normalizedRequestedMailboxId &&
    normalizeMailboxIdentityTokens(normalizedRequestedMailboxId).some((token) =>
      senderMailboxTokenSet.has(token)
    )
  ) {
    return normalizedRequestedMailboxId;
  }
  if (
    normalizedFallbackMailboxId &&
    normalizeMailboxIdentityTokens(normalizedFallbackMailboxId).some((token) =>
      senderMailboxTokenSet.has(token)
    )
  ) {
    return normalizedFallbackMailboxId;
  }
  return normalizedSenderMailboxOptions[0] || normalizedFallbackMailboxId;
}

function buildCanonicalCcoMailboxSettingsDocument({
  tenantSettings = {},
  defaultSenderMailboxId = CCO_DEFAULT_SENDER_MAILBOX,
  readAllowlistMailboxIds = [],
  sendAllowlistMailboxIds = [],
  deleteAllowlistMailboxIds = [],
  graphReadEnabled = false,
  graphSendEnabled = false,
  graphDeleteEnabled = false,
} = {}) {
  const normalizedTenantSettings = safeObject(tenantSettings);
  const mailFoundation = normalizeCcoMailFoundation(normalizedTenantSettings.mailFoundation);
  const customMailboxes = mailFoundation.customMailboxes;
  const signatureProfiles = addUniqueProfiles([...CCO_BASE_SIGNATURE_PROFILES]);

  const normalizedReadAllowlistMailboxIds = parseMailboxIds(readAllowlistMailboxIds);
  const normalizedSendAllowlistMailboxIds = parseMailboxIds(sendAllowlistMailboxIds);
  const normalizedDeleteAllowlistMailboxIds = parseMailboxIds(deleteAllowlistMailboxIds);

  const requestedDefaultSenderMailboxId =
    mailFoundation.defaults.composeSenderMailboxId ||
    mailFoundation.defaults.senderMailboxId ||
    normalizeMailboxId(defaultSenderMailboxId) ||
    CCO_DEFAULT_SENDER_MAILBOX;
  const resolvedDefaultSenderMailboxId = chooseDefaultSenderMailbox({
    requestedMailboxId: requestedDefaultSenderMailboxId,
    senderMailboxOptions: normalizedSendAllowlistMailboxIds,
    fallbackMailboxId: normalizeMailboxId(defaultSenderMailboxId) || CCO_DEFAULT_SENDER_MAILBOX,
  });
  const replySenderMailboxId = chooseDefaultSenderMailbox({
    requestedMailboxId:
      mailFoundation.defaults.replySenderMailboxId || resolvedDefaultSenderMailboxId,
    senderMailboxOptions: normalizedSendAllowlistMailboxIds,
    fallbackMailboxId: resolvedDefaultSenderMailboxId,
  });
  const defaultSignatureProfile = resolveCcoMailboxSignatureProfile(
    {
      signatureProfiles,
      defaults: {
        senderMailboxId: resolvedDefaultSenderMailboxId,
        replySenderMailboxId,
        signatureProfileId: mailFoundation.defaults.signatureProfileId,
      },
    },
    mailFoundation.defaults.signatureProfileId,
    {
      fallbackMailboxIds: [resolvedDefaultSenderMailboxId, replySenderMailboxId],
    }
  );

  const senderMailboxOptions = Array.from(new Set(normalizedSendAllowlistMailboxIds));
  const senderMailboxTokenSet = buildMailboxTokenSet(senderMailboxOptions);
  const deleteMailboxTokenSet = buildMailboxTokenSet(normalizedDeleteAllowlistMailboxIds);
  const readMailboxTokenSet = buildMailboxTokenSet(normalizedReadAllowlistMailboxIds);
  const signatureProfilesByMailbox = new Map(
    signatureProfiles
      .map((profile) => {
        const mailboxId = normalizeMailboxId(profile?.senderMailboxId);
        if (!mailboxId) return null;
        return [mailboxId, profile];
      })
      .filter(Boolean)
  );
  const customMailboxByEmail = new Map(
    customMailboxes
      .map((mailbox) => {
        const mailboxId = normalizeMailboxId(mailbox?.email || mailbox?.id);
        if (!mailboxId) return null;
        return [mailboxId, mailbox];
      })
      .filter(Boolean)
  );

  const mailboxCapabilities = Array.from(
    new Set([
      resolvedDefaultSenderMailboxId,
      replySenderMailboxId,
      ...normalizedReadAllowlistMailboxIds,
      ...normalizedDeleteAllowlistMailboxIds,
      ...senderMailboxOptions,
      ...customMailboxes.map((mailbox) => normalizeMailboxId(mailbox.email || mailbox.id)),
      ...signatureProfiles.map((profile) => normalizeMailboxId(profile.senderMailboxId)),
    ])
  )
    .filter(Boolean)
    .map((mailboxId, index) => {
      const customMailbox = customMailboxByEmail.get(mailboxId) || null;
      const signatureProfile =
        signatureProfilesByMailbox.get(mailboxId) ||
        resolveCcoMailboxSignatureProfile(
          {
            signatureProfiles,
            defaults: {
              senderMailboxId: resolvedDefaultSenderMailboxId,
              signatureProfileId: defaultSignatureProfile?.key || '',
            },
          },
          mailboxId
        );
      const mailboxTokens = normalizeMailboxIdentityTokens(mailboxId);
      const senderAvailable = mailboxTokens.some((token) => senderMailboxTokenSet.has(token));
      const deleteAvailable = mailboxTokens.some((token) => deleteMailboxTokenSet.has(token));
      const readAvailable =
        graphReadEnabled !== true
          ? false
          : !readMailboxTokenSet.size ||
            mailboxTokens.some((token) => readMailboxTokenSet.has(token));
      return {
        id: mailboxId,
        email: mailboxId,
        label: normalizeText(customMailbox?.label) || mailboxLabelFromId(mailboxId),
        owner: normalizeText(customMailbox?.owner) || 'Mailbox',
        custom: Boolean(customMailbox),
        readAvailable,
        sendAvailable: graphSendEnabled === true && senderAvailable,
        deleteAvailable: graphDeleteEnabled === true && deleteAvailable,
        senderAvailable,
        signatureProfileId: normalizeText(signatureProfile?.key) || null,
        signatureProfileAvailable: Boolean(signatureProfile),
        signatureProfileLabel:
          normalizeText(signatureProfile?.label || signatureProfile?.fullName) || null,
        order: index,
      };
    });

  return {
    version: 'phase_6',
    kind: 'mailbox_settings_document',
    operator: {
      profileName: normalizeText(normalizedTenantSettings.profileName),
      profileEmail: normalizeText(normalizedTenantSettings.profileEmail),
    },
    defaults: {
      senderMailboxId: resolvedDefaultSenderMailboxId,
      composeSenderMailboxId: resolvedDefaultSenderMailboxId,
      replySenderMailboxId,
      signatureProfileId: normalizeText(defaultSignatureProfile?.key) || 'fazli',
    },
    allowlists: {
      readMailboxIds: normalizedReadAllowlistMailboxIds,
      sendMailboxIds: senderMailboxOptions,
      deleteMailboxIds: normalizedDeleteAllowlistMailboxIds,
    },
    graph: {
      readEnabled: graphReadEnabled === true,
      sendEnabled: graphSendEnabled === true,
      deleteEnabled: graphDeleteEnabled === true,
    },
    customMailboxes,
    signatureProfiles,
    senderMailboxOptions,
    mailboxCapabilities,
  };
}

module.exports = {
  CCO_DEFAULT_SENDER_MAILBOX,
  CCO_BASE_SIGNATURE_PROFILES,
  normalizeCustomMailboxDefinition,
  normalizeCcoMailFoundation,
  normalizeMailFoundationDefaults,
  buildCanonicalCcoMailboxSettingsDocument,
  buildApprovedEgzonaSignatureHtml,
  buildApprovedFazliSignatureHtml,
  resolveCcoMailboxSignatureProfile,
};
