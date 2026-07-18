'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const fsPromises = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const { buildClientoLinkProposedPack } = require('../../src/ops/clientoLinkProposedPack');

const checksum = (label) => crypto.createHash('sha256').update(label).digest('hex');

function candidate(bookingRef) {
  return {
    bookingRef,
    candidateState: 'review_only',
    patientId: null,
    encounterId: null,
    linkAllowed: false,
    compareAndSwap: {
      algorithm: 'sha256(normalized-source-snapshot-v1)',
      left: {
        tenantId: 'hair_tp',
        sourceSnapshotChecksum: checksum(`${bookingRef}:left:source`),
        coreChecksum: checksum(`${bookingRef}:left:core`),
        notesChecksum: checksum(`${bookingRef}:left:notes`),
      },
      right: {
        tenantId: 'hair-tp-clinic',
        sourceSnapshotChecksum: checksum(`${bookingRef}:right:source`),
        coreChecksum: checksum(`${bookingRef}:right:core`),
        notesChecksum: checksum(`${bookingRef}:right:notes`),
      },
      expectedPairChecksum: checksum(`${bookingRef}:pair`),
    },
  };
}

function manifest() {
  const entries = [
    candidate('sha256:cccccccccccccccc'),
    candidate('sha256:aaaaaaaaaaaaaaaa'),
    candidate('sha256:bbbbbbbbbbbbbbbb'),
    candidate('sha256:dddddddddddddddd'),
  ];
  return {
    readOnly: true,
    zeroWrites: true,
    unlinkedReview: { maskedBookingRefSetChecksum: checksum('review-set') },
    cohort: { candidateCount: entries.length, entries },
    gate: { status: 'review_candidates_only', persistentLinkWriteAllowed: false },
  };
}

test('bygger deterministiskt mycket litet maskerat proposed-preview med alla grindar stängda', () => {
  const input = manifest();
  const before = JSON.stringify(input);
  const pack = buildClientoLinkProposedPack({
    candidateManifest: input,
    limit: 3,
    generatedAt: '2026-07-18T12:00:00.000Z',
  });

  assert.equal(pack.packSize, 3);
  assert.deepEqual(
    pack.proposals.map((item) => item.bookingRef),
    ['sha256:aaaaaaaaaaaaaaaa', 'sha256:bbbbbbbbbbbbbbbb', 'sha256:cccccccccccccccc']
  );
  assert.equal(
    pack.proposals.every((item) => item.state === 'proposed_preview'),
    true
  );
  assert.equal(
    pack.proposals.every((item) => item.canonicalPatientId === null),
    true
  );
  assert.equal(
    pack.proposals.every((item) => item.canonicalEncounterId === null),
    true
  );
  assert.equal(pack.verification.allBookingRefsMasked, true);
  assert.equal(pack.verification.allCasChecksumsPresent, true);
  assert.equal(pack.verification.ledgerEventsBefore, 0);
  assert.equal(pack.verification.ledgerEventsAfter, 0);
  assert.equal(pack.gates.productionWriteAllowed, false);
  assert.equal(JSON.stringify(input), before);
});

test('blockerar ofullständigt manifest och pack större än säker maxgräns', () => {
  const blocked = manifest();
  blocked.gate.status = 'blocked_data_invariant';
  assert.throws(() => buildClientoLinkProposedPack({ candidateManifest: blocked }), /inte godkänt/);
  assert.throws(
    () => buildClientoLinkProposedPack({ candidateManifest: manifest(), limit: 11 }),
    /1–10/
  );
});

test('CLI lämnar manifestet byte-identiskt och emitterar bara maskerade referenser', async (t) => {
  const dir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'cliento-proposed-pack-'));
  t.after(() => fsPromises.rm(dir, { recursive: true, force: true }));
  const manifestPath = path.join(dir, 'manifest.json');
  await fsPromises.writeFile(manifestPath, JSON.stringify(manifest()), 'utf8');
  const before = crypto.createHash('sha256').update(fs.readFileSync(manifestPath)).digest('hex');
  const result = spawnSync(
    process.execPath,
    ['scripts/prepare-cliento-link-proposed-pack.js', '--manifest', manifestPath, '--limit', '3'],
    { cwd: path.resolve(__dirname, '../..'), encoding: 'utf8' }
  );

  assert.equal(result.status, 0, result.stderr);
  const after = crypto.createHash('sha256').update(fs.readFileSync(manifestPath)).digest('hex');
  assert.equal(after, before);
  const pack = JSON.parse(result.stdout);
  assert.equal(pack.verification.inputFileUnchanged, true);
  assert.equal(pack.verification.inputFileChecksumBefore, before);
  assert.equal(pack.verification.inputFileChecksumAfter, before);
  assert.equal(pack.packSize, 3);
  assert.equal(result.stdout.includes('patient-'), false);
  assert.equal(result.stdout.includes('booking-'), false);
});

test('det förberedda första packet är maskerat och har noll writes i before/after', () => {
  const packPath = path.resolve(
    __dirname,
    '../../docs/strategy/CLIENTO-LINK-FIRST-PROPOSED-PACK-2026-07-18.masked.json'
  );
  const raw = fs.readFileSync(packPath, 'utf8');
  const pack = JSON.parse(raw);
  assert.equal(pack.packSize, 3);
  assert.equal(pack.readOnly, true);
  assert.equal(pack.zeroWrites, true);
  assert.equal(
    pack.proposals.every((item) => /^sha256:[a-f0-9]{16}$/.test(item.bookingRef)),
    true
  );
  assert.equal(
    pack.proposals.every((item) => item.canonicalPatientId === null),
    true
  );
  assert.equal(
    pack.proposals.every((item) => item.canonicalEncounterId === null),
    true
  );
  assert.equal(pack.verification.ledgerEventsBefore, 0);
  assert.equal(pack.verification.ledgerEventsAfter, 0);
  assert.equal(pack.verification.sourceMutations, 0);
  assert.equal(pack.gates.productionWriteAllowed, false);
  assert.equal(pack.gates.activationAllowed, false);
  assert.equal(/customerEmail|customerPhone|clientoCustomerId/.test(raw), false);
});
