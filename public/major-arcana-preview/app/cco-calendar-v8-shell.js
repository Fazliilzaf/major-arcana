'use strict';
/* ════════════════════════════════════════════════════════════════════════
 * cco-calendar-v8-shell.js — facit-trogen kalender (v8) renderer.
 * Exponerar window.ArcanaCalendarV8.render(ctx) som monterar facitens 3-panel-
 * layout under #cco-cal-v8-root. Bakom feature-flag (data-calendar-v8="on").
 *
 * FAS-STATUS: P0 = statisk facit-markup (pixel-identisk baseline). Senare faser
 * parametriserar sektionerna (morgon-kort, vecko-grid, dossiér) från ctx-data.
 * ════════════════════════════════════════════════════════════════════════ */
(function () {
  var MARKUP = `<div class="top-nav">
  <span class="brand">CCO</span>
  <a href="#">Konversationer</a>
  <a href="#">Kunder</a>
  <a href="#" class="active">Kalender</a>
  <a href="#">Automatisering</a>
  <a href="#">Mer</a>
  <label class="global-search" id="globalSearch">
    <svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
    </svg>
    <input type="search" placeholder="Sök kund, bokning eller behandling…" id="globalSearchInput" />
    <span class="kbd">⌘K</span>
  </label>
  <span id="breadcrumbSlot"></span>
</div>

<!-- Search overlay (Cmd+K) -->
<div class="search-overlay" id="searchOverlay">
  <div class="search-panel">
    <div class="search-panel-input">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
      </svg>
      <input type="search" id="searchOverlayInput" placeholder="Sök kund eller bokning… (försök 'Anna' eller 'PRP')" autocomplete="off" />
    </div>
    <div class="search-panel-kicker" id="searchPanelKicker">Senaste · 1 247 kunder totalt</div>
    <div class="search-panel-list" id="searchPanelList"></div>
    <div class="search-footer">
      <span><kbd>↑</kbd><kbd>↓</kbd> navigera</span>
      <span><kbd>Return</kbd> öppna</span>
      <span><kbd>Esc</kbd> stäng</span>
    </div>
  </div>
</div>

<div class="app-grid">

  <!-- VÄNSTER -->
  <aside class="side-shell">
    <div class="side-kicker">Arbetslista</div>
    <h2 class="side-h2">Idag</h2>
    <div class="side-list">
      <div class="side-link active">Dagens mottagning <span class="count">12</span></div>
      <div class="side-link">Imorgon <span class="count">8</span></div>
      <div class="side-link">Veckan <span class="count">47</span></div>
      <div class="side-link">Resurser <span class="count">7</span></div>
    </div>
    <div class="side-section">
      <div class="side-kicker">Status</div>
      <div class="side-list" style="margin-top:4px">
        <div class="side-link"><span style="display:inline-flex;gap:7px;align-items:center"><span class="dot" style="background:var(--cco-status-success)"></span>Bekräftade</span><span class="count">8</span></div>
        <div class="side-link"><span style="display:inline-flex;gap:7px;align-items:center"><span class="dot" style="background:var(--cco-status-warning)"></span>Tentativa</span><span class="count">2</span></div>
        <div class="side-link"><span style="display:inline-flex;gap:7px;align-items:center"><span class="dot" style="background:var(--conflict-red)"></span>Konflikt</span><span class="count">1</span></div>
        <div class="side-link"><span style="display:inline-flex;gap:7px;align-items:center"><span class="dot" style="background:var(--cco-status-info)"></span>Återbesök</span><span class="count">3</span></div>
      </div>
    </div>
    <div class="mini-inbox" id="miniInbox">
      <div class="mini-inbox-kicker">Inkorg <span class="badge">3 obokade</span></div>
      <div class="mail-thread" draggable="true" data-source="contact" data-customer="Sofie Andersson" data-init="SA" data-treatment="Konsultation" data-duration="30">
        <div class="mail-from">Sofie Andersson</div>
        <div class="mail-subj">Vill boka konsultation</div>
        <div class="mail-meta">contact@ · 2 min sedan</div>
        <span class="mail-ai-hint">★ Dra till slot</span>
      </div>
      <div class="mail-thread" draggable="true" data-source="info" data-customer="Marcus Berg" data-init="MB" data-treatment="PRP återbesök" data-duration="45">
        <div class="mail-from">Marcus Berg</div>
        <div class="mail-subj">Bokning återbesök PRP</div>
        <div class="mail-meta">info@ · 14 min</div>
        <span class="mail-ai-hint">★ Dra till slot</span>
      </div>
      <div class="mail-thread" draggable="true" data-source="egzona" data-customer="Eva Johansson" data-init="EJ" data-treatment="Microneedling" data-duration="60">
        <div class="mail-from">Eva Johansson</div>
        <div class="mail-subj">Boka microneedling</div>
        <div class="mail-meta">egzona@ · 1 tim</div>
        <span class="mail-ai-hint">★ Dra till slot</span>
      </div>
    </div>
  </aside>

  <!-- KALENDER -->
  <section class="calendar-shell">
    <div class="calendar-surface">

      <header class="calendar-toolbar">
        <div class="calendar-toolbar-main">
          <span class="calendar-toolbar-kicker">Kalender</span>
          <span class="calendar-mark">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 9h18M8 3v4M16 3v4"/>
            </svg>
          </span>
          <h2 id="calTitle">God morgon, Fazli</h2>
        </div>
        <div class="calendar-toolbar-actions">
          <div class="density-toggle" title="Kortdensitet">
            <button class="density-btn active" data-density="vanlig"><span class="density-dot"></span>Vanlig</button>
            <button class="density-btn" data-density="stressig"><span class="density-dot"></span><span class="density-dot"></span>Stressig</button>
            <button class="density-btn" data-density="maraton"><span class="density-dot"></span><span class="density-dot"></span><span class="density-dot"></span>Maraton</button>
          </div>
          <button class="mic-btn" id="micBtn" title="Voice booking — säg t.ex. &quot;Boka Anna PRP nästa tisdag 14 hos Egzona&quot;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>
            </svg>
          </button>
          <button class="calm-toggle" id="calmToggle" title="Lugnt läge — sänk visuell stress när AI har många varningar"><span class="moon">☾</span>Lugnt</button>
          <button class="avatar-toggle" id="avatarToggle" title="Linear/Notion-mode — visa patientavatar istället för rail"><span>◐</span>Avatar</button>
          <div class="timemachine" id="timemachine" title="Tid-maskin — drag bakåt eller framåt">
            <svg class="timemachine-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 12a9 9 0 1 0 9-9"/><polyline points="3 4 3 10 9 10"/><polyline points="12 7 12 12 16 14"/>
            </svg>
            <input type="range" id="tmSlider" min="-7" max="7" value="0" step="1" />
            <span class="timemachine-label" id="tmLabel">Nutid</span>
          </div>
          <div class="segment-group">
            <button class="segment-tab segment-tab--morgon active" data-mode="morgon">☼ Morgon</button>
            <button class="segment-tab" data-mode="vecka">Vecka</button>
            <button class="segment-tab" data-mode="dag">Dag</button>
            <button class="segment-tab" data-mode="resurs">Resurs</button>
          </div>
          <button class="nav-btn">‹</button>
          <button class="nav-btn nav-btn--today">Idag</button>
          <button class="nav-btn">›</button>
        </div>
      </header>

      <div class="calendar-status-bar">
        <span class="week-pill">Vecka <span class="num">22</span></span>
        <span class="status-pill status-pill--success"><span class="dot"></span>8 bekräftade</span>
        <span class="status-pill status-pill--warning"><span class="dot"></span>2 tentativa</span>
        <span class="status-pill status-pill--conflict"><span class="dot"></span>1 konflikt</span>
        <span class="status-pill status-pill--info"><span class="dot"></span>3 återbesök</span>
        <span class="spacer"></span>
        <span class="status-pill" style="color:var(--cco-text-tertiary)">39h lediga</span>
      </div>

      <div class="calendar-content" data-mode="morgon">

        <!-- ═══ MORGON-STANDUP ═══ -->
        <div class="morgon-story">
          <div class="greet">
            <div class="greet-sun"></div>
            <div class="greet-text">
              <h1>God morgon, <span>Fazli</span></h1>
              <p>Torsdag 28 maj · vecka 22 · klockan är <strong>07:32</strong></p>
            </div>
          </div>

          <div class="story-grid">

            <!-- IDAG -->
            <div class="story-card" data-kind="idag">
              <div class="story-card-kicker"><span class="icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 9h18M8 3v4M16 3v4"/></svg></span>Idag</div>
              <h2 class="story-card-headline"><span class="num">12</span> bokningar</h2>
              <p class="story-card-sub">Första kl 08:00 · sista kl 17:30 · tre lunchpauser i veckan</p>
              <div class="day-spark">
                <div class="day-spark-bar" data-h="0" style="height:0%"></div>
                <div class="day-spark-bar" style="height:45%"></div>
                <div class="day-spark-bar" style="height:90%"></div>
                <div class="day-spark-bar" style="height:60%"></div>
                <div class="day-spark-bar" style="height:30%"></div>
                <div class="day-spark-bar" data-h="0" style="height:0%"></div>
                <div class="day-spark-bar" data-h="0" style="height:0%"></div>
                <div class="day-spark-now"></div>
                <div class="day-spark-bar" style="height:75%"></div>
                <div class="day-spark-bar" style="height:80%"></div>
                <div class="day-spark-bar" style="height:55%"></div>
                <div class="day-spark-bar" style="height:35%"></div>
              </div>
            </div>

            <!-- RISKER -->
            <div class="story-card" data-kind="risker">
              <div class="story-card-kicker"><span class="icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4M12 17h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/></svg></span>3 risker</div>
              <h2 class="story-card-headline">Hantera först</h2>
              <div class="story-list">
                <div class="story-item" data-severity="high" data-jump="#bookAnna">
                  <span class="badge">!</span>
                  <span><span class="who">Anna Karlsson</span> <span class="what">— friskförsäkran saknas</span></span>
                  <span class="when">08:00</span>
                </div>
                <div class="story-item" data-severity="med">
                  <span class="badge">!</span>
                  <span><span class="who">Karl Lindberg</span> <span class="what">— betalt halvt</span></span>
                  <span class="when">09:00</span>
                </div>
                <div class="story-item" data-severity="med">
                  <span class="badge">!</span>
                  <span><span class="who">Eva K.</span> <span class="what">— no-show-historik (3)</span></span>
                  <span class="when">14:30</span>
                </div>
              </div>
            </div>

            <!-- MÖJLIGHETER -->
            <div class="story-card" data-kind="mojligheter">
              <div class="story-card-kicker"><span class="icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l2.39 4.84L20 8l-3.5 4 1.5 6L12 15l-6 3 1.5-6L4 8l5.61-1.16L12 2z"/></svg></span>2 möjligheter</div>
              <h2 class="story-card-headline">Fyll luckor</h2>
              <div class="story-list">
                <div class="story-item" data-severity="ok">
                  <span class="badge">★</span>
                  <span><span class="who">Maria-luckan</span> <span class="what">— ring Sofie (väntelista)</span></span>
                  <span class="when">14:30</span>
                </div>
                <div class="story-item" data-severity="ok">
                  <span class="badge">★</span>
                  <span><span class="who">Anna-mönster</span> <span class="what">— bok PRP återbesök tis 09</span></span>
                  <span class="when">+3v</span>
                </div>
              </div>
            </div>

            <!-- KLART FÖR DAGEN -->
            <div class="story-card" data-kind="klart">
              <div class="story-card-kicker"><span class="icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg></span>Prognos</div>
              <h2 class="story-card-headline">Klar 17:00</h2>
              <p class="story-card-sub">Om risker hanteras före lunch. 86% sannolikhet att hålla schemat.</p>
              <div class="ready-meter">
                <div class="ready-meter-track"><div class="ready-meter-fill" style="width:86%"></div></div>
                <div class="ready-meter-labels"><span>Schema-säkerhet</span><span>86%</span></div>
              </div>
            </div>
          </div>

          <div class="story-cta-row">
            <button class="story-cta story-cta--primary" data-jump-mode="vecka">→ Öppna veckovyn</button>
            <button class="story-cta">★ Skicka alla påminnelser (3)</button>
            <button class="story-cta">★ Bekräfta tentativa (2)</button>
            <button class="story-cta">↻ Generera ny standup</button>
          </div>
        </div>

        <!-- ═══ BUSY-BAR ═══ -->
        <div class="calendar-busy">
          <div class="busy-row"><span class="busy-name">Fazli</span><div class="busy-track"><div class="busy-fill" style="width:67%"></div></div><span class="busy-pct">67%</span></div>
          <div class="busy-row"><span class="busy-name">Egzona</span><div class="busy-track"><div class="busy-fill" style="width:82%"></div></div><span class="busy-pct">82%</span></div>
          <div class="busy-row"><span class="busy-name">Dr. Arya</span><div class="busy-track"><div class="busy-fill" style="width:54%"></div></div><span class="busy-pct">54%</span></div>
          <div class="busy-row"><span class="busy-name">Clara</span><div class="busy-track"><div class="busy-fill" style="width:41%"></div></div><span class="busy-pct">41%</span></div>
        </div>

        <!-- ═══ VIBE-VÄDER ═══ -->
        <div class="vibe-strip" id="vibeStrip">
          <div class="vibe-day"><span>☀️</span><span class="vibe-label">Mån</span><span class="vibe-tip">Lugnt · 6 bokningar</span></div>
          <div class="vibe-day"><span>🌤️</span><span class="vibe-label">Tis</span><span class="vibe-tip">Mestadels klart · 8 bokningar · 1 ny inkommande</span></div>
          <div class="vibe-day"><span>⛅</span><span class="vibe-label">Ons</span><span class="vibe-tip">Variabelt · 5 bokningar · 3 luckor</span></div>
          <div class="vibe-day"><span>🔆</span><span class="vibe-label">Tor</span><span class="vibe-tip">Strålande · 12 bokningar — idag är dagen</span></div>
          <div class="vibe-day"><span>🌧️</span><span class="vibe-label">Fre</span><span class="vibe-tip">Stressigt · +12 nya bokningar inkommande</span></div>
          <div class="vibe-day"><span>🌫️</span><span class="vibe-label">Lör</span><span class="vibe-tip">Dimmigt · 0 bokningar · helg-pris aktivt</span></div>
          <div class="vibe-day"><span>🌙</span><span class="vibe-label">Sön</span><span class="vibe-tip">Vilodag · 0 bokningar</span></div>
        </div>

        <!-- ═══ VECKOGRID ═══ -->
        <div class="calendar-week" id="calWeek" data-density="vanlig">
          <div class="time-col">
            <div class="time-tick">06</div><div class="time-tick">07</div><div class="time-tick">08</div><div class="time-tick">09</div><div class="time-tick">10</div><div class="time-tick">11</div><div class="time-tick">12</div><div class="time-tick">13</div><div class="time-tick">14</div><div class="time-tick">15</div><div class="time-tick">16</div><div class="time-tick">17</div><div class="time-tick">18</div><div class="time-tick">19</div><div class="time-tick">20</div><div class="time-tick">21</div><div class="time-tick">22</div><div class="time-tick">23</div>
          </div>

          <div class="day-col">
            <div class="day-head"><span class="day-label">Mån</span><span class="day-date">25</span></div>
            <div class="day-slots">
              <div class="booking" data-source="info" data-status="confirmed" style="top:186px;height:31px" data-customer="Anna Karlsson" data-init="AK">
                <div class="booking-time">09:00 – 09:30</div><div class="booking-title">Fysisk konsultation</div>
              </div>
              <div class="booking" data-source="contact" data-status="confirmed" style="top:248px;height:62px">
                <div class="booking-time">10:00 – 11:00</div><div class="booking-title">PRP för hår</div><div class="booking-sub">Karl Lindberg</div>
              </div>
              <div class="lunch-block" style="top:372px;height:62px">⌣ Lunch 12:00 – 13:00</div>
              <div class="booking" data-source="egzona" data-status="tentative" data-expiry="far" style="top:496px;height:31px" data-customer="Maria Berg" data-init="MB">
                <div class="booking-time">14:00 – 14:30</div><div class="booking-title">Online möte</div>
              </div>
              <div class="empty-slot" data-predictive style="top:558px;height:62px">
                <span class="empty-label">+ Ledig 15:00 – 16:00</span>
                <div class="ghost-preview">
                  <span class="gp-kicker">★ AI · Sofie på väntelistan</span>
                  <div class="gp-title">Konsultation</div>
                  <div class="gp-sub">Match 92% · ring nu</div>
                </div>
              </div>
            </div>
          </div>

          <div class="day-col">
            <div class="day-head"><span class="day-label">Tis</span><span class="day-date">26</span></div>
            <div class="day-slots">
              <div class="booking" data-source="fazli" data-status="confirmed" style="top:155px;height:31px" data-customer="Johan Svensson" data-init="JS">
                <div class="booking-time">08:30 – 09:00</div><div class="booking-title">Uppföljning</div>
              </div>
              <div class="empty-slot" data-predictive style="top:186px;height:62px">
                <span class="empty-label">+ Ledig 09:00 – 10:00</span>
                <div class="ghost-preview">
                  <span class="gp-kicker">★ AI · Anna brukar boka</span>
                  <div class="gp-title">PRP återbesök</div>
                  <div class="gp-sub">3v efter förra · träffar perfekt</div>
                </div>
              </div>
              <div class="lunch-block" style="top:372px;height:62px">⌣ Lunch</div>
              <div class="booking" data-source="contact" data-status="followup" style="top:558px;height:62px">
                <div class="booking-time">15:00 – 16:00</div><div class="booking-title">Microneedling</div><div class="booking-sub">Eva Johansson</div>
              </div>
            </div>
          </div>

          <div class="day-col">
            <div class="day-head"><span class="day-label">Ons</span><span class="day-date">27</span></div>
            <div class="day-slots">
              <div class="booking" data-source="egzona" data-status="confirmed" style="top:248px;height:46px">
                <div class="booking-time">10:00 – 10:45</div><div class="booking-title">PRP för hår</div>
              </div>
              <div class="lunch-block" style="top:372px;height:62px">⌣ Lunch</div>
              <div class="empty-slot" style="top:496px;height:62px">
                <span class="empty-label">+ Skapa bokning</span>
                <div class="ghost-preview">
                  <span class="gp-kicker">★ AI · Gap-analys</span>
                  <div class="gp-title">Konsultation</div>
                  <div class="gp-sub">Best fit: 30 min hos Arya</div>
                </div>
              </div>
            </div>
          </div>

          <div class="day-col today">
            <div class="day-head"><span class="day-label">Tor</span><span class="day-date">28</span></div>
            <div class="day-slots">
              <div class="booking selected" id="bookAnna" data-source="contact" data-status="confirmed" style="top:124px;height:46px">
                <div class="booking-time">08:00 – 08:45</div><div class="booking-title">PRP för hår</div><div class="booking-sub">Anna Karlsson</div>
                <span class="booking-ai-badge">★ Friskförs.</span>
              </div>
              <div class="booking" data-source="fazli" data-status="confirmed" style="top:186px;height:248px">
                <div class="booking-time">09:00 – 13:00</div><div class="booking-title">DHI ögonbryn</div><div class="booking-sub">Karl Lindberg</div>
              </div>
              <div class="lunch-block" style="top:372px;height:62px">⌣ Lunch</div>
              <div class="booking" id="bookEva" data-source="egzona" data-status="tentative" data-expiry="critical" data-noshow="high" data-conflict="A" style="top:496px;height:46px">
                <div class="booking-time">14:30 – 15:15</div><div class="booking-title">Konsultation Eva</div>
                <span class="booking-ai-badge">★ Påminn nu</span>
                <span class="noshow-mark" title="No-show-historik">!</span>
              </div>
              <div class="booking" data-source="info" data-status="followup" style="top:620px;height:31px" data-customer="Johan Svensson" data-init="JS">
                <div class="booking-time">16:00 – 16:30</div><div class="booking-title">Återbesök</div>
              </div>
              <div class="now-line" style="top:511px"><span class="now-label">NU 14:23</span></div>
            </div>
          </div>

          <div class="day-col">
            <div class="day-head"><span class="day-label">Fre</span><span class="day-date">29</span></div>
            <div class="day-slots">
              <div class="booking" data-source="contact" data-status="confirmed" style="top:217px;height:31px" data-customer="Sofie Andersson" data-init="SA">
                <div class="booking-time">09:30 – 10:00</div><div class="booking-title">Online möte</div>
              </div>
              <div class="lunch-block" style="top:372px;height:62px">⌣ Lunch</div>
              <div class="booking" id="bookConflictB" data-source="egzona" data-status="tentative" data-expiry="near" data-noshow="med" data-conflict="A" style="top:496px;height:31px">
                <div class="booking-time">14:00 – 14:30</div><div class="booking-title">Konsultation</div>
              </div>
              <div class="empty-slot" data-predictive style="top:558px;height:62px">
                <span class="empty-label">+ Ledig 15:00 – 16:00</span>
                <div class="ghost-preview">
                  <span class="gp-kicker">★ AI · Veckans sista</span>
                  <div class="gp-title">Återbesök Karl</div>
                  <div class="gp-sub">Mönster: 1 v efter DHI</div>
                </div>
              </div>
            </div>
          </div>

          <div class="day-col">
            <div class="day-head"><span class="day-label">Lör</span><span class="day-date">30</span></div>
            <div class="day-slots">
              <div class="empty-slot" style="top:248px;height:62px">
                <span class="empty-label">+ Helg-pris</span>
                <div class="ghost-preview">
                  <span class="gp-kicker">★ AI · Helg-pris</span>
                  <div class="gp-title">VIP-tid</div>
                  <div class="gp-sub">Premium-slot · 60 min</div>
                </div>
              </div>
            </div>
          </div>

          <div class="day-col">
            <div class="day-head"><span class="day-label">Sön</span><span class="day-date">31</span></div>
            <div class="day-slots">
              <div class="empty-slot" style="top:310px;height:62px">
                <span class="empty-label">+ Skapa bokning</span>
                <div class="ghost-preview">
                  <span class="gp-kicker">★ AI · Vilodag</span>
                  <div class="gp-title">Ej rek</div>
                  <div class="gp-sub">Föreslå måndag istället</div>
                </div>
              </div>
            </div>
          </div>

          <!-- SVG overlay för conflict-spider-web -->
          <svg class="conflict-overlay" id="conflictSvg" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none"></svg>
        </div>

      </div>
    </div>
  </section>

  <!-- HÖGER INTEL -->
  <aside class="intel-shell" id="intelShell" data-context="booking">
    <div class="intel-booking-view">
    <div>
      <div class="intel-kicker">Kundintelligens</div>
      <h3 class="intel-title">Operatörsstöd</h3>
    </div>
    <div class="intel-head">
      <div class="intel-avatar">AK</div>
      <div>
        <div class="intel-name">Anna Karlsson</div>
        <div class="intel-meta">Återkommande · 92% engagemang</div>
      </div>
    </div>
    <dl class="intel-grid">
      <dt>Livscykel</dt>     <dd>Återbesök · 4:e tid</dd>
      <dt>Behandling</dt>    <dd>PRP för hår (45 min)</dd>
      <dt>Tid</dt>           <dd>tor 28 maj 08:00–08:45</dd>
      <dt>Behandlare</dt>    <dd>Egzona Krasniqi</dd>
      <dt>Källa</dt>         <dd><span style="display:inline-block;width:6px;height:6px;border-radius:999px;background:var(--rail-contact);vertical-align:middle;margin-right:4px;box-shadow:0 0 4px var(--rail-contact)"></span>contact@hairtpclinic</dd>
      <dt>Status</dt>        <dd class="warn">Friskförsäkran saknas</dd>
    </dl>
    <div class="ready-row">
      <span class="ready-pill" data-state="success">✓ Hälsodekl.</span>
      <span class="ready-pill" data-state="success">✓ Samtycke</span>
      <span class="ready-pill" data-state="success">✓ Avtal</span>
      <span class="ready-pill" data-state="warning">⚠ Friskförs.</span>
      <span class="ready-pill" data-state="success">✓ ID</span>
      <span class="ready-pill" data-state="success">✓ Betalning</span>
    </div>
    <div class="ai-reason">
      Kunden är <strong>inte redo</strong>. Saknar friskförsäkran och bokningen är imorgon kl 08:00.
      Skicka påminnelse nu.
    </div>
    <div class="intel-tabs">
      <button class="intel-tab active">Brief</button>
      <button class="intel-tab">Historik</button>
      <button class="intel-tab">Filer</button>
      <button class="intel-tab">Anteckningar</button>
    </div>
    <div class="intel-actions">
      <button class="quick-pill quick-pill--ai" data-ai-action="friskforsakran" data-target="#bookAnna">★ AI Skicka friskförsäkran</button>
      <button class="quick-pill quick-pill--ai" data-ai-action="newtime" data-target="#bookAnna">★ AI Föreslå ny tid</button>
      <button class="quick-pill">✎ Smart anteckning</button>
      <button class="quick-pill">✉ Svarstudio</button>
      <button class="quick-pill quick-pill--success">✓ Markera ankommen</button>
      <button class="quick-pill">↻ Boka om</button>
    </div>
    </div>

    <!-- KUNDDOSSIER-vy (visas när context=customer) -->
    <div class="intel-customer-view" id="intelCustomerView" style="display:flex;flex-direction:column;height:100%;"></div>
  </aside>
</div>

<!-- ═══════════════════════════════════════════════════════════════
     INTERAKTION 9: APPLE WATCH WIDGET (floating, nere höger)
     ═══════════════════════════════════════════════════════════════ -->
<div class="watch-widget" id="watchWidget">
  <div class="watch-band-top"></div>
  <div class="watch-body" data-alert="high">
    <div class="watch-screen">
      <div class="watch-time"><span>NÄSTA</span><span class="clock">14:30</span></div>
      <div class="watch-kicker">⚠ Påminn nu</div>
      <div class="watch-title">Konsultation</div>
      <div class="watch-sub">Eva K. · Egzona</div>
      <span class="watch-ai-pill">★ AI · Skicka SMS</span>
      <div class="watch-swipe" id="watchSwipe">
        <div class="watch-swipe-fill"></div>
        <span class="watch-swipe-label">Svep för ankommen</span>
        <span class="watch-swipe-arrow">→</span>
      </div>
    </div>
  </div>
  <div class="watch-band-bottom"></div>
  <div class="watch-caption">På din handled</div>
</div>

<!-- ═══════════════════════════════════════════════════════════════
     INTERAKTION 10: VOICE BOOKING (overlay + sheet)
     ═══════════════════════════════════════════════════════════════ -->
<div class="voice-overlay" id="voiceOverlay">
  <div class="voice-orb"></div>
  <div class="voice-text" id="voiceText"></div>
  <div class="voice-hint">Säg vad du vill boka — släpp för att stoppa</div>
  <button class="voice-cancel" id="voiceCancel">Avbryt</button>
</div>

<div class="voice-sheet" id="voiceSheet">
  <div class="voice-sheet-kicker">★ AI · TOLKAT</div>
  <h3>Bekräfta bokning</h3>
  <p class="voice-sheet-original">"Boka Anna PRP nästa tisdag fjorton hos Egzona"</p>
  <dl class="voice-sheet-grid">
    <dt>Kund</dt>       <dd>Anna Karlsson (matchad 96%)</dd>
    <dt>Behandling</dt> <dd>PRP för hår · 45 min</dd>
    <dt>Tid</dt>        <dd>Tis 2 juni 2026 · 14:00 – 14:45</dd>
    <dt>Behandlare</dt> <dd>Egzona Krasniqi</dd>
    <dt>Rum</dt>        <dd>Behandling 2 · ledigt</dd>
  </dl>
  <div class="voice-sheet-actions">
    <button class="quick-pill quick-pill--success" id="voiceConfirm">✓ Bekräfta & skicka bekräftelse</button>
    <button class="quick-pill" id="voiceEdit">✎ Justera</button>
    <button class="quick-pill" id="voiceClose">Avbryt</button>
  </div>
</div>

<!-- Lugnt-läge banner -->
<div class="calm-banner" id="calmBanner">
  <span>☾</span>
  Lugnt läge aktivt — fokusera på en sak i taget
</div>`;

  function mountPoint() {
    return (
      document.querySelector(
        '.preview-canvas[data-app-shell-view="calendar"] .preview-workspace'
      ) || document.querySelector('.preview-workspace')
    );
  }

  function render(ctx) {
    var host = mountPoint();
    if (!host) return null;
    var root = document.getElementById('cco-cal-v8-root');
    if (!root) {
      root = document.createElement('div');
      root.id = 'cco-cal-v8-root';
      host.appendChild(root);
    }
    root.innerHTML = MARKUP;
    // FAS P1+: parametrisera sektioner från ctx här.
    return root;
  }

  window.ArcanaCalendarV8 = { render: render };

  // ── Self-mount boot ────────────────────────────────────────────────────
  // När flaggan är på och kalendervyn blir aktiv: rendera v8 (legacy göms i CSS).
  function flagOn() {
    return document.documentElement.getAttribute('data-calendar-v8') === 'on';
  }
  function maybeMount() {
    if (!flagOn()) return;
    if (!document.querySelector('.preview-canvas[data-app-shell-view="calendar"]')) return;
    if (!document.getElementById('cco-cal-v8-root')) render({});
  }
  function boot() {
    maybeMount();
    var target = document.querySelector('.preview-canvas') || document.body;
    try {
      new MutationObserver(maybeMount).observe(target, {
        attributes: true,
        subtree: true,
        attributeFilter: ['data-app-shell-view'],
      });
    } catch (e) {
      /* ignore */
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
