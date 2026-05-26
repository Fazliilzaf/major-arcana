function normalizeEmail(value = '') {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

const NON_PATIENT_DOMAIN_SUFFIXES = Object.freeze([
  'cliento.com',
  'pipedrive.com',
  'getaccept.com',
  'foodora.se',
  'smsdirekt.se',
  'clinicminds.com',
  'airestech.com',
  'tieto.com',
  'molnlycke.com',
  'npgroup.eu',
  'yoast.com',
  'futurepedia.io',
  'gilead.com',
  'markydot.com',
  'sigmatechnology.com',
  'militum.se',
  'mynextmove.se',
  'dhiglobal.com',
  'alphanex.se',
  'westva.se',
  'skanska.se',
  'castellum.se',
  'info.hairtpclinic.se',
]);

const NON_PATIENT_LOCAL_PREFIXES = Object.freeze([
  'no-reply',
  'noreply',
  'do-not-reply',
  'notifications',
  'notification',
  'mailer-daemon',
  'postmaster',
  'reply_to_sender',
  'smartdocs',
  'documents',
  'support',
  'hello',
  'help',
  'sms',
  'microsoftexchange',
]);

function isNonPatientCounterpartyEmail(email = '') {
  const normalized = normalizeEmail(email);
  if (!normalized || !normalized.includes('@')) return true;

  const [localPart, domain = ''] = normalized.split('@');
  if (!domain) return true;

  if (domain.endsWith('hairtpclinic.com')) return true;
  if (domain === 'googlemail.com' && localPart === 'mailer-daemon') return true;

  if (NON_PATIENT_DOMAIN_SUFFIXES.some((suffix) => domain === suffix || domain.endsWith(`.${suffix}`))) {
    return true;
  }

  if (
    NON_PATIENT_LOCAL_PREFIXES.some(
      (prefix) => localPart === prefix || localPart.startsWith(`${prefix}+`) || localPart.startsWith(`${prefix}.`)
    )
  ) {
    return true;
  }

  return false;
}

module.exports = {
  isNonPatientCounterpartyEmail,
  NON_PATIENT_DOMAIN_SUFFIXES,
  NON_PATIENT_LOCAL_PREFIXES,
};
