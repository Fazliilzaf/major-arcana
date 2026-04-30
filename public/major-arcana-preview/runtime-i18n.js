/**
 * Major Arcana Preview — i18n Runtime (I1+I2+I3).
 *
 * Stödjer 4 språk: sv (default), en, de, dk.
 *
 * API:
 *   t('common.save', { fallback: 'Spara' })
 *   formatDate(iso, { style: 'short' })
 *   formatRelativeTime(iso)
 *   formatNumber(value)
 *   formatCurrency(value, { currency: 'SEK' })
 *   setLocale('en')
 *   getLocale()
 *
 * Auto-detect: navigator.language → sv om okänd.
 * Override via localStorage 'cco.locale' eller window.__CCO_LOCALE__.
 */
(() => {
  'use strict';

  const SUPPORTED = Object.freeze(['sv', 'en', 'de', 'dk']);
  const DEFAULT_LOCALE = 'sv';
  const STORAGE_KEY = 'cco.locale';

  const TRANSLATIONS = {
    sv: {
      'common.save': 'Spara',
      'common.cancel': 'Avbryt',
      'common.close': 'Stäng',
      'common.confirm': 'Bekräfta',
      'common.delete': 'Radera',
      'common.edit': 'Redigera',
      'common.loading': 'Laddar…',
      'common.error': 'Fel',
      'common.success': 'Klart',
      'common.search': 'Sök',
      'common.next': 'Nästa',
      'common.back': 'Tillbaka',
      'common.yes': 'Ja',
      'common.no': 'Nej',
      'common.help': 'Hjälp',
      'common.settings': 'Inställningar',

      'cmdk.placeholder': 'Hoppa till lane, vy, action eller inställning…',
      'cmdk.empty': 'Inga matchningar',
      'cmdk.hint': 'esc stänger',
      'cmdk.group.navigation': 'Navigering',
      'cmdk.group.lanes': 'Lanes',
      'cmdk.group.actions': 'Snabbåtgärder',
      'cmdk.group.search': 'Sökning',
      'cmdk.group.savedViews': 'Sparade vyer',
      'cmdk.group.help': 'Hjälp',
      'cmdk.group.ai': 'AI',
      'cmdk.group.focus': 'Fokus',

      'queue.lane.all': 'Alla',
      'queue.lane.actNow': 'Agera nu',
      'queue.lane.sprint': 'Sprint',
      'queue.lane.later': 'Senare',
      'queue.lane.admin': 'Admin',
      'queue.lane.review': 'Granska',
      'queue.lane.unclear': 'Oklart',
      'queue.lane.bookable': 'Bokning',
      'queue.lane.medical': 'Medicinsk',

      'followup.label': 'Uppföljn.',
      'followup.all': 'Alla',
      'followup.overdue': 'Försenade',
      'followup.today': 'Idag',
      'followup.tomorrow': 'Imorgon',
      'followup.waiting': 'Väntar svar',

      'thread.summary.title': 'Sammanfattning',
      'thread.summary.button': 'Sammanfatta',
      'thread.summary.source.heuristic': 'Heuristisk',
      'thread.summary.source.openai': 'AI · OpenAI',
      'thread.summary.verified': 'Verifierad',
      'thread.summary.unverified': 'Ej verifierad',
      'thread.summary.sinceLast': 'Sedan senast',
      'thread.summary.nbaLabel': 'Föreslagen åtgärd',

      'sentiment.positive': 'Positiv',
      'sentiment.neutral': 'Neutral',
      'sentiment.negative': 'Negativ',
      'sentiment.anxious': 'Orolig',
      'sentiment.urgent': 'Akut',

      'session.lockTitle': 'Sessionen är låst',
      'session.unlockBtn': 'Lås upp',
      'session.timeoutMsg': 'Sessionen har överskridit max-tiden.',

      'softBreak.title': 'Hantera avbrott',
      'softBreak.pause': 'Pausa fokus',
      'softBreak.replace': 'Byt ut fokus-tråd',
      'softBreak.end': 'Avsluta fokus',

      'pwa.install': 'Installera CCO',
      'pwa.update': 'Ny version tillgänglig — ladda om för att uppdatera.',
      'pwa.offline': 'Offline-läge: åtgärder köas och synkas när du är online.',

      'wizard.title.brand': 'Brand & namn',
      'wizard.title.mailbox': 'Mailbox-koppling',
      'wizard.title.identity': 'Writing-identity',
      'wizard.title.review': 'Granska och slutför',
      'wizard.create': 'Skapa tenant',

      'feedback.registered': 'Feedback registrerad — bidrar till bättre utkast.',

      'help.faq.title': 'Vanliga frågor',
      'help.shortcuts.title': 'Snabbgenvägar',
      'help.contact.title': 'Behöver du mer hjälp?',
    },

    en: {
      'common.save': 'Save', 'common.cancel': 'Cancel', 'common.close': 'Close',
      'common.confirm': 'Confirm', 'common.delete': 'Delete', 'common.edit': 'Edit',
      'common.loading': 'Loading…', 'common.error': 'Error', 'common.success': 'Done',
      'common.search': 'Search', 'common.next': 'Next', 'common.back': 'Back',
      'common.yes': 'Yes', 'common.no': 'No', 'common.help': 'Help', 'common.settings': 'Settings',
      'cmdk.placeholder': 'Jump to lane, view, action or setting…',
      'cmdk.empty': 'No matches', 'cmdk.hint': 'esc closes',
      'cmdk.group.navigation': 'Navigation', 'cmdk.group.lanes': 'Lanes',
      'cmdk.group.actions': 'Quick actions', 'cmdk.group.search': 'Search',
      'cmdk.group.savedViews': 'Saved views', 'cmdk.group.help': 'Help',
      'cmdk.group.ai': 'AI', 'cmdk.group.focus': 'Focus',
      'queue.lane.all': 'All', 'queue.lane.actNow': 'Act now', 'queue.lane.sprint': 'Sprint',
      'queue.lane.later': 'Later', 'queue.lane.admin': 'Admin', 'queue.lane.review': 'Review',
      'queue.lane.unclear': 'Unclear', 'queue.lane.bookable': 'Booking', 'queue.lane.medical': 'Medical',
      'followup.label': 'Follow-up', 'followup.all': 'All', 'followup.overdue': 'Overdue',
      'followup.today': 'Today', 'followup.tomorrow': 'Tomorrow', 'followup.waiting': 'Waiting reply',
      'thread.summary.title': 'Summary', 'thread.summary.button': 'Summarize',
      'thread.summary.source.heuristic': 'Heuristic', 'thread.summary.source.openai': 'AI · OpenAI',
      'thread.summary.verified': 'Verified', 'thread.summary.unverified': 'Unverified',
      'thread.summary.sinceLast': 'Since last visit', 'thread.summary.nbaLabel': 'Suggested action',
      'sentiment.positive': 'Positive', 'sentiment.neutral': 'Neutral', 'sentiment.negative': 'Negative',
      'sentiment.anxious': 'Anxious', 'sentiment.urgent': 'Urgent',
      'session.lockTitle': 'Session locked', 'session.unlockBtn': 'Unlock',
      'session.timeoutMsg': 'Session has exceeded the maximum time.',
      'softBreak.title': 'Handle interruption', 'softBreak.pause': 'Pause focus',
      'softBreak.replace': 'Replace focus thread', 'softBreak.end': 'End focus',
      'pwa.install': 'Install CCO',
      'pwa.update': 'New version available — reload to update.',
      'pwa.offline': 'Offline mode: actions queued and synced when back online.',
      'wizard.title.brand': 'Brand & name', 'wizard.title.mailbox': 'Mailbox connection',
      'wizard.title.identity': 'Writing identity', 'wizard.title.review': 'Review and finish',
      'wizard.create': 'Create tenant',
      'feedback.registered': 'Feedback recorded — improves future drafts.',
      'help.faq.title': 'FAQ', 'help.shortcuts.title': 'Shortcuts',
      'help.contact.title': 'Need more help?',
    },

    de: {
      'common.save': 'Speichern', 'common.cancel': 'Abbrechen', 'common.close': 'Schließen',
      'common.confirm': 'Bestätigen', 'common.delete': 'Löschen', 'common.edit': 'Bearbeiten',
      'common.loading': 'Lädt…', 'common.error': 'Fehler', 'common.success': 'Fertig',
      'common.search': 'Suchen', 'common.next': 'Weiter', 'common.back': 'Zurück',
      'common.yes': 'Ja', 'common.no': 'Nein', 'common.help': 'Hilfe', 'common.settings': 'Einstellungen',
      'cmdk.placeholder': 'Springe zu Lane, Ansicht, Aktion oder Einstellung…',
      'cmdk.empty': 'Keine Treffer', 'cmdk.hint': 'esc schließt',
      'cmdk.group.navigation': 'Navigation', 'cmdk.group.lanes': 'Lanes',
      'cmdk.group.actions': 'Schnellaktionen', 'cmdk.group.search': 'Suche',
      'cmdk.group.savedViews': 'Gespeicherte Ansichten', 'cmdk.group.help': 'Hilfe',
      'cmdk.group.ai': 'KI', 'cmdk.group.focus': 'Fokus',
      'queue.lane.all': 'Alle', 'queue.lane.actNow': 'Jetzt handeln', 'queue.lane.sprint': 'Sprint',
      'queue.lane.later': 'Später', 'queue.lane.admin': 'Admin', 'queue.lane.review': 'Prüfen',
      'queue.lane.unclear': 'Unklar', 'queue.lane.bookable': 'Buchung', 'queue.lane.medical': 'Medizinisch',
      'followup.label': 'Follow-up', 'followup.all': 'Alle', 'followup.overdue': 'Überfällig',
      'followup.today': 'Heute', 'followup.tomorrow': 'Morgen', 'followup.waiting': 'Wartet auf Antwort',
      'thread.summary.title': 'Zusammenfassung', 'thread.summary.button': 'Zusammenfassen',
      'thread.summary.source.heuristic': 'Heuristisch', 'thread.summary.source.openai': 'KI · OpenAI',
      'thread.summary.verified': 'Verifiziert', 'thread.summary.unverified': 'Nicht verifiziert',
      'thread.summary.sinceLast': 'Seit letztem Besuch', 'thread.summary.nbaLabel': 'Vorgeschlagene Aktion',
      'sentiment.positive': 'Positiv', 'sentiment.neutral': 'Neutral', 'sentiment.negative': 'Negativ',
      'sentiment.anxious': 'Besorgt', 'sentiment.urgent': 'Dringend',
      'session.lockTitle': 'Sitzung gesperrt', 'session.unlockBtn': 'Entsperren',
      'session.timeoutMsg': 'Sitzung hat das Zeitlimit überschritten.',
      'softBreak.title': 'Unterbrechung handhaben', 'softBreak.pause': 'Fokus pausieren',
      'softBreak.replace': 'Fokus-Thread ersetzen', 'softBreak.end': 'Fokus beenden',
      'pwa.install': 'CCO installieren',
      'pwa.update': 'Neue Version verfügbar — bitte neu laden.',
      'pwa.offline': 'Offline-Modus: Aktionen werden synchronisiert wenn online.',
      'wizard.title.brand': 'Marke & Name', 'wizard.title.mailbox': 'Mailbox-Verbindung',
      'wizard.title.identity': 'Schreib-Identität', 'wizard.title.review': 'Prüfen & abschließen',
      'wizard.create': 'Tenant erstellen',
      'feedback.registered': 'Feedback gespeichert — verbessert zukünftige Entwürfe.',
      'help.faq.title': 'Häufige Fragen', 'help.shortcuts.title': 'Tastenkürzel',
      'help.contact.title': 'Brauchst du mehr Hilfe?',
    },

    dk: {
      'common.save': 'Gem', 'common.cancel': 'Annullér', 'common.close': 'Luk',
      'common.confirm': 'Bekræft', 'common.delete': 'Slet', 'common.edit': 'Rediger',
      'common.loading': 'Indlæser…', 'common.error': 'Fejl', 'common.success': 'Færdig',
      'common.search': 'Søg', 'common.next': 'Næste', 'common.back': 'Tilbage',
      'common.yes': 'Ja', 'common.no': 'Nej', 'common.help': 'Hjælp', 'common.settings': 'Indstillinger',
      'cmdk.placeholder': 'Hop til lane, visning, handling eller indstilling…',
      'cmdk.empty': 'Ingen resultater', 'cmdk.hint': 'esc lukker',
      'cmdk.group.navigation': 'Navigation', 'cmdk.group.lanes': 'Lanes',
      'cmdk.group.actions': 'Hurtighandlinger', 'cmdk.group.search': 'Søgning',
      'cmdk.group.savedViews': 'Gemte visninger', 'cmdk.group.help': 'Hjælp',
      'cmdk.group.ai': 'AI', 'cmdk.group.focus': 'Fokus',
      'queue.lane.all': 'Alle', 'queue.lane.actNow': 'Handl nu', 'queue.lane.sprint': 'Sprint',
      'queue.lane.later': 'Senere', 'queue.lane.admin': 'Admin', 'queue.lane.review': 'Gennemgå',
      'queue.lane.unclear': 'Uklart', 'queue.lane.bookable': 'Booking', 'queue.lane.medical': 'Medicinsk',
      'followup.label': 'Follow-up', 'followup.all': 'Alle', 'followup.overdue': 'Forsinkede',
      'followup.today': 'I dag', 'followup.tomorrow': 'I morgen', 'followup.waiting': 'Venter på svar',
      'thread.summary.title': 'Resumé', 'thread.summary.button': 'Resumér',
      'thread.summary.source.heuristic': 'Heuristisk', 'thread.summary.source.openai': 'AI · OpenAI',
      'thread.summary.verified': 'Verificeret', 'thread.summary.unverified': 'Ikke verificeret',
      'thread.summary.sinceLast': 'Siden sidst', 'thread.summary.nbaLabel': 'Foreslået handling',
      'sentiment.positive': 'Positiv', 'sentiment.neutral': 'Neutral', 'sentiment.negative': 'Negativ',
      'sentiment.anxious': 'Bekymret', 'sentiment.urgent': 'Akut',
      'session.lockTitle': 'Session låst', 'session.unlockBtn': 'Lås op',
      'session.timeoutMsg': 'Session har overskredet maks-tiden.',
      'softBreak.title': 'Håndtér afbrydelse', 'softBreak.pause': 'Pausér fokus',
      'softBreak.replace': 'Erstat fokus-tråd', 'softBreak.end': 'Afslut fokus',
      'pwa.install': 'Installer CCO',
      'pwa.update': 'Ny version tilgængelig — genindlæs for at opdatere.',
      'pwa.offline': 'Offline-tilstand: handlinger synkroniseres når online.',
      'wizard.title.brand': 'Brand & navn', 'wizard.title.mailbox': 'Mailbox-forbindelse',
      'wizard.title.identity': 'Skrive-identitet', 'wizard.title.review': 'Gennemgå og afslut',
      'wizard.create': 'Opret tenant',
      'feedback.registered': 'Feedback registreret — forbedrer fremtidige udkast.',
      'help.faq.title': 'Ofte stillede spørgsmål', 'help.shortcuts.title': 'Genveje',
      'help.contact.title': 'Brug for mere hjælp?',
    },
  };

  function detectLocale() {
    try {
      const stored = window.localStorage?.getItem(STORAGE_KEY);
      if (stored && SUPPORTED.includes(stored)) return stored;
    } catch (_e) {}
    if (typeof window !== 'undefined' && window.__CCO_LOCALE__) {
      const o = String(window.__CCO_LOCALE__).toLowerCase();
      if (SUPPORTED.includes(o)) return o;
    }
    if (typeof navigator !== 'undefined' && navigator.language) {
      const lang = navigator.language.toLowerCase().split('-')[0];
      const norm = lang === 'da' ? 'dk' : lang;
      if (SUPPORTED.includes(norm)) return norm;
    }
    return DEFAULT_LOCALE;
  }

  let currentLocale = detectLocale();

  function setLocale(locale) {
    const safe = String(locale || '').toLowerCase();
    if (!SUPPORTED.includes(safe)) return;
    currentLocale = safe;
    try { window.localStorage?.setItem(STORAGE_KEY, safe); } catch (_e) {}
    document.documentElement.setAttribute('lang', safe === 'dk' ? 'da' : safe);
    document.documentElement.setAttribute('data-cco-locale', safe);
    if (typeof window.MajorArcanaPreviewI18n?._notifyListeners === 'function') {
      window.MajorArcanaPreviewI18n._notifyListeners(safe);
    }
  }

  function getLocale() { return currentLocale; }

  function t(key, options = {}) {
    const fallback = options?.fallback != null ? String(options.fallback) : key;
    const dict = TRANSLATIONS[currentLocale] || TRANSLATIONS[DEFAULT_LOCALE];
    const result = dict?.[key];
    if (result == null) {
      // Fallback till sv om aktuell locale saknar nyckeln
      return TRANSLATIONS[DEFAULT_LOCALE]?.[key] || fallback;
    }
    return result;
  }

  function intlLocale() {
    return currentLocale === 'dk' ? 'da-DK'
      : currentLocale === 'sv' ? 'sv-SE'
      : currentLocale === 'de' ? 'de-DE'
      : 'en-US';
  }

  function formatDate(iso, options = {}) {
    if (!iso) return '';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    const style = options.style || 'short';
    const fmt = new Intl.DateTimeFormat(intlLocale(), {
      dateStyle: style === 'long' ? 'long' : style === 'medium' ? 'medium' : 'short',
      timeStyle: options.includeTime ? 'short' : undefined,
    });
    return fmt.format(date);
  }

  function formatRelativeTime(iso) {
    if (!iso) return '';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    const diffSec = Math.round((date.getTime() - Date.now()) / 1000);
    const fmt = new Intl.RelativeTimeFormat(intlLocale(), { numeric: 'auto' });
    const abs = Math.abs(diffSec);
    if (abs < 60) return fmt.format(diffSec, 'second');
    if (abs < 3600) return fmt.format(Math.round(diffSec / 60), 'minute');
    if (abs < 86400) return fmt.format(Math.round(diffSec / 3600), 'hour');
    if (abs < 86400 * 7) return fmt.format(Math.round(diffSec / 86400), 'day');
    return formatDate(iso, { style: 'short' });
  }

  function formatNumber(value, options = {}) {
    if (value == null || value === '') return '';
    return new Intl.NumberFormat(intlLocale(), options).format(Number(value) || 0);
  }

  function formatCurrency(value, options = {}) {
    if (value == null || value === '') return '';
    const currency = options.currency || (currentLocale === 'dk' ? 'DKK' : currentLocale === 'de' ? 'EUR' : currentLocale === 'en' ? 'GBP' : 'SEK');
    return new Intl.NumberFormat(intlLocale(), { style: 'currency', currency }).format(Number(value) || 0);
  }

  // Listeners för locale-change
  const listeners = [];
  function onLocaleChange(fn) {
    if (typeof fn === 'function') listeners.push(fn);
    return () => {
      const idx = listeners.indexOf(fn);
      if (idx !== -1) listeners.splice(idx, 1);
    };
  }
  function _notifyListeners(locale) {
    for (const fn of listeners.slice()) {
      try { fn(locale); } catch (_e) {}
    }
  }

  function mount() {
    document.documentElement.setAttribute('lang', currentLocale === 'dk' ? 'da' : currentLocale);
    document.documentElement.setAttribute('data-cco-locale', currentLocale);
  }

  if (typeof window !== 'undefined') {
    window.MajorArcanaPreviewI18n = Object.freeze({
      mount,
      t,
      setLocale,
      getLocale,
      formatDate,
      formatRelativeTime,
      formatNumber,
      formatCurrency,
      onLocaleChange,
      _notifyListeners,
      SUPPORTED,
    });

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', mount, { once: true });
    } else {
      mount();
    }
  }
})();
