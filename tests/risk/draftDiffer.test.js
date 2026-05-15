const test = require('node:test');
const assert = require('node:assert/strict');

const {
  diffTokens,
  detectFormalityShift,
  detectFactAdditions,
  buildDiffReport,
  wordCount,
  sentenceCount,
} = require('../../src/risk/draftDiffer');

test('wordCount and sentenceCount basic counts', () => {
  assert.equal(wordCount('one two three'), 3);
  assert.equal(sentenceCount('First. Second! Third?'), 3);
});

test('wordCount treats non-string as empty; sentenceCount empty string is 0', () => {
  assert.equal(wordCount(null), 0);
  assert.equal(sentenceCount(''), 0);
  assert.equal(sentenceCount('   '), 0);
});

test('wordCount returns 0 for punctuation-only text', () => {
  assert.equal(wordCount('... --- !!!'), 0);
});

test('sentenceCount counts only segments ending with . ! or ?', () => {
  assert.equal(sentenceCount('No closing punctuation'), 0);
  assert.equal(sentenceCount('Single.'), 1);
  assert.equal(sentenceCount('One? Two! Three.'), 3);
});

test('buildDiffReport default and empty object inputs are identical empty drafts', () => {
  const a = buildDiffReport();
  const b = buildDiffReport({});
  assert.equal(a.identicalDraft, true);
  assert.equal(b.identicalDraft, true);
  assert.ok(a.classifications.includes('accepted_unchanged'));
  assert.ok(b.classifications.includes('accepted_unchanged'));
});

test('buildDiffReport normalizes non-string drafts to empty identical pair', () => {
  const r = buildDiffReport({ originalDraft: null, editedDraft: undefined });
  assert.equal(r.identicalDraft, true);
  assert.ok(r.classifications.includes('accepted_unchanged'));
});

test('buildDiffReport trims both sides for identicalDraft comparison', () => {
  const r = buildDiffReport({
    originalDraft: '  same text  ',
    editedDraft: 'same text',
  });
  assert.equal(r.identicalDraft, true);
});

test('buildDiffReport classifies both added_date and added_time', () => {
  const r = buildDiffReport({
    originalDraft: 'Vi återkommer.',
    editedDraft: 'Bokad 2026-08-15 kl 16:45 hos oss.',
  });
  assert.ok(r.classifications.includes('added_date'));
  assert.ok(r.classifications.includes('added_time'));
});

test('diffTokens reports added and removed tokens', () => {
  const d = diffTokens('hello world', 'hello there');
  assert.ok(d.removed.length > 0 || d.added.length > 0);
  assert.ok(d.common >= 1);
});

test('diffTokens empty inputs return empty sides', () => {
  assert.deepEqual(diffTokens('', ''), { added: [], removed: [], common: 0 });
  const onlyB = diffTokens('', 'a b');
  assert.deepEqual(onlyB.removed, []);
  assert.ok(onlyB.added.length >= 1);
  const onlyA = diffTokens('x y', '');
  assert.deepEqual(onlyA.added, []);
  assert.ok(onlyA.removed.length >= 1);
});

test('detectFormalityShift detects more formal closing', () => {
  const shift = detectFormalityShift('Hey thanks!', 'Med vänlig hälsning\nTack på förhand.');
  assert.equal(shift, 'more_formal');
});

test('detectFormalityShift detects more casual rewrite', () => {
  const shift = detectFormalityShift(
    'Med vänlig hälsning. Tack på förhand.',
    'hey thanks! super kul att höra från dig'
  );
  assert.equal(shift, 'more_casual');
});

test('detectFormalityShift returns unchanged when scores stay close', () => {
  assert.equal(detectFormalityShift('Hej.', 'Hallå.'), 'unchanged');
});

test('detectFactAdditions finds new ISO date in edited draft', () => {
  const facts = detectFactAdditions('Vi ses snart.', 'Vi ses 2026-06-01 kl 10:00.');
  assert.ok(facts.addedDates.includes('2026-06-01'));
  assert.ok(facts.addedTimes.some((t) => t.includes('10')));
});

test('detectFactAdditions tracks removed times, dates and prices', () => {
  const facts = detectFactAdditions(
    '2026-01-10 kl 15:30 kostar 500 kr.',
    'Vi återkommer utan siffror.'
  );
  assert.ok(facts.removedDates.includes('2026-01-10'));
  assert.ok(facts.removedTimes.some((t) => t.includes('15')));
  assert.ok(facts.removedPrices.some((p) => p.includes('500')));
});

test('detectFactAdditions finds new price token', () => {
  const facts = detectFactAdditions('Pris enligt offert.', 'Priset är 1200 kr inklusive moms.');
  assert.ok(facts.addedPrices.some((p) => p.includes('1200')));
});

test('buildDiffReport marks identical drafts', () => {
  const r = buildDiffReport({ originalDraft: 'Same', editedDraft: 'Same' });
  assert.equal(r.identicalDraft, true);
  assert.ok(r.classifications.includes('accepted_unchanged'));
});

test('buildDiffReport classifies major shortening', () => {
  const long = Array.from({ length: 40 }, () => 'word').join(' ');
  const short = 'word word';
  const r = buildDiffReport({ originalDraft: long, editedDraft: short });
  assert.ok(r.classifications.includes('shortened'));
  assert.ok(r.wordCounts.delta < 0);
});

test('buildDiffReport classifies lengthened drafts', () => {
  const short = 'one two three four five';
  const long = `${short} ${Array.from({ length: 30 }, () => 'extra').join(' ')}`;
  const r = buildDiffReport({ originalDraft: short, editedDraft: long });
  assert.ok(r.classifications.includes('lengthened'));
  assert.ok(r.wordCounts.delta > 0);
});

test('buildDiffReport classifies added price and removed time', () => {
  const price = buildDiffReport({
    originalDraft: 'Vi återkommer.',
    editedDraft: 'Det kostar 2500 kr.',
  });
  assert.ok(price.classifications.includes('added_price'));

  const time = buildDiffReport({
    originalDraft: 'Ring kl 09:00.',
    editedDraft: 'Ring när som helst.',
  });
  assert.ok(time.classifications.includes('removed_time'));
});

test('buildDiffReport classifies removed price when numeric amount is deleted', () => {
  const r = buildDiffReport({
    originalDraft: 'Det kostar 3500 kr och faktureras direkt.',
    editedDraft: 'Priset meddelas senare.',
  });
  assert.ok(r.classifications.includes('removed_price'));
});

test('buildDiffReport includes tone_more_formal when rewrite shifts style', () => {
  const r = buildDiffReport({
    originalDraft: 'hey! tack!',
    editedDraft: 'Bästa kund, med vänlig hälsning och tack på förhand.',
  });
  assert.ok(r.classifications.includes('tone_more_formal'));
  assert.equal(r.formalityShift, 'more_formal');
});

test('buildDiffReport caps learnings list to max 6 entries', () => {
  const r = buildDiffReport({
    originalDraft: 'Akut kl 09:00 den 2026-01-10 kostar 500 kr. Hej! Tack!',
    editedDraft:
      'Bästa kund, med vänlig hälsning. Ring 112. kl 11:00 den 2026-01-11 kostar 1800 kr och extra text extra text extra text extra text extra text extra text extra text.',
  });
  assert.ok(r.learnings.length <= 6);
});

test('buildDiffReport falls back to minor_edit for small neutral edits', () => {
  const r = buildDiffReport({
    originalDraft: 'Hej Anna, välkommen till oss.',
    editedDraft: 'Hej Anna, välkommen till er.',
  });
  assert.ok(r.classifications.includes('minor_edit'));
  assert.equal(r.identicalDraft, false);
});

test('wordCount och sentenceCount behandlar icke-sträng som tom text', () => {
  assert.equal(wordCount(123), 0);
  assert.equal(sentenceCount(null), 0);
});

test('diffTokens identiska utkast ger inga tillagda eller borttagna token', () => {
  const d = diffTokens('hello world', 'hello world');
  assert.deepEqual(d.added, []);
  assert.deepEqual(d.removed, []);
  assert.ok(d.common >= 1);
});

test('detectFactAdditions hanterar nullish original som tom', () => {
  const facts = detectFactAdditions(null, 'Möte 2026-12-01 kl 14:30.');
  assert.ok(facts.addedDates.includes('2026-12-01'));
  assert.ok(facts.addedTimes.some((t) => t.includes('14')));
});
