const test = require('node:test');
const assert = require('node:assert/strict');

const {
  VARIABLE_WHITELIST_BY_CATEGORY,
  extractTemplateVariables,
  resolveVariablePolicy,
  buildVariablePolicyMeta,
  validateTemplateVariables,
  applyChannelSignature,
} = require('../../src/templates/variables');

test('extractTemplateVariables parses spaced mustache tokens', () => {
  const vars = extractTemplateVariables('Hej {{ first_name }} — {{clinic_name}} och {{ first_name }}');
  assert.deepEqual(vars.sort(), ['clinic_name', 'first_name']);
});

test('extractTemplateVariables deduplicerar upprepade tokens', () => {
  const vars = extractTemplateVariables('{{a}} {{b}} {{a}}');
  assert.equal(vars.length, 2);
  assert.ok(vars.includes('a'));
  assert.ok(vars.includes('b'));
});

test('extractTemplateVariables returns empty for non-string or empty', () => {
  assert.deepEqual(extractTemplateVariables(''), []);
  assert.deepEqual(extractTemplateVariables(null), []);
  assert.deepEqual(extractTemplateVariables(123), []);
});

test('extractTemplateVariables tillater underscore och siffror i token', () => {
  const vars = extractTemplateVariables('{{ patient_id_2 }} och {{x9}}');
  assert.deepEqual(vars.sort(), ['patient_id_2', 'x9']);
});

test('extractTemplateVariables ignorerar tom token mellan klamrar', () => {
  assert.deepEqual(extractTemplateVariables('Hej {{   }} du'), []);
});

test('extractTemplateVariables ignorerar mustasch med bindestreck i namn', () => {
  assert.deepEqual(extractTemplateVariables('Hej {{first-name}} du'), []);
});

test('extractTemplateVariables matchar bara första giltiga token vid dubbla klamrar', () => {
  const vars = extractTemplateVariables('{{{{first_name}}}}');
  assert.deepEqual(vars, ['first_name']);
});

test('validateTemplateVariables saknade required trots tom placeholder-lista', () => {
  const r = validateTemplateVariables({
    category: 'BOOKING',
    content: 'Statisk text utan variabler.',
  });
  assert.equal(r.ok, false);
  assert.deepEqual(r.missingRequiredVariables, ['clinic_name']);
  assert.deepEqual(r.unknownVariables, []);
});

test('resolveVariablePolicy merges tenant allowlist and required overrides', () => {
  const policy = resolveVariablePolicy({
    category: 'BOOKING',
    allowlistOverridesByCategory: { BOOKING: ['custom_token'] },
    requiredOverridesByCategory: { BOOKING: ['booking_link'] },
  });
  assert.equal(policy.category, 'BOOKING');
  assert.ok(policy.allowedVariables.includes('first_name'));
  assert.ok(policy.allowedVariables.includes('custom_token'));
  assert.ok(policy.requiredVariables.includes('clinic_name'));
  assert.ok(policy.requiredVariables.includes('booking_link'));
});

test('resolveVariablePolicy normaliserar kategori till versaler', () => {
  const policy = resolveVariablePolicy({ category: '  booking ' });
  assert.equal(policy.category, 'BOOKING');
  assert.ok(policy.allowedVariables.includes('first_name'));
});

test('resolveVariablePolicy deduplicerar överlappande allowlist och required', () => {
  const policy = resolveVariablePolicy({
    category: 'LEAD',
    allowlistOverridesByCategory: { LEAD: ['  clinic_name  ', 'lead_source'] },
    requiredOverridesByCategory: { LEAD: ['clinic_name', 'booking_link'] },
  });
  assert.equal(policy.allowedVariables.filter((v) => v === 'clinic_name').length, 1);
  assert.equal(policy.requiredVariables.filter((v) => v === 'clinic_name').length, 1);
});

test('validateTemplateVariables flags unknowns and missing required', () => {
  const r = validateTemplateVariables({
    category: 'BOOKING',
    content: 'Hej {{first_name}} {{typo_var}}',
  });
  assert.equal(r.ok, false);
  assert.deepEqual(r.missingRequiredVariables, ['clinic_name']);
  assert.ok(r.unknownVariables.includes('typo_var'));
});

test('validateTemplateVariables använder explicit variables-lista framför content-scan', () => {
  const r = validateTemplateVariables({
    category: 'BOOKING',
    content: '{{typo_var}}',
    variables: ['first_name', 'clinic_name'],
  });
  assert.equal(r.ok, true);
  assert.deepEqual(r.unknownVariables, []);
  assert.deepEqual(r.missingRequiredVariables, []);
});

test('validateTemplateVariables tom variables-array skannar content', () => {
  const r = validateTemplateVariables({
    category: 'BOOKING',
    content: '{{first_name}} hos {{clinic_name}}.',
    variables: [],
  });
  assert.equal(r.ok, true);
  assert.deepEqual(r.unknownVariables, []);
});

test('validateTemplateVariables INTERNAL utan required är ok med staff_name', () => {
  const r = validateTemplateVariables({
    category: 'INTERNAL',
    content: 'Hej {{staff_name}}',
  });
  assert.equal(r.ok, true);
});

test('buildVariablePolicyMeta enumerates every template category', () => {
  const meta = buildVariablePolicyMeta();
  assert.equal(meta.categories.length, 5);
  for (const cat of meta.categories) {
    assert.ok(Array.isArray(meta.variableWhitelist[cat]));
    assert.ok(Array.isArray(meta.requiredVariables[cat]));
  }
  assert.ok(VARIABLE_WHITELIST_BY_CATEGORY.INTERNAL.length > 0);
});

test('buildVariablePolicyMeta propagerar overrides per kategori', () => {
  const meta = buildVariablePolicyMeta({
    allowlistOverridesByCategory: { INTERNAL: ['tenant_internal_flag'] },
    requiredOverridesByCategory: { BOOKING: ['booking_link'] },
  });
  assert.ok(meta.variableWhitelist.INTERNAL.includes('tenant_internal_flag'));
  assert.ok(meta.requiredVariables.BOOKING.includes('booking_link'));
  assert.ok(meta.requiredVariables.INTERNAL.length === 0);
});

test('validateTemplateVariables explicit variables med tom sträng ger unknown tom token', () => {
  const r = validateTemplateVariables({
    category: 'BOOKING',
    content: '{{first_name}}',
    variables: ['clinic_name', ''],
  });
  assert.equal(r.ok, false);
  assert.ok(r.unknownVariables.includes(''));
  assert.deepEqual(r.missingRequiredVariables, []);
});

test('applyChannelSignature appends once and skips duplicate', () => {
  const sig = '— Team';
  const base = 'Rad ett';
  const once = applyChannelSignature({
    content: base,
    channel: 'email',
    signaturesByChannel: { email: sig },
  });
  assert.equal(once.endsWith(sig), true);
  const twice = applyChannelSignature({
    content: once,
    channel: 'email',
    signaturesByChannel: { email: sig },
  });
  assert.equal(twice, once);
});

test('applyChannelSignature no-op utan kanal, signatur eller tomt innehåll', () => {
  assert.equal(applyChannelSignature({ content: '   ', channel: 'email', signaturesByChannel: { email: 'X' } }), '');
  assert.equal(
    applyChannelSignature({
      content: 'Hej',
      channel: '  ',
      signaturesByChannel: { email: '—' },
    }),
    'Hej'
  );
  assert.equal(
    applyChannelSignature({
      content: 'Hej',
      channel: 'email',
      signaturesByChannel: { email: '   ' },
    }),
    'Hej'
  );
});

test('resolveVariablePolicy ger tom policy för okänd kategori', () => {
  const policy = resolveVariablePolicy({ category: 'UNKNOWN_CATEGORY' });
  assert.equal(policy.category, 'UNKNOWN_CATEGORY');
  assert.deepEqual(policy.allowedVariables, []);
  assert.deepEqual(policy.requiredVariables, []);
});

test('validateTemplateVariables för okänd kategori markerar variabler som unknown', () => {
  const result = validateTemplateVariables({
    category: 'UNKNOWN_CATEGORY',
    content: 'Hej {{first_name}}',
  });
  assert.equal(result.ok, false);
  assert.ok(result.unknownVariables.includes('first_name'));
  assert.deepEqual(result.missingRequiredVariables, []);
});

test('applyChannelSignature normaliserar channel till lowercase/trim', () => {
  const out = applyChannelSignature({
    content: 'Hej kund',
    channel: '  EMAIL  ',
    signaturesByChannel: { email: '— Teamet' },
  });
  assert.ok(out.endsWith('— Teamet'));
});

test('applyChannelSignature ignorerar signaturesByChannel när det inte är objekt', () => {
  const out = applyChannelSignature({
    content: 'Hej',
    channel: 'email',
    signaturesByChannel: 'not-an-object',
  });
  assert.equal(out, 'Hej');
});

test('applyChannelSignature no-op vid saknat argument eller tomt innehall', () => {
  assert.equal(applyChannelSignature(), '');
  assert.equal(applyChannelSignature({}), '');
});

test('applyChannelSignature ignorerar signatur som inte är sträng', () => {
  const out = applyChannelSignature({
    content: 'Hej',
    channel: 'email',
    signaturesByChannel: { email: 12345 },
  });
  assert.equal(out, 'Hej');
});
