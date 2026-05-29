'use strict';

/**
 * import-meridiq-content.js — Importerar 14 questionnaires + 39 consents
 * från Meridiq till ccoTemplateRegistry. Ersätter PLATSHÅLLAR-text med
 * faktisk klinisk text från Meridiq API-export.
 *
 * Källor:
 *   - migration/meridiq/questionary-catalog.json (16 forms, 14 migrate)
 *   - migration/meridiq/consent-catalog.json (39 letterText)
 *
 * Princip:
 *   - Använd `upsert` så befintliga mallar bumpas + arkiveras till revisions
 *   - Bevarar metadata från seed (brand, journeyStep, channel, legal-status)
 *   - Sätter `mustStoreVersionShownToPatient: true` för alla kliniska mallar
 *   - Legal-status: 'meridiq_clinical' med datum från Meridiq-export
 *
 * Använd: `node scripts/import-meridiq-content.js [--dry-run]`
 */

const fs = require('fs');
const path = require('path');
const { createCcoTemplateRegistry } = require('../src/ops/ccoTemplateRegistry');

const DRY_RUN = process.argv.includes('--dry-run');

// Mappning från Meridiq brand-namn till Arcana brand-koder
const BRAND_MAP = {
  'Hair TP Clinic': 'hair_tp',
  'Curatiio': 'curatiio',
};

// Brand-override-tabell. Källa: config/meridiq-brand-overrides.json (audit Steg 10).
// 17 Meridiq-mallar är felaktigt taggade Hair TP Clinic men säljs som Curatiio/shared.
let BRAND_OVERRIDES = { consent: {}, questionary: {}, journalSchema: {} };
try {
  const overridesPath = path.join(__dirname, '..', 'config', 'meridiq-brand-overrides.json');
  if (fs.existsSync(overridesPath)) {
    const overridesData = JSON.parse(fs.readFileSync(overridesPath, 'utf8'));
    BRAND_OVERRIDES = overridesData.overrides || BRAND_OVERRIDES;
    console.log(`[brand-overrides] Laddad: ${Object.keys(BRAND_OVERRIDES.consent || {}).length} consent-overrides, ${Object.keys(BRAND_OVERRIDES.questionary || {}).length} questionary-overrides.`);
  } else {
    console.warn('[brand-overrides] config/meridiq-brand-overrides.json saknas — inga overrides applied.');
  }
} catch (err) {
  console.error('[brand-overrides] Kunde inte ladda overrides:', err.message);
}

function applyBrandOverride(category, apiId, defaultBrand, title) {
  const overrideTable = BRAND_OVERRIDES[category] || {};
  const override = overrideTable[String(apiId)];
  if (override && override.ccoBrand) {
    console.log(`  [BRAND_OVERRIDE] ${category}/${apiId} "${title}": ${defaultBrand} → ${override.ccoBrand} (${override.reason})`);
    return { brand: override.ccoBrand, applied: true, reason: override.reason, duplicateOf: override.duplicateOf || null };
  }
  return { brand: defaultBrand, applied: false };
}

// Mappning från Meridiq arcanaJournalType → templateId-prefix för existing/new templates
// (vi mappar mot existing seeded templates där möjligt, annars skapas nya med suffix)
function mapQuestionnaireToTemplateId(form) {
  // Använd _resolvedBrand om importQuestionnaires() har applicerat override, annars default
  const brand = form._resolvedBrand || BRAND_MAP[form.brand] || 'shared';
  const type = form.arcanaJournalType;
  // Försök matcha existing IDs först
  const knownIdMap = {
    'health_declaration': brand === 'hair_tp' ? 'health_declaration_hair_tp' : 'health_declaration_curatiio',
    'fitness_certificate': brand === 'hair_tp' ? 'fitness_certificate_hair_tp' : 'fitness_certificate_curatiio',
  };
  if (knownIdMap[type]) return knownIdMap[type];
  // Annars unique-ID baserat på apiId
  return `meridiq_${type}_${form.apiId}_${brand}`;
}

function mapConsentToTemplateId(consent) {
  const brand = consent._resolvedBrand || BRAND_MAP[consent.brand] || 'shared';
  // Slugifiera title för läsbarhet
  const slug = String(consent.title)
    .toLowerCase()
    .replace(/[åä]/g, 'a').replace(/ö/g, 'o')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
  return `meridiq_consent_${slug}_${consent.apiId}`;
}

function buildBodyFromQuestionnaire(form) {
  const lines = [`# ${form.title}\n`];
  if (form.questionCount) lines.push(`*${form.questionCount} frågor · Meridiq API-ID ${form.apiId}*\n`);
  for (const q of form.questions || []) {
    const required = q.required ? ' *(obligatorisk)*' : '';
    lines.push(`\n## ${q.label}${required}`);
    if (q.type === 'yes_no') {
      lines.push('\n- [ ] Ja');
      lines.push('- [ ] Nej');
    } else if (q.type === 'yes_no_textbox') {
      lines.push('\n- [ ] Ja → specificera:');
      lines.push('- [ ] Nej');
    } else if (q.type === 'checkbox' && Array.isArray(q.options)) {
      for (const opt of q.options) lines.push(`- [ ] ${opt}`);
    } else if (q.type === 'textbox') {
      lines.push('\n_(fritext)_');
    } else if (q.options) {
      for (const opt of q.options) lines.push(`- [ ] ${opt}`);
    }
  }
  return lines.join('\n');
}

function buildSubjectFromQuestionnaire(form) {
  return `${form.title} — vänligen fyll i inför ditt besök`;
}

async function importQuestionnaires(registry, catalog) {
  const stats = { imported: 0, skipped: 0, errors: 0, items: [] };
  for (const form of (catalog.forms || [])) {
    if (!form.migrate) { stats.skipped += 1; continue; }
    try {
      const defaultBrand = BRAND_MAP[form.brand] || 'shared';
      const overrideResult = applyBrandOverride('questionary', form.apiId, defaultBrand, form.title);
      const brand = overrideResult.brand;
      // Templates-ID måste byggas EFTER brand-override så ID inkluderar rätt brand
      const templateId = mapQuestionnaireToTemplateId({ ...form, _resolvedBrand: brand });
      const existing = registry.get(templateId);
      // Bumpa version om existerande (seed gav 3.0.0 → vi sätter 3.1.0 efter import)
      const nextVersion = existing
        ? bumpMinor(existing.version)
        : '1.0.0';

      const tpl = {
        templateId,
        brand,
        type: form.arcanaJournalType === 'fitness_certificate' ? 'fitness_certificate'
            : form.arcanaJournalType === 'health_declaration' ? 'health_declaration'
            : 'patient_information',
        journeyStep: form.arcanaJournalType === 'fitness_certificate' ? 'fitness'
                   : form.arcanaJournalType === 'health_declaration' ? 'healthdecl'
                   : 'info',
        version: nextVersion,
        channel: ['portal'],
        source: 'meridiq',
        legalReviewStatus: 'meridiq_clinical',
        legalReviewedAt: catalog.exportedAt || '2026-05-25',
        legalReviewExternalRef: `meridiq_api_questionary_${form.apiId}`,
        mustStoreVersionShownToPatient: true,
        requiresHumanApproval: false,
        requiresPatientSignature: true,
        mergeFields: ['firstName', 'treatmentDate'],
        subject: { sv: buildSubjectFromQuestionnaire(form) },
        body: { sv: buildBodyFromQuestionnaire(form) },
        meridiqMeta: {
          apiId: form.apiId,
          originalTitle: form.title,
          questionCount: form.questionCount,
          isActive: form.isActive,
        },
      };

      if (DRY_RUN) {
        stats.imported += 1;
        stats.items.push({ id: templateId, action: existing ? 'UPDATE' : 'CREATE', version: nextVersion, brand, type: tpl.type });
      } else {
        await registry.upsert(tpl, { role: 'meridiq_import' });
        stats.imported += 1;
        stats.items.push({ id: templateId, action: existing ? 'UPDATE' : 'CREATE', version: nextVersion, brand, type: tpl.type });
      }
    } catch (err) {
      stats.errors += 1;
      stats.items.push({ id: form.apiId, action: 'ERROR', error: err.message });
    }
  }
  return stats;
}

async function importConsents(registry, catalog) {
  const stats = { imported: 0, skipped: 0, errors: 0, items: [] };
  for (const c of (catalog.consents || [])) {
    if (!c.isActive) { stats.skipped += 1; continue; }
    try {
      const defaultBrand = BRAND_MAP[c.brand] || 'shared';
      const overrideResult = applyBrandOverride('consent', c.apiId, defaultBrand, c.title);
      const brand = overrideResult.brand;
      const templateId = mapConsentToTemplateId({ ...c, _resolvedBrand: brand });
      const existing = registry.get(templateId);
      const version = existing ? bumpMinor(existing.version) : '1.0.0';

      const tpl = {
        templateId,
        brand,
        type: 'consent',
        journeyStep: 'consent',
        version,
        channel: ['portal', 'email'],
        source: 'meridiq',
        legalReviewStatus: 'meridiq_clinical',
        legalReviewedAt: catalog.exportedAt || '2026-05-25',
        legalReviewExternalRef: `meridiq_api_letter_of_consent_${c.apiId}`,
        mustStoreVersionShownToPatient: true,
        requiresHumanApproval: false,
        requiresPatientSignature: true,
        revocable: true,
        mergeFields: ['firstName', 'treatmentLabel', 'treatmentDate'],
        subject: { sv: `Behandlingssamtycke: ${c.title}` },
        body: { sv: c.letterText || '[ingen text från Meridiq]' },
        meridiqMeta: {
          apiId: c.apiId,
          originalTitle: c.title,
          publishBeforeAfterPhotos: c.publishBeforeAfterPhotos,
          meridiqVersion: c.version,
        },
      };

      if (DRY_RUN) {
        stats.imported += 1;
        stats.items.push({ id: templateId, action: existing ? 'UPDATE' : 'CREATE', version, brand, title: c.title });
      } else {
        await registry.upsert(tpl, { role: 'meridiq_import' });
        stats.imported += 1;
        stats.items.push({ id: templateId, action: existing ? 'UPDATE' : 'CREATE', version, brand, title: c.title });
      }
    } catch (err) {
      stats.errors += 1;
      stats.items.push({ id: c.apiId, action: 'ERROR', error: err.message });
    }
  }
  return stats;
}

function bumpMinor(version) {
  if (!version || !/^\d+\.\d+\.\d+$/.test(version)) return '1.0.0';
  const [maj, min, patch] = version.split('.').map(Number);
  return `${maj}.${min + 1}.0`;
}

async function main() {
  const meridiqDir = path.join(__dirname, '..', 'migration', 'meridiq');
  const qCatalog = JSON.parse(fs.readFileSync(path.join(meridiqDir, 'questionary-catalog.json'), 'utf8'));
  const cCatalog = JSON.parse(fs.readFileSync(path.join(meridiqDir, 'consent-catalog.json'), 'utf8'));

  const registry = await createCcoTemplateRegistry({
    filePath: path.join(__dirname, '..', 'data', 'cco-templates.json'),
  });

  console.log(`=== Meridiq Import ${DRY_RUN ? '(DRY-RUN)' : '(LIVE)'} ===`);
  console.log(`Questionnaires: ${qCatalog.count} total, ${qCatalog.migrateCount} to migrate`);
  console.log(`Consents: ${cCatalog.count || (cCatalog.consents || []).length} total`);
  console.log('');

  const qStats = await importQuestionnaires(registry, qCatalog);
  console.log(`--- Questionnaires: ${qStats.imported} imported, ${qStats.skipped} skipped, ${qStats.errors} errors ---`);
  for (const item of qStats.items.slice(0, 20)) {
    console.log(`  [${item.action}] ${(item.id || '').padEnd(48)} v${item.version || '?'} ${item.brand || ''} ${item.type || item.title || ''}`);
  }
  if (qStats.items.length > 20) console.log(`  ... (+${qStats.items.length - 20} more)`);

  const cStats = await importConsents(registry, cCatalog);
  console.log('');
  console.log(`--- Consents: ${cStats.imported} imported, ${cStats.skipped} skipped, ${cStats.errors} errors ---`);
  for (const item of cStats.items.slice(0, 20)) {
    console.log(`  [${item.action}] ${(item.id || '').slice(-48).padEnd(48)} v${item.version || '?'} ${item.brand || ''} "${(item.title || '').slice(0, 32)}"`);
  }
  if (cStats.items.length > 20) console.log(`  ... (+${cStats.items.length - 20} more)`);

  console.log('');
  console.log('=== STATS ===');
  console.log(JSON.stringify(registry.stats(), null, 2));
}

main().catch((err) => {
  console.error('Import failed:', err);
  process.exit(1);
});
