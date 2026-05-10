(() => {
  window.MajorArcanaPreviewConfig = Object.freeze({
    QUEUE_LANE_ORDER: [
      "act-now",
      "sprint",
      "later",
      "admin",
      "review",
      "unclear",
      "bookable",
      "medical",
    ],
    QUEUE_LANE_LABELS: {
      all: "Alla",
      later: "Senare",
      followup: "Uppföljn.",
      review: "Granska",
      unclear: "Oklart",
      sprint: "Sprint",
      "act-now": "Agera nu",
      bookable: "Bokning",
      today: "Idag",
      tomorrow: "Imorgon",
      "high-risk": "Hög risk",
      unassigned: "Oägda",
      medical: "Medicinsk",
      admin: "Admin",
    },
    PILL_ICON_SVGS: {
      focus:
        '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="4.7" fill="none" stroke="currentColor" stroke-width="1.3" /><circle cx="8" cy="8" r="1.4" fill="currentColor" /></svg>',
      bolt: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8.7 2.7 4.6 8.5h2.6L6.8 13.3l4.6-6H8.8l-.1-4.6Z" fill="currentColor" /></svg>',
      play: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5 4.5 11.5 8 5 11.5Z" fill="currentColor" /></svg>',
      warning:
        '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2.7 13.1 12H2.9L8 2.7Z" fill="none" stroke="currentColor" stroke-linejoin="round" stroke-width="1.3" /><path d="M8 6.1v3.1M8 11.4h.1" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.4" /></svg>',
      mail: '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="2.7" y="4.1" width="10.6" height="7.8" rx="1.7" fill="none" stroke="currentColor" stroke-width="1.3" /><path d="M4.1 6 8 8.7 11.9 6" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.3" /></svg>',
      info: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="5.1" fill="none" stroke="currentColor" stroke-width="1.3" /><path d="M8 7.1v3M8 5h.1" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.5" /></svg>',
      question:
        '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6.3 6.2c0-1 .7-1.8 1.8-1.8 1 0 1.8.7 1.8 1.6 0 1.4-1.8 1.7-1.8 2.8" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.3" /><path d="M8.1 11.6h.1" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.6" /></svg>',
      clock:
        '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="5.2" fill="none" stroke="currentColor" stroke-width="1.3" /><path d="M8 5.2v3.1l2.1 1.3" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.3" /></svg>',
      history:
        '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.9 5.3V2.9H6.3" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.3" /><path d="M4 5.3A4.8 4.8 0 1 1 3.5 8" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.3" /><path d="M8 5.1v3L10 9.3" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.3" /></svg>',
      sparkle:
        '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m8 1.8.9 3 3 .9-3 .9-.9 3-.9-3-3-.9 3-.9Zm4.5 6.8.5 1.6 1.6.5-1.6.5-.5 1.6-.5-1.6-1.6-.5 1.6-.5Z" fill="none" stroke="currentColor" stroke-linejoin="round" stroke-width="1.2" /></svg>',
      check:
        '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="5.2" fill="none" stroke="currentColor" stroke-width="1.3" /><path d="M5.6 8.1 7.3 9.8 10.6 6.6" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.4" /></svg>',
      calendar:
        '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="2.8" y="3.6" width="10.4" height="9" rx="2" fill="none" stroke="currentColor" stroke-width="1.3" /><path d="M5.2 2.8v2M10.8 2.8v2M2.9 6h10.2" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.3" /></svg>',
      note: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2.7h6.5L13 5.2v7.1a1.1 1.1 0 0 1-1.1 1.1H4A1.1 1.1 0 0 1 2.9 12.3V3.8A1.1 1.1 0 0 1 4 2.7Z" fill="none" stroke="currentColor" stroke-linejoin="round" stroke-width="1.2" /><path d="M10.5 2.8v2.6H13M5.2 7.4h5.2M5.2 9.6h4.1" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.2" /></svg>',
      sliders:
        '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 4.5h10M3 8h10M3 11.5h10" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.3" /><circle cx="6" cy="4.5" r="1.2" fill="currentColor" /><circle cx="10" cy="8" r="1.2" fill="currentColor" /><circle cx="7.5" cy="11.5" r="1.2" fill="currentColor" /></svg>',
      layers:
        '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3.2 12.2 5.5 8 7.8 3.8 5.5 8 3.2Z" fill="none" stroke="currentColor" stroke-linejoin="round" stroke-width="1.2" /><path d="M3.8 8.1 8 10.4l4.2-2.3M3.8 10.7 8 13l4.2-2.3" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.2" /></svg>',
      grid: '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="3" y="3" width="4" height="4" rx="1" fill="none" stroke="currentColor" stroke-width="1.2" /><rect x="9" y="3" width="4" height="4" rx="1" fill="none" stroke="currentColor" stroke-width="1.2" /><rect x="3" y="9" width="4" height="4" rx="1" fill="none" stroke="currentColor" stroke-width="1.2" /><rect x="9" y="9" width="4" height="4" rx="1" fill="none" stroke="currentColor" stroke-width="1.2" /></svg>',
      plus: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3.1v9.8M3.1 8h9.8" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.5" /></svg>',
      team: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="6" cy="6.1" r="1.9" fill="none" stroke="currentColor" stroke-width="1.2" /><circle cx="10.5" cy="6.8" r="1.6" fill="none" stroke="currentColor" stroke-width="1.2" /><path d="M3.7 12c.5-1.7 1.6-2.5 3.2-2.5 1.5 0 2.6.8 3.1 2.5M9.2 11.8c.3-1.1 1-1.7 2-1.7.9 0 1.6.5 2 1.5" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.2" /></svg>',
      list: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5 4.5h6M5 8h6M5 11.5h6" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.3" /><circle cx="3.2" cy="4.5" r=".8" fill="currentColor" /><circle cx="3.2" cy="8" r=".8" fill="currentColor" /><circle cx="3.2" cy="11.5" r=".8" fill="currentColor" /></svg>',
      send: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M13 3.4 3.2 7.6l3.8 1.2 1.2 3.8L13 3.4Z" fill="none" stroke="currentColor" stroke-linejoin="round" stroke-width="1.2" /><path d="M7 8.8 13 3.4" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.2" /></svg>',
      trash:
        '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5.3 3.8h5.4M6.2 3.8V2.9h3.6v.9M4.6 5.1l.5 6.6a1 1 0 0 0 1 .9h3.8a1 1 0 0 0 1-.9l.5-6.6M6.9 6.7v4.1M9.1 6.7v4.1" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.2" /></svg>',
      undo: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4.2 7.2V4.5H1.5M4.2 4.5c1.4-2 3.8-3.2 6.4-3.2 4.2 0 7.6 3.4 7.6 7.6S14.8 16 10.6 16c-2.9 0-5.4-1.6-6.7-4" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.3" /></svg>',
    },
    QUEUE_ACTIONS: [
      { label: "Svarstudio", tone: "studio", action: "studio", mode: "reply", icon: "sparkle" },
      { label: "Historik", tone: "history", action: "history", icon: "history" },
      { label: "Senare", tone: "later", action: "later", icon: "clock" },
      { label: "Skickade", tone: "sent", action: "sent_feed", icon: "send" },
      { label: "Klar", tone: "done", action: "handled", icon: "check" },
      { label: "Radera", tone: "delete", action: "delete", icon: "trash" },
    ],
    FOCUS_SIGNALS: [
      { label: "Agera nu", tone: "queue", icon: "bolt" },
      { label: "SLA 45m", tone: "sla", icon: "clock" },
      { label: "Följ upp", tone: "followup", icon: "calendar" },
    ],
    FOCUS_ACTIONS: [
      { label: "Svara nu", tone: "studio", action: "studio", mode: "reply", icon: "mail" },
      {
        label: "Nytt mejl till kunden",
        tone: "compose",
        action: "studio",
        mode: "compose",
        icon: "send",
      },
      { label: "Svara senare", tone: "later", action: "later", icon: "clock" },
      { label: "Markera klar", tone: "done", action: "handled", icon: "check" },
      { label: "Schemalägg uppföljning", tone: "schedule", action: "schedule", icon: "calendar" },
      { label: "Öppna historik", tone: "history", action: "history", icon: "history" },
      { label: "Radera", tone: "delete", action: "delete", icon: "trash" },
    ],
    INTEL_ACTIONS: [
      { label: "Historik", tone: "history", action: "history", icon: "history" },
      {
        label: "Signaler",
        tone: "calibration",
        action: "readout",
        target: "calibration",
        icon: "sliders",
      },
      { label: "Driftläge", tone: "shadow", action: "readout", target: "shadow", icon: "layers" },
    ],
    WORKLIST_TRUTH_VIEW: {
      enabled: true,
      defaultOpen: false,
      limit: 6,
      relayMode: "legacy_advisory_only",
      comparableBaselineMailboxIds: [
        "egzona@hairtpclinic.com",
        "contact@hairtpclinic.com",
        "fazli@hairtpclinic.com",
        "info@hairtpclinic.com",
      ],
    },
    WORKLIST_TRUTH_PRIMARY: {
      enabled: true,
      mailboxIds: ["egzona@hairtpclinic.com", "contact@hairtpclinic.com"],
      limit: 120,
      disableStorageKey: "cco.truthPrimaryWorklist.disabled",
    },
    FOCUS_TRUTH_PRIMARY: {
      enabled: true,
      mailboxIds: ["egzona@hairtpclinic.com", "contact@hairtpclinic.com"],
      readOnly: true,
      disableStorageKey: "cco.truthPrimaryFocus.disabled",
    },
    STUDIO_TRUTH_PRIMARY: {
      enabled: true,
      mailboxIds: ["egzona@hairtpclinic.com", "contact@hairtpclinic.com"],
      replyOnly: true,
      disableStorageKey: "cco.truthPrimaryStudio.disabled",
    },
    NOTE_MODE_PRESETS: {
      "ai-summary": {
        templateKey: null,
        text: "AI-sammanfattning:\n- Kunden vill boka om morgondagens PRP-tid.\n- Föredrar eftermiddag denna vecka.\n- Kräver snabb återkoppling innan dagens slut.",
        tags: ["AI", "Sammanfattning", "Ombokning"],
      },
      "ai-extract": {
        templateKey: null,
        text: "Extraherade detaljer:\n- Behandling: PRP 2/3\n- Preferred window: eftermiddag\n- Driver: behöver ny tid snabbt",
        tags: ["AI", "Detaljer", "Signal"],
      },
      "ai-action-items": {
        templateKey: null,
        text: "Åtgärdspunkter:\n1. Skicka två eftermiddagstider.\n2. Säkra fallback-slot efter 15:00.\n3. Schemalägg uppföljning om inget svar inom 2h.",
        tags: ["AI", "Åtgärder", "Uppföljning"],
      },
      manual: {
        templateKey: null,
        text: "",
        tags: ["Manuell"],
      },
    },
    PRIORITY_LABELS: {
      high: "Hög",
      medium: "Medel",
      low: "Låg",
    },
    VISIBILITY_LABELS: {
      team: "Team",
      internal: "Intern",
      all_operators: "Alla operatörer",
    },
    DEFAULT_WORKSPACE: {
      left: 396,
      main: 596,
      right: 372,
    },
    MIN_QUEUE_WIDTH: 360,
    MIN_INTEL_WIDTH: 320,
  });
})();
