const { buildClinicMessages } = require('../clinic/buildMessages');
const { maybeSummarizeConversation } = require('../memory/summarize');
const { runChatWithTools } = require('../openai/runChatWithTools');
const { redactForStorage } = require('../privacy/redact');

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
  getKnowledgeRetriever,
}) {
  return async function chat(req, res) {
    try {
      const body = req.body || {};
      const message =
        typeof body.message === 'string' ? body.message.trim() : '';
      if (!message) {
        return res.status(400).json({ error: 'Meddelande saknas.' });
      }

      const brand =
        typeof resolveBrand === 'function'
          ? resolveBrand(req, typeof body.sourceUrl === 'string' ? body.sourceUrl : '')
          : undefined;

      const incomingConversationId =
        typeof body.conversationId === 'string' ? body.conversationId : '';

      let conversationId = incomingConversationId;
      let conversation = conversationId
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

      await memoryStore.ensureConversation(conversationId, brand);

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
      const knowledge = knowledgeRetriever
        ? await knowledgeRetriever.search(message)
        : [];

      const fallbackReply = buildHairTPFallbackReply({ brand, message });
      if (fallbackReply) {
        await memoryStore.appendMessage(
          conversationId,
          'user',
          redactForStorage(message)
        );
        await memoryStore.appendMessage(
          conversationId,
          'assistant',
          redactForStorage(fallbackReply)
        );
        return res.json({ reply: fallbackReply, conversationId });
      }

      const messages = await buildClinicMessages({
        brand,
        conversation,
        knowledge,
        currentUserMessage: message,
      });

      await memoryStore.appendMessage(
        conversationId,
        'user',
        redactForStorage(message)
      );

      const reply = await runChatWithTools({
        openai,
        model,
        messages,
      });

      await memoryStore.appendMessage(
        conversationId,
        'assistant',
        redactForStorage(reply)
      );

      return res.json({ reply, conversationId });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Något gick fel.' });
    }
  };
}

module.exports = { createChatHandler };
