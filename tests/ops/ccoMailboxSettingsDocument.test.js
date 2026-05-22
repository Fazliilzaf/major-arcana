const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildCanonicalCcoMailboxSettingsDocument,
  buildApprovedEgzonaSignatureHtml,
  buildApprovedFazliSignatureHtml,
  normalizeCcoMailFoundation,
  normalizeCustomMailboxDefinition,
  normalizeMailFoundationDefaults,
  resolveCcoMailboxSignatureProfile,
} = require('../../src/ops/ccoMailboxSettingsDocument');

test('canonical mailbox settings document keeps only approved signatures and defaults', () => {
  const document = buildCanonicalCcoMailboxSettingsDocument({
    tenantSettings: {
      profileName: 'Operator One',
      profileEmail: 'operator@hairtpclinic.com',
      mailFoundation: {
        defaults: {
          senderMailboxId: 'support@hairtpclinic.com',
        },
        customMailboxes: [
          {
            id: 'support@hairtpclinic.com',
            email: 'support@hairtpclinic.com',
            label: 'Support',
            owner: 'Support',
            signature: {
              label: 'Support signatur',
              fullName: 'Hair TP Support',
              title: 'Supportteam',
              html: '<div>Support signatur</div>',
            },
          },
        ],
      },
    },
    sendAllowlistMailboxIds: [
      'contact@hairtpclinic.com',
      'support@hairtpclinic.com',
    ],
    readAllowlistMailboxIds: ['support@hairtpclinic.com'],
    deleteAllowlistMailboxIds: ['support@hairtpclinic.com'],
    graphReadEnabled: true,
    graphSendEnabled: true,
    graphDeleteEnabled: true,
  });

  assert.equal(document.version, 'phase_6');
  assert.equal(document.kind, 'mailbox_settings_document');
  assert.equal(document.operator.profileName, 'Operator One');
  assert.equal(document.defaults.senderMailboxId, 'support@hairtpclinic.com');
  assert.equal(
    document.defaults.signatureProfileId,
    'fazli'
  );
  assert.ok(
    document.signatureProfiles.some(
      (profile) => profile.key === 'fazli'
    )
  );
  assert.ok(
    document.signatureProfiles.some((profile) => profile.key === 'egzona')
  );
  assert.equal(
    document.signatureProfiles.some(
      (profile) => profile.key === 'mailbox-signature:support@hairtpclinic.com'
    )
  ,
    false
  );
  const supportCapability = document.mailboxCapabilities.find(
    (capability) => capability.id === 'support@hairtpclinic.com'
  );
  assert.ok(supportCapability);
  assert.equal(supportCapability.label, 'Support');
  assert.equal(supportCapability.sendAvailable, true);
  assert.equal(supportCapability.readAvailable, true);
  assert.equal(supportCapability.deleteAvailable, true);
  assert.equal(
    supportCapability.signatureProfileId,
    'fazli'
  );
});

test('signature resolution falls back to approved base signatures for non-approved mailbox aliases', () => {
  const document = buildCanonicalCcoMailboxSettingsDocument({
    tenantSettings: {
      mailFoundation: {
        customMailboxes: [
          {
            id: 'contact@hairtpclinic.com',
            email: 'contact@hairtpclinic.com',
            label: 'Contact',
            signature: {
              label: 'Contact custom',
              fullName: 'Hair TP Contact',
              title: 'Custom contact',
            },
          },
        ],
      },
    },
    sendAllowlistMailboxIds: ['contact@hairtpclinic.com'],
    graphSendEnabled: true,
  });

  const resolvedProfile = resolveCcoMailboxSignatureProfile(document, 'contact');
  assert.equal(
    resolvedProfile.key,
    'fazli'
  );
  assert.equal(resolvedProfile.fullName, 'Fazli Krasniqi');
});

test('fazli base profile carries approved provided html for send/profile parity', () => {
  const document = buildCanonicalCcoMailboxSettingsDocument({
    sendAllowlistMailboxIds: ['contact@hairtpclinic.com', 'fazli@hairtpclinic.com'],
    graphSendEnabled: true,
  });

  const resolvedProfile = resolveCcoMailboxSignatureProfile(document, 'fazli');
  assert.equal(resolvedProfile.key, 'fazli');
  assert.equal(resolvedProfile.preferProvidedHtml, true);
  assert.equal(resolvedProfile.html, buildApprovedFazliSignatureHtml());
  assert.equal(resolvedProfile.html.includes('Fazli Krasniqi'), true);
  assert.equal(resolvedProfile.html.includes('contact@hairtpclinic.com'), true);
  assert.equal(resolvedProfile.html.includes('Vasaplatsen 2, 411 34 Göteborg'), true);
  assert.equal(
    resolvedProfile.html.includes('img2.gimm.io/9e99c2fb-11b4-402b-8a43-6022ede8aa2b/image.png'),
    true
  );
});

test('egzona base profile carries approved provided html for send/profile parity', () => {
  const document = buildCanonicalCcoMailboxSettingsDocument({
    sendAllowlistMailboxIds: ['contact@hairtpclinic.com', 'egzona@hairtpclinic.com'],
    graphSendEnabled: true,
  });

  const resolvedProfile = resolveCcoMailboxSignatureProfile(document, 'egzona');
  assert.equal(resolvedProfile.key, 'egzona');
  assert.equal(resolvedProfile.preferProvidedHtml, true);
  assert.equal(resolvedProfile.html, buildApprovedEgzonaSignatureHtml());
  assert.equal(resolvedProfile.html.includes('Egzona Krasniqi'), true);
  assert.equal(resolvedProfile.html.includes('mailto:egzona@hairtpclinic.com'), true);
  assert.equal(resolvedProfile.html.includes('Vasaplatsen 2, 411 34 Göteborg'), true);
  assert.equal(
    resolvedProfile.html.includes('img2.gimm.io/9e99c2fb-11b4-402b-8a43-6022ede8aa2b/image.png'),
    true
  );
});

test('normalizeCustomMailboxDefinition null eller saknad email returnerar null', () => {
  assert.equal(normalizeCustomMailboxDefinition(null), null);
  assert.equal(normalizeCustomMailboxDefinition({}), null);
  assert.equal(normalizeCustomMailboxDefinition({ label: 'utan adress' }), null);
});

test('normalizeCustomMailboxDefinition normaliserar id email och ägare', () => {
  const mailbox = normalizeCustomMailboxDefinition(
    {
      id: 'Owner@Clinic.SE',
      email: 'owner@clinic.se',
      label: '  Owner ',
      owner: '  Reception ',
      toneClass: 'CALM',
    },
    2
  );
  assert.equal(mailbox.id, 'owner@clinic.se');
  assert.equal(mailbox.email, 'owner@clinic.se');
  assert.equal(mailbox.label, 'Owner');
  assert.equal(mailbox.owner, 'Reception');
  assert.equal(mailbox.toneClass, 'CALM');
  assert.equal(mailbox.source, 'mailbox_admin');
});

test('normalizeMailFoundationDefaults läser defaultSenderMailboxId och defaultSignatureProfileId', () => {
  const defaults = normalizeMailFoundationDefaults({
    defaultSenderMailboxId: 'A@B.com',
    defaultSignatureProfileId: '  fazli  ',
  });
  assert.equal(defaults.senderMailboxId, 'a@b.com');
  assert.equal(defaults.signatureProfileId, 'fazli');
});

test('normalizeCcoMailFoundation filtrerar bort ogiltiga mailbox-poster', () => {
  const foundation = normalizeCcoMailFoundation({
    defaults: { senderMailboxId: 'x@y.com' },
    customMailboxes: [{}, null, { email: 'ok@clinic.com', label: 'OK' }],
  });
  assert.equal(foundation.customMailboxes.length, 1);
  assert.equal(foundation.customMailboxes[0].email, 'ok@clinic.com');
  assert.equal(foundation.defaults.senderMailboxId, 'x@y.com');
});

test('normalizeCcoMailFoundation icke-array customMailboxes blir tom lista', () => {
  const foundation = normalizeCcoMailFoundation({
    defaults: {},
    customMailboxes: 'ignored',
  });
  assert.deepEqual(foundation.customMailboxes, []);
});
