const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const PREVIEW_DIR = path.join(ROOT, 'public', 'major-arcana-preview');
const INDEX = path.join(PREVIEW_DIR, 'index.html');

test('CCO care panel — module + API paths wired in preview', () => {
  const carePanel = fs.readFileSync(path.join(PREVIEW_DIR, 'app', 'cco-care-panel.js'), 'utf8');
  assert.match(carePanel, /ArcanaCcoCarePanel/, 'ArcanaCcoCarePanel export saknas');
  assert.match(carePanel, /missing-forms-report/, 'missing-forms-report API saknas');
  assert.match(carePanel, /cco-care\/reminders/, 'reminders API saknas');
  assert.match(carePanel, /draft-proposals\?status=pending/, 'draft-proposals API saknas');
  assert.match(carePanel, /run-missing-forms/, 'run-missing-forms POST saknas');
});

test('thread AI summary — module + summary API wired', () => {
  const summaryJs = fs.readFileSync(path.join(PREVIEW_DIR, 'app', 'thread-ai-summary.js'), 'utf8');
  assert.match(summaryJs, /ArcanaThreadAiSummary/, 'ArcanaThreadAiSummary export saknas');
  assert.match(summaryJs, /\/summary/, 'conversation summary API saknas');
});

test('AI drafting — bundled preview calls capability endpoints', () => {
  const appJs = fs.readFileSync(path.join(PREVIEW_DIR, 'app.js'), 'utf8');
  assert.match(appJs, /RefineReplyDraft\/run/, 'RefineReplyDraft wiring saknas');
  assert.match(appJs, /PrepareResponseDrafts\/run/, 'PrepareResponseDrafts wiring saknas');
  assert.match(appJs, /RecordDraftFeedback\/run/, 'RecordDraftFeedback wiring saknas');
  const asyncJs = fs.readFileSync(path.join(PREVIEW_DIR, 'runtime-async-orchestration.js'), 'utf8');
  assert.match(asyncJs, /recordDraftFeedbackFireAndForget/, 'send-path feedback hook saknas');
});

test('index.html — care + AI scripts linked', () => {
  const html = fs.readFileSync(INDEX, 'utf8');
  assert.match(html, /cco-care-panel\.js/, 'cco-care-panel script saknas');
  assert.match(html, /thread-ai-summary\.js/, 'thread-ai-summary script saknas');
  assert.match(html, /data-cco-care-open/, 'CCO Care open trigger saknas');
});
