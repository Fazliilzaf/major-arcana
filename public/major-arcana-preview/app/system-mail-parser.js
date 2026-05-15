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
 * Integrationen sitter i runtime-queue-renderers.js's customer-name-resolver
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
      'okänd', 'unknown', 'no reply', 'noreply', 'notifications', 'system',
      'support', 'admin', 'info', 'kontakt', 'contact', 'team',
      'bekräftelse', 'bokning', 'order', 'faktura', 'invoice', 'receipt',
    ];
    if (blocklist.some((b) => t.toLowerCase().includes(b))) return false;
    return true;
  }

  // ====== Per-system parsers ======
  // Varje parser tar { subject, body } och returnerar { customerName, systemLabel }
  // eller null om inget kundnamn kunde extraheras.

  function parseCliento({ subject, body }) {
    // Cliento-format: "Bokning · Anna Karlsson · 15 maj 14:00"
    //                 "Anna Karlsson har bokat tid"
    //                 "Bekräftelse: Anna Karlsson, 15 maj"
    const s = subject || '';
    const b = body || '';
    let m;
    // "Bokning · Namn · ..." eller "Bekräftelse: Namn, ..."
    m = s.match(/(?:bokning|bekräftelse|booking)[\s·:,-]+([A-ZÅÄÖ][a-zåäöéüø]+(?:\s+[A-ZÅÄÖ][a-zåäöéüø]+)+)/i);
    if (m && looksLikePersonName(m[1])) return { customerName: m[1].trim(), systemLabel: 'via Cliento' };
    // "Namn har bokat" eller "Namn har bekräftat"
    m = s.match(/^([A-ZÅÄÖ][a-zåäöéüø]+(?:\s+[A-ZÅÄÖ][a-zåäöéüø]+)+)\s+har\s+(bokat|bekräftat|avbokat)/i);
    if (m && looksLikePersonName(m[1])) return { customerName: m[1].trim(), systemLabel: 'via Cliento' };
    // Fallback: leta i body
    m = b.match(/(?:kund|patient|namn)[\s:]+([A-ZÅÄÖ][a-zåäöéüø]+(?:\s+[A-ZÅÄÖ][a-zåäöéüø]+)+)/i);
    if (m && looksLikePersonName(m[1])) return { customerName: m[1].trim(), systemLabel: 'via Cliento' };
    return null;
  }

  function parseSmartdocs({ subject, body }) {
    // Smartdocs-format: 'Dokumentet "Andreas Monasterio ..." version 1 har öppnats'
    //                   'Andreas Monasterio har signerat dokument X'
    const s = subject || '';
    let m;
    m = s.match(/^([A-ZÅÄÖ][a-zåäöéüø]+(?:\s+[A-ZÅÄÖ][a-zåäöéüø]+)+)\s+har\s+(signerat|öppnat|granskat)/i);
    if (m && looksLikePersonName(m[1])) return { customerName: m[1].trim(), systemLabel: 'via Smartdocs' };
    m = s.match(/[Dd]okumentet\s+["']([A-ZÅÄÖ][a-zåäöéüø]+(?:\s+[A-ZÅÄÖ][a-zåäöéüø]+)+)[\s\S]*?["']/);
    if (m && looksLikePersonName(m[1])) return { customerName: m[1].trim(), systemLabel: 'via Smartdocs' };
    return null;
  }

  function parseBokadirekt({ subject, body }) {
    // Bokadirekt-format: "Booking Request from Jimmy Skoglund"
    //                    "Bokningsförfrågan: Jimmy Skoglund"
    const s = subject || '';
    let m;
    m = s.match(/(?:booking request|bokningsförfrågan)[\s:from-]+([A-ZÅÄÖ][a-zåäöéüø]+(?:\s+[A-ZÅÄÖ][a-zåäöéüø]+)+)/i);
    if (m && looksLikePersonName(m[1])) return { customerName: m[1].trim(), systemLabel: 'via Bokadirekt' };
    return null;
  }

  function parseGetAccept({ subject, body }) {
    // GetAccept-format: "Dokumentet: FUE Behandlingsavtal hårtransplantation - Albert Mattsson är på väg ..."
    //                   "Albert Mattsson har öppnat ditt dokument"
    const s = subject || '';
    const b = body || '';
    let m;
    m = (s + ' ' + b).match(/[-—]\s*([A-ZÅÄÖ][a-zåäöéüø]+(?:\s+[A-ZÅÄÖ][a-zåäöéüø]+)+)\s+(?:är på väg|har öppnat|har signerat)/i);
    if (m && looksLikePersonName(m[1])) return { customerName: m[1].trim(), systemLabel: 'via GetAccept' };
    m = s.match(/^([A-ZÅÄÖ][a-zåäöéüø]+(?:\s+[A-ZÅÄÖ][a-zåäöéüø]+)+)\s+har\s+(öppnat|signerat)/i);
    if (m && looksLikePersonName(m[1])) return { customerName: m[1].trim(), systemLabel: 'via GetAccept' };
    return null;
  }

  function parseGoogleCalendar({ subject, body }) {
    // Calendar-format: "Preliminärt tackat ja: Jimmy skoglund | Hair TP Clinic | Online"
    //                  "Accepterat: Anna Karlsson | Klinikbesök"
    //                  "Avböjt: Lars Andersson"
    const s = subject || '';
    let m;
    m = s.match(/(?:preliminärt tackat ja|accepterat|avböjt|tackat ja)[\s:]+([A-ZÅÄÖ][a-zåäöéüø]+(?:\s+[a-zåäöéüø][a-zåäöéüø]+)+)/i);
    if (m && looksLikePersonName(m[1])) return { customerName: m[1].trim(), systemLabel: 'via Kalender' };
    return null;
  }

  function parseKivra({ subject, body }) {
    // Kivra-format: "Du har fått ett dokument från [Anna Karlsson]"
    //               "Påminnelse: kvitto från Anna Karlsson"
    const s = subject || '';
    let m;
    m = s.match(/(?:från|from)\s+([A-ZÅÄÖ][a-zåäöéüø]+(?:\s+[A-ZÅÄÖ][a-zåäöéüø]+)+)/i);
    if (m && looksLikePersonName(m[1])) return { customerName: m[1].trim(), systemLabel: 'via Kivra' };
    return null;
  }

  function parsePipedrive({ subject, body }) {
    // Pipedrive Notifications: "Activity assigned: Anna Karlsson - Follow up"
    //                          "New deal: Anna Karlsson"
    const s = subject || '';
    let m;
    m = s.match(/(?:activity|deal|task|note)[\s:assigned-]+([A-ZÅÄÖ][a-zåäöéüø]+(?:\s+[A-ZÅÄÖ][a-zåäöéüø]+)+)/i);
    if (m && looksLikePersonName(m[1])) return { customerName: m[1].trim(), systemLabel: 'via Pipedrive' };
    return null;
  }

  // ====== Generic fallback ======
  // Om ingen specifik parser fångar något: leta efter ett name-mönster
  // i subject/body som ser ut som ett svenskt/engelskt namn. Bättre än
  // att lämna "No Reply" som synlig avsändare.
  function parseGeneric({ subject, body }) {
    const s = (subject || '') + ' ' + (body || '').slice(0, 200);
    // Letar efter "från Anna Karlsson" / "om Anna Karlsson" / "till Anna Karlsson"
    let m = s.match(/(?:från|from|om|to|till|för|for)\s+([A-ZÅÄÖ][a-zåäöéüø]+(?:\s+[A-ZÅÄÖ][a-zåäöéüø]+)+)/i);
    if (m && looksLikePersonName(m[1])) return { customerName: m[1].trim(), systemLabel: null };
    // Annars: leta efter ett tvåordigt namn i början av subject
    m = (subject || '').match(/^([A-ZÅÄÖ][a-zåäöéüø]+\s+[A-ZÅÄÖ][a-zåäöéüø]+)\b/);
    if (m && looksLikePersonName(m[1])) return { customerName: m[1].trim(), systemLabel: null };
    return null;
  }

  // ====== System-detektering via sender-email ======
  const SYSTEM_PARSERS = [
    { match: /cliento/i, parser: parseCliento, label: 'via Cliento' },
    { match: /smartdocs|documents\.pipedrive/i, parser: parseSmartdocs, label: 'via Smartdocs' },
    { match: /bokadirekt/i, parser: parseBokadirekt, label: 'via Bokadirekt' },
    { match: /getaccept/i, parser: parseGetAccept, label: 'via GetAccept' },
    { match: /calendar-notification@google|calendar\.google/i, parser: parseGoogleCalendar, label: 'via Kalender' },
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
    const lowercased = (senderEmail || senderName || '').toLowerCase();
    return /no.?reply|noreply|notifications?|do.?not.?reply|automated|system|robot/.test(lowercased);
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
    const { senderEmail, senderName, subject, body } = input;
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
    if (domainLabel) return { customerName: null, systemLabel: domainLabel };
    return null;
  }

  if (typeof window !== 'undefined') {
    window.MajorArcanaSystemMailParser = Object.freeze({
      parse,
      isSystemSender,
      systemLabelFromEmail,
      // Exponera per-parsers för testning
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
    });
  }
})();
