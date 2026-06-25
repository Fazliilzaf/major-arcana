#!/usr/bin/env node
/**
 * Exporterar steg3-health-declaration-eng-facit.json från Meridiq 14865.
 * source: migration/meridiq/questionary-catalog.json#14865
 *         migration/meridiq/journal-schema-catalog.json (health_declaration:eng)
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const CATALOG = path.join(ROOT, 'migration/meridiq/questionary-catalog.json');
const SCHEMA_CATALOG = path.join(ROOT, 'migration/meridiq/journal-schema-catalog.json');
const OUT = path.join(ROOT, 'migration/meridiq/steg3-health-declaration-eng-facit.json');

function loadTristateIds() {
  const catalog = JSON.parse(fs.readFileSync(SCHEMA_CATALOG, 'utf8'));
  const schema = (catalog.schemas || []).find((s) => s.meridiqQuestionaryId === 14865);
  if (!schema) return new Set();
  const ids = new Set();
  for (const section of schema.sections || []) {
    for (const field of section.fields || []) {
      if (field.type === 'tristate' && field.meridiqQuestionId) {
        ids.add(field.meridiqQuestionId);
      }
    }
  }
  return ids;
}

function mapQuestionType(meridiqType) {
  if (meridiqType === 'textbox') return 'textbox';
  return meridiqType;
}

function buildFacit() {
  const catalog = JSON.parse(fs.readFileSync(CATALOG, 'utf8'));
  const form = (catalog.forms || []).find((f) => f.apiId === 14865);
  if (!form) throw new Error('Meridiq 14865 saknas i questionary-catalog.json');

  const tristateIds = loadTristateIds();
  const questions = (form.questions || [])
    .slice()
    .sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0))
    .map((q) => {
      const row = {
        id: q.id,
        type: mapQuestionType(q.type),
        label: q.label,
      };
      if (tristateIds.has(q.id)) row.tristate = true;
      return row;
    });

  return {
    source: 'migration/meridiq/questionary-catalog.json#14865',
    sourceNote:
      'Meridiq archive form ENG | Health Questionnaire (29 questions). isActive=false in Meridiq export.',
    registryId: 'health_tp_eng',
    meridiqApiId: 14865,
    questionCount: questions.length,
    ui: {
      yes: 'Yes',
      no: 'No',
      unknown: "Don't know",
      placeholder: 'Describe here…',
      selectEmpty: '— Select —',
    },
    intro: {
      title: 'Health questionnaire',
      body: 'Please answer all questions below before your consultation or treatment. Your answers help us assess whether the treatment is safe and appropriate for you.',
      note: 'ENG health questionnaire · Hair TP Clinic · archive form 14865',
    },
    questionsSection: {
      title: `Health questionnaire · ${questions.length} questions`,
      hint: 'Please answer all questions.',
    },
    actions: {
      primary: 'Sign &amp; submit',
      ghost: 'Save draft',
    },
    questions,
  };
}

const facit = buildFacit();
fs.writeFileSync(OUT, `${JSON.stringify(facit, null, 2)}\n`, 'utf8');
console.log(`✓ Skrev ${OUT} — ${facit.questionCount} questions (Meridiq 14865)`);
