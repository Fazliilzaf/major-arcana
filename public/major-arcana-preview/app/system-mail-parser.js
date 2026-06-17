/**
 * app/system-mail-parser.js — extraherar kundnamn från system-mejl.
 *
 * Mejl från no-reply / notifications-adresser visar systemets namn istället
 * för den faktiska kund som mejlet handlar om. Den här modulen identifierar
 * vilket system avsändaren är, kör en specifik subject/body-parser, och
 * returnerar { customerName, systemLabel } när ett kundnamn kan extraheras.
 *
 * Användning:
 *   const r = window.MajorArcanaSystemMailParser.parse({
 *     senderEmail: 'no-reply@cliento.com',
 *     subject: 'Bokning · Anna Karlsson · 15 maj 14:00',
 *     body: '...',
 *   });
 *   if (r) {
 *     // r = { customerName: 'Anna Karlsson', systemLabel: 'via Cliento' }
 *   }
 *
 * Integrationen sitter i app.js customer-name-resolver (getQueueHistoryCounterpartyLabel)
 * (samma path som "Okänd avsändare"-fixet). När parser hittar ett kundnamn
 * skrivs både sender-text och en system-label-pill ut.
 */
(() => {
  'use strict';

  function normalizeName(s) {
    return String(s || '')
      .replace(/\s+/g, ' ')
      .replace(/[^\w\sÅÄÖåäöÉéÜüØøÆæßñÑ\-'.]/g, '')
      .trim();
  }

  function looksLikePersonName(s) {
    if (!s) return false;
    const t = normalizeName(s);
    if (t.length < 2 || t.length > 60) return false;
    // Minst en stor bokstav + ev. mellanslag + minst två tecken
    if (!/^[A-ZÅÄÖ]/.test(t)) return false;
    // Skipp uppenbara icke-namn
    const blocklist = [
      'okänd',
      'unknown',
      'no reply',
      'noreply',
      'notifications',
      'system',
      'support',
      'admin',
      'info',
      'kontakt',
      'contact',
      'team',
      'bekräftelse',
      'bokning',
      'order',
      'faktura',
      'invoice',
      'receipt',
      'hair tp',
      'hairtp',
      'klinik',
      'clinic',
      // Dokument-prefix som annars råkar fångas in i namn
      'behandling',
      'behandlingsavtal',
      'avtal',
      'samtycke',
      'fullmakt',
      'document',
      'dokument',
    ];
    if (blocklist.some((b) => t.toLowerCase().includes(b))) return false;
    return true;
  }

  // ====== Body-parsing helpers (Phase 2) ======
  // Förstärker alla per-system parsers när subject inte räcker till.

  // Namn-separator får INTE inkludera \n/\r — annars äter regex sig vidare
  // till nästa rad och plockar med t.ex. "Tel" som tredje "förnamn".
  const NAME_PATTERN = '[A-ZÅÄÖ][a-zåäöéüø]+(?:[ \\t-][A-ZÅÄÖ][a-zåäöéüø]+){1,3}';
  const NAME_RX = new RegExp(NAME_PATTERN);

  /**
   * Phase 3: strippa HTML-taggar och dekoda vanliga entities innan body
   * skickas till regex-parsers. System-mejl är ofta HTML och vi vill att
   * "<p>Kund: <strong>Maria</strong></p>" ska bete sig som "Kund: Maria".
   */
  function stripHtml(s) {
    if (!s || typeof s !== 'string') return '';
    // Skydda email-adresser inom <...> så de inte strippas som HTML.
    // Exempel: "Från: Sofia Andersson <sofia@x.com>" — vi behöver behålla
    // hela <sofia@x.com> för matchQuotedFrom-regexen.
    const emailPlaceholders = [];
    let out = s.replace(/<([^<>\s]+@[^<>\s]+)>/g, (_match, email) => {
      emailPlaceholders.push(email);
      return `__EMAIL_PLACEHOLDER_${emailPlaceholders.length - 1}__`;
    });
    // Behåll line-break för <br> + </p> + </div> + </tr> så att radvis
    // parsing fortsätter att fungera korrekt.
    out = out
      .replace(/<\s*br\s*\/?\s*>/gi, '\n')
      .replace(/<\s*\/\s*(?:p|div|tr|li|h[1-6])\s*>/gi, '\n')
      .replace(/<[^>]+>/g, '');
    // Återställ emails
    out = out.replace(/__EMAIL_PLACEHOLDER_(\d+)__/g, (_m, idx) => {
      return `<${emailPlaceholders[Number(idx)]}>`;
    });
    // Vanliga HTML-entities
    out = out
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&aring;/g, 'å')
      .replace(/&Aring;/g, 'Å')
      .replace(/&auml;/g, 'ä')
      .replace(/&Auml;/g, 'Ä')
      .replace(/&ouml;/g, 'ö')
      .replace(/&Ouml;/g, 'Ö');
    return out;
  }

  /**
   * Försök matcha ett "label: Name" mönster (Kund/Patient/Mottagare/Customer/etc.)
   * Returnerar namnet eller null.
   */
  function matchLabeledName(body, labels) {
    if (!body) return null;
    for (const label of labels) {
      const rx = new RegExp(`(?:^|[\\n\\r])\\s*${label}\\s*[:|]\\s*(${NAME_PATTERN})`, 'i');
      const m = body.match(rx);
      if (m && looksLikePersonName(m[1])) return m[1].trim();
    }
    return null;
  }

  /**
   * Hej Name, / Hi Name, / Hallå Name — vanlig greeting i body.
   * OBS: greeting används bara om body innehåller en signatur eller "from"-rad
   * som indikerar att avsändaren faktiskt heter Name. Annars är "Hej Anna"
   * troligen riktad TILL Anna (mottagaren), inte FRÅN Anna.
   */
  function matchGreeting(body) {
    if (!body) return null;
    const m = body.match(
      new RegExp(
        `(?:^|[\\n\\r])\\s*(?:hej|hi|hallå|hello|tjena|dear)\\s+(${NAME_PATTERN})\\s*[,!]`,
        'i'
      )
    );
    if (m && looksLikePersonName(m[1])) return m[1].trim();
    return null;
  }

  /**
   * Signature på sista raden: "Med vänlig hälsning,\nAnna Karlsson" eller "Best regards,\nAnna"
   */
  function matchSignature(body) {
    if (!body) return null;
    const closers = [
      'med vänlig hälsning',
      'mvh',
      'vänligen',
      'hälsningar',
      'best regards',
      'kind regards',
      'regards',
      'sincerely',
      'thanks',
    ];
    for (const c of closers) {
      const rx = new RegExp(`${c}[,\\s]*[\\n\\r]+\\s*(${NAME_PATTERN})`, 'i');
      const m = body.match(rx);
      if (m && looksLikePersonName(m[1])) return m[1].trim();
    }
    return null;
  }

  /**
   * Quoted reply-header: "Från: Anna Karlsson <email>" / "From: Anna Karlsson <email>"
   * Vanligt i forwarded system-mejl när en kund-tråd vidarebefordrats.
   */
  function matchQuotedFrom(body) {
    if (!body) return null;
    const rx = new RegExp(
      `(?:^|[\\n\\r])\\s*(?:från|from)\\s*[:|]?\\s*(${NAME_PATTERN})\\s*[<(]`,
      'i'
    );
    const m = body.match(rx);
    if (m && looksLikePersonName(m[1])) return m[1].trim();
    return null;
  }

  /**
   * Sista chansen: extrahera namn från en email-adress.
   * "anna.karlsson@hotmail.com" -> "Anna Karlsson"
   * "anna-karlsson@..." -> "Anna Karlsson"
   * Returnerar null för kryptiska localparts ("akarlsson", "anna123", "fr0ggy").
   */
  function nameFromEmail(emailAddr) {
    if (!emailAddr || typeof emailAddr !== 'string') return null;
    const localPart = emailAddr.split('@')[0] || '';
    if (!localPart || localPart.length < 4 || localPart.length > 40) return null;
    if (/\d/.test(localPart)) return null;
    // Måste innehålla separator (.,-,_) som ger två ordkomponenter
    const parts = localPart.split(/[._-]/).filter(Boolean);
    if (parts.length < 2 || parts.length > 4) return null;
    if (parts.some((p) => p.length < 2)) return null;
    const cap = parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join(' ');
    if (looksLikePersonName(cap)) return cap;
    return null;
  }

  /**
   * Kombinerad body-extractor: kör matchLabeledName + matchGreeting +
   * matchSignature + matchQuotedFrom i den ordningen. Använder en kombinerad
   * lista av kund-labels som täcker svenska + engelska.
   */
  const KUND_LABELS = [
    'kund',
    'patient',
    'mottagare',
    'customer',
    'client',
    'till',
    'namn',
    'name',
    'avsändare',
    'sender',
    'kontakt',
    'contact person',
    'för',
    'for',
    'patientnamn',
    'kundnamn',
  ];
  /**
   * Skanna en rad bakifrån och plocka SISTA 2-3-ords-sekvensen som ser ut
   * som ett namn. Användbart för dokumentrubriker där kundens namn står
   * sist: "Behandlingsavtal Erik Svensson" → "Erik Svensson".
   */
  function tailNameFromLine(line) {
    if (!line) return null;
    const words = String(line)
      .split(/[\s,]+/)
      .filter(Boolean);
    // Försök 3, 2 ords-namn (i den ordningen — föredra 3 om båda passar)
    for (const len of [3, 2]) {
      for (let i = words.length - len; i >= 0; i--) {
        const candidate = words.slice(i, i + len).join(' ');
        if (looksLikePersonName(candidate) && /^[A-ZÅÄÖ]/.test(words[i])) {
          // Alla orden måste börja med stor bokstav
          if (words.slice(i, i + len).every((w) => /^[A-ZÅÄÖ]/.test(w))) {
            return candidate;
          }
        }
      }
    }
    return null;
  }

  function extractFromBody(body) {
    if (!body) return null;
    // Prio: label (Kund:/Customer:) > signature (kunden signerar) > quoted From
    // OBS: greeting ("Hej Anna,") UTELÄMNAS — det adresserar mottagaren (oss),
    // inte avsändaren. Att lägga in den skulle felaktigt visa vår personal
    // som "kund" på interna eskaleringsmejl.
    return (
      matchLabeledName(body, KUND_LABELS) || matchSignature(body) || matchQuotedFrom(body) || null
    );
  }

  // ====== Per-system parsers ======
  // Varje parser tar { subject, body } och returnerar { customerName, systemLabel }
  // eller null om inget kundnamn kunde extraheras.

  function parseCliento({ subject, body }) {
    // Cliento-format: "Bokning · Anna Karlsson · 15 maj 14:00"
    //                 "Anna Karlsson har bokat tid"
    //                 "Bekräftelse: Anna Karlsson, 15 maj"
    //                 "Ny bokning (web): Carl-Marcus Ahlengren, onsdag 17 juni 2026 15:15"
    const s = subject || '';
    const b = body || '';
    let m;
    m = s.match(/ny bokning\s*\(web\)\s*[:-]\s*([^,]+)/i);
    if (m && looksLikePersonName(m[1]))
      return { customerName: m[1].trim(), systemLabel: 'via Cliento' };
    // "Bokning · Namn · ..." eller "Bekräftelse: Namn, ..." eller "Ny bokning: Namn - ..."
    m = s.match(
      /(?:bokning|bekräftelse|booking)[\s·:,-]+([A-ZÅÄÖ][a-zåäöéüø]+(?:\s+[A-ZÅÄÖ][a-zåäöéüø]+)+)/i
    );
    if (m && looksLikePersonName(m[1]))
      return { customerName: m[1].trim(), systemLabel: 'via Cliento' };
    // "Namn har bokat" eller "Namn har bekräftat"
    m = s.match(
      /^([A-ZÅÄÖ][a-zåäöéüø]+(?:\s+[A-ZÅÄÖ][a-zåäöéüø]+)+)\s+har\s+(bokat|bekräftat|avbokat)/i
    );
    if (m && looksLikePersonName(m[1]))
      return { customerName: m[1].trim(), systemLabel: 'via Cliento' };
    // Body: "Kund:/Patient:/Namn:" labeled, sedan generic greeting/signature
    const bodyName = extractFromBody(b);
    if (bodyName) return { customerName: bodyName, systemLabel: 'via Cliento' };
    return null;
  }

  function parseSmartdocs({ subject, body }) {
    // Smartdocs-format: 'Dokumentet "Andreas Monasterio ..." version 1 har öppnats'
    //                   'Andreas Monasterio har signerat dokument X'
    const s = subject || '';
    const b = body || '';
    let m;
    m = s.match(
      /^([A-ZÅÄÖ][a-zåäöéüø]+(?:\s+[A-ZÅÄÖ][a-zåäöéüø]+)+)\s+har\s+(signerat|öppnat|granskat)/i
    );
    if (m && looksLikePersonName(m[1]))
      return { customerName: m[1].trim(), systemLabel: 'via Smartdocs' };
    m = s.match(
      /[Dd]okumentet\s+["']([A-ZÅÄÖ][a-zåäöéüø]+(?:\s+[A-ZÅÄÖ][a-zåäöéüø]+)+)[\s\S]*?["']/
    );
    if (m && looksLikePersonName(m[1]))
      return { customerName: m[1].trim(), systemLabel: 'via Smartdocs' };
    // Body: "Dokument: Behandlingsavtal Erik Svensson" — scanna varje rad
    // som börjar med dokument/avtal och plocka SISTA 2-3-ords-namnet.
    const docLine = b.match(
      /(?:^|[\n\r])\s*(?:dokument(?:et|namn)?|avtal|fil)\s*[:|]?\s*([^\n\r]+)/i
    );
    if (docLine) {
      const tail = tailNameFromLine(docLine[1]);
      if (tail) return { customerName: tail, systemLabel: 'via Smartdocs' };
    }
    const bodyName = extractFromBody(b);
    if (bodyName) return { customerName: bodyName, systemLabel: 'via Smartdocs' };
    return null;
  }

  function parseBokadirekt({ subject, body }) {
    // Bokadirekt-format: "Booking Request from Jimmy Skoglund"
    //                    "Bokningsförfrågan: Jimmy Skoglund"
    const s = subject || '';
    const b = body || '';
    let m;
    // OBS: använder INTE /i på hela regexen — då blir [A-ZÅÄÖ] case-insensitive
    // och kan börja matcha namnet mitt i ordet "from". Case-sensitive prefix:
    m = s.match(
      /(?:[Bb]ooking [Rr]equest|[Bb]okningsförfrågan)[\s:.,-]+(?:[Ff]rom\s+)?([A-ZÅÄÖ][a-zåäöéüø]+(?:\s+[A-ZÅÄÖ][a-zåäöéüø]+)+)/
    );
    if (m && looksLikePersonName(m[1]))
      return { customerName: m[1].trim(), systemLabel: 'via Bokadirekt' };
    // Body: "Customer: Jimmy Skoglund\nPhone: ..." vanligt format
    const bodyName = extractFromBody(b);
    if (bodyName) return { customerName: bodyName, systemLabel: 'via Bokadirekt' };
    return null;
  }

  function parseGetAccept({ subject, body }) {
    // GetAccept-format: "Dokumentet: FUE Behandlingsavtal hårtransplantation - Albert Mattsson är på väg ..."
    //                   "Albert Mattsson har öppnat ditt dokument"
    const s = subject || '';
    const b = body || '';
    let m;
    m = (s + ' ' + b).match(
      /[-—]\s*([A-ZÅÄÖ][a-zåäöéüø]+(?:\s+[A-ZÅÄÖ][a-zåäöéüø]+)+)\s+(?:är på väg|har öppnat|har signerat)/i
    );
    if (m && looksLikePersonName(m[1]))
      return { customerName: m[1].trim(), systemLabel: 'via GetAccept' };
    m = s.match(/^([A-ZÅÄÖ][a-zåäöéüø]+(?:\s+[A-ZÅÄÖ][a-zåäöéüø]+)+)\s+har\s+(öppnat|signerat)/i);
    if (m && looksLikePersonName(m[1]))
      return { customerName: m[1].trim(), systemLabel: 'via GetAccept' };
    // Body: "Mottagare: Albert Mattsson <email>"
    m = b.match(
      /(?:mottagare|recipient|signer)\s*[:|]\s*([A-ZÅÄÖ][a-zåäöéüø]+(?:\s+[A-ZÅÄÖ][a-zåäöéüø]+)+)/i
    );
    if (m && looksLikePersonName(m[1]))
      return { customerName: m[1].trim(), systemLabel: 'via GetAccept' };
    const bodyName = extractFromBody(b);
    if (bodyName) return { customerName: bodyName, systemLabel: 'via GetAccept' };
    return null;
  }

  function parseGoogleCalendar({ subject, body }) {
    // Calendar-format: "Preliminärt tackat ja: Jimmy skoglund | Hair TP Clinic | Online"
    //                  "Accepterat: Anna Karlsson | Klinikbesök"
    //                  "Avböjt: Lars Andersson"
    const s = subject || '';
    const b = body || '';
    let m;
    m = s.match(
      /(?:preliminärt tackat ja|accepterat|avböjt|tackat ja)[\s:]+([A-ZÅÄÖ][a-zåäöéüø]+(?:\s+[a-zåäöéüø][a-zåäöéüø]+)+)/i
    );
    if (m && looksLikePersonName(m[1]))
      return { customerName: m[1].trim(), systemLabel: 'via Kalender' };
    // Body: "Gäster: Anna Karlsson <email>, Erik <email>"  → ta första gästen
    m = b.match(
      /(?:gäster|guests|attendees|deltagare)\s*[:|]\s*([A-ZÅÄÖ][a-zåäöéüø]+(?:\s+[A-ZÅÄÖ][a-zåäöéüø]+)+)/i
    );
    if (m && looksLikePersonName(m[1]))
      return { customerName: m[1].trim(), systemLabel: 'via Kalender' };
    // Body: "Organiserad av Anna Karlsson" / "Organized by"
    m = b.match(
      /(?:organiserad? av|organized by|invited by)\s+([A-ZÅÄÖ][a-zåäöéüø]+(?:\s+[A-ZÅÄÖ][a-zåäöéüø]+)+)/i
    );
    if (m && looksLikePersonName(m[1]))
      return { customerName: m[1].trim(), systemLabel: 'via Kalender' };
    return null;
  }

  function parseKivra({ subject, body }) {
    // Kivra-format: "Du har fått ett dokument från [Anna Karlsson]"
    //               "Påminnelse: kvitto från Anna Karlsson"
    const s = subject || '';
    const b = body || '';
    let m;
    m = s.match(/(?:från|from)\s+([A-ZÅÄÖ][a-zåäöéüø]+(?:\s+[A-ZÅÄÖ][a-zåäöéüø]+)+)/i);
    if (m && looksLikePersonName(m[1]))
      return { customerName: m[1].trim(), systemLabel: 'via Kivra' };
    // Body: "Avsändare: Anna Karlsson"
    const bodyName = extractFromBody(b);
    if (bodyName) return { customerName: bodyName, systemLabel: 'via Kivra' };
    return null;
  }

  function parsePipedrive({ subject, body }) {
    // Pipedrive Notifications: "Activity assigned: Anna Karlsson - Follow up"
    //                          "New deal: Anna Karlsson"
    const s = subject || '';
    const b = body || '';
    let m;
    // Case-sensitive prefix (samma anledning som Bokadirekt — /i förstör namnet)
    m = s.match(
      /(?:[Aa]ctivity|[Dd]eal|[Tt]ask|[Nn]ote|[Nn]ew\s+[Dd]eal)[\s:.,-]+(?:[Aa]ssigned[\s:.,-]+)?(?:to\s+)?([A-ZÅÄÖ][a-zåäöéüø]+(?:\s+[A-ZÅÄÖ][a-zåäöéüø]+)+)/
    );
    if (m && looksLikePersonName(m[1]))
      return { customerName: m[1].trim(), systemLabel: 'via Pipedrive' };
    // Body: "Contact: Anna Karlsson" / "Person: Anna Karlsson"
    m = b.match(
      /(?:contact|person|lead)\s*[:|]\s*([A-ZÅÄÖ][a-zåäöéüø]+(?:\s+[A-ZÅÄÖ][a-zåäöéüø]+)+)/i
    );
    if (m && looksLikePersonName(m[1]))
      return { customerName: m[1].trim(), systemLabel: 'via Pipedrive' };
    const bodyName = extractFromBody(b);
    if (bodyName) return { customerName: bodyName, systemLabel: 'via Pipedrive' };
    return null;
  }

  // ====== Generic fallback ======
  // Om ingen specifik parser fångar något: leta efter ett name-mönster
  // i subject/body som ser ut som ett svenskt/engelskt namn. Bättre än
  // att lämna "No Reply" som synlig avsändare.
  function parseGeneric({ subject, body }) {
    const s = (subject || '') + ' ' + (body || '').slice(0, 200);
    // Letar efter "från Anna Karlsson" / "om Anna Karlsson" / "till Anna Karlsson"
    let m = s.match(
      /(?:från|from|om|to|till|för|for)\s+([A-ZÅÄÖ][a-zåäöéüø]+(?:\s+[A-ZÅÄÖ][a-zåäöéüø]+)+)/i
    );
    if (m && looksLikePersonName(m[1])) return { customerName: m[1].trim(), systemLabel: null };
    // Annars: leta efter ett tvåordigt namn i början av subject
    m = (subject || '').match(/^([A-ZÅÄÖ][a-zåäöéüø]+\s+[A-ZÅÄÖ][a-zåäöéüø]+)\b/);
    if (m && looksLikePersonName(m[1])) return { customerName: m[1].trim(), systemLabel: null };
    // Body-fallback: KUND_LABELS / greeting / signature / quoted From
    const bodyName = extractFromBody(body);
    if (bodyName) return { customerName: bodyName, systemLabel: null };
    return null;
  }

  // ====== System-detektering via sender-email ======
  const SYSTEM_PARSERS = [
    { match: /cliento/i, parser: parseCliento, label: 'via Cliento' },
    { match: /smartdocs|documents\.pipedrive/i, parser: parseSmartdocs, label: 'via Smartdocs' },
    { match: /bokadirekt/i, parser: parseBokadirekt, label: 'via Bokadirekt' },
    { match: /getaccept/i, parser: parseGetAccept, label: 'via GetAccept' },
    {
      match: /calendar-notification@google|calendar\.google/i,
      parser: parseGoogleCalendar,
      label: 'via Kalender',
    },
    { match: /kivra/i, parser: parseKivra, label: 'via Kivra' },
    { match: /pipedrive/i, parser: parsePipedrive, label: 'via Pipedrive' },
  ];

  // ====== System-label baserat på domän (när parser inte hittar namn) ======
  const DOMAIN_LABELS = {
    'cliento.com': 'via Cliento',
    'documents.pipedrive.com': 'via Smartdocs',
    'activities.pipedrive.com': 'via Pipedrive',
    'transactional.bokadirekt.se': 'via Bokadirekt',
    'getaccept.com': 'via GetAccept',
    'google.com': 'via Kalender',
    'kivra.com': 'via Kivra',
    'mail.hellofresh.se': 'via HelloFresh',
    'revolut.com': 'via Revolut',
    'teams.mail.microsoft': 'via Teams',
  };

  function isSystemSender(senderEmail, senderName) {
    if (!senderEmail && !senderName) return false;
    const rx = /no.?reply|noreply|notifications?|do.?not.?reply|automated|system|robot/i;
    // Kolla email OCH name var för sig — annars missar vi fall där email är
    // en riktig adress men display-name är "Noreply" (eller tvärtom).
    if (rx.test(senderEmail || '') || rx.test(senderName || '')) return true;
    // Eller känd system-domän (t.ex. transactional@bokadirekt.se,
    // calendar-notification@google.com) — de använder inte alltid no-reply
    // som localpart men är ändå system-mejl.
    const domain = (senderEmail || '').split('@')[1] || '';
    if (!domain) return false;
    if (DOMAIN_LABELS[domain]) return true;
    if (SYSTEM_PARSERS.some((sp) => sp.match.test(domain))) return true;
    return false;
  }

  function systemLabelFromEmail(senderEmail) {
    if (!senderEmail) return null;
    const domain = senderEmail.split('@')[1] || '';
    if (!domain) return null;
    if (DOMAIN_LABELS[domain]) return DOMAIN_LABELS[domain];
    // Fallback: ta ut första del av domän
    const parts = domain.split('.');
    if (parts.length >= 2) {
      const name = parts[parts.length - 2];
      if (name && name.length > 2 && name.length < 20) {
        return `via ${name.charAt(0).toUpperCase() + name.slice(1)}`;
      }
    }
    return null;
  }

  /**
   * Huvudfunktion: parsea ett system-mejl och returnera kundnamn + systemlabel.
   * @param {object} input - { senderEmail, senderName, subject, body }
   * @returns {object|null} - { customerName, systemLabel } eller null
   */
  function parse(input = {}) {
    const { senderEmail, senderName, subject } = input;
    // Phase 3: strippa HTML från body innan per-system parsers ser den.
    // Då fungerar Kund:/Patient:/Mottagare:-labels även för HTML-mejl.
    const body = stripHtml(input.body || '');
    if (!isSystemSender(senderEmail, senderName)) return null;

    // Hitta system-specifik parser
    const senderText = (senderEmail || '') + ' ' + (senderName || '');
    for (const { match, parser, label } of SYSTEM_PARSERS) {
      if (match.test(senderText)) {
        const r = parser({ subject, body });
        if (r) return r;
        // Parser hittade inget namn, men vi vet vilket system → returnera label utan namn
        return { customerName: null, systemLabel: label };
      }
    }

    // Inget känt system → prova generic parser + domän-label
    const generic = parseGeneric({ subject, body });
    const domainLabel = systemLabelFromEmail(senderEmail);
    if (generic) return { customerName: generic.customerName, systemLabel: domainLabel };
    // Sista chansen: extrahera namn ur email-localpart (anna.karlsson@... -> Anna Karlsson)
    // Bara om vi har en email som inte är en no-reply-kanonisk
    if (senderEmail && !/no.?reply|noreply|notifications?|do.?not.?reply/i.test(senderEmail)) {
      const fromEmail = nameFromEmail(senderEmail);
      if (fromEmail) return { customerName: fromEmail, systemLabel: domainLabel };
    }
    if (domainLabel) return { customerName: null, systemLabel: domainLabel };
    return null;
  }

  if (typeof window !== 'undefined') {
    window.MajorArcanaSystemMailParser = Object.freeze({
      parse,
      isSystemSender,
      systemLabelFromEmail,
      // Exponera per-parsers + body-helpers för testning
      parsers: {
        cliento: parseCliento,
        smartdocs: parseSmartdocs,
        bokadirekt: parseBokadirekt,
        getaccept: parseGetAccept,
        googleCalendar: parseGoogleCalendar,
        kivra: parseKivra,
        pipedrive: parsePipedrive,
        generic: parseGeneric,
      },
      bodyHelpers: {
        matchLabeledName,
        matchGreeting,
        matchSignature,
        matchQuotedFrom,
        nameFromEmail,
        tailNameFromLine,
        extractFromBody,
        stripHtml,
      },
    });
  }
})();
