'use strict';

const { getDocumentTypeById } = require('./ccoDocumentTypeRegistry');

const MANUAL_TRIAGE_TYPE = '_manual_triage';

const TRIAGE_RULES = Object.freeze([
  {
    pattern: /h[äa]lsodeklaration|health questionnaire/i,
    documentTypeId: 'haelso_tp_sve',
    altTypeIds: ['health_tp_eng'],
    flows: ['tp'],
  },
  {
    pattern: /friskf[öo]rs[äa]kring|friskf[öo]rs/i,
    documentTypeId: 'friskfoers_tp',
    flows: ['tp'],
  },
  {
    pattern: /offert.*profhilo|profhilo.*offert/i,
    documentTypeId: 'offert_profilo',
    flows: ['profhilo'],
  },
  {
    pattern: /offert.*prp.*h[åa]r|prp.*h[åa]r.*offert/i,
    documentTypeId: 'offert_prp_hair',
    flows: ['prp_hair'],
  },
  {
    pattern: /offert.*prp.*hud|prp.*hud.*offert/i,
    documentTypeId: 'offert_prp_skin',
    flows: ['prp_skin'],
  },
  {
    pattern: /offert.*microneedling|microneedling.*offert/i,
    documentTypeId: 'offert_microneedling',
    flows: ['microneedling'],
  },
  {
    pattern: /offert.*prf|prf.*offert/i,
    documentTypeId: 'offert_prf',
    flows: ['prf'],
  },
  {
    pattern: /offert.*tp|behandlingsplan.*tp|tp.*offert/i,
    documentTypeId: 'offert_tp',
    flows: ['tp'],
  },
  {
    pattern: /bokningsbekr[äa]ftelse/i,
    documentTypeId: 'auto_bokningsbekraftelse',
    flows: ['all'],
  },
  {
    pattern: /bokningsp[åa]minnelse/i,
    documentTypeId: 'auto_bokningspaminnelse',
    flows: ['all'],
  },
  {
    pattern: /avbokningsbekr[äa]ftelse/i,
    documentTypeId: 'auto_avbokningsbekraftelse',
    flows: ['all'],
  },
  {
    pattern: /foto.*samtycke|samtycke.*foto|publicering.*foto/i,
    documentTypeId: 'foto_samtycke',
    flows: ['all'],
  },
  {
    pattern: /bet[äa]nketid|cooling.?off/i,
    documentTypeId: 'auto_betanketid',
    flows: ['all'],
  },
  {
    pattern: /meridiq.*form|formul[äa]rl[äa]nk|ifyll/i,
    documentTypeId: null,
    flows: ['all'],
    needsReview: true,
  },
]);

const DOCUMENT_MAIL_HINT =
  /offert|h[äa]lsodeklaration|health questionnaire|friskf[öo]rs|formul[äa]r|meridiq|samtycke|bokningsbekr[äa]ftelse|behandlingsplan/i;

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function detectFlow(text) {
  const blob = text.toLowerCase();
  if (blob.includes('profhilo')) return 'profhilo';
  if (blob.includes('microneedling')) return 'microneedling';
  if (blob.includes('prf')) return 'prf';
  if (blob.includes('prp') && (blob.includes('hud') || blob.includes('skin'))) return 'prp_skin';
  if (blob.includes('prp')) return 'prp_hair';
  return 'tp';
}

function ruleMatchesFlow(rule, flow) {
  const flows = rule.flows || ['all'];
  return flows.includes('all') || flows.includes(flow);
}

function classifyIncomingDocument({
  subject = '',
  bodyPreview = '',
  bodyText = '',
  flow = null,
} = {}) {
  const text = [subject, bodyPreview, bodyText].map(normalizeText).filter(Boolean).join('\n');
  if (!text) {
    return {
      documentTypeId: null,
      confidence: 'none',
      needsManualTriage: true,
      reason: 'empty_content',
    };
  }

  const resolvedFlow = flow || detectFlow(text);
  for (const rule of TRIAGE_RULES) {
    if (!rule.pattern.test(text)) continue;
    if (!ruleMatchesFlow(rule, resolvedFlow)) continue;

    if (rule.needsReview) {
      return {
        documentTypeId: null,
        confidence: 'low',
        needsManualTriage: true,
        reason: 'form_link_needs_review',
        flow: resolvedFlow,
      };
    }

    let documentTypeId = rule.documentTypeId;
    if (rule.altTypeIds?.length && /eng|english/i.test(text)) {
      documentTypeId = rule.altTypeIds[0];
    }

    if (documentTypeId && !getDocumentTypeById(documentTypeId)) {
      return {
        documentTypeId: null,
        confidence: 'low',
        needsManualTriage: true,
        reason: 'unknown_registry_type',
        flow: resolvedFlow,
      };
    }

    return {
      documentTypeId,
      confidence: documentTypeId ? 'high' : 'low',
      needsManualTriage: !documentTypeId,
      reason: documentTypeId ? 'pattern_match' : 'pattern_without_type',
      flow: resolvedFlow,
    };
  }

  if (DOCUMENT_MAIL_HINT.test(text)) {
    return {
      documentTypeId: null,
      confidence: 'low',
      needsManualTriage: true,
      reason: 'document_hint_without_rule',
      flow: resolvedFlow,
    };
  }

  return {
    documentTypeId: null,
    confidence: 'none',
    needsManualTriage: false,
    reason: 'not_document_mail',
  };
}

function isTerminalStatus(status) {
  return ['signed', 'filled', 'delivered', 'archived'].includes(
    normalizeText(status).toLowerCase()
  );
}

async function triageAndCreateInstance(
  documentInstanceStore,
  {
    tenantId,
    patientId,
    subject = '',
    bodyPreview = '',
    bodyText = '',
    sourceMessageId = null,
    actor = 'triage_engine',
    flow = null,
  } = {}
) {
  if (!documentInstanceStore) {
    return { skipped: true, reason: 'document_instance_store_missing' };
  }

  const tid = normalizeText(tenantId);
  const pid = normalizeText(patientId);
  if (!tid || !pid) {
    return { skipped: true, reason: 'missing_patient_context' };
  }

  const classification = classifyIncomingDocument({ subject, bodyPreview, bodyText, flow });
  if (classification.confidence === 'none' && !classification.needsManualTriage) {
    return { skipped: true, reason: classification.reason, classification };
  }

  if (sourceMessageId && typeof documentInstanceStore.findBySourceMessageId === 'function') {
    const existingBySource = await documentInstanceStore.findBySourceMessageId(sourceMessageId);
    if (existingBySource) {
      return {
        skipped: true,
        reason: 'already_triaged',
        instance: existingBySource,
        classification,
      };
    }
  }

  const documentTypeId = classification.documentTypeId || MANUAL_TRIAGE_TYPE;
  const needsManualTriage =
    classification.needsManualTriage === true || documentTypeId === MANUAL_TRIAGE_TYPE;

  if (!needsManualTriage && typeof documentInstanceStore.findOpenForPatientType === 'function') {
    const open = await documentInstanceStore.findOpenForPatientType({
      tenantId: tid,
      patientId: pid,
      documentTypeId,
    });
    if (open && isTerminalStatus(open.status)) {
      return { skipped: true, reason: 'already_satisfied', instance: open, classification };
    }
    if (open) {
      return { skipped: true, reason: 'open_instance_exists', instance: open, classification };
    }
  }

  const instance = await documentInstanceStore.createInstance({
    tenantId: tid,
    patientId: pid,
    documentTypeId: needsManualTriage ? null : documentTypeId,
    needsManualTriage,
    status: 'pending',
    actor,
    sourceMessageId,
    triageConfidence: classification.confidence,
    payload: {
      subject: normalizeText(subject).slice(0, 240),
      triageReason: classification.reason,
      flow: classification.flow || flow || detectFlow([subject, bodyPreview, bodyText].join(' ')),
    },
  });

  return { skipped: false, created: true, instance, classification };
}

function createCcoDocumentTriageEngine({ documentInstanceStore } = {}) {
  return {
    classifyIncomingDocument,
    triageAndCreateInstance: (input) => triageAndCreateInstance(documentInstanceStore, input),
    triageInboundMail: async (input) => triageAndCreateInstance(documentInstanceStore, input),
    MANUAL_TRIAGE_TYPE,
  };
}

module.exports = {
  TRIAGE_RULES,
  MANUAL_TRIAGE_TYPE,
  classifyIncomingDocument,
  triageAndCreateInstance,
  createCcoDocumentTriageEngine,
};
