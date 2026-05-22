const test = require('node:test');
const assert = require('node:assert/strict');

const {
  ALLOWED_DRAFT_MODES,
  composeContextAwareDraft,
  resolveRecommendedMode,
} = require('../../src/intelligence/draftComposer');

function countWords(text = '') {
  return String(text || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

function countParagraphs(text = '') {
  return String(text || '')
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter(Boolean).length;
}

test('Draft composer returns three distinct modes and required structure', async () => {
  const result = await composeContextAwareDraft({
    intent: 'booking_request',
    tone: 'anxious',
    priorityLevel: 'Medium',
    tenantToneStyle: 'varm',
    originalMessage: 'Hej, jag vill boka men är orolig inför behandlingen.',
    customerProfile: { firstName: 'Anna' },
  });

  assert.equal(typeof result.draftModes.short, 'string');
  assert.equal(typeof result.draftModes.warm, 'string');
  assert.equal(typeof result.draftModes.professional, 'string');
  assert.notEqual(result.draftModes.short, result.draftModes.warm);
  assert.notEqual(result.draftModes.warm, result.draftModes.professional);
  assert.equal(['short', 'warm', 'professional'].includes(result.recommendedMode), true);
  assert.equal(typeof result.structureUsed.acknowledgement, 'string');
  assert.equal(typeof result.structureUsed.coreAnswer, 'string');
  assert.equal(typeof result.structureUsed.cta, 'string');
});

test('Draft composer enforces max 220 words and max 3 paragraphs per mode', async () => {
  const result = await composeContextAwareDraft({
    intent: 'follow_up',
    tone: 'neutral',
    priorityLevel: 'Medium',
    tenantToneStyle: 'balanserad',
    originalMessage: 'Detta är ett långt meddelande '.repeat(120),
    customerProfile: {},
  });

  for (const mode of ['short', 'warm', 'professional']) {
    const text = result.draftModes[mode];
    assert.equal(countWords(text) <= 220, true);
    assert.equal(countParagraphs(text) <= 3, true);
  }
});

test('Draft composer CTA varies by priority level', async () => {
  const critical = await composeContextAwareDraft({
    intent: 'pricing_question',
    tone: 'neutral',
    priorityLevel: 'Critical',
    tenantToneStyle: 'professionell',
    originalMessage: 'Vad kostar behandlingen?',
    customerProfile: {},
  });
  const low = await composeContextAwareDraft({
    intent: 'pricing_question',
    tone: 'neutral',
    priorityLevel: 'Low',
    tenantToneStyle: 'professionell',
    originalMessage: 'Vad kostar behandlingen?',
    customerProfile: {},
  });

  const criticalText = String(critical.draftModes[critical.recommendedMode] || '').toLowerCase();
  const lowText = String(low.draftModes[low.recommendedMode] || '').toLowerCase();
  assert.equal(criticalText.includes('inom 1 timme') || criticalText.includes('svara idag'), true);
  assert.equal(lowText.includes('när det passar dig'), true);
});

test('Draft composer strips forbidden guarantee/legal language', async () => {
  const result = await composeContextAwareDraft(
    {
      intent: 'complaint',
      tone: 'frustrated',
      priorityLevel: 'High',
      tenantToneStyle: 'varm',
      originalMessage: 'Ni garanterar 100% resultat annars juridisk process.',
      customerProfile: {},
      isMedicalTopic: false,
      isAcute: false,
    },
    {
      semanticResolver: async () => ({
        acknowledgement: 'Vi garanterar 100% resultat och juridisk uppföljning.',
        coreAnswer: 'Vi garanterar omedelbart resultat i varje fall.',
        cta: 'Kontakta advokat direkt.',
      }),
    }
  );

  const text = String(result.draftModes.professional || '').toLowerCase();
  assert.equal(text.includes('garanti'), false);
  assert.equal(text.includes('100%'), false);
  assert.equal(text.includes('jurid'), false);
  assert.equal(text.includes('advokat'), false);
});

test('resolveRecommendedMode follows locked mapping rules', () => {
  assert.equal(
    resolveRecommendedMode({ intent: 'booking_request', tone: 'neutral', tenantToneStyle: '' }),
    'warm'
  );
  assert.equal(
    resolveRecommendedMode({ intent: 'pricing_question', tone: 'neutral', tenantToneStyle: '' }),
    'professional'
  );
  assert.equal(
    resolveRecommendedMode({ intent: 'complaint', tone: 'frustrated', tenantToneStyle: 'varm' }),
    'professional'
  );
  assert.equal(
    resolveRecommendedMode({ intent: 'follow_up', tone: 'urgent', tenantToneStyle: 'varm' }),
    'short'
  );
  assert.equal(
    resolveRecommendedMode({ intent: 'follow_up', tone: 'anxious', tenantToneStyle: '' }),
    'warm'
  );
});

test('Draft composer can apply semantic structure fill via injected resolver', async () => {
  const result = await composeContextAwareDraft(
    {
      intent: 'follow_up',
      tone: 'neutral',
      priorityLevel: 'Medium',
      tenantToneStyle: 'balanserad',
      originalMessage: 'Kan ni återkoppla med status?',
      customerProfile: {},
    },
    {
      semanticResolver: async ({ deterministicStructure }) => ({
        acknowledgement: `${deterministicStructure.acknowledgement} Bekräftat.`,
        coreAnswer: deterministicStructure.coreAnswer,
        cta: deterministicStructure.cta,
      }),
    }
  );

  assert.equal(result.draftModes.short.includes('Bekräftat.'), true);
});

test('Draft composer changes output by mailbox writing profile for same message', async () => {
  const sharedInput = {
    intent: 'booking_request',
    tone: 'anxious',
    priorityLevel: 'High',
    tenantToneStyle: 'balanserad',
    originalMessage: 'Hej, jag vill boka en tid och känner mig orolig inför ingreppet.',
    customerProfile: { firstName: 'Sara' },
  };

  const egzonaStyle = await composeContextAwareDraft({
    ...sharedInput,
    writingProfile: {
      greetingStyle: 'Hej {{name}},',
      closingStyle: 'Bästa hälsningar',
      formalityLevel: 7,
      ctaStyle: 'calm-guiding',
      sentenceLength: 'medium',
      emojiUsage: false,
      warmthIndex: 7,
    },
  });

  const fazliStyle = await composeContextAwareDraft({
    ...sharedInput,
    writingProfile: {
      greetingStyle: 'Hej,',
      closingStyle: 'Vänliga hälsningar',
      formalityLevel: 9,
      ctaStyle: 'direct-structured',
      sentenceLength: 'short',
      emojiUsage: false,
      warmthIndex: 4,
    },
  });

  assert.notEqual(egzonaStyle.draftModes.warm, fazliStyle.draftModes.warm);
  assert.notEqual(egzonaStyle.draftModes.professional, fazliStyle.draftModes.professional);
});

test('Draft composer can include compact history support in reply structure', async () => {
  const result = await composeContextAwareDraft({
    intent: 'booking_request',
    tone: 'neutral',
    priorityLevel: 'High',
    tenantToneStyle: 'balanserad',
    originalMessage: 'Hej, jag behöver boka om min tid så snart som möjligt.',
    customerProfile: {
      firstName: 'Sara',
      historySignalPattern: 'reschedule',
      historyMailboxCount: 2,
    },
  });

  const text = String(result.draftModes[result.recommendedMode] || '').toLowerCase();
  assert.equal(text.includes('tidigare kontakt visar'), true);
  assert.equal(text.includes('tydliga tider'), true);
});

test('Draft composer can include outcome support in reply structure', async () => {
  const result = await composeContextAwareDraft({
    intent: 'follow_up',
    tone: 'neutral',
    priorityLevel: 'High',
    tenantToneStyle: 'balanserad',
    originalMessage: 'Hej, jag återkommer igen men får inget svar.',
    customerProfile: {
      firstName: 'Sara',
      historyOutcomeCode: 'no_response',
    },
  });

  const text = String(result.draftModes[result.recommendedMode] || '').toLowerCase();
  assert.equal(text.includes('tappade fart'), true);
  assert.equal(text.includes('tydlig och tidsatt cta'), true);
});

test('Draft composer can prefer calibrated mode when positive history is strong', async () => {
  const result = await composeContextAwareDraft({
    intent: 'booking_request',
    tone: 'neutral',
    priorityLevel: 'Medium',
    tenantToneStyle: 'balanserad',
    originalMessage: 'Hej, jag behöver boka om min tid.',
    customerProfile: {
      firstName: 'Sara',
      historyCalibrationPreferredMode: 'professional',
      historyCalibrationPositiveOutcomeCount: 3,
      historyCalibrationNegativeOutcomeCount: 1,
    },
  });

  assert.equal(result.recommendedMode, 'professional');
});

test('resolveRecommendedMode prioritizes complaint and urgent tone', () => {
  assert.equal(resolveRecommendedMode({ intent: 'complaint', tone: 'neutral' }), 'professional');
  assert.equal(resolveRecommendedMode({ intent: 'follow_up', tone: 'urgent' }), 'short');
});

test('resolveRecommendedMode honors calibrated preferred mode when evidence is strong', () => {
  const mode = resolveRecommendedMode({
    intent: 'follow_up',
    tone: 'neutral',
    customerProfile: {
      historyCalibrationPreferredMode: 'short',
      historyCalibrationPositiveOutcomeCount: 3,
      historyCalibrationNegativeOutcomeCount: 1,
    },
  });
  assert.equal(mode, 'short');
});

test('resolveRecommendedMode maps concise tenant style to short', () => {
  assert.equal(
    resolveRecommendedMode({
      intent: 'unclear',
      tone: 'neutral',
      tenantToneStyle: 'Vi vill vara korta och koncisa.',
    }),
    'short'
  );
});

test('resolveRecommendedMode prefers professional for high-formality writing profile', () => {
  assert.equal(
    resolveRecommendedMode({
      intent: 'unclear',
      tone: 'neutral',
      tenantToneStyle: 'balanserad',
      writingProfile: { formalityLevel: 9, warmthIndex: 3 },
    }),
    'professional'
  );
});

test('ALLOWED_DRAFT_MODES exporterar frysta tre standardlagen', () => {
  assert.deepEqual(new Set(ALLOWED_DRAFT_MODES), new Set(['short', 'warm', 'professional']));
  assert.throws(() => {
    ALLOWED_DRAFT_MODES.push('extra');
  });
});

test('resolveRecommendedMode cancellation med neutral ton blir professional', () => {
  assert.equal(
    resolveRecommendedMode({ intent: 'cancellation', tone: 'neutral', tenantToneStyle: '' }),
    'professional'
  );
});

test('composeContextAwareDraft med blank originalMessage ger alla tre lagen', async () => {
  const result = await composeContextAwareDraft({
    intent: 'unclear',
    tone: 'neutral',
    priorityLevel: 'Low',
    tenantToneStyle: 'balanserad',
    originalMessage: '   ',
    customerProfile: {},
  });
  for (const mode of ['short', 'warm', 'professional']) {
    assert.ok(String(result.draftModes[mode]).length > 20);
  }
});

test('Draft composer injects medical safety when isMedicalTopic flag is true', async () => {
  const result = await composeContextAwareDraft({
    intent: 'follow_up',
    tone: 'neutral',
    priorityLevel: 'Medium',
    tenantToneStyle: 'balanserad',
    originalMessage: 'Hej, jag har en fraga om min bokning.',
    customerProfile: {},
    isMedicalTopic: true,
    isAcute: false,
  });
  const text = String(result.draftModes.professional || '').toLowerCase();
  assert.ok(text.includes('medicinsk'));
});

test('Draft composer injects acute safety when isAcute flag is true', async () => {
  const result = await composeContextAwareDraft({
    intent: 'follow_up',
    tone: 'neutral',
    priorityLevel: 'Medium',
    tenantToneStyle: 'balanserad',
    originalMessage: 'Enkel fraga om tider.',
    customerProfile: {},
    isMedicalTopic: false,
    isAcute: true,
  });
  const text = String(result.draftModes.warm || '').toLowerCase();
  assert.ok(text.includes('112') || text.includes('akutmottagning'));
});

test('Draft composer combines medical and acute safety copy', async () => {
  const result = await composeContextAwareDraft({
    intent: 'unclear',
    tone: 'neutral',
    priorityLevel: 'High',
    tenantToneStyle: 'professionell',
    originalMessage: 'Jag mar illa.',
    customerProfile: {},
    isMedicalTopic: true,
    isAcute: true,
  });
  const text = String(result.draftModes.professional || '').toLowerCase();
  assert.ok(text.includes('112'));
  assert.ok(text.includes('medicinsk'));
});
