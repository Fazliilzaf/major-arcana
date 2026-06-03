'use strict';

function isStrongCustomerMatch(row) {
  const ids = row?.suggestedPatientIds || [];
  if (ids.length !== 1) return false;
  const conf = String(row.matchConfidence || '').toLowerCase();
  if (conf === 'high') return true;
  if (conf === 'medium' && row.reason === 'ambiguous_patient') return true;
  return false;
}

module.exports = { isStrongCustomerMatch };
