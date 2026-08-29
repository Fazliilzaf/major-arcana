'use strict';

/**
 * Systemmallar — mallar som produkten SJÄLV skickar och som därför måste
 * finnas i registret på varje miljö, inte bara där någon råkat köra en seeder.
 *
 * Bakgrunden: ORD-125 flyttade portal-notisen från hårdkodad HTML till en
 * mall bakom den juridiska grinden. Grinden är fail-closed — saknas mallen
 * skickas ingenting. Seedern (scripts/seed-portal-reply-template.js) skriver
 * till data/cco-templates.json, men `data/` är gitignored och ingen kör ett
 * skript på Renders disk. Följden: mallen fanns lokalt och saknades i prod,
 * alltså en notis som aldrig kunde gå ut oavsett flaggor.
 *
 * Därför registreras systemmallar vid uppstart i stället. Idempotent: upsert
 * med samma ämne och kropp ger ingen ny revision och rör inte legal-statusen.
 *
 * VIKTIGT: `upsert` sätter legalReviewStatus 'pending'. Det är rätt utgångs-
 * läge och ska inte kringgås här — en mall godkänns av en människa via
 * POST /api/v1/cco-templates/:id/legal-review, aldrig av kod vid boot.
 */

// ORDAGRANT samma text som seedern och som den gamla hårdkodade notisen.
// Ändras den här måste seedern ändras likadant — därför bor definitionen på
// ETT ställe och båda importerar den.
const PORTAL_REPLY_TEMPLATE = Object.freeze({
  id: 'portal_reply_notify',
  name: 'Portal-notis vid klinik-svar',
  type: 'notification',
  lang: 'sv',
  subject: 'Du har ett nytt svar i din portal',
  body:
    'Hej {{firstName}},\n\n' +
    'Kliniken har svarat dig i din trygga portal.\n\n' +
    '{{portalUrl}}\n\n' +
    'Hair TP Clinic',
});

const SYSTEM_TEMPLATES = Object.freeze([PORTAL_REPLY_TEMPLATE]);

/**
 * Säkerställ att varje systemmall finns i registret.
 *
 * Får aldrig fälla uppstarten: en mall som inte kan registreras är ett
 * problem för utskicken, inte för servern. Fel loggas och sväljs.
 *
 * @returns {Promise<{created:string[], existing:string[], failed:string[]}>}
 */
async function ensureSystemTemplates(registry, logger = console) {
  const result = { created: [], existing: [], failed: [] };
  if (!registry || typeof registry.upsert !== 'function') return result;

  for (const template of SYSTEM_TEMPLATES) {
    try {
      const before = typeof registry.get === 'function' ? registry.get(template.id) : null;
      await registry.upsert(template, { role: 'system' });
      if (before) result.existing.push(template.id);
      else {
        result.created.push(template.id);
        logger?.log?.(
          `[cco-templates] systemmall registrerad: ${template.id} ` +
            '(legalReviewStatus: pending — kräver juridiskt godkännande innan utskick)'
        );
      }
    } catch (error) {
      result.failed.push(template.id);
      logger?.warn?.(
        `[cco-templates] kunde inte registrera systemmallen ${template.id}: ` +
          String((error && error.message) || error)
      );
    }
  }
  return result;
}

module.exports = {
  PORTAL_REPLY_TEMPLATE,
  SYSTEM_TEMPLATES,
  ensureSystemTemplates,
};
