#!/usr/bin/env node
const fs = require('node:fs/promises');
const path = require('node:path');

const { TEMPLATE_CATEGORIES } = require('../src/templates/constants');

const OUTPUT_FILE = path.join(process.cwd(), 'docs', 'risk', 'gold-set-v1.json');

const SAFE_TEMPLATES = Object.freeze([
  'Hej {{patient_name}}, tack för att du kontaktade oss. Vi återkommer med tider inom två arbetsdagar.',
  'Din bokning är registrerad. Ta med legitimation och kom gärna tio minuter före besöket.',
  'Efter behandlingen rekommenderar vi att du följer de skriftliga råden du fått vid utskrivning.',
  'Vi har uppdaterat din kontaktinformation i systemet och bekräftar mottagandet av ditt meddelande.',
  'Tack för ditt förtroende. Vi skickar en ny uppdatering när nästa steg är planerat.',
  'Du kan svara på detta mejl om du vill komplettera med fler praktiska frågor inför besöket.',
  'Vi bekräftar att din uppföljning är bokad och att ansvarig behandlare tar emot dig på plats.',
  'Detta är en administrativ bekräftelse med information om datum, tid och kontaktvägar.',
  'Vi har mottagit din förfrågan och återkopplar med tillgängliga tider så snart som möjligt.',
  'Om du behöver omboka kan du använda länken i bokningsbekräftelsen eller kontakta receptionen.',
]);

const BORDERLINE_TEMPLATES = Object.freeze([
  'Du måste följa alla steg omedelbart för att processen ska fungera enligt planen.',
  'Vi behöver att du omedelbart uppdaterar formuläret och alltid håller informationen aktuell.',
  'Inför besöket måste checklistan fyllas i omedelbart så att teamet kan förbereda rätt underlag.',
  'Du måste svara omedelbart på uppföljningen och alltid använda rätt referensnummer i svaret.',
  'Planen kräver att du omedelbart återkopplar och alltid följer instruktionerna i meddelandet.',
  'Vi behöver omedelbart bekräftelse från dig och du måste svara i samma tråd för spårbarhet.',
  'Du måste omedelbart läsa igenom informationen och alltid återkomma om något saknas.',
  'För att hålla processen stabil måste du omedelbart verifiera uppgifterna och alltid följa checklistan.',
  'Du måste omedelbart skicka komplettering och alltid använda samma kontaktkanal tills ärendet är klart.',
  'Vi behöver omedelbart en uppdatering och du måste alltid markera ämnesraden enligt instruktionen.',
]);

const CRITICAL_TEMPLATES = Object.freeze([
  {
    expectedRiskLevel: 4,
    content: 'Vi garanterar 100 % resultat efter denna behandling och helt säker effekt för alla patienter.',
  },
  {
    expectedRiskLevel: 4,
    content: 'Denna metod botar håravfall direkt och ger riskfri behandling utan biverkningar.',
  },
  {
    expectedRiskLevel: 4,
    content: 'Du har diagnos androgen alopeci och vi diagnostiserar tillståndet redan i detta meddelande.',
  },
  {
    expectedRiskLevel: 4,
    content: 'Du lider av sjukdomen och vi garanterar att du blir helt återställd snabbt.',
  },
  {
    expectedRiskLevel: 5,
    content: 'Vid akut andningssvårigheter och svår smärta ska du invänta nästa ordinarie tid.',
  },
  {
    expectedRiskLevel: 5,
    content: 'Om läget känns akut med svår smärta ska du stanna hemma och avvakta vårt svar.',
  },
  {
    expectedRiskLevel: 5,
    content: 'Akut försämring och andningssvårigheter hanteras genom att du väntar till imorgon.',
  },
  {
    expectedRiskLevel: 5,
    content: 'Detta är akut och du har svår smärta, men fortsätt endast med egenvård tills vidare.',
  },
  {
    expectedRiskLevel: 4,
    content: 'Vi garanterar att behandlingen är helt riskfri och att du inte får några biverkningar.',
  },
  {
    expectedRiskLevel: 4,
    content: 'Du har sjukdomen och vi garanterar ett botande resultat inom kort tid.',
  },
]);

function makeCase({
  id,
  category,
  content,
  expectedBand,
  expectedRiskLevel,
  variableValidation = null,
  notes = '',
}) {
  return {
    id,
    category,
    content,
    expectedBand,
    expectedRiskLevel,
    ...(variableValidation ? { variableValidation } : {}),
    ...(notes ? { notes } : {}),
  };
}

async function main() {
  const categories = [...TEMPLATE_CATEGORIES];
  const cases = [];

  for (let index = 0; index < 50; index += 1) {
    const category = categories[index % categories.length];
    const base = SAFE_TEMPLATES[index % SAFE_TEMPLATES.length];
    const expectedRiskLevel = index % 7 === 0 ? 2 : 1;
    const content = `${base} Referens SAFE-${String(index + 1).padStart(3, '0')}.`;
    cases.push(
      makeCase({
        id: `safe-${String(index + 1).padStart(3, '0')}`,
        category,
        content,
        expectedBand: 'safe',
        expectedRiskLevel,
        notes: 'Baslinje utan policy-triggers.',
      })
    );
  }

  for (let index = 0; index < 50; index += 1) {
    const category = categories[index % categories.length];
    const base = BORDERLINE_TEMPLATES[index % BORDERLINE_TEMPLATES.length];
    const content = `${base} Referens BORDER-${String(index + 1).padStart(3, '0')}.`;
    cases.push(
      makeCase({
        id: `borderline-${String(index + 1).padStart(3, '0')}`,
        category,
        content,
        expectedBand: 'borderline',
        expectedRiskLevel: 3,
        variableValidation: {
          unknownVariables: ['{{unsupported_variable}}'],
          missingRequiredVariables: ['{{medical_disclaimer}}'],
        },
        notes: 'Borderline via kombinerad semantic signal + variabelavvikelser.',
      })
    );
  }

  for (let index = 0; index < 50; index += 1) {
    const category = categories[index % categories.length];
    const base = CRITICAL_TEMPLATES[index % CRITICAL_TEMPLATES.length];
    const content = `${base.content} Referens CRIT-${String(index + 1).padStart(3, '0')}.`;
    cases.push(
      makeCase({
        id: `critical-${String(index + 1).padStart(3, '0')}`,
        category,
        content,
        expectedBand: 'critical',
        expectedRiskLevel: base.expectedRiskLevel,
        notes: 'Policy floor förväntas slå igenom.',
      })
    );
  }

  const payload = {
    version: 'gold-set-v1',
    source: 'Arcana risk precision benchmark',
    generatedAt: new Date().toISOString(),
    totals: {
      cases: cases.length,
      safe: 50,
      borderline: 50,
      critical: 50,
    },
    cases,
  };

  await fs.mkdir(path.dirname(OUTPUT_FILE), { recursive: true });
  await fs.writeFile(OUTPUT_FILE, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  process.stdout.write(`✅ Gold set genererat: ${OUTPUT_FILE} (${cases.length} cases)\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
