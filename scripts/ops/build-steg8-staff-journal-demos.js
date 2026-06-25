#!/usr/bin/env node
/**
 * Genererar staff-journal final-demos B16–B21 (steg 8 / post-op / uppföljning).
 * source: migration/meridiq/journal-schema-catalog.json
 */
'use strict';

const path = require('path');
const { ROOT, buildStaffJournalHtml, writeStaffDocument } = require('./staff-document-build-lib');

const PREVIEW = path.join(ROOT, 'public/major-arcana-preview');

const DEMOS = [
  {
    registryId: 'journal_tp',
    schemaId: 'tp_treatment:hair_tp',
    meridiqId: 16411,
    out: 'steg8-journal-tp-final-demo.html',
    headerTitle: 'Journal · TP Behandling',
    pageTitle: 'Steg 8 — Journal TP Behandling | Hair TP Clinic',
    subtitle: 'Hair TP Clinic · Op-dag',
    contextLabel: 'Personal · Op-dag',
  },
  {
    registryId: 'journal_tp_post_prp',
    schemaId: 'prp_treatment:tp_post_op',
    meridiqId: 16412,
    out: 'steg8-journal-tp-post-prp-final-demo.html',
    headerTitle: 'Journal · TP Efterbehandling (PRP)',
    pageTitle: 'Steg 8 — Journal TP Efterbehandling PRP | Hair TP Clinic',
    subtitle: 'Hair TP Clinic · Post-op PRP',
    contextLabel: 'Personal · Post-op',
  },
  {
    registryId: 'journal_tp_follow_4',
    schemaId: 'follow_up:4_manader',
    meridiqId: 16407,
    out: 'steg8-journal-tp-follow-4-final-demo.html',
    headerTitle: 'Journal · TP Uppföljning (4 mån)',
    pageTitle: 'Uppföljning — Journal TP 4 mån | Hair TP Clinic',
    subtitle: 'Hair TP Clinic · Uppföljning 4 månader',
    contextLabel: 'Personal · Uppföljning',
    stepBadge: 'Uppföljning · 4 mån',
  },
  {
    registryId: 'journal_tp_follow_6',
    schemaId: 'follow_up:6_manader',
    meridiqId: 16409,
    out: 'steg8-journal-tp-follow-6-final-demo.html',
    headerTitle: 'Journal · TP Uppföljning (6 mån)',
    pageTitle: 'Uppföljning — Journal TP 6 mån | Hair TP Clinic',
    subtitle: 'Hair TP Clinic · Uppföljning 6 månader',
    contextLabel: 'Personal · Uppföljning',
    stepBadge: 'Uppföljning · 6 mån',
  },
  {
    registryId: 'journal_tp_follow_12',
    schemaId: 'follow_up:12_manader',
    meridiqId: 16390,
    out: 'steg8-journal-tp-follow-12-final-demo.html',
    headerTitle: 'Journal · TP Resultat (12 mån)',
    pageTitle: 'Uppföljning — Journal TP 12 mån | Hair TP Clinic',
    subtitle: 'Hair TP Clinic · Resultatuppföljning 12 månader',
    contextLabel: 'Personal · Uppföljning',
    stepBadge: 'Uppföljning · 12 mån',
  },
  {
    registryId: 'journal_prp_multi',
    schemaId: 'prp_treatment:prp_skin',
    meridiqId: 14988,
    out: 'steg8-journal-prp-multi-final-demo.html',
    headerTitle: 'Journal · PRP, PRF, Microneedling',
    pageTitle: 'Steg 8 — Journal PRP/PRF/Microneedling | Hair TP Clinic',
    subtitle: 'Hair TP Clinic · Op-dag',
    contextLabel: 'Personal · Op-dag',
  },
];

const only = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const targets = only.length
  ? DEMOS.filter((d) => only.includes(d.registryId) || only.includes(d.out))
  : DEMOS;

if (!targets.length) {
  console.error('Okänt filter:', only.join(', '));
  process.exit(1);
}

for (const demo of targets) {
  const outPath = path.join(PREVIEW, demo.out);
  const { html, fieldCount, sectionCount } = buildStaffJournalHtml(demo);
  writeStaffDocument(outPath, html);
  console.log('✓ Skrev', outPath, '—', fieldCount, 'fält,', sectionCount, 'sektioner');
}
