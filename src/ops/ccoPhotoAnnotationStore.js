/**
 * ccoPhotoAnnotationStore — stub (2026-06-02)
 *
 * Den fullständiga modulen är pausad bakom Photo Review-spåret och flaggad
 * "behind feature flag" på personal-startsidan. Tills den fullständiga
 * implementationen är klar exporterar denna stub en factory som returnerar
 * ett objekt med samma API-yta. Read-metoder returnerar tomma listor, write-
 * metoder kastar ett tydligt fel.
 *
 * Syfte: hålla server.js-IIFE:n vid liv så CF.2–CF.9-routes mountar.
 * Inga side-effects, inga filer på disk, inget auditlog skrivet.
 */

'use strict';

const SCHEMA_VERSION = '0.0.0-stub';

function disabled(name) {
  const err = new Error(
    `Photo annotation pausad (stub) — '${name}' inte tillgänglig förrän Photo Review-fasen är på.`
  );
  err.statusCode = 503;
  err.stub = true;
  throw err;
}

async function createCcoPhotoAnnotationStore(_opts = {}) {
  return {
    schemaVersion: SCHEMA_VERSION,
    isStub: true,
    // Read-only metoder returnerar tom kollektion
    getByCustomer() { return []; },
    getById() { return null; },
    listAnnotations() { return []; },
    // Write-metoder → 503
    async createAnnotationSet() { return disabled('createAnnotationSet'); },
    async updateAnnotationSet() { return disabled('updateAnnotationSet'); },
    async deleteAnnotation() { return disabled('deleteAnnotation'); },
  };
}

module.exports = { createCcoPhotoAnnotationStore, SCHEMA_VERSION };
