const { buildClinicMessages } = require('../clinic/buildMessages');
const { maybeSummarizeConversation } = require('../memory/summarize');
const { runChatWithTools } = require('../openai/runChatWithTools');
const { redactForStorage } = require('../privacy/redact');
const { evaluateTemplateRisk } = require('../risk/templateRisk');
const { evaluatePolicyFloorText } = require('../policy/floor');
const { createExecutionGateway } = require('../gateway/executionGateway');
const { getRuntimeProfile } = require('../agents/runtimeRegistry');

function normalizeText(value) {
  if (typeof value !== 'string') return '';
  return value.trim();
}

function extractHost(value) {
  const raw = normalizeText(value);
  if (!raw) return '';
  try {
    if (raw.includes('://')) return normalizeText(new URL(raw).hostname).toLowerCase();
    return normalizeText(new URL(`https://${raw}`).hostname).toLowerCase();
  } catch {
    return '';
  }
}

function normalizeAllowedHosts(values = []) {
  const set = new Set();
  for (const value of Array.isArray(values) ? values : []) {
    const raw = normalizeText(value).toLowerCase();
    if (!raw) continue;
    const asHost = extractHost(raw);
    set.add(asHost || raw);
  }
  return Array.from(set);
}

function isLocalhostHost(host) {
  const normalized = normalizeText(host).toLowerCase();
  return ['localhost', '127.0.0.1', '::1'].includes(normalized) || normalized.endsWith('.local');
}

function matchesAllowedHost(candidateHost, allowedHost) {
  const candidate = normalizeText(candidateHost).toLowerCase();
  const allowed = normalizeText(allowedHost).toLowerCase();
  if (!candidate || !allowed) return false;
  if (candidate === allowed) return true;
  if (allowed.startsWith('*.')) {
    const suffix = allowed.slice(2);
    return Boolean(suffix) && candidate.endsWith(`.${suffix}`);
  }
  return false;
}

function parsePositiveInt(value, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function looksLikePromptInjection(message = '') {
  const text = normalizeText(message).toLowerCase();
  if (!text) return false;
  const patterns = [
    /\bignore\b.*\b(instruction|instructions|policy|policies)\b/i,
    /\bingorera\b.*\b(instruktion|instruktioner|policy|policys)\b/i,
    /\b(system prompt|systemprompt|developer prompt|dev prompt)\b/i,
    /\b(reveal|visa)\b.*\b(prompt|instruktion)\b/i,
    /\b(jailbreak|bypass|override)\b/i,
  ];
  return patterns.some((pattern) => pattern.test(text));
}

function countConversationTurns(conversation = null, role = 'user') {
  const normalizedRole = normalizeText(role).toLowerCase();
  const messages = Array.isArray(conversation?.messages) ? conversation.messages : [];
  return messages.filter((item) => normalizeText(item?.role).toLowerCase() === normalizedRole).length;
}

function evaluatePublicChatBetaGate({
  req,
  sourceUrl = '',
  betaGate = null,
}) {
  if (Boolean(betaGate?.killSwitch)) {
    return {
      allowed: false,
      reason: 'kill_switch',
      message:
        normalizeText(betaGate?.killSwitchMessage) ||
        'Patientchatten är tillfälligt pausad. Kontakta kliniken direkt.',
    };
  }

  const enabled = Boolean(betaGate?.enabled);
  if (!enabled) {
    return {
      allowed: true,
      reason: 'disabled',
    };
  }

  const headerName = normalizeText(betaGate?.headerName).toLowerCase() || 'x-arcana-beta-key';
  const expectedKey = normalizeText(betaGate?.key);
  const providedKey = normalizeText(req.get(headerName));

  if (expectedKey && providedKey && providedKey === expectedKey) {
    return {
      allowed: true,
      reason: 'header_key',
    };
  }

  const allowedHosts = normalizeAllowedHosts(betaGate?.allowHosts);
  const candidates = [
    extractHost(sourceUrl),
    extractHost(req.get('origin')),
    extractHost(req.get('referer')),
    normalizeText(req.hostname).toLowerCase(),
  ].filter(Boolean);

  if (Boolean(betaGate?.allowLocalhost) && candidates.some((host) => isLocalhostHost(host))) {
    return {
      allowed: true,
      reason: 'localhost',
    };
  }

  if (allowedHosts.length > 0) {
    for (const host of candidates) {
      if (allowedHosts.some((allowedHost) => matchesAllowedHost(host, allowedHost))) {
        return {
          allowed: true,
          reason: 'allowed_host',
        };
      }
    }
  }

  return {
    allowed: false,
    reason: 'blocked',
    message:
      normalizeText(betaGate?.denyMessage) ||
      'Den här chatten är i begränsad beta. Kontakta kliniken för åtkomst.',
  };
}

function analyzePatientConversionSignals(message = '') {
  const text = normalizeText(message).toLowerCase();
  if (!text) {
    return {
      intents: [],
      score: 0,
      stage: 'unknown',
    };
  }

  const intentRules = [
    {
      id: 'booking',
      score: 4,
      regex: /\b(boka|bokning|appointment|book|konsultation|consultation|boka tid|online[- ]?konsultation)\b/i,
    },
    {
      id: 'contact',
      score: 3,
      regex: /\b(kontakt|kontakta|telefon|ring|call|e-?post|epost|mail|email)\b/i,
    },
    {
      id: 'finance',
      score: 2,
      regex: /\b(finans|financing|delbetal|avbetal|betalplan|klarna|lån|loan)\b/i,
    },
    {
      id: 'pricing',
      score: 2,
      regex: /\b(pris|priser|kostnad|kosta|kr|sek|grafts?)\b/i,
    },
  ];

  const intents = [];
  let score = 0;
  for (const rule of intentRules) {
    if (!rule.regex.test(text)) continue;
    intents.push(rule.id);
    score += rule.score;
  }

  let stage = 'awareness';
  if (intents.includes('booking')) {
    stage = 'action';
  } else if (intents.includes('contact') || intents.includes('finance')) {
    stage = 'consideration';
  } else if (intents.includes('pricing')) {
    stage = 'evaluation';
  }

  return {
    intents,
    score,
    stage,
  };
}

function buildPatientSignalBase({
  req,
  sourceUrl = '',
  tenantId = '',
  brand = '',
  betaGate = null,
  betaDecision = null,
  signal = null,
}) {
  return {
    tenantId: normalizeText(tenantId) || null,
    brand: normalizeText(brand) || null,
    gateEnabled: Boolean(betaGate?.enabled),
    gateReason: normalizeText(betaDecision?.reason).toLowerCase() || null,
    sourceHost: extractHost(sourceUrl) || null,
    originHost: extractHost(req.get('origin')) || null,
    refererHost: extractHost(req.get('referer')) || null,
    requestHost: normalizeText(req.hostname).toLowerCase() || null,
    intents: Array.isArray(signal?.intents) ? signal.intents : [],
    intentScore: Number(signal?.score || 0),
    metadata: {
      stage: normalizeText(signal?.stage).toLowerCase() || 'unknown',
    },
    correlationId: normalizeText(req.correlationId) || normalizeText(req.get('x-correlation-id')) || null,
  };
}

function buildForcedBlockRiskEvaluation({ reasonCode = '', scope = 'input' } = {}) {
  const normalizedReason = normalizeText(reasonCode) || 'CHAT_PRECHECK_BLOCKED';
  return {
    scope,
    category: 'CONSULTATION',
    tenantRiskModifier: 0,
    riskLevel: 4,
    riskColor: 'orange',
    riskScore: 90,
    semanticScore: 0,
    ruleScore: 0,
    decision: 'blocked',
    reasonCodes: [normalizedReason],
    ruleHits: [],
    policyHits: [],
    policyAdjustments: [],
    versions: {
      ruleSetVersion: 'rules.v1',
      thresholdVersion: 'threshold.v1',
      semanticModelVersion: 'semantic.heuristic.v1',
      fusionVersion: 'fusion.weighted.v1',
      buildVersion: normalizeText(process.env.npm_package_version || process.env.ARCANA_BUILD_VERSION || 'dev'),
    },
    evaluatedAt: new Date().toISOString(),
  };
}

function buildForcedBlockResponse({ forcedBlock = null, conversationId = '', patientRuntime = null } = {}) {
  if (!forcedBlock) return null;
  const payload = {
    error: normalizeText(forcedBlock?.message) || 'Din förfrågan blockerades av säkerhetsskäl.',
    code: normalizeText(forcedBlock?.reasonCode) || 'chat_precheck_blocked',
    runtime: {
      id: normalizeText(patientRuntime?.id) || null,
      domain: normalizeText(patientRuntime?.domain) || null,
    },
  };
  if (normalizeText(conversationId)) {
    payload.conversationId = normalizeText(conversationId);
  }
  return payload;
}

async function recordPatientSignalSafely(patientConversionStore, payload) {
  if (!patientConversionStore || typeof patientConversionStore.recordEvent !== 'function') {
    return;
  }
  try {
    await patientConversionStore.recordEvent(payload);
  } catch (error) {
    console.error('[chat] failed to record patient conversion event', error?.message || error);
  }
}

function buildHairTPFallbackReply({ brand, message }) {
  const normalizedBrand = typeof brand === 'string' ? brand.trim().toLowerCase() : '';
  if (normalizedBrand !== 'hair-tp-clinic') return '';

  const q = String(message ?? '').toLowerCase().trim();
  if (!q) return '';

  const normalizedQuery = q.replace(/(\d)\s+(\d{3})/g, '$1$2').replace(/\s+/g, ' ');

  function hasAny(regexes) {
    return regexes.some((re) => re.test(normalizedQuery));
  }

  function joinLines(lines) {
    return lines.join('\n');
  }

  const FUE = {
    1000: '42 000 kr/behandling',
    1500: '46 000 kr/behandling',
    2000: '50 000 kr/behandling',
    2500: '54 000 kr/behandling',
    3000: '58 000 kr/behandling',
    3500: '62 000 kr/behandling',
    4000: '66 000 kr/behandling',
  };

  const DHI = {
    1000: '52 000 kr/behandling',
    1500: '56 000 kr/behandling',
    2000: '60 000 kr/behandling',
    2500: '64 000 kr/behandling',
    3000: '68 000 kr/behandling',
  };

  const PRP = {
    standard: '4 300 kr/behandling',
    xl: '4 800 kr/behandling',
    mini: '2 500 kr/behandling',
    efterHartransplantation: '2 500 kr/behandling',
    skagg: '4 300 kr/behandling',
    ansikte: '4 300 kr/behandling',
    hals: '4 300 kr/behandling',
    dekolletage: '4 300 kr/behandling',
    hander: '4 300 kr/behandling',
    microneedlingDermapenMedPrp: '5 800 kr/behandling',
    laggTillOmrade: '1 500 kr/område',
  };

  const contactReply = joinLines([
    'Kontaktuppgifter till Hair TP Clinic:',
    'Adress: Vasaplatsen 2, 411 34 Göteborg',
    'Telefon: 031 88 11 66',
    'E-post: contact@hairtpclinic.com',
  ]);

  const priceOverviewReply = joinLines([
    'Prislista hårtransplantation:',
    `FUE 1000/1500/2000/2500/3000/3500/4000 grafts: ${FUE[1000]}, ${FUE[1500]}, ${FUE[2000]}, ${FUE[2500]}, ${FUE[3000]}, ${FUE[3500]}, ${FUE[4000]}`,
    `DHI 1000/1500/2000/2500/3000 grafts: ${DHI[1000]}, ${DHI[1500]}, ${DHI[2000]}, ${DHI[2500]}, ${DHI[3000]}`,
    '',
    'PRP-priser:',
    `- Hår Standard: ${PRP.standard}`,
    `- Hår XL: ${PRP.xl}`,
    `- Hår Mini: ${PRP.mini}`,
    `- Efter hårtransplantation: ${PRP.efterHartransplantation}`,
    `- Skägg / Ansikte / Hals / Dekolletage / Händer: ${PRP.skagg}`,
    `- Microneedling/Dermapen + PRP för huden: ${PRP.microneedlingDermapenMedPrp}`,
    `- Lägg till ett område: ${PRP.laggTillOmrade}`,
    '',
    'Antal grafts avgörs vid konsultation.',
  ]);

  if (/^priser?$/.test(normalizedQuery)) {
    return priceOverviewReply;
  }

  if (/^behandling(ar)?$/.test(normalizedQuery)) {
    return joinLines([
      'Vi erbjuder:',
      '- Hårtransplantation (FUE och DHI)',
      '- PRP för hår (för män och kvinnor)',
      '- PRP för hud',
      '- Microneedling / Dermapen',
      '- Hårtransplantation för skägg, ögonbryn och ärr',
    ]);
  }

  if (/^efterv[aå]rd$/.test(normalizedQuery)) {
    return joinLines([
      'Eftervård ingår som en viktig del av behandlingsprocessen.',
      'Du får vägledning om eftervård efter hårtransplantation från kliniken.',
      'Kliniken har även information om: före behandlingen (konsultation), behandlingsdagen och eftervård.',
    ]);
  }

  if (/^boka( konsultation| tid)?$/.test(normalizedQuery)) {
    return joinLines([
      'Du kan boka direkt via knappen "Boka tid" i chatten.',
      'Det går att boka både fysisk konsultation och online-konsultation.',
    ]);
  }

  if (
    hasAny([
      /kontaktuppgift/,
      /kontakt/,
      /kontakta/,
    ])
  ) {
    return contactReply;
  }

  if (
    hasAny([
      /adress/,
      /address/,
      /var ligger/,
      /vart ligger/,
      /var finns/,
      /hitta till/,
      /location/,
    ])
  ) {
    return 'Hair TP Clinic ligger på Vasaplatsen 2, 411 34 Göteborg.';
  }

  if (
    hasAny([
      /telefon/,
      /tel/,
      /nummer/,
      /ring/,
      /call/,
    ])
  ) {
    return 'Du når Hair TP Clinic på telefon 031 88 11 66.';
  }

  if (hasAny([/e-post/, /epost/, /email/, /mail/])) {
    return 'E-post till Hair TP Clinic: contact@hairtpclinic.com.';
  }

  if (
    hasAny([
      /öppettid/,
      /oppettid/,
      /öppet/,
      /oppet/,
      /öppnar/,
      /oppnar/,
      /stänger/,
      /stanger/,
      /tider/,
      /opening hours/,
      /open/,
    ])
  ) {
    return 'Öppettider enligt hemsidans uppgifter: alla dagar 09:00-17:00.';
  }

  if (
    hasAny([
      /sedan när/,
      /när startade/,
      /hur länge/,
      /vilket år/,
      /sedan 2014/,
    ])
  ) {
    return 'Hair TP Clinic uppger att de har arbetat med hårtransplantation och PRP-behandlingar sedan 2014.';
  }

  if (
    hasAny([
      /boka/,
      /bokar/,
      /bokning/,
      /online[- ]?konsultation/,
      /fysisk konsultation/,
      /boka tid/,
    ])
  ) {
    return joinLines([
      'Du kan boka direkt via knappen "Boka tid" i chatten.',
      'Det går att boka både fysisk konsultation och online-konsultation.',
      'Om du vill kan jag guida dig till rätt typ av konsultation.',
    ]);
  }

  const graftMatch = normalizedQuery.match(/\b(1000|1500|2000|2500|3000|3500|4000)\b/);
  const graftCount = graftMatch ? Number.parseInt(graftMatch[1], 10) : null;
  const wantsDHI = /\bdhi\b/.test(normalizedQuery);
  const wantsFUE = /\bfue\b/.test(normalizedQuery);
  const wantsPRP = /\bprp\b|\bplasma\b/.test(normalizedQuery);
  const wantsMicroneedling = /\bmicroneedling\b|\bdermapen\b/.test(normalizedQuery);
  const hasPriceWord = hasAny([
    /\bpris\b/,
    /\bpriser\b/,
    /\bkostnad\b/,
    /\bkostar\b/,
    /\bkosta\b/,
    /\bkr\b/,
    /\bsek\b/,
  ]);
  const hasGraftKeyword = /\bgrafts?\b/.test(normalizedQuery);
  const hasPriceCount = graftCount && (hasGraftKeyword || wantsDHI || wantsFUE);
  const isPriceIntent = hasPriceWord || Boolean(hasPriceCount);

  if (isPriceIntent && wantsPRP) {
    if (/(mini)/i.test(q)) {
      return `PRP Hår Mini: ${PRP.mini}.`;
    }
    if (/(xl)/i.test(q)) {
      return `PRP Hår XL: ${PRP.xl}.`;
    }
    if (/(standard)/i.test(q)) {
      return `PRP Hår Standard: ${PRP.standard}.`;
    }

    return joinLines([
      'PRP-priser:',
      `- Hår Standard: ${PRP.standard}`,
      `- Hår XL: ${PRP.xl}`,
      `- Hår Mini: ${PRP.mini}`,
      `- Efter hårtransplantation: ${PRP.efterHartransplantation}`,
      `- Skägg / Ansikte / Hals / Dekolletage / Händer: ${PRP.skagg}`,
      `- Microneedling/Dermapen + PRP för huden: ${PRP.microneedlingDermapenMedPrp}`,
      `- Lägg till ett område: ${PRP.laggTillOmrade}`,
    ]);
  }

  if (isPriceIntent && wantsMicroneedling) {
    return joinLines([
      `Microneedling/Dermapen + PRP för huden: ${PRP.microneedlingDermapenMedPrp}.`,
      `Lägg till ett område: ${PRP.laggTillOmrade}.`,
    ]);
  }

  if (isPriceIntent && graftCount && wantsDHI && DHI[graftCount]) {
    return joinLines([
      `Priset för ${graftCount} grafts med DHI är ${DHI[graftCount]}.`,
      'Antal grafts avgörs vid konsultation.',
    ]);
  }

  if (isPriceIntent && graftCount && wantsFUE && FUE[graftCount]) {
    return joinLines([
      `Priset för ${graftCount} grafts med FUE är ${FUE[graftCount]}.`,
      'Antal grafts avgörs vid konsultation.',
    ]);
  }

  if (isPriceIntent && graftCount && !wantsDHI && !wantsFUE) {
    const lines = [`Pris för ${graftCount} grafts:`];
    if (FUE[graftCount]) lines.push(`- FUE: ${FUE[graftCount]}`);
    if (DHI[graftCount]) lines.push(`- DHI: ${DHI[graftCount]}`);
    lines.push('Antal grafts avgörs vid konsultation.');
    return joinLines(lines);
  }

  if (isPriceIntent && wantsDHI) {
    return joinLines([
      'Prislista DHI:',
      `- 1000 grafts: ${DHI[1000]}`,
      `- 1500 grafts: ${DHI[1500]}`,
      `- 2000 grafts: ${DHI[2000]}`,
      `- 2500 grafts: ${DHI[2500]}`,
      `- 3000 grafts: ${DHI[3000]}`,
      'Antal grafts avgörs vid konsultation.',
    ]);
  }

  if (isPriceIntent && wantsFUE) {
    return joinLines([
      'Prislista FUE:',
      `- 1000 grafts: ${FUE[1000]}`,
      `- 1500 grafts: ${FUE[1500]}`,
      `- 2000 grafts: ${FUE[2000]}`,
      `- 2500 grafts: ${FUE[2500]}`,
      `- 3000 grafts: ${FUE[3000]}`,
      `- 3500 grafts: ${FUE[3500]}`,
      `- 4000 grafts: ${FUE[4000]}`,
      'Antal grafts avgörs vid konsultation.',
    ]);
  }

  if (isPriceIntent) {
    return priceOverviewReply;
  }

  if (
    hasAny([
      /vad är en graft/,
      /vad betyder graft/,
      /grafts?/,
    ])
  ) {
    return joinLines([
      'En graft är en transplanterad hårsäcksenhet.',
      'Hur många grafts som behövs avgörs vid konsultation utifrån område och önskat resultat.',
    ]);
  }

  if (
    hasAny([
      /fue.*dhi/,
      /dhi.*fue/,
      /skillnad.*dhi/,
      /skillnad.*fue/,
      /vilken metod/,
      /dhi[- ]?metod/,
      /vad är dhi/,
      /vad innebär dhi/,
      /vad är fue/,
      /vad innebär fue/,
    ])
  ) {
    return joinLines([
      'Hair TP Clinic arbetar med både FUE och DHI.',
      'Vilken metod som passar dig bäst avgörs vid konsultation utifrån hår, område och mål.',
    ]);
  }

  if (
    hasAny([
      /vad erbjuder ni/,
      /erbjuder ni/,
      /vilka behandlingar/,
      /behandling(ar)?/,
      /tjänster/,
      /vad kan ni hjälpa/,
    ])
  ) {
    return joinLines([
      'Hair TP Clinic erbjuder:',
      '- Hårtransplantation (för män och kvinnor, inklusive DHI-metoden)',
      '- PRP-behandling för hår',
      '- PRP-behandling för hud',
      '- Microneedling / Dermapen',
      '- Hårtransplantation av skägg, ögonbryn och ärr',
    ]);
  }

  if (hasAny([/skägg/, /skagg/, /ögonbryn/, /ogonbryn/, /ärr/, /arr/])) {
    return 'Hair TP Clinic erbjuder även transplantation för skägg, ögonbryn och ärr.';
  }

  if (
    hasAny([
      /hårtransplantation/,
      /hartransplantation/,
      /transplantation/,
    ])
  ) {
    return joinLines([
      'Hair TP Clinic erbjuder hårtransplantation med fokus på naturligt resultat.',
      'Kliniken arbetar med både FUE och DHI samt behandlingar för män och kvinnor.',
      'Antal grafts och upplägg bestäms vid konsultation.',
    ]);
  }

  if (hasAny([/\bprp\b/, /plasma/])) {
    return joinLines([
      'PRP-behandling används för att stimulera hårtillväxt och stödja hårsäckarnas vitalitet.',
      'Kliniken erbjuder PRP för hår (män och kvinnor) samt PRP för hud.',
    ]);
  }

  if (hasAny([/microneedling/, /dermapen/])) {
    return joinLines([
      'Microneedling / Dermapen används för att förbättra hudstruktur och hudkvalitet.',
      'Behandlingen används bland annat vid fina linjer, ärr, porer och ojämn hudton.',
    ]);
  }

  if (
    hasAny([
      /för män/,
      /for man/,
      /för kvinnor/,
      /for kvinnor/,
      /män/,
      /manligt/,
      /kvinn/,
    ])
  ) {
    return 'Kliniken erbjuder behandlingar för både män och kvinnor, inklusive hårtransplantation och PRP.';
  }

  if (
    hasAny([
      /före behandlingen/,
      /fore behandlingen/,
      /inför behandlingen/,
      /infor behandlingen/,
      /innan behandlingen/,
      /konsultation före/,
      /forbered/,
      /förbered/,
    ])
  ) {
    return joinLines([
      'Inför behandling börjar processen med konsultation.',
      'Där går ni igenom mål, förutsättningar och plan för behandlingen.',
    ]);
  }

  if (
    hasAny([
      /dagen för/,
      /behandlingsdagen/,
      /operationsdagen/,
      /dagen för din hårtransplantation/,
    ])
  ) {
    return joinLines([
      'Kliniken har en tydlig genomgång för behandlingsdagen.',
      'Du får information steg för steg inför och under dagen i samband med konsultationen.',
    ]);
  }

  if (
    hasAny([
      /efterv[aå]rd/,
      /efter behandlingen/,
      /återhämtning/,
      /aterhamtning/,
      /recovery/,
    ])
  ) {
    return joinLines([
      'Eftervård är en viktig del av behandlingen.',
      'Kliniken går igenom eftervård efter hårtransplantation så att du vet exakt hur du ska sköta området.',
    ]);
  }

  if (
    hasAny([
      /håravfall/,
      /haravfall/,
      /tappar hår/,
      /tappar har/,
      /alopecia/,
    ])
  ) {
    return joinLines([
      'Hair TP Clinic arbetar med flera typer av håravfallsrelaterade behandlingar.',
      'För rätt upplägg behöver du en konsultation där orsaker och mål gås igenom.',
    ]);
  }

  if (
    hasAny([
      /delbetal/,
      /avbetal/,
      /finans/,
      /betalplan/,
      /klarna/,
    ])
  ) {
    return joinLines([
      'Ja, Hair TP Clinic uppger att de erbjuder finansiering via Medical Finance.',
      'Exempel från deras information: lån på 50 000 SEK med 0 % ränta och 24 månaders återbetalningstid kan erbjudas efter godkänd ansökan.',
      'Exakt upplägg beror på kreditprövning och din ansökan.',
      'För frågor om finansiering, kontakta kliniken direkt:',
      'Telefon: 031 88 11 66',
      'E-post: contact@hairtpclinic.com',
    ]);
  }

  return '';
}

function createChatHandler({
  openai,
  model,
  memoryStore,
  resolveBrand,
  resolveTenantId,
  getKnowledgeRetriever,
  authStore = null,
  executionGateway = null,
  patientConversionStore = null,
  betaGate = null,
}) {
  const gateway =
    executionGateway ||
    createExecutionGateway({
      buildVersion: process.env.npm_package_version || 'dev',
    });
  const patientRuntime = getRuntimeProfile('patient');

  async function writeAuditEvent({
    tenantId,
    action,
    outcome = 'success',
    targetType = 'chat',
    targetId = '',
    metadata = {},
  }) {
    if (!authStore || typeof authStore.addAuditEvent !== 'function') return;
    await authStore.addAuditEvent({
      tenantId: normalizeText(tenantId) || null,
      actorUserId: null,
      action,
      outcome,
      targetType,
      targetId: normalizeText(targetId),
      metadata,
    });
  }

  return async function chat(req, res) {
    const requestStartedMs = Date.now();
    let signalBase = null;
    let signalConversationId = null;
    let signalAllowed = false;
    try {
      const body = req.body || {};
      const sourceUrl = typeof body.sourceUrl === 'string' ? body.sourceUrl : '';
      const message =
        typeof body.message === 'string' ? body.message.trim() : '';
      const correlationId =
        normalizeText(req.correlationId) || normalizeText(req.get('x-correlation-id')) || null;
      const idempotencyKey =
        normalizeText(req.get('x-idempotency-key')) ||
        normalizeText(body.idempotencyKey) ||
        null;
      if (!message) {
        return res.status(400).json({ error: 'Meddelande saknas.' });
      }

      const brand =
        typeof resolveBrand === 'function'
          ? resolveBrand(req, sourceUrl)
          : undefined;
      const tenantId =
        typeof resolveTenantId === 'function'
          ? resolveTenantId(req, sourceUrl, brand)
          : brand;
      const signal = analyzePatientConversionSignals(message);

      const betaDecision = evaluatePublicChatBetaGate({
        req,
        sourceUrl,
        betaGate,
      });
      signalAllowed = betaDecision.allowed === true;
      let forcedBlock = null;
      signalBase = buildPatientSignalBase({
        req,
        sourceUrl,
        tenantId,
        brand,
        betaGate,
        betaDecision,
        signal,
      });

      if (!betaDecision.allowed) {
        const gateBlockedCode =
          betaDecision.reason === 'kill_switch'
            ? 'chat_kill_switch_active'
            : 'chat_beta_gate_denied';
        forcedBlock = {
          reasonCode: gateBlockedCode,
          message: betaDecision.message,
          statusCode: betaDecision.reason === 'kill_switch' ? 503 : 403,
          signalEventType: 'beta_denied',
          metadata: {
            sourceHost: signalBase?.sourceHost || null,
            runtimeId: patientRuntime.id,
          },
        };
      }

      const promptInjectionFilterEnabled = betaGate?.promptInjectionFilterEnabled !== false;
      if (!forcedBlock && promptInjectionFilterEnabled && looksLikePromptInjection(message)) {
        const promptInjectionMessage =
          normalizeText(betaGate?.promptInjectionMessage) ||
          'Jag kan inte hjälpa till med den typen av instruktion. Kontakta kliniken direkt för fortsatt hjälp.';
        forcedBlock = {
          reasonCode: 'chat_prompt_injection_blocked',
          message: promptInjectionMessage,
          statusCode: 403,
          signalEventType: 'prompt_injection_blocked',
          metadata: {
            sourceHost: signalBase?.sourceHost || null,
            runtimeId: patientRuntime.id,
          },
        };
      }

      const incomingConversationId =
        typeof body.conversationId === 'string' ? body.conversationId : '';

      let conversationId = incomingConversationId;
      let conversation = null;
      let knowledge = [];

      if (!forcedBlock) {
        conversation = conversationId
          ? await memoryStore.getConversation(conversationId)
          : null;

        if (conversation && conversation.brand && brand && conversation.brand !== brand) {
          conversationId = '';
          conversation = null;
        }

        if (!conversationId) {
          conversationId = await memoryStore.createConversation(brand);
          conversation = await memoryStore.getConversation(conversationId);
        }
        signalConversationId = conversationId || null;

        await memoryStore.ensureConversation(conversationId, brand);

        const maxTurns = parsePositiveInt(betaGate?.maxTurns, 0);
        const userTurnsBefore = countConversationTurns(conversation, 'user');
        if (maxTurns > 0 && userTurnsBefore >= maxTurns) {
          const turnLimitMessage =
            'Den här konversationen har nått max antal meddelanden i beta. Fortsätt via klinikens kontaktkanaler för personlig hjälp.';
          forcedBlock = {
            reasonCode: 'chat_turn_limit_reached',
            message: turnLimitMessage,
            statusCode: 429,
            signalEventType: 'turn_limit_blocked',
            metadata: {
              maxTurns,
              userTurnsBefore,
              runtimeId: patientRuntime.id,
            },
          };
        }
      }

      if (!forcedBlock) {
        const convoBefore = await memoryStore.getConversation(conversationId);
        const summaryResult = await maybeSummarizeConversation({
          openai,
          model,
          conversation: convoBefore,
          brand,
        });
        if (summaryResult.summarized) {
          await memoryStore.setSummary(conversationId, summaryResult.summary);
          await memoryStore.replaceMessages(
            conversationId,
            summaryResult.remainingMessages
          );
        }

        conversation = await memoryStore.getConversation(conversationId);

        const knowledgeRetriever =
          typeof getKnowledgeRetriever === 'function'
            ? await getKnowledgeRetriever(brand)
            : null;
        knowledge = knowledgeRetriever
          ? await knowledgeRetriever.search(message)
          : [];
      }

      const gatewayResult = await gateway.run({
        context: {
          tenant_id: tenantId || 'public-chat',
          actor: {
            id: normalizeText(req.ip) || 'anonymous',
            role: 'PUBLIC',
          },
          channel: 'patient',
          intent: 'chat.response',
          payload: {
            message,
            sourceUrl,
            brand: brand || null,
            conversationId,
            runtimeId: patientRuntime.id,
          },
          correlation_id: correlationId,
          idempotency_key: idempotencyKey,
        },
        handlers: {
          audit: async (event) => {
            await writeAuditEvent({
              tenantId,
              action: event.action,
              outcome: event.outcome,
              targetType: 'gateway_run',
              targetId: String(event?.metadata?.runId || ''),
              metadata: {
                ...(event?.metadata || {}),
                correlationId,
              },
            });
          },
          inputRisk: async () => {
            if (forcedBlock) {
              return buildForcedBlockRiskEvaluation({
                reasonCode: forcedBlock.reasonCode,
                scope: 'input',
              });
            }
            return evaluateTemplateRisk({
              scope: 'input',
              category: 'CONSULTATION',
              content: message,
              tenantRiskModifier: 0,
              riskThresholdVersion: 1,
            });
          },
          agentRun: async () => {
            if (forcedBlock) {
              return {
                reply: forcedBlock.message,
                fallbackUsed: true,
                forcedBlock: true,
              };
            }
            const fallbackReply = buildHairTPFallbackReply({ brand, message });
            if (fallbackReply) {
              return {
                reply: fallbackReply,
                fallbackUsed: true,
              };
            }
            const messages = await buildClinicMessages({
              brand,
              conversation,
              knowledge,
              currentUserMessage: message,
            });
            const reply = await runChatWithTools({
              openai,
              model,
              messages,
              maxTurns: Number(patientRuntime.maxTurns || 4),
            });
            return {
              reply,
              fallbackUsed: false,
            };
          },
          outputRisk: async ({ agentResult }) =>
            evaluateTemplateRisk({
              scope: 'output',
              category: 'CONSULTATION',
              content: normalizeText(agentResult?.reply),
              tenantRiskModifier: 0,
              riskThresholdVersion: 1,
            }),
          policyFloor: async ({ agentResult }) =>
            evaluatePolicyFloorText({
              text: normalizeText(agentResult?.reply),
              context: 'patient_response',
            }),
          persist: async ({ agentResult }) => {
            if (forcedBlock) {
              const error = new Error('chat_forced_block_persist_forbidden');
              error.nonRetryable = true;
              throw error;
            }
            await memoryStore.appendMessage(
              conversationId,
              'user',
              redactForStorage(message)
            );
            await memoryStore.appendMessage(
              conversationId,
              'assistant',
              redactForStorage(normalizeText(agentResult?.reply))
            );
            await recordPatientSignalSafely(patientConversionStore, {
              ...signalBase,
              eventType: 'chat_response',
              allowed: true,
              conversationId,
              fallbackUsed: Boolean(agentResult?.fallbackUsed),
              responseMs: Date.now() - requestStartedMs,
            });
            return {
              artifact_refs: {
                run_id: null,
                conversation_id: conversationId,
              },
            };
          },
          safeResponse: () =>
            buildForcedBlockResponse({
              forcedBlock,
              conversationId,
              patientRuntime,
            }) || {
              reply:
                'Jag kan inte svara säkert på detta. Kontakta kliniken direkt och ring 112 vid akuta besvär.',
              conversationId,
              runtime: {
                id: patientRuntime.id,
                domain: patientRuntime.domain,
              },
            },
          response: ({ agentResult }) =>
            buildForcedBlockResponse({
              forcedBlock,
              conversationId,
              patientRuntime,
            }) || {
              reply: normalizeText(agentResult?.reply),
              conversationId,
              runtime: {
                id: patientRuntime.id,
                domain: patientRuntime.domain,
              },
            },
        },
      });

      if (gatewayResult.decision === 'blocked' || gatewayResult.decision === 'critical_escalate') {
        const blockedEventType = normalizeText(forcedBlock?.signalEventType) || 'chat_blocked';
        await recordPatientSignalSafely(patientConversionStore, {
          ...signalBase,
          eventType: blockedEventType,
          allowed: false,
          conversationId,
          fallbackUsed: false,
          responseMs: Date.now() - requestStartedMs,
          metadata: {
            ...(signalBase?.metadata || {}),
            decision: gatewayResult.decision,
            reasonCodes: gatewayResult?.policy_summary?.reason_codes || [],
            reason: forcedBlock?.reasonCode || null,
            ...(forcedBlock?.metadata || {}),
          },
        });
        await writeAuditEvent({
          tenantId,
          action: 'chat.blocked',
          outcome: 'blocked',
          targetType: 'chat',
          targetId: conversationId || correlationId || '',
          metadata: {
            decision: gatewayResult.decision,
            policy: gatewayResult.policy_summary,
            risk: gatewayResult.risk_summary,
            correlationId,
            runtimeId: patientRuntime.id,
            reason: forcedBlock?.reasonCode || null,
            ...(forcedBlock?.metadata || {}),
          },
        });
        return res.status(Number(forcedBlock?.statusCode || 403)).json(
          gatewayResult.safe_response || {
            reply:
              'Jag kan inte svara säkert på detta. Kontakta kliniken direkt och ring 112 vid akuta besvär.',
            conversationId,
            runtime: {
              id: patientRuntime.id,
              domain: patientRuntime.domain,
            },
          }
        );
      }

      await writeAuditEvent({
        tenantId,
        action: 'chat.response',
        outcome: 'success',
        targetType: 'chat',
        targetId: conversationId,
        metadata: {
          decision: gatewayResult.decision,
          correlationId,
          runtimeId: patientRuntime.id,
        },
      });

      return res.json(gatewayResult.response_payload);
    } catch (error) {
      await recordPatientSignalSafely(patientConversionStore, {
        ...(signalBase || {}),
        eventType: 'chat_error',
        allowed: signalAllowed,
        conversationId: signalConversationId,
        responseMs: Date.now() - requestStartedMs,
        metadata: {
          ...(signalBase?.metadata || {}),
          error: normalizeText(error?.message || '').slice(0, 160) || 'chat_failed',
        },
      });
      await writeAuditEvent({
        tenantId: signalBase?.tenantId || null,
        action: 'chat.error',
        outcome: 'error',
        targetType: 'chat',
        targetId: signalConversationId || '',
        metadata: {
          correlationId:
            normalizeText(req.correlationId) || normalizeText(req.get('x-correlation-id')) || null,
          error: normalizeText(error?.message || '').slice(0, 160) || 'chat_failed',
          runtimeId: patientRuntime.id,
        },
      });
      console.error(error);
      return res.status(500).json({ error: 'Något gick fel.' });
    }
  };
}

module.exports = { createChatHandler };
