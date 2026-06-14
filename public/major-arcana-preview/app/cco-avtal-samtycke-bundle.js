/**
 * Steg 7 — Avtal + samtycke bundle (dual-signature modal).
 *
 * Content registry:
 *   source: migration/meridiq/consent-catalog.json — apiId 170917, 170955
 *   source: MA-Archive Word — 251203_Behandlingsavtal Hair TP Clinic gbg AB (DHI-metoden), 2 dagar.docx
 *   source: docs/legal/juridik-gdpr/JURIST-FLODE-GABRIELLE-HANDLER.md — ångerfristsamtycke
 *   source: public/friskforsakran.html — portal tokens + panel chrome
 *   source: new — dual-signature modal, legal_review gate, journal submit
 */
(function (global) {
  'use strict';

  const ROOT_ID = 'cco-steg7-bundle-scrim';
  const GATE_ID = 'cco-steg7-bundle-gate-scrim';
  const STYLE_ID = 'cco-steg7-bundle-styles';
  const DISMISS_KEY = 'arcana.steg7bundle.dismissed';
  const SIGNED_KEY = 'arcana.steg7bundle.signed';
  const CACHE_BUST = global.CcoStepModalDesign?.CACHE_BUST || 'hairtp-step789-kundkort-v1';

  const CONSENT_AGREEMENT = {
    apiId: 170917,
    title: 'Behandlingsavtal | TP',
    version: '2',
    brand: 'Hair TP Clinic',
  };

  const CONSENT_COOLING = {
    apiId: 170955,
    title: 'Begäran och samtycke till att behandling påbörjas under ångerfristen (14 dagar)',
    version: '1',
    brand: 'Hair TP Clinic',
  };

  // source: MA-Archive Word — 251203_Behandlingsavtal Hair TP Clinic gbg AB (DHI-metoden), 2 dagar.docx
  function buildAgreementBody(context) {
    return [
      `<p class="doc-title"><strong>Behandlingsavtal (hårtransplantation med DHI-metoden)</strong></p>`,
      `<p class="doc-text">Mellan</p>`,
      `<p class="doc-text">Hair TP Clinic, org. nr. 559034-2688, Vasaplatsen 2, 411 34 Göteborg, (Tjänstutövaren) och</p>`,
      `<p class="doc-text">${escapeHtml(context.patientName)}${context.personnummer ? `, ${escapeHtml(context.personnummer)}` : ''} (Kunden)</p>`,
      `<p class="doc-text">har träffats följande behandlingsavtal (Avtalet) om hårtransplantation i enlighet med tjänstbeskrivning (Behandlingen), se bilaga 1. Pris för Behandlingen framgår av lämnad offert, se bilaga 2${context.offerLabel ? ` (${escapeHtml(context.offerLabel)})` : ''}.</p>`,
      `<p class="doc-heading"><strong>Giltighetstid och betänketid</strong></p>`,
      `<p class="doc-text">Tjänsteutövaren tillämpar betänketid (Betänketiden). Avtalet kan ingås med bindande verkan först när minst två (2) dagar har förflutit från att Kunden tagit del av informationen om Behandlingen i tjänstebeskrivningen.</p>`,
      `<p class="doc-text">Avtalet är giltigt från att Kunden undertecknar Avtalet efter utgången av Betänketiden till dess Behandlingen fullgjorts av Tjänsteutövaren. För det fall Kunden inte bokar en tid för behandling, eller efter avbokning inte bokar en ny tid för behandling, upphör Avtalet dock att gälla 30 dagar efter att det undertecknades av Kunden.</p>`,
      `<p class="doc-heading"><strong>Betalningsvillkor</strong></p>`,
      `<p class="doc-text">Behandlingen är en privat tjänst som bekostas av Kunden.</p>`,
      `<p class="doc-text">Kunden ska erlägga en förskottsbetalning (Förskottsbetalningen) om 20 % (tjugo procent) av den totala behandlingskostnaden. Tjänstutövaren fakturerar beloppet i samband med bokning av behandlingstillfälle. Genom erlagd förskottsbetalning bekräftas den bokade tiden.</p>`,
      `<p class="doc-text">Betalning ska erläggas via faktura, betalkort eller finansiering via Medical Finance (ingen kontantbetalning). Slutbetalning ska vara Tjänsteutövaren tillhanda innan behandlingen påbörjas. Tjänsteutövaren förbehålls rätten att avboka behandlingstiden och säga upp Avtalet med omedelbar verkan om slutbetalning inte skett i tid, varvid Kunden inte äger rätt till återbetalning av förskottsbetalningen.</p>`,
      `<p class="doc-heading"><strong>Av- och ombokning</strong></p>`,
      `<p class="doc-text">Kundens ombokning av behandlingstid ska ske senast 14 kalenderdagar före den planerade behandlingsdagen. Detta ger Tjänsteutövaren möjlighet att justera schemat och erbjuda tiden till annan kund vid behov. För ombokning ska Kunden kontakta contact@curatiio.com. Ombokningen är giltig först när Kunden mottagit en skriftlig bekräftelse på ombokning från Tjänsteutövaren.</p>`,
      `<p class="doc-text">Vid Kundens avbokning mer än 14 dagar före behandlingsdatum återbetalas Förskottsbetalningen i dess helhet.</p>`,
      `<p class="doc-text">Vid Kundens avbokning mindre än 14 dagar före behandlingsdatum äger Kunden inte rätt till återbetalning av Förskottsbetalningen. Denna utgör då en administrativ avgift med anledning av avbokningen.</p>`,
      `<p class="doc-text">Avbokning sker via e-post till: contact@curatiio.com. Avbokning är giltig först när Kunden mottagit en skriftlig bekräftelse från Tjänsteutövaren. Om Kunden inte erhållit sådan bekräftelse inom 48 timmar ska Kunden kontakt Tjänstutövaren för att säkerställa att avbokningen har registrerats.</p>`,
      `<p class="doc-text">Vid utebliven avbokning enligt ovanstående rutin äger Kunden inte rätt till återbetalning av Förskottsbetalningen. Vid sjukdom bokas behandlingstiden om kostnadsfritt, förutsatt att Kunden kan uppvisa läkarintyg som intygar att Kunden inte bör genomgå behandlingen.</p>`,
      `<p class="doc-heading"><strong>Resultat</strong></p>`,
      `<p class="doc-text">Kunden är införstådd med att risker förenade med Behandlingen och Behandlingens förväntade resultat är beroende av personliga och medicinska förutsättningar samt efterlevnad av samtliga förberedelse- och eftervårdsinstruktioner. Tjänsteutövaren använder sitt kunnande och erfarenhet för att uppnås bästa möjliga resultat utefter Kundens individuella förutsättningar men kan inte garantera ett visst resultat.</p>`,
      `<p class="doc-text">Kunden är införstådd med att hårsäckarnas emotsedda överlevnad (95%) förutsätter att Kunden genomgår hela Behandlingen inklusive fyra (4) PRP-behandling, inte använder tobak eller nikotinprodukter före eller efter behandlingen och följer samtliga förberedelse- och eftervårdsinstruktioner. Resultatet utvärderas tillsammans med kliniken. För det fall att en tillfredsställande överlevnadsnivå för hårsäckarna inte uppnås genom behandlingen planeras eventuell korrigering efter medicinsk bedömning och överenskommelse med Kunden.</p>`,
      `<p class="doc-heading"><strong>Ansvar</strong></p>`,
      `<p class="doc-text">Tjänsteutövaren ansvarar endast för direkt skada med anledning av bolagets vårdslöshet. Därutöver bär Tjänsteutövaren inget ansvar med anledning av Behandlingen, såsom för komplikationer, inkomstbortfall eller oönskat resultat. Tjänstutövaren ansvarar inte heller för exempelvis felaktigt tillverkade medicinska produkter.</p>`,
      `<p class="doc-heading"><strong>Ångerrätt</strong></p>`,
      `<p class="doc-text">Behandlingen omfattas av lag (2005:59) om distansavtal och avtal utanför affärslokal (Distansavtalslagen). Patienten har rätt att frånträda avtalet inom 14 dagar från den dag då Avtalet ingås. För att utnyttja ångerrätten krävs att Patienten skickar ett klart och tydligt meddelande till Tjänsteutövaren om att Patienten önskar utöva sin ångerrätt. Sådant meddelande kan skickas till contact@curatiio.com. Patienten kan även använda sig av standardformulär, se bilaga 3.</p>`,
      `<p class="doc-text">För det fall att Kunden önskar påbörja Behandlingen och boka en behandlingstid som infaller innan utgången av Kundens ångerfrist krävs Kundens särskilda samtycke.</p>`,
      `<p class="doc-heading"><strong>Avtalsbrott och force majeure</strong></p>`,
      `<p class="doc-text">Om Tjänstutövarens fullgörande av sina åtaganden enligt Avtalet förhindras på grund av omständighet som Tjänsteutövaren inte kunnat råda över och inte skäligen kunde förväntas ha räknat med vid Avtalets ingående och vars följder Tjänstutövaren inte heller skäligen kunde ha undvikit eller övervunnit, såsom exempelvis allmän arbetskonflikt, krig, eldsvåda, blixtnedslag, terroristattack, pandemi, ändrad myndighetsbestämmelse eller myndighetsingripande ska detta utgöra befrielsegrund som medför rätt för Tjänstutövaren att säga upp Avtalet med omedelbar verkan.</p>`,
      `<p class="doc-text">Tjänstutövaren ska även äga rätt att säga upp Avtalet med omedelbar verkan vid Kundens Väsentliga avtalsbrott eller upprepade avtalsbrott utan återbetalning av Förskottsbetalningen.</p>`,
      `<p class="doc-heading"><strong>Information &amp; samtycke</strong></p>`,
      `<p class="doc-text">Kunden bekräftar att Kunden har tagit del av skriftlig information, se bilaga 1, samt att Kunden tagit del av motsvarande information muntligt. Kunden har även tagit del av individuell behandlingsplan.</p>`,
      `<p class="doc-text">Kunden lämnar sitt samtycke till att behandlingen får utföras.</p>`,
      `<p class="doc-heading"><strong>Tvist</strong></p>`,
      `<p class="doc-text">Svensk lag ska tillämpas på avtalet.</p>`,
      `<p class="doc-text">För det fall utförd behandling omfattas av Tjänsteutövarens patientförsäkring enligt patientskadelagen (1996:799) kan Kunden hänskjuta eventuell tvist till Patientskadenämnden. Avseende frågor som inte kräver medicinsk sakkunskap har Kunden även möjlighet att hänskjuta tvist till prövning genom anmälan till Allmänna reklamationsnämnden (ARN). Tvist med anledning av avtalet ska slutligen avgöras av allmän domstol med Göteborgs tingsrätt som första instans.</p>`,
    ].join('');
  }

  // source: docs/legal/juridik-gdpr/JURIST-FLODE-GABRIELLE-HANDLER.md — särskilt samtycke (170955)
  const COOLING_BODY = `
    <div class="doc-divider" aria-hidden="true"></div>
    <p class="doc-heading"><strong>Begäran och samtycke till behandling inom ångerfrist (14 dagar)</strong></p>
    <p class="doc-text">Detta samtycke gäller när behandlingsavtalet ingås på distans och du begär att Hair TP Clinic ska påbörja behandlingen och/eller boka behandlingstid <strong>innan</strong> 14 dagars ångerfrist har löpt ut.</p>
    <p class="doc-text">Du bekräftar att du tagit del av information om ångerrätt enligt Distansavtalslagen, att du fått tillgång till Konsumentverkets ångerblankett (bilaga 3), och att du förstår att du genom detta samtycke kan avstå från ångerrätt för den del av tjänsten som redan fullgjorts.</p>
    <p class="doc-text">Genom att signera begär du uttryckligen att behandling/bokning påbörjas under ångerfristen.</p>`;

  function buildDocumentsBlock(context) {
    return buildAgreementBody(context) + COOLING_BODY;
  }

  const STEP7_EXTRA_CSS = `
#${ROOT_ID} .doc-scroll{max-height:none;overflow:visible}
#${ROOT_ID} .doc-heading{font-size:12px;line-height:1.5;color:var(--brand);margin:12px 0 8px;font-weight:700}
#${ROOT_ID} .doc-title{font-size:12px;line-height:1.5;color:var(--brand);margin:0 0 10px}
#${ROOT_ID} .doc-divider{padding-top:10px;border-top:1px solid rgba(215,202,194,.3);margin:10px 0 0}
#${GATE_ID} .head{padding:18px 18px 16px;border-bottom:1px solid rgba(215,202,194,.5);background:var(--header-bg);border-radius:0;margin:0}
#${GATE_ID} .head .kicker{font-size:9px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:var(--t3);margin-bottom:8px}
#${GATE_ID} .head h1{font-size:16px;font-weight:800;margin:0 0 6px;color:var(--brand)}
#${GATE_ID} .head p{font-size:11px;color:var(--t2);margin:0;line-height:1.45}
#${GATE_ID} .gate-panel{padding:14px;margin:12px 18px 18px;border-radius:14px;background:var(--card-bg);border:1px solid rgba(255,255,255,.72);box-shadow:var(--card-shadow);text-align:center}
#${GATE_ID} .gate-panel p{margin:0 0 12px;color:var(--t2);font-size:12px;line-height:1.5}
#${GATE_ID} .gate-panel .btn{margin-top:8px;padding:11px 20px;border-radius:12px;border:1px solid rgba(132,117,107,.28);background:transparent;font:inherit;font-weight:700;cursor:pointer;color:var(--t2)}
`;

  function buildStyleText() {
    const shell = global.CcoStepModalDesign?.buildShellCss([ROOT_ID, GATE_ID], 10040) || '';
    return shell + STEP7_EXTRA_CSS;
  }

  let keyHandler = null;
  let gateKeyHandler = null;
  let mountOptions = {};

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function isV9On() {
    return document.documentElement.getAttribute('data-v9-enabled') === 'on';
  }

  function isDemoFlagOn() {
    return (
      isV9On() &&
      (document.documentElement.getAttribute('data-v9-demo') === 'on' ||
        global.__ARCANA_V9_DEMO_ENABLED__ === true)
    );
  }

  function isCustomersView() {
    try {
      const params = new URLSearchParams(global.location.search || '');
      if (params.get('view') === 'customers') return true;
    } catch {
      /* ignore */
    }
    const canvas = document.querySelector('.preview-canvas');
    return canvas && canvas.dataset.appShellView === 'customers';
  }

  function readDemoParam(name) {
    try {
      return String(new URLSearchParams(global.location.search || '').get(name) || '').trim();
    } catch {
      return '';
    }
  }

  function resolveLegalReviewApproved(options = {}) {
    if (options.legalReviewApproved === true) return true;
    if (global.__ARCANA_STEG7_LEGAL_APPROVED__ === true) return true;
    if (readDemoParam('demoLegal') === 'approved') return true;
    const card = global.currentPatientCard;
    if (card?.legalReviewApproved === true) return true;
    return false;
  }

  function readContext(options = {}) {
    let patientName = 'Anna Karlsson';
    let patientId = '';
    let personnummer = '';
    let offerLabel = 'Hårtransplantation DHI · enligt offert';
    try {
      const demoPatient = readDemoParam('demoPatient');
      const demoPatientId = readDemoParam('demoPatientId');
      const demoPnr = readDemoParam('demoPnr');
      const demoOffer = readDemoParam('demoOffer');
      if (demoPatient) patientName = demoPatient;
      if (demoPatientId) patientId = demoPatientId;
      if (demoPnr) personnummer = demoPnr;
      if (demoOffer) offerLabel = demoOffer;
    } catch {
      /* ignore */
    }
    if (options.patientName) patientName = options.patientName;
    if (options.patientId) patientId = options.patientId;
    if (options.personnummer) personnummer = options.personnummer;
    if (options.offerLabel) offerLabel = options.offerLabel;
    return { patientName, patientId, personnummer, offerLabel };
  }

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = buildStyleText();
    document.head.appendChild(style);
  }

  function setOverlayStatus(root, msg, kind) {
    const status = root.querySelector('#steg7Status');
    if (!status) return;
    status.textContent = msg;
    status.className = 'status show ' + (kind || '');
  }

  function syncSignButton(root) {
    const signBtn = root.querySelector('#signBothBtn');
    if (!signBtn) return;
    const ackBundle = root.querySelector('#ackBundle')?.checked;
    const name = root.querySelector('#patientName')?.value.trim();
    const pnr = root.querySelector('#patientId')?.value.trim();
    signBtn.disabled = !(ackBundle && name && pnr);
  }

  function buildFormHtml(context) {
    return `
  <div class="wrap">
    <header class="demo-header">
      <span class="demo-kicker">★ Steg 7</span>
      <h1 class="demo-title">Avtal &amp; Samtycke</h1>
      <p class="demo-subtitle">Signera båda dokumenten tillsammans. Låses i journalen (${CONSENT_AGREEMENT.apiId} + ${CONSENT_COOLING.apiId}).</p>
    </header>

    <div class="demo-scroll" id="steg7FormPanel">
      <section class="section-block section-block--docs" aria-label="Dokument att signera" data-consent-ids="${CONSENT_AGREEMENT.apiId},${CONSENT_COOLING.apiId}">
        <div class="doc-scroll">${buildDocumentsBlock(context)}</div>
        <label class="check">
          <input type="checkbox" id="ackBundle" />
          <span>Jag godkänner behandlingsavtalet och lämnar särskilt samtycke till behandling innan ångerfristen löpt ut.</span>
        </label>
      </section>

      <section class="section-block section-block--sign" aria-label="Signering">
        <div class="field">
          <label for="patientName">Namn</label>
          <input type="text" id="patientName" autocomplete="name" value="${escapeHtml(context.patientName)}" placeholder="För- och efternamn" />
        </div>
        <div class="field">
          <label for="patientId">Personnummer</label>
          <input type="text" id="patientId" autocomplete="off" value="${escapeHtml(context.personnummer)}" placeholder="ÅÅÅÅMMDD-XXXX" pattern="\\d{8}-?\\d{4}" />
        </div>
      </section>

      <div class="status" id="steg7Status" role="status" aria-live="polite"></div>
    </div>

    <div class="actions">
      <button class="btn btn-ghost" type="button" id="cancelBtn">Avbryt</button>
      <button class="btn btn-primary" type="button" id="signBothBtn" disabled>✍ Signera</button>
    </div>

    <section class="signed-panel" id="signedPanel" hidden>
      <div class="signed-banner">
        <h3>✓ Avtal och samtycke signerat och låst</h3>
        <p>Båda dokumenten är registrerade i Hair TP:s journal-system. Du kan stänga sidan — kliniken har fått besked.</p>
        <p style="margin-top:10px;font-size:11px;color:var(--t3)">
          Entry-ID: <code id="signedEntryId" style="font-family:'SF Mono',ui-monospace,monospace;font-weight:700"></code>
        </p>
      </div>
    </section>
  </div>`;
  }

  function mockSignatureHash(name, pnr, consentId) {
    try {
      return btoa(unescape(encodeURIComponent(`${name}|${pnr}|${consentId}|${Date.now()}`)));
    } catch {
      return `demo-${consentId}-${Date.now().toString(36)}`;
    }
  }

  async function apiFetch(path, options = {}) {
    const res = await fetch(path, {
      method: options.method || 'GET',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(options.headers || {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    const text = await res.text();
    let payload = null;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = { raw: text };
    }
    if (!res.ok) {
      const message =
        (payload && (payload.error || payload.message)) || text || `HTTP ${res.status}`;
      throw new Error(message);
    }
    return payload;
  }

  async function submitBundleToJournal(root, context) {
    const patientName = root.querySelector('#patientName')?.value.trim() || context.patientName;
    const patientIdNumber = root.querySelector('#patientId')?.value.trim() || context.personnummer;
    const patientId = context.patientId || mountOptions.patientId || '';
    const signedAt = new Date().toISOString();
    const signatures = [CONSENT_AGREEMENT, CONSENT_COOLING].map((consent) => ({
      consentId: consent.apiId,
      consentTitle: consent.title,
      consentVersion: consent.version,
      patientName,
      patientIdNumber,
      timestamp: signedAt,
      signatureHash: mockSignatureHash(patientName, patientIdNumber, consent.apiId),
    }));

    const journalPayload = {
      patientId,
      personnummer: patientIdNumber,
      journalType: 'consent_bundle',
      title: 'Avtal + samtycke · steg 7',
      source: 'cco_consent_bundle',
      status: 'draft',
      fields: {
        bundleType: 'CONSENT_BUNDLE',
        step: 7,
        consentIds: [CONSENT_AGREEMENT.apiId, CONSENT_COOLING.apiId],
        patientSignedName: patientName,
        patientSignedId: patientIdNumber,
        signatures,
        offerLabel: context.offerLabel,
      },
    };

    if (typeof mountOptions.onJournalSubmit === 'function') {
      return mountOptions.onJournalSubmit(journalPayload);
    }

    if (!patientId) {
      return {
        entryId: `demo-steg7-${Date.now().toString(36)}`,
        demo: true,
      };
    }

    const created = await apiFetch('/api/v1/cco-journal/entry', {
      method: 'PUT',
      body: journalPayload,
    });
    const entryId = created?.entry?.entryId;
    if (!entryId) throw new Error('Journalpost saknar entryId.');
    const signed = await apiFetch('/api/v1/cco-journal/entry/sign', {
      method: 'POST',
      body: { patientId, entryId },
    });
    return {
      entryId: signed?.entry?.entryId || entryId,
      entry: signed?.entry || created?.entry,
    };
  }

  function showSignedState(root, entryId) {
    const formPanel = root.querySelector('#steg7FormPanel');
    const actions = root.querySelector('.actions');
    const header = root.querySelector('.demo-header');
    const signedPanel = root.querySelector('#signedPanel');
    const signedEntryId = root.querySelector('#signedEntryId');
    if (formPanel) formPanel.style.display = 'none';
    if (actions) actions.style.display = 'none';
    if (header) header.style.display = 'none';
    if (signedPanel) signedPanel.hidden = false;
    if (signedEntryId) signedEntryId.textContent = entryId || '—';
    try {
      sessionStorage.setItem(SIGNED_KEY, '1');
      sessionStorage.removeItem(DISMISS_KEY);
    } catch {
      /* private mode */
    }
  }

  async function signBundle(root, context) {
    const signBtn = root.querySelector('#signBothBtn');
    if (!signBtn || signBtn.disabled) return;

    const ackBundle = root.querySelector('#ackBundle')?.checked;
    const name = root.querySelector('#patientName')?.value.trim();
    const pnr = root.querySelector('#patientId')?.value.trim();
    if (!ackBundle) {
      setOverlayStatus(root, '⚠ Godkänn avtal och samtycke innan signering.', 'error');
      return;
    }
    if (!name || !pnr) {
      setOverlayStatus(root, '⚠ Ange namn och personnummer.', 'error');
      return;
    }

    signBtn.disabled = true;
    setOverlayStatus(root, 'Signerar avtal och samtycke…', 'warning');

    try {
      const result = await submitBundleToJournal(root, {
        ...context,
        patientName: name,
        personnummer: pnr,
      });
      setOverlayStatus(root, '✓ Avtal och samtycke signerat och låst', 'success');
      showSignedState(root, result.entryId);
      if (typeof mountOptions.onSigned === 'function') {
        mountOptions.onSigned(result);
      }
      window.setTimeout(() => {
        if (readDemoParam('demoSteg') === '8' || mountOptions.advanceToSteg8 === true) {
          try {
            global.location.hash = '#steg8';
          } catch {
            /* ignore */
          }
          global.CcoFriskforsakranDemoOverlay?.mount?.({
            patientName: name,
            operationLabel: mountOptions.operationLabel,
          });
        }
      }, 1500);
    } catch (error) {
      signBtn.disabled = false;
      syncSignButton(root);
      setOverlayStatus(root, '⚠ ' + (error.message || 'Signering misslyckades.'), 'error');
    }
  }

  function bindOverlay(root, context) {
    ['#ackBundle', '#patientName', '#patientId'].forEach((sel) => {
      root.querySelector(sel)?.addEventListener('input', () => syncSignButton(root));
      root.querySelector(sel)?.addEventListener('change', () => syncSignButton(root));
    });
    syncSignButton(root);

    root.querySelector('#cancelBtn')?.addEventListener('click', () => unmount(true));
    root.querySelector('#signBothBtn')?.addEventListener('click', () => {
      void signBundle(root, context);
    });
    root.addEventListener('click', (event) => {
      if (event.target === root) unmount(true);
    });

    keyHandler = (event) => {
      if (!document.getElementById(ROOT_ID)) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        unmount(true);
        return;
      }
      if (event.key === 'Enter' && !event.shiftKey) {
        const active = document.activeElement;
        if (active && (active.tagName === 'TEXTAREA' || active.tagName === 'SELECT')) return;
        event.preventDefault();
        void signBundle(root, context);
      }
    };
    document.addEventListener('keydown', keyHandler);
  }

  function showLegalGate(context) {
    if (document.getElementById(GATE_ID)) return document.getElementById(GATE_ID);
    ensureStyles();
    const root = document.createElement('div');
    root.id = GATE_ID;
    root.innerHTML = `
      <div class="demo-modal" role="alertdialog" aria-modal="true" aria-label="Avtal väntar juridisk granskning">
        <div class="wrap">
          <header class="demo-header">
            <span class="demo-kicker">★ Steg 7 · legal_review</span>
            <h1 class="demo-title">Avtal väntar juridisk granskning</h1>
            <p class="demo-subtitle">Behandlingsavtalet och ångerfristsamtycket kan inte signeras förrän mall-versionen är godkänd av juridik.</p>
          </header>
          <section class="gate-panel">
            <p>Kontakta kliniken om du behöver signera innan godkännande finns.</p>
            <p><strong>${escapeHtml(context.patientName)}</strong></p>
            <button type="button" class="btn" id="gateCloseBtn">Stäng</button>
          </section>
        </div>
      </div>`;
    document.body.appendChild(root);
    root.querySelector('#gateCloseBtn')?.addEventListener('click', () => unmountGate(true));
    root.addEventListener('click', (event) => {
      if (event.target === root) unmountGate(true);
    });
    gateKeyHandler = (event) => {
      if (!document.getElementById(GATE_ID)) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        unmountGate(true);
      }
    };
    document.addEventListener('keydown', gateKeyHandler);
    return root;
  }

  function unmountGate(dismissed) {
    document.getElementById(GATE_ID)?.remove();
    if (gateKeyHandler) {
      document.removeEventListener('keydown', gateKeyHandler);
      gateKeyHandler = null;
    }
    if (dismissed) {
      try {
        sessionStorage.setItem(DISMISS_KEY, '1');
      } catch {
        /* private mode */
      }
    }
  }

  function mount(options = {}) {
    mountOptions = { ...options };
    if (document.getElementById(ROOT_ID)) return document.getElementById(ROOT_ID);

    const context = readContext(options);
    global.currentPatientCard = {
      id: context.patientId || options.patientId || '',
      displayName: context.patientName,
      personnummer: context.personnummer,
      legalReviewApproved: resolveLegalReviewApproved(options),
    };

    if (!resolveLegalReviewApproved(options)) {
      showLegalGate(context);
      return null;
    }

    ensureStyles();
    const root = document.createElement('div');
    root.id = ROOT_ID;
    root.className = 'demo-scrim';
    root.setAttribute('role', 'presentation');
    root.innerHTML = `
      <div class="demo-modal" role="dialog" aria-modal="true" aria-label="Avtal + samtycke · steg 7">
        ${buildFormHtml(context)}
      </div>`;
    document.body.appendChild(root);
    bindOverlay(root, context);
    try {
      sessionStorage.removeItem(DISMISS_KEY);
    } catch {
      /* private mode */
    }
    return root;
  }

  function unmount(dismissed) {
    document.getElementById(ROOT_ID)?.remove();
    unmountGate(false);
    if (keyHandler) {
      document.removeEventListener('keydown', keyHandler);
      keyHandler = null;
    }
    mountOptions = {};
    if (dismissed) {
      try {
        sessionStorage.setItem(DISMISS_KEY, '1');
      } catch {
        /* private mode */
      }
    }
  }

  function isSteg7Complete() {
    try {
      if (sessionStorage.getItem(SIGNED_KEY) === '1') return true;
      if (readDemoParam('demoSteg') === '8') return true;
      if (readDemoParam('demoSkipSteg7') === '1') return true;
    } catch {
      /* private mode */
    }
    return false;
  }

  function maybeAutoMount(options = {}) {
    if (!isDemoFlagOn() || !isCustomersView()) return false;
    try {
      if (sessionStorage.getItem(DISMISS_KEY) === '1') return false;
      if (sessionStorage.getItem(SIGNED_KEY) === '1') return false;
    } catch {
      /* private mode */
    }
    mount(options);
    return true;
  }

  global.CcoAvtalSamtyckeBundle = {
    mount,
    unmount,
    maybeAutoMount,
    isDemoFlagOn,
    isSteg7Complete,
    resolveLegalReviewApproved,
    readContext,
    CONSENT_AGREEMENT,
    CONSENT_COOLING,
    CACHE_BUST,
  };
})(typeof window !== 'undefined' ? window : global);
