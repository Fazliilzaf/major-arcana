const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildCanonicalMailContentSections,
  extractTextFromHtml,
} = require('../../src/ops/ccoMailContentParser');

test('buildCanonicalMailContentSections sectionerar html till primary, signature, quoted och system', () => {
  const sections = buildCanonicalMailContentSections({
    primaryBodyHtml: `
      <div>Du får inte ofta e-post från patient@example.com.</div>
      <div>Hej Exona,</div>
      <div>Kan vi boka om till fredag?</div>
      <div>Med vänlig hälsning</div>
      <table role="presentation"><tr><td><img src="https://example.com/logo.png" alt="Logo" width="94" /></td><td>Vincent<br />vincent@example.com</td></tr></table>
      <div>Från: Contact &lt;contact@hairtpclinic.com&gt;</div>
      <div>Datum: 2026-04-07</div>
      <div>Till: Vincent &lt;vincent@example.com&gt;</div>
      <div>Ämne: Sv: Ombokning</div>
    `,
    sourceText:
      'Du får inte ofta e-post från patient@example.com. Hej Exona, Kan vi boka om till fredag? Med vänlig hälsning Vincent Från: Contact <contact@hairtpclinic.com>',
  });

  assert.equal(sections.mode, 'html_structured');
  assert.equal(sections.diagnostics.htmlSectioned, true);
  assert.match(sections.primaryBody.text, /Kan vi boka om till fredag/i);
  assert.match(sections.primaryBody.html, /Hej Exona/i);
  assert.doesNotMatch(sections.primaryBody.html, /Från:\s*Contact/i);
  assert.ok(sections.signatureBlock);
  assert.match(sections.signatureBlock.text, /Med vänlig hälsning/i);
  assert.match(sections.signatureBlock.html, /<table\b/i);
  assert.equal(sections.signatureBlock.truth.confidence, 'high');
  assert.equal(sections.signatureBlock.truth.visibleInReadSurface, false);
  assert.equal(sections.diagnostics.signatureConfidence, 'high');
  assert.equal(sections.diagnostics.signatureVisibleInReadSurface, false);
  assert.equal(sections.quotedBlocks.length, 1);
  assert.match(sections.quotedBlocks[0].text, /Från:\s*Contact/i);
  assert.match(sections.quotedBlocks[0].html, /Ämne:\s*Sv: Ombokning/i);
  assert.equal(sections.systemBlocks.length, 1);
  assert.match(sections.systemBlocks[0].text, /Du får inte ofta e-post/i);
});

test('buildCanonicalMailContentSections faller tillbaka till textsektionering när html saknas', () => {
  const sections = buildCanonicalMailContentSections({
    primaryBodyHtml: '',
    sourceText:
      'Hej Exona,\nKan vi boka om till fredag?\n\nMed vänlig hälsning\nVincent\n\nFrån: Contact <contact@hairtpclinic.com>',
  });

  assert.equal(sections.mode, 'text_fallback');
  assert.match(sections.primaryBody.text, /Kan vi boka om till fredag/i);
  assert.equal(sections.primaryBody.html, null);
  assert.match(sections.signatureBlock.text, /Med vänlig hälsning/i);
  assert.equal(sections.signatureBlock.truth.confidence, 'high');
  assert.equal(sections.signatureBlock.truth.visibleInReadSurface, true);
  assert.equal(sections.diagnostics.signatureConfidence, 'high');
  assert.equal(sections.diagnostics.signatureVisibleInReadSurface, true);
  assert.match(sections.quotedBlocks[0].text, /Från:\s*Contact/i);
});

test('buildCanonicalMailContentSections håller Hair TP-signaturer synliga i read-surface trots layouttung html', () => {
  const sections = buildCanonicalMailContentSections({
    primaryBodyHtml: `
      <div>Hej Egzona,</div>
      <div>Detta är ett kontrollerat live signaturtest.</div>
      <div>Bästa hälsningar</div>
      <table role="presentation">
        <tr>
          <td><img src="https://arcana.hairtpclinic.se/assets/hair-tp-clinic/hairtpclinic-mark-light.svg" alt="Hair TP Clinic" width="68" /></td>
          <td>
            Hair TP Clinic<br />
            Hårspecialist I Hårtransplantationer &amp; PRP-injektioner<br />
            031-88 11 66<br />
            fazli@hairtpclinic.com<br />
            Vasaplatsen 2, 411 34 Göteborg
          </td>
        </tr>
      </table>
    `,
    sourceText:
      'Hej Egzona. Detta är ett kontrollerat live signaturtest. Bästa hälsningar Fazli Krasniqi Hårspecialist I Hårtransplantationer & PRP-injektioner 031-88 11 66 fazli@hairtpclinic.com Vasaplatsen 2, 411 34 Göteborg',
  });

  assert.ok(sections.signatureBlock);
  assert.equal(sections.signatureBlock.truth.confidence, 'high');
  assert.equal(sections.signatureBlock.truth.visibleInReadSurface, true);
  assert.equal(sections.diagnostics.signatureVisibleInReadSurface, true);
});

test('extractTextFromHtml returns empty for blank input', () => {
  assert.equal(extractTextFromHtml(''), '');
  assert.equal(extractTextFromHtml('   \n\t  '), '');
});

test('extractTextFromHtml decodes entities and line breaks', () => {
  const text = extractTextFromHtml(
    '<p>A &amp; B&nbsp;C</p><br /><div>&#x20AC; 100</div>'
  );
  assert.match(text, /A & B C/);
  assert.match(text, /€ 100/);
  assert.ok(text.includes('\n'));
});

test('extractTextFromHtml strips tags and collapses whitespace', () => {
  const text = extractTextFromHtml('<li>First</li><li>Second</li>');
  assert.match(text, /• First/);
  assert.match(text, /• Second/);
});

test('extractTextFromHtml returnerar tom sträng for icke-strang input', () => {
  assert.equal(extractTextFromHtml(null), '');
  assert.equal(extractTextFromHtml(undefined), '');
  assert.equal(extractTextFromHtml(123), '');
});

test('extractTextFromHtml avkodar decimal numeriska entiteter', () => {
  const text = extractTextFromHtml('<p>&#8364; 50</p>');
  assert.match(text, /€\s*50/);
});

test('extractTextFromHtml infogar radbrytning mellan stangande p-taggar', () => {
  const text = extractTextFromHtml('<p>Rad ett</p><p>Rad två</p>');
  assert.match(text, /Rad ett/);
  assert.match(text, /Rad två/);
  assert.ok(text.includes('\n'));
});

test('buildCanonicalMailContentSections anvander textfallback nar html ar blank efter trim', () => {
  const sections = buildCanonicalMailContentSections({
    primaryBodyHtml: '   \n\t  ',
    sourceText: 'Endast text\nNästa rad',
  });
  assert.equal(sections.mode, 'text_fallback');
  assert.match(sections.primaryBody.text, /Endast text/);
  assert.match(sections.primaryBody.text, /Nästa rad/);
  assert.equal(sections.primaryBody.html, null);
});

test('buildCanonicalMailContentSections enkel html utan citat signatur eller systemblock', () => {
  const sections = buildCanonicalMailContentSections({
    primaryBodyHtml: '<div>Bara ett stycke.</div>',
    sourceText: 'Bara ett stycke.',
  });
  assert.equal(sections.mode, 'html_structured');
  assert.equal(sections.quotedBlocks.length, 0);
  assert.equal(sections.systemBlocks.length, 0);
  assert.equal(sections.signatureBlock, null);
  assert.equal(sections.primaryBody.text, 'Bara ett stycke.');
});

test('buildCanonicalMailContentSections harleder sourceText fran html nar sourceText ar tom', () => {
  const sections = buildCanonicalMailContentSections({
    primaryBodyHtml: '<p>Endast&nbsp;html</p>',
    sourceText: '',
  });
  assert.equal(sections.mode, 'html_structured');
  assert.equal(sections.primaryBody.text, 'Endast html');
});

test('extractTextFromHtml tar bort carriage return', () => {
  const text = extractTextFromHtml('<p>A\r\nB\rC</p>');
  assert.equal(text.includes('\r'), false);
  assert.match(text, /A/);
  assert.match(text, /B/);
  assert.match(text, /C/);
});
