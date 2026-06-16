'use strict';

function evaluateHdStickprov(patient = {}) {
  const hd = patient.healthDeclaration || {};
  const fc = patient.fitnessCertificate || {};
  const hasHealthDeclaration = Boolean(hd.signedAt || patient.hasHealthDeclaration);
  const missingHealthDeclaration =
    patient.missingHealthDeclaration === false
      ? false
      : patient.missingHealthDeclaration === true
        ? true
        : !hasHealthDeclaration;
  return {
    patientId: patient.id,
    name: patient.displayName || '',
    hdSignedAt: hd.signedAt || null,
    hdSource: hd.source || hd.sourceSystem || null,
    hasHealthDeclaration,
    missingHealthDeclaration,
    fitnessSigned: Boolean(fc.signedAt || patient.fitnessSigned),
  };
}

module.exports = { evaluateHdStickprov };
