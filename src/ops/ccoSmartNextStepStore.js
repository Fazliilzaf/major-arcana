'use strict';

const {
  evaluateDocumentReadiness,
  buildDocumentBlockerSignals,
  mapBlockersToActionIds,
  actionBlockedByDocuments,
} = require('./ccoDocumentReadiness');

function buildSmartNextStepReadout({ card = {}, instances = [], journalEntries = [] } = {}) {
  const documentReadiness = evaluateDocumentReadiness({ card, instances, journalEntries });
  const blockedActionIds = mapBlockersToActionIds(documentReadiness.blockedSteps);

  return {
    documentReadiness,
    documentBlockers: documentReadiness.blockers,
    blockedSteps: documentReadiness.blockedSteps,
    blockedActionIds,
    hasDocumentBlockers: documentReadiness.hasBlockers,
  };
}

module.exports = {
  buildSmartNextStepReadout,
  evaluateDocumentReadiness,
  buildDocumentBlockerSignals,
  mapBlockersToActionIds,
  actionBlockedByDocuments,
};
