'use strict';
/* ════════════════════════════════════════════════════════════════════════
 * cco-calendar-v8-shell.js — facit-trogen kalender (v8) renderer + interaktion.
 * window.ArcanaCalendarV8.render(ctx) monterar facitens 3-panel-layout under
 * #cco-cal-v8-root och kör facitens interaktions-JS (vy-växling, ⌘K-sök,
 * watch-svep, voice) efter injektionen. Bakom flagga (data-calendar-v8="on").
 *
 * FAS: P0 statisk markup + (väg 2) facit-interaktioner. P1 byter mitten mot
 * legacy-renderaren (riktig data) utan dubblering.
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

  // Facitens interaktions-JS, oförändrad, körd efter att markup injicerats.
  // All bindning sker via addEventListener (inga inline-handlers) så det wirar
  // korrekt mot de injicerade elementen.
  function initV8Interactions() {
    try {
      /* ═══════════════════════════════════════════════════════════════
   VY-BYTE (Morgon ↔ Vecka)
   ═══════════════════════════════════════════════════════════════ */

      const content = document.querySelector('.calendar-content');
      const calTitle = document.getElementById('calTitle');
      const tabs = document.querySelectorAll('.segment-tab');

      function setMode(mode) {
        content.dataset.mode = mode;
        tabs.forEach((t) => t.classList.toggle('active', t.dataset.mode === mode));
        if (mode === 'morgon') calTitle.textContent = 'God morgon, Fazli';
        else if (mode === 'vecka') calTitle.textContent = '25 maj – 31 maj 2026';
        else if (mode === 'dag') calTitle.textContent = 'Tor 28 maj';
        else if (mode === 'resurs') calTitle.textContent = 'Resurser · vecka 22';
        // Rita om conflict-curves när vyn ändras
        if (mode !== 'morgon') requestAnimationFrame(drawConflicts);
      }
      tabs.forEach((t) => t.addEventListener('click', () => setMode(t.dataset.mode)));

      document
        .querySelectorAll('[data-jump-mode]')
        .forEach((el) => el.addEventListener('click', () => setMode(el.dataset.jumpMode)));

      document.querySelectorAll('[data-jump]').forEach((el) =>
        el.addEventListener('click', () => {
          setMode('vecka');
          setTimeout(() => {
            const target = document.querySelector(el.dataset.jump);
            if (target) {
              target.scrollIntoView({ behavior: 'smooth', block: 'center' });
              target.classList.add('is-receiving');
              setTimeout(() => target.classList.remove('is-receiving'), 700);
            }
          }, 300);
        })
      );

      /* ═══════════════════════════════════════════════════════════════
   CONFLICT-SPIDER-WEB
   ═══════════════════════════════════════════════════════════════ */

      const svg = document.getElementById('conflictSvg');

      function drawConflicts() {
        if (!svg) return;
        svg.innerHTML = '';
        const week = document.getElementById('calWeek');
        if (!week) return;
        const weekRect = week.getBoundingClientRect();

        // Sätt viewBox till veckans pixel-mått
        svg.setAttribute('viewBox', `0 0 ${weekRect.width} ${weekRect.height}`);
        svg.style.width = weekRect.width + 'px';
        svg.style.height = weekRect.height + 'px';

        // Gruppera bokningar per data-conflict
        const groups = {};
        document.querySelectorAll('.booking[data-conflict]').forEach((b) => {
          const k = b.dataset.conflict;
          (groups[k] = groups[k] || []).push(b);
        });

        Object.entries(groups).forEach(([key, bookings]) => {
          if (bookings.length < 2) return;
          // Rita kurva mellan alla par (här bara första paret för enkelhet)
          for (let i = 0; i < bookings.length - 1; i++) {
            const a = bookings[i].getBoundingClientRect();
            const b = bookings[i + 1].getBoundingClientRect();
            // Mittpunkter relativa till week
            const x1 = a.left + a.width / 2 - weekRect.left;
            const y1 = a.top + a.height / 2 - weekRect.top;
            const x2 = b.left + b.width / 2 - weekRect.left;
            const y2 = b.top + b.height / 2 - weekRect.top;
            // Kontrollpunkter för en mjuk bezier (lutar ut åt sidan)
            const dx = x2 - x1,
              dy = y2 - y1;
            const cx1 = x1 + dx * 0.25,
              cy1 = y1 - 60;
            const cx2 = x1 + dx * 0.75,
              cy2 = y2 - 60;
            const d = `M ${x1} ${y1} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${x2} ${y2}`;
            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.setAttribute('class', 'conflict-curve');
            path.setAttribute('d', d);
            path.dataset.pair = `${bookings[i].id || i}__${bookings[i + 1].id || i + 1}`;
            path.dataset.key = key;
            svg.appendChild(path);

            // Label vid mitten
            const midX = (x1 + x2) / 2;
            const midY = (y1 + y2) / 2 - 50;
            const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            text.setAttribute('class', 'conflict-label');
            text.setAttribute('x', midX);
            text.setAttribute('y', midY);
            text.setAttribute('text-anchor', 'middle');
            text.dataset.key = key;
            text.textContent = '⚠ Rum-konflikt';
            svg.appendChild(text);
          }
        });
      }

      window.addEventListener('load', () => requestAnimationFrame(drawConflicts));
      window.addEventListener('resize', () => requestAnimationFrame(drawConflicts));

      // Hover på conflict-bokning → highlight kurvan
      function setupConflictHover() {
        document.querySelectorAll('.booking[data-conflict]').forEach((b) => {
          b.addEventListener('mouseenter', () => {
            const key = b.dataset.conflict;
            document
              .querySelectorAll(
                `.conflict-curve[data-key="${key}"], .conflict-label[data-key="${key}"]`
              )
              .forEach((el) => el.classList.add('is-hot'));
            document
              .querySelectorAll(`.booking[data-conflict="${key}"]`)
              .forEach((other) => other.classList.add('conflict-hover'));
          });
          b.addEventListener('mouseleave', () => {
            const key = b.dataset.conflict;
            document
              .querySelectorAll(
                `.conflict-curve[data-key="${key}"], .conflict-label[data-key="${key}"]`
              )
              .forEach((el) => el.classList.remove('is-hot'));
            document
              .querySelectorAll(`.booking[data-conflict="${key}"]`)
              .forEach((other) => other.classList.remove('conflict-hover'));
          });
        });
      }
      setupConflictHover();

      /* ═══════════════════════════════════════════════════════════════
   DRAG-DROP (från v3)
   ═══════════════════════════════════════════════════════════════ */

      const HOUR_H = 62;
      const SNAP_STEP = HOUR_H / 4;
      let dragState = null;

      function bookingMouseDown(ev) {
        const booking = ev.currentTarget;
        if (ev.target.closest('.booking-ai-badge') || ev.target.closest('.noshow-mark')) return;
        const rect = booking.getBoundingClientRect();
        const clone = booking.cloneNode(true);
        clone.classList.add('drag-clone');
        clone.classList.remove('selected');
        clone.style.left = rect.left + 'px';
        clone.style.top = rect.top + 'px';
        clone.style.width = rect.width + 'px';
        clone.style.height = rect.height + 'px';
        clone.style.right = 'auto';
        document.body.appendChild(clone);
        booking.classList.add('is-dragging');
        const hint = document.createElement('div');
        hint.className = 'drag-hint';
        hint.innerHTML = 'Drag för att omboka · <kbd>ESC</kbd> ångra · släpp = bekräfta';
        document.body.appendChild(hint);
        const snap = document.createElement('div');
        snap.className = 'snap-indicator';
        snap.style.height = rect.height + 'px';
        snap.style.display = 'none';
        document.body.appendChild(snap);
        dragState = {
          booking,
          clone,
          hint,
          snap,
          offsetX: ev.clientX - rect.left,
          offsetY: ev.clientY - rect.top,
          vx: 0,
          lastX: ev.clientX,
          lastT: performance.now(),
          targetSlot: null,
          targetTop: null,
        };
        document.addEventListener('mousemove', bookingDragMove);
        document.addEventListener('mouseup', bookingDragEnd);
        document.addEventListener('keydown', bookingDragEsc);
        ev.preventDefault();
      }
      function bookingDragMove(ev) {
        if (!dragState) return;
        const now = performance.now();
        const dt = Math.max(now - dragState.lastT, 1);
        dragState.vx = ((ev.clientX - dragState.lastX) / dt) * 16;
        dragState.lastX = ev.clientX;
        dragState.lastT = now;
        const tilt = Math.max(-6, Math.min(6, dragState.vx * 0.4));
        dragState.clone.style.left = ev.clientX - dragState.offsetX + 'px';
        dragState.clone.style.top = ev.clientY - dragState.offsetY + 'px';
        dragState.clone.style.transform = `rotate(${-1.5 + tilt}deg) scale(1.04)`;
        const el = document.elementFromPoint(ev.clientX, ev.clientY);
        const slots = el?.closest('.day-slots');
        if (slots) {
          const sRect = slots.getBoundingClientRect();
          let relY = ev.clientY - sRect.top - dragState.offsetY;
          relY = Math.max(0, Math.min(sRect.height - dragState.clone.offsetHeight, relY));
          relY = Math.round(relY / SNAP_STEP) * SNAP_STEP;
          dragState.targetSlot = slots;
          dragState.targetTop = relY;
          dragState.snap.style.display = 'block';
          dragState.snap.style.left = sRect.left + 2 + 'px';
          dragState.snap.style.top = sRect.top + relY + 'px';
          dragState.snap.style.width = sRect.width - 4 + 'px';
        } else {
          dragState.snap.style.display = 'none';
          dragState.targetSlot = null;
        }
      }
      function bookingDragEnd() {
        if (!dragState) return;
        const { booking, clone, hint, snap, targetSlot, targetTop } = dragState;
        if (targetSlot && targetTop !== null) {
          targetSlot.appendChild(booking);
          booking.style.top = targetTop + 'px';
          booking.classList.remove('is-dragging');
          booking.animate(
            [
              { transform: 'translateY(-6px) scale(1.02)' },
              { transform: 'translateY(0) scale(1)' },
            ],
            { duration: 320, easing: 'cubic-bezier(.34,1.56,.64,1)' }
          );
          drawConflicts();
        } else booking.classList.remove('is-dragging');
        clone.remove();
        hint.remove();
        snap.remove();
        document.removeEventListener('mousemove', bookingDragMove);
        document.removeEventListener('mouseup', bookingDragEnd);
        document.removeEventListener('keydown', bookingDragEsc);
        dragState = null;
      }
      function bookingDragEsc(ev) {
        if (ev.key !== 'Escape' || !dragState) return;
        dragState.booking.classList.remove('is-dragging');
        dragState.clone.remove();
        dragState.hint.remove();
        dragState.snap.remove();
        document.removeEventListener('mousemove', bookingDragMove);
        document.removeEventListener('mouseup', bookingDragEnd);
        document.removeEventListener('keydown', bookingDragEsc);
        dragState = null;
      }
      document
        .querySelectorAll('.booking')
        .forEach((b) => b.addEventListener('mousedown', bookingMouseDown));

      /* ═══════════════════════════════════════════════════════════════
   AI-sparkles (från v3)
   ═══════════════════════════════════════════════════════════════ */

      function fireAiAction(button) {
        if (button.classList.contains('is-firing')) return;
        button.classList.add('is-firing');
        setTimeout(() => button.classList.remove('is-firing'), 620);
        const target = document.querySelector(button.dataset.target);
        if (!target) return;
        const bRect = button.getBoundingClientRect();
        const tRect = target.getBoundingClientRect();
        const startX = bRect.left + bRect.width / 2;
        const startY = bRect.top + bRect.height / 2;
        const endX = tRect.left + tRect.width / 2;
        const endY = tRect.top + tRect.height / 2;
        for (let i = 0; i < 7; i++) {
          const spark = document.createElement('div');
          spark.className = 'ai-spark';
          document.body.appendChild(spark);
          const jx = (Math.random() - 0.5) * 30;
          const jy = (Math.random() - 0.5) * 20;
          const delay = i * 50;
          const duration = 700 + Math.random() * 200;
          spark.animate(
            [
              { transform: `translate(${startX}px, ${startY}px) scale(.4)`, opacity: 0, offset: 0 },
              {
                transform: `translate(${startX + (endX - startX) * 0.35 + jx}px, ${startY + (endY - startY) * 0.35 - 60 + jy}px) scale(1.1)`,
                opacity: 1,
                offset: 0.35,
              },
              {
                transform: `translate(${endX + jx * 0.3}px, ${endY + jy * 0.3}px) scale(.6)`,
                opacity: 0.9,
                offset: 1,
              },
            ],
            { duration, delay, easing: 'cubic-bezier(.32,.72,.45,1.1)', fill: 'forwards' }
          );
          setTimeout(() => spark.remove(), duration + delay + 50);
        }
        setTimeout(() => {
          target.classList.add('is-receiving');
          setTimeout(() => target.classList.remove('is-receiving'), 720);
        }, 600);
        const toast = document.createElement('div');
        toast.className = 'ai-toast';
        const labels = {
          friskforsakran: '✓ Friskförsäkran skickad till Annas tråd',
          newtime: '✓ Ny tid föreslagen — väntar på kund',
        };
        toast.textContent = labels[button.dataset.aiAction] || '✓ AI-action utförd';
        document.body.appendChild(toast);
        requestAnimationFrame(() => toast.classList.add('is-visible'));
        setTimeout(() => {
          toast.classList.remove('is-visible');
          setTimeout(() => toast.remove(), 320);
        }, 2200);
      }
      document
        .querySelectorAll('.quick-pill--ai[data-target]')
        .forEach((btn) => btn.addEventListener('click', () => fireAiAction(btn)));

      /* Empty-slot click → toast */
      document.querySelectorAll('.empty-slot').forEach((slot) => {
        slot.addEventListener('click', () => {
          slot.animate(
            [{ transform: 'scale(1)' }, { transform: 'scale(.96)' }, { transform: 'scale(1)' }],
            { duration: 240, easing: 'cubic-bezier(.34,1.56,.64,1)' }
          );
          const isPredictive = slot.hasAttribute('data-predictive');
          const toast = document.createElement('div');
          toast.className = 'ai-toast';
          toast.textContent = isPredictive
            ? '✓ Förslag skickat till Svarstudio som utkast'
            : '✓ Bokning öppnad';
          document.body.appendChild(toast);
          requestAnimationFrame(() => toast.classList.add('is-visible'));
          setTimeout(() => {
            toast.classList.remove('is-visible');
            setTimeout(() => toast.remove(), 320);
          }, 2000);
        });
      });

      /* Story CTA-knappar */
      document.querySelectorAll('.story-cta').forEach((btn) => {
        if (btn.dataset.jumpMode) return;
        btn.addEventListener('click', () => {
          const toast = document.createElement('div');
          toast.className = 'ai-toast';
          toast.textContent = '✓ ' + btn.textContent.replace(/^★ |^↻ /, '');
          document.body.appendChild(toast);
          requestAnimationFrame(() => toast.classList.add('is-visible'));
          setTimeout(() => {
            toast.classList.remove('is-visible');
            setTimeout(() => toast.remove(), 320);
          }, 2000);
        });
      });

      /* Bokningsklick → markera + uppdatera AI-target */
      document.querySelectorAll('.booking').forEach((b) => {
        b.addEventListener('click', (ev) => {
          if (dragState) return;
          document
            .querySelectorAll('.booking.selected')
            .forEach((s) => s.classList.remove('selected'));
          b.classList.add('selected');
          if (!b.id) b.id = 'bookSelected_' + Math.random().toString(36).slice(2, 7);
          document
            .querySelectorAll('.quick-pill--ai[data-target]')
            .forEach((p) => (p.dataset.target = '#' + b.id));
        });
      });

      /* Boot — om vyn just bytte till vecka, rita conflicts. Default = morgon. */
      setMode('morgon');

      /* ═══════════════════════════════════════════════════════════════
   INTERAKTION 9: APPLE WATCH SWIPE
   ═══════════════════════════════════════════════════════════════ */

      const watchSwipe = document.getElementById('watchSwipe');
      const watchFill = watchSwipe.querySelector('.watch-swipe-fill');
      const watchArrow = watchSwipe.querySelector('.watch-swipe-arrow');
      let swipeState = null;

      watchSwipe.addEventListener('mousedown', (ev) => {
        if (watchSwipe.dataset.swipeState === 'ok') return;
        const rect = watchSwipe.getBoundingClientRect();
        swipeState = { startX: ev.clientX, rect, width: rect.width };
        document.addEventListener('mousemove', onSwipeMove);
        document.addEventListener('mouseup', onSwipeEnd);
        ev.preventDefault();
      });

      function onSwipeMove(ev) {
        if (!swipeState) return;
        const dx = Math.max(0, Math.min(swipeState.width, ev.clientX - swipeState.startX));
        const pct = dx / (swipeState.width - 22);
        watchFill.style.transform = `translateX(${-100 + pct * 100}%)`;
        watchArrow.style.transform = `translateY(-50%) translateX(${dx * 0.8}px)`;
        if (pct >= 0.85) {
          // Snap to OK
          watchSwipe.dataset.swipeState = 'ok';
          cleanupSwipe();
          setTimeout(() => {
            // Visa toast
            const toast = document.createElement('div');
            toast.className = 'ai-toast';
            toast.textContent = '✓ Eva markerad ankommen från handleden';
            document.body.appendChild(toast);
            requestAnimationFrame(() => toast.classList.add('is-visible'));
            setTimeout(() => {
              toast.classList.remove('is-visible');
              setTimeout(() => toast.remove(), 320);
            }, 2400);
            // Reset efter 3s så du kan testa igen
            setTimeout(() => {
              watchSwipe.dataset.swipeState = '';
              watchFill.style.transform = 'translateX(-100%)';
              watchArrow.style.transform = 'translateY(-50%) translateX(0)';
              watchArrow.style.opacity = '1';
            }, 3200);
          }, 200);
        }
      }

      function onSwipeEnd() {
        if (!swipeState) return;
        if (watchSwipe.dataset.swipeState !== 'ok') {
          // Spring tillbaka
          watchFill.style.transform = 'translateX(-100%)';
          watchArrow.style.transform = 'translateY(-50%) translateX(0)';
        }
        cleanupSwipe();
      }

      function cleanupSwipe() {
        swipeState = null;
        document.removeEventListener('mousemove', onSwipeMove);
        document.removeEventListener('mouseup', onSwipeEnd);
      }

      /* ═══════════════════════════════════════════════════════════════
   INTERAKTION 10: VOICE BOOKING
   ═══════════════════════════════════════════════════════════════ */

      const micBtn = document.getElementById('micBtn');
      const voiceOverlay = document.getElementById('voiceOverlay');
      const voiceText = document.getElementById('voiceText');
      const voiceCancel = document.getElementById('voiceCancel');
      const voiceSheet = document.getElementById('voiceSheet');

      const VOICE_PHRASE = ['Boka', 'Anna', 'PRP', 'nästa', 'tisdag', 'fjorton', 'hos', 'Egzona'];
      let voiceTimers = [];

      function startVoice() {
        micBtn.classList.add('is-listening');
        voiceOverlay.classList.add('is-active');
        voiceText.innerHTML = '';
        // Bygg up word-spans
        VOICE_PHRASE.forEach((w, i) => {
          const span = document.createElement('span');
          span.className = 'word';
          span.textContent = (i === 0 ? '' : ' ') + w;
          voiceText.appendChild(span);
        });
        // Word-by-word visibility
        voiceTimers = VOICE_PHRASE.map((w, i) =>
          setTimeout(() => voiceText.children[i]?.classList.add('is-visible'), 300 + i * 280)
        );
        // Efter sista ordet → visa sheet
        voiceTimers.push(
          setTimeout(
            () => {
              stopVoice(true);
              voiceSheet.classList.add('is-visible');
            },
            300 + VOICE_PHRASE.length * 280 + 500
          )
        );
      }

      function stopVoice(success) {
        micBtn.classList.remove('is-listening');
        voiceOverlay.classList.remove('is-active');
        voiceTimers.forEach((t) => clearTimeout(t));
        voiceTimers = [];
      }

      micBtn.addEventListener('click', () => {
        if (micBtn.classList.contains('is-listening')) stopVoice(false);
        else startVoice();
      });
      voiceCancel.addEventListener('click', () => stopVoice(false));

      document.getElementById('voiceConfirm').addEventListener('click', () => {
        voiceSheet.classList.remove('is-visible');
        const toast = document.createElement('div');
        toast.className = 'ai-toast';
        toast.textContent = '✓ Bokad — bekräftelse skickad till Anna';
        document.body.appendChild(toast);
        requestAnimationFrame(() => toast.classList.add('is-visible'));
        setTimeout(() => {
          toast.classList.remove('is-visible');
          setTimeout(() => toast.remove(), 320);
        }, 2400);
      });
      document
        .getElementById('voiceEdit')
        .addEventListener('click', () => voiceSheet.classList.remove('is-visible'));
      document
        .getElementById('voiceClose')
        .addEventListener('click', () => voiceSheet.classList.remove('is-visible'));

      /* ═══════════════════════════════════════════════════════════════
   INTERAKTION 11: DENSITY TOGGLE
   ═══════════════════════════════════════════════════════════════ */

      document.querySelectorAll('.density-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          document.querySelectorAll('.density-btn').forEach((b) => b.classList.remove('active'));
          btn.classList.add('active');
          const calWeek = document.getElementById('calWeek');
          calWeek.dataset.density = btn.dataset.density;
          // Om vi är i morgon-vyn, hoppa till vecka för att se effekten
          if (content.dataset.mode === 'morgon') setMode('vecka');
          requestAnimationFrame(drawConflicts);
        });
      });

      /* ═══════════════════════════════════════════════════════════════
   INTERAKTION 12: LUGNT LÄGE
   ═══════════════════════════════════════════════════════════════ */

      const calmToggle = document.getElementById('calmToggle');
      const calmBanner = document.getElementById('calmBanner');

      calmToggle.addEventListener('click', () => {
        const on = document.body.dataset.calm !== 'on';
        document.body.dataset.calm = on ? 'on' : '';
        calmToggle.classList.toggle('is-active', on);
        calmBanner.classList.toggle('is-visible', on);
        if (on) {
          // Auto-hide banner efter 4s
          setTimeout(() => calmBanner.classList.remove('is-visible'), 4000);
        }
      });

      /* ═══════════════════════════════════════════════════════════════
   INTERAKTION 15: AVATAR-BUBBLOR — injicera per bokning
   ═══════════════════════════════════════════════════════════════ */

      /* Heuristisk avatar baserat på sub-texten (kundnamn) */
      function injectAvatars() {
        document.querySelectorAll('.booking').forEach((b) => {
          const title = b.querySelector('.booking-title');
          let sub = b.querySelector('.booking-sub');
          if (!sub && b.dataset.customer && title) {
            sub = document.createElement('div');
            sub.className = 'booking-sub';
            sub.textContent = b.dataset.customer;
            title.insertAdjacentElement('afterend', sub);
          }
          if (b.querySelector('.avatar-bubble')) return;
          let initials = b.dataset.init;
          if (!initials) {
            const name =
              b.dataset.customer || sub?.textContent?.trim() || title?.textContent?.trim() || '?';
            initials =
              name
                .split(/\s+/)
                .slice(0, 2)
                .map((w) => w[0]?.toUpperCase() || '')
                .join('')
                .slice(0, 2) || '?';
          }
          const av = document.createElement('span');
          av.className = 'avatar-bubble';
          av.dataset.init = initials;
          av.textContent = initials;
          b.appendChild(av);
        });
      }
      injectAvatars();

      const avatarToggle = document.getElementById('avatarToggle');
      avatarToggle.addEventListener('click', () => {
        const on = document.body.dataset.avatarMode !== 'on';
        document.body.dataset.avatarMode = on ? 'on' : '';
        avatarToggle.classList.toggle('is-active', on);
      });

      /* ═══════════════════════════════════════════════════════════════
   INTERAKTION 14: DRA FRÅN MEJL TILL SLOT
   ═══════════════════════════════════════════════════════════════ */

      let mailDragState = null;
      const MAIL_SOURCE_COLORS = {
        contact: { rail: '#2596a8', glow: 'rgba(37,150,168,.42)', soft: 'rgba(37,150,168,.08)' },
        info: { rail: '#84756b', glow: 'rgba(132,117,107,.34)', soft: 'rgba(132,117,107,.08)' },
        fazli: { rail: '#7c3aed', glow: 'rgba(124,58,237,.42)', soft: 'rgba(124,58,237,.08)' },
        egzona: { rail: '#a37433', glow: 'rgba(163,116,51,.42)', soft: 'rgba(163,116,51,.08)' },
      };

      document.querySelectorAll('.mail-thread').forEach((thread) => {
        thread.addEventListener('mousedown', (ev) => {
          if (ev.button !== 0) return;
          const rect = thread.getBoundingClientRect();
          const clone = thread.cloneNode(true);
          clone.classList.add('mail-drag-clone');
          clone.style.left = rect.left + 'px';
          clone.style.top = rect.top + 'px';
          document.body.appendChild(clone);
          const colors = MAIL_SOURCE_COLORS[thread.dataset.source] || MAIL_SOURCE_COLORS.info;
          clone.style.setProperty('--rail-color', colors.rail);
          document.body.style.setProperty('--rail-color', colors.rail);
          document.body.style.setProperty('--rail-color-glow', colors.glow);
          document.body.style.setProperty('--rail-color-soft', colors.soft);
          document.body.classList.add('is-mail-dragging');
          // Tvinga vecka-vyn så vi ser kalendern
          if (content.dataset.mode === 'morgon') setMode('vecka');

          mailDragState = {
            thread,
            clone,
            colors,
            offsetX: ev.clientX - rect.left,
            offsetY: ev.clientY - rect.top,
            data: { ...thread.dataset },
          };
          document.addEventListener('mousemove', onMailDragMove);
          document.addEventListener('mouseup', onMailDragEnd);
          ev.preventDefault();
        });
      });

      function onMailDragMove(ev) {
        if (!mailDragState) return;
        mailDragState.clone.style.left = ev.clientX - mailDragState.offsetX + 'px';
        mailDragState.clone.style.top = ev.clientY - mailDragState.offsetY + 'px';
      }

      function onMailDragEnd(ev) {
        if (!mailDragState) return;
        const { thread, clone, colors, data } = mailDragState;
        const el = document.elementFromPoint(ev.clientX, ev.clientY);
        const slots = el?.closest('.day-slots');
        if (slots) {
          const sRect = slots.getBoundingClientRect();
          let relY = ev.clientY - sRect.top - 8;
          relY = Math.max(
            0,
            Math.min(sRect.height - 40, Math.round(relY / (HOUR_H / 4)) * (HOUR_H / 4))
          );
          const heightPx = (parseInt(data.duration, 10) / 60) * HOUR_H;
          // Bygg bokning
          const startsAt = relY / HOUR_H + 7;
          const startH = Math.floor(startsAt);
          const startM = Math.round((startsAt - startH) * 60);
          const endsAt = startsAt + parseInt(data.duration, 10) / 60;
          const endH = Math.floor(endsAt);
          const endM = Math.round((endsAt - endH) * 60);
          const fmt = (h, m) => `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
          const booking = document.createElement('div');
          booking.className = 'booking is-fresh';
          booking.dataset.source = data.source;
          booking.dataset.status = 'tentative';
          booking.dataset.expiry = 'near';
          booking.style.top = relY + 'px';
          booking.style.height = heightPx + 'px';
          booking.innerHTML = `
      <div class="booking-time">${fmt(startH, startM)} – ${fmt(endH, endM)}</div>
      <div class="booking-title">${data.treatment}</div>
      <div class="booking-sub">${data.customer}</div>
      <span class="booking-ai-badge">★ Från mejl</span>
      <span class="avatar-bubble" data-init="${data.init}">${data.init}</span>
    `;
          slots.appendChild(booking);
          booking.addEventListener('mousedown', bookingMouseDown);
          booking.addEventListener('click', () => {
            document
              .querySelectorAll('.booking.selected')
              .forEach((s) => s.classList.remove('selected'));
            booking.classList.add('selected');
          });
          // Toast
          const toast = document.createElement('div');
          toast.className = 'ai-toast';
          toast.textContent = `✓ Bokning skapad från ${data.customer}s mejl`;
          document.body.appendChild(toast);
          requestAnimationFrame(() => toast.classList.add('is-visible'));
          setTimeout(() => {
            toast.classList.remove('is-visible');
            setTimeout(() => toast.remove(), 320);
          }, 2400);
          // Fade ut mejlet i inkorgen
          thread.style.transition = 'opacity .35s ease, transform .35s ease';
          thread.style.opacity = '0';
          thread.style.transform = 'translateX(-20px)';
          setTimeout(() => (thread.style.display = 'none'), 360);
          // Uppdatera räknare
          const badge = document.querySelector('.mini-inbox-kicker .badge');
          if (badge) {
            const left = document.querySelectorAll(
              '.mail-thread:not([style*="display: none"])'
            ).length;
            badge.textContent = `${left} obokade`;
          }
        }
        clone.remove();
        document.body.classList.remove('is-mail-dragging');
        document.body.style.removeProperty('--rail-color');
        document.body.style.removeProperty('--rail-color-glow');
        document.body.style.removeProperty('--rail-color-soft');
        document.removeEventListener('mousemove', onMailDragMove);
        document.removeEventListener('mouseup', onMailDragEnd);
        mailDragState = null;
      }

      /* ═══════════════════════════════════════════════════════════════
   INTERAKTION 13: TID-MASKIN SLIDER + Cmd+Z UNDO
   ═══════════════════════════════════════════════════════════════ */

      const tmSlider = document.getElementById('tmSlider');
      const tmLabel = document.getElementById('tmLabel');
      const tmContainer = document.getElementById('timemachine');
      const DAY_OFFSETS = {
        '-7': { label: 'Förra mån', dir: 'past' },
        '-6': { label: 'Förra tis', dir: 'past' },
        '-5': { label: 'Förra ons', dir: 'past' },
        '-4': { label: 'Förra tors', dir: 'past' },
        '-3': { label: 'Förra fre', dir: 'past' },
        '-2': { label: 'I förrgår', dir: 'past' },
        '-1': { label: 'Igår', dir: 'past' },
        0: { label: 'Nutid', dir: 'now' },
        1: { label: 'Imorgon', dir: 'future' },
        2: { label: 'I övermorg', dir: 'future' },
        3: { label: 'Om 3 dagar', dir: 'future' },
        4: { label: 'Om 4 dagar', dir: 'future' },
        5: { label: 'Om 5 dagar', dir: 'future' },
        6: { label: 'Om 6 dagar', dir: 'future' },
        7: { label: 'Nästa tors', dir: 'future' },
      };

      tmSlider.addEventListener('input', () => {
        const v = tmSlider.value;
        const info = DAY_OFFSETS[v] || { label: 'Nutid', dir: 'now' };
        tmLabel.textContent = info.label;
        document.body.dataset.timeOffset = v;
        document.body.dataset.timeDirection = info.dir;
        tmContainer.classList.toggle('is-past', info.dir === 'past');
        tmContainer.classList.toggle('is-future', info.dir === 'future');

        // Visuell morph: skugga bokningar baserat på direction
        if (info.dir === 'past') {
          // Simulerat "färre" bokningar — dölj ca 1 av 4
          document.querySelectorAll('.booking').forEach((b, i) => {
            b.style.transition = 'opacity .35s ease, transform .35s ease, filter .35s ease';
            b.style.opacity = i % 4 === Math.abs(parseInt(v)) ? '0.18' : '';
          });
        } else if (info.dir === 'future') {
          document.querySelectorAll('.booking').forEach((b, i) => {
            b.style.transition = 'opacity .35s ease, transform .35s ease, filter .35s ease';
            b.style.opacity = i % 3 === 2 ? '0.32' : '';
          });
        } else {
          document.querySelectorAll('.booking').forEach((b) => {
            b.style.opacity = '';
            b.style.filter = '';
          });
        }

        // Säkerställ att vyn är vecka för att se effekten
        if (content.dataset.mode === 'morgon' && v !== '0') setMode('vecka');
      });

      // Cmd+Z / Ctrl+Z = ångra senaste (här: visuell flash + toast + reset till nutid)
      document.addEventListener('keydown', (ev) => {
        if ((ev.metaKey || ev.ctrlKey) && ev.key === 'z' && !ev.shiftKey) {
          ev.preventDefault();
          const flash = document.createElement('div');
          flash.className = 'undo-flash';
          document.body.appendChild(flash);
          setTimeout(() => flash.remove(), 520);
          const toast = document.createElement('div');
          toast.className = 'ai-toast';
          toast.style.background = 'linear-gradient(180deg, #efe6f4, #d8c6e3)';
          toast.style.borderColor = 'rgba(187,71,121,.34)';
          toast.style.color = 'var(--accent-studio)';
          toast.style.boxShadow =
            '0 14px 38px rgba(187,71,121,.22), inset 0 1px 0 rgba(255,255,255,.95)';
          toast.textContent = '↶ Ångrade senaste ändring (5 min historik)';
          document.body.appendChild(toast);
          requestAnimationFrame(() => toast.classList.add('is-visible'));
          setTimeout(() => {
            toast.classList.remove('is-visible');
            setTimeout(() => toast.remove(), 320);
          }, 2400);
          // Reset slider till nutid
          tmSlider.value = '0';
          tmSlider.dispatchEvent(new Event('input'));
        }
      });

      document.body.dataset.timeOffset = '0';
      document.body.dataset.timeDirection = 'now';

      /* ═══════════════════════════════════════════════════════════════
   KUNDSÖK (Cmd+K)
   ═══════════════════════════════════════════════════════════════ */

      const CUSTOMERS = [
        {
          name: 'Anna Karlsson',
          init: 'AK',
          bg: 'linear-gradient(180deg, #d8c1f0, #b48ad6)',
          sub: 'Återkommande · PRP återbesök tor 28 · 92%',
          badges: [
            { kind: 'risk', label: '⚠ Friskförs.' },
            { kind: 'upcoming', label: 'Tor 28' },
          ],
        },
        {
          name: 'Karl Lindberg',
          init: 'KL',
          bg: 'linear-gradient(180deg, #c5d8a8, #92b86e)',
          sub: 'DHI ögonbryn tor 28 · 09:00–13:00',
          badges: [
            { kind: 'upcoming', label: 'Tor 28' },
            { kind: 'ready', label: '✓ Redo' },
          ],
        },
        {
          name: 'Eva Karlsson',
          init: 'EK',
          bg: 'linear-gradient(180deg, #f4d4f0, #d48ac8)',
          sub: 'Tentativ tor 28 · 14:30 · 3 no-shows',
          badges: [{ kind: 'risk', label: '!! No-show-risk' }],
        },
        {
          name: 'Sofie Andersson',
          init: 'SA',
          bg: 'linear-gradient(180deg, #ffe3b8, #e8a04e)',
          sub: 'På väntelistan · vill boka konsultation',
          badges: [{ kind: 'vip', label: 'VIP' }],
        },
        {
          name: 'Marcus Berg',
          init: 'MB',
          bg: 'linear-gradient(180deg, #b8d4e8, #7aa8d4)',
          sub: 'PRP återbesök väntar · senast feb',
          badges: [{ kind: 'upcoming', label: 'Föreslå tis' }],
        },
        {
          name: 'Eva Johansson',
          init: 'EJ',
          bg: 'linear-gradient(180deg, #ffd4b5, #f0a070)',
          sub: 'Microneedling · obokad förfrågan',
          badges: [],
        },
        {
          name: 'Maria Larsson',
          init: 'ML',
          bg: 'linear-gradient(180deg, #f0c8c8, #d48484)',
          sub: 'Avbokade 14:30 · slot ledig',
          badges: [],
        },
        {
          name: 'Sara Pettersson',
          init: 'SP',
          bg: 'linear-gradient(180deg, #f0c8c8, #d48484)',
          sub: 'PRP för hår ons 27 · 10:00',
          badges: [{ kind: 'ready', label: '✓ Redo' }],
        },
        {
          name: 'Johan Svensson',
          init: 'JS',
          bg: 'linear-gradient(180deg, #d4d4d4, #a8a8a8)',
          sub: 'Återbesök tor 28 · 16:00',
          badges: [{ kind: 'upcoming', label: 'Idag' }],
        },
        {
          name: 'Lisa Holm',
          init: 'LH',
          bg: 'linear-gradient(180deg, #c8e8e0, #88c8b8)',
          sub: 'Ny kund · väntar bekräftelse',
          badges: [{ kind: 'risk', label: 'Ny' }],
        },
        {
          name: 'Erik Nordström',
          init: 'EN',
          bg: 'linear-gradient(180deg, #f4e8c8, #d4b870)',
          sub: 'PRP-kur 4/6 · nästa om 3 v',
          badges: [],
        },
        {
          name: 'Anna Larsson',
          init: 'AL',
          bg: 'linear-gradient(180deg, #e8d4ff, #b894e8)',
          sub: 'VIP · DHI nästa månad',
          badges: [{ kind: 'vip', label: 'VIP' }],
        },
      ];

      const globalSearch = document.getElementById('globalSearch');
      const globalSearchInput = document.getElementById('globalSearchInput');
      const searchOverlay = document.getElementById('searchOverlay');
      const searchOverlayInput = document.getElementById('searchOverlayInput');
      const searchPanelList = document.getElementById('searchPanelList');
      const searchPanelKicker = document.getElementById('searchPanelKicker');
      let searchSelectedIdx = 0;

      function renderSearch(q = '') {
        const ql = q.toLowerCase().trim();
        const filtered = ql
          ? CUSTOMERS.filter(
              (c) => c.name.toLowerCase().includes(ql) || c.sub.toLowerCase().includes(ql)
            )
          : CUSTOMERS;
        searchPanelKicker.textContent = ql
          ? `${filtered.length} träffar för "${q}"`
          : 'Senaste · 1 247 kunder totalt';
        if (filtered.length === 0) {
          searchPanelList.innerHTML = `<div class="search-empty">Ingen kund matchar "${q}"</div>`;
          return;
        }
        searchPanelList.innerHTML = filtered
          .map(
            (c, i) => `
    <div class="search-result ${i === 0 ? 'is-selected' : ''}" data-idx="${i}" data-name="${c.name}">
      <span class="search-avatar" style="background:${c.bg}">${c.init}</span>
      <div class="search-result-meta">
        <div class="search-result-name">${c.name}</div>
        <div class="search-result-sub">${c.sub}</div>
        ${c.badges.length ? `<div class="search-result-badges">${c.badges.map((b) => `<span class="search-badge search-badge--${b.kind}">${b.label}</span>`).join('')}</div>` : ''}
      </div>
      <span class="search-result-arrow">›</span>
    </div>
  `
          )
          .join('');
        searchSelectedIdx = 0;
      }

      function openSearch() {
        searchOverlay.classList.add('is-visible');
        setTimeout(() => searchOverlayInput.focus(), 50);
        renderSearch(searchOverlayInput.value);
      }
      function closeSearch() {
        searchOverlay.classList.remove('is-visible');
        searchOverlayInput.value = '';
        globalSearchInput.value = '';
        globalSearch.classList.remove('is-focused');
      }

      globalSearchInput.addEventListener('focus', () => {
        globalSearch.classList.add('is-focused');
        openSearch();
      });
      globalSearchInput.addEventListener('blur', () => globalSearch.classList.remove('is-focused'));

      searchOverlayInput.addEventListener('input', () => renderSearch(searchOverlayInput.value));

      searchOverlay.addEventListener('click', (ev) => {
        if (ev.target === searchOverlay) closeSearch();
        const result = ev.target.closest('.search-result');
        if (!result) return;
        closeSearch();
        openCustomerDossier(result.dataset.name);
      });

      // Cmd+K / Ctrl+K → öppna global search
      document.addEventListener('keydown', (ev) => {
        if ((ev.metaKey || ev.ctrlKey) && ev.key === 'k') {
          ev.preventDefault();
          openSearch();
        }
        if (ev.key === 'Escape' && searchOverlay.classList.contains('is-visible')) {
          ev.preventDefault();
          closeSearch();
        }
        // Up/Down i overlay
        if (searchOverlay.classList.contains('is-visible')) {
          const results = searchPanelList.querySelectorAll('.search-result');
          if (ev.key === 'ArrowDown') {
            ev.preventDefault();
            searchSelectedIdx = Math.min(results.length - 1, searchSelectedIdx + 1);
            results.forEach((r, i) => r.classList.toggle('is-selected', i === searchSelectedIdx));
            results[searchSelectedIdx]?.scrollIntoView({ block: 'nearest' });
          }
          if (ev.key === 'ArrowUp') {
            ev.preventDefault();
            searchSelectedIdx = Math.max(0, searchSelectedIdx - 1);
            results.forEach((r, i) => r.classList.toggle('is-selected', i === searchSelectedIdx));
            results[searchSelectedIdx]?.scrollIntoView({ block: 'nearest' });
          }
          if (ev.key === 'Enter') {
            ev.preventDefault();
            results[searchSelectedIdx]?.click();
          }
        }
      });

      renderSearch();

      /* ═══════════════════════════════════════════════════════════════
   INTERAKTION 17: KUNDDOSSIER
   ═══════════════════════════════════════════════════════════════ */

      const DOSSIER_DATA = {
        'Anna Karlsson': {
          init: 'AK',
          bg: 'linear-gradient(180deg, #d8c1f0, #b48ad6)',
          contact: 'contact@hairtpclinic · 0704-12 34 56',
          tags: [
            { kind: 'vip', label: '★ VIP' },
            { kind: 'lifecycle', label: 'PRP-kur 4/6' },
            { kind: 'engagement', label: '92% engagement' },
            { kind: 'risk', label: '⚠ Friskförs. saknas' },
          ],
          stats: [
            { label: 'Besök', value: '12', trend: '+3 i år' },
            { label: 'Intäkt', value: '38 400 kr', trend: '+18% YTD' },
            { label: 'No-shows', value: '0', trend: 'Klockren' },
          ],
          upcoming: [
            {
              source: 'contact',
              day: 'TOR',
              num: '28',
              mon: 'MAJ',
              title: 'PRP för hår',
              sub: '08:00 · 45 min · Egzona',
              state: 'warn',
              stateLabel: '⚠ Friskförs.',
            },
            {
              source: 'contact',
              day: 'TIS',
              num: '18',
              mon: 'JUN',
              title: 'PRP för hår',
              sub: '14:30 · 45 min · Egzona',
              state: 'ready',
              stateLabel: '✓ Redo',
            },
          ],
          history: [
            {
              source: 'contact',
              day: 'TIS',
              num: '5',
              mon: 'MAJ',
              title: 'PRP 3/6',
              sub: 'Egzona · 45 min',
              state: 'done',
              stateLabel: 'Klar',
              historyWeek: -3,
            },
            {
              source: 'contact',
              day: 'TIS',
              num: '14',
              mon: 'APR',
              title: 'PRP 2/6',
              sub: 'Egzona · 45 min',
              state: 'done',
              stateLabel: 'Klar',
              historyWeek: -6,
            },
            {
              source: 'contact',
              day: 'TIS',
              num: '24',
              mon: 'MAR',
              title: 'PRP 1/6',
              sub: 'Egzona · 45 min',
              state: 'done',
              stateLabel: 'Klar',
              historyWeek: -7,
            },
            {
              source: 'info',
              day: 'ONS',
              num: '11',
              mon: 'FEB',
              title: 'Konsultation',
              sub: 'Egzona · 30 min',
              state: 'done',
              stateLabel: 'Klar',
              historyWeek: -7,
            },
            {
              source: 'contact',
              day: 'TIS',
              num: '14',
              mon: 'JAN',
              title: 'Provkonsult',
              sub: 'Fazli · 60 min',
              state: 'done',
              stateLabel: 'Klar',
              historyWeek: -7,
            },
          ],
          files: [
            { icon: '📋', name: 'Hälsodekl', badge: '2026' },
            { icon: '✍️', name: 'Samtycke', badge: 'OK' },
            { icon: '📄', name: 'Avtal' },
            { icon: '🖼️', name: 'Före-bild', badge: '4' },
            { icon: '🖼️', name: 'Efter-bild', badge: '2' },
            { icon: '📝', name: 'Protokoll' },
          ],
          notes: [
            {
              text: 'Bra svar på behandling 3, fortsätt med 4. Inga biverkningar.',
              meta: 'Egzona · 5 maj 2026',
            },
            {
              text: 'Kund är väldigt motiverad och följer eftervård exakt.',
              meta: 'Egzona · 14 apr 2026',
            },
            {
              text: 'Pratade om VIP+ uppgradering — låter intresserad.',
              meta: 'Fazli · 11 feb 2026',
            },
          ],
          comm: [
            {
              type: 'mail',
              text: 'Re: PRP-bekräftelse fre 28 maj',
              meta: 'contact-tråden · 2 dagar sedan · ✓ läst',
            },
            {
              type: 'sms',
              text: 'Påminnelse skickad: PRP idag kl 08',
              meta: '5 maj 07:00 · ✓ läst 07:14',
            },
            {
              type: 'call',
              text: 'Bekräftade nästa tid över telefon',
              meta: 'Fazli · 12 mar · 15 min',
            },
            {
              type: 'mail',
              text: 'Frågor om eftervård efter PRP 2',
              meta: 'contact-tråden · 17 apr · ✓ besvarad',
            },
          ],
          economy: [
            { label: 'Total intäkt', value: '38 400 kr' },
            { label: 'Utestående', value: '0 kr' },
            { label: 'Snitt/besök', value: '6 400 kr' },
            { label: 'Livstidsvärde', value: '~58 000 kr' },
          ],
          insights: [
            {
              text: 'Kund är på <strong>4/6 i PRP-kur</strong> — föreslå 5:e ~3 veckor från 5 maj (omkring <strong>12 juni</strong>). Tis 18 jun 14:30 finns redan, men hon brukar boka <strong>tor 14:30 hos Egzona</strong> — ändra?',
              action: 'suggestPRPSlot',
            },
            {
              text: 'Bokar <strong>oftast tor 08:00</strong> (4 av senaste 5) — denna slot träffar perfekt om du vill boka in extra.',
              action: null,
            },
            {
              text: 'Engagemang sjunker svagt (96% → 92% på 3 mån). <strong>Skicka personligt mejl?</strong> Förslag finns i Svarstudio.',
              action: null,
            },
            {
              text: 'Värd att uppgradera till <strong>VIP+</strong> — total omsättning passerar 35 000 kr-tröskeln.',
              action: null,
            },
          ],
        },
      };

      // Default fallback för andra kunder utan full data
      function getDossier(name) {
        if (DOSSIER_DATA[name]) return DOSSIER_DATA[name];
        // Bygg ett enkelt default-dossier
        const customer = CUSTOMERS.find((c) => c.name === name) || {
          init: '??',
          bg: 'linear-gradient(180deg, #d4d4d4, #a8a8a8)',
          sub: '',
        };
        return {
          init: customer.init,
          bg: customer.bg,
          contact: `${customer.name.toLowerCase().replace(/\s/g, '.')}@email.se · 070-XXX XX XX`,
          tags: [
            { kind: 'lifecycle', label: 'Återkommande' },
            { kind: 'engagement', label: '88%' },
          ],
          stats: [
            { label: 'Besök', value: '3', trend: 'Pågående' },
            { label: 'Intäkt', value: '11 200 kr', trend: '+stabilt' },
            { label: 'No-shows', value: '0', trend: 'OK' },
          ],
          upcoming: [],
          history: [
            {
              source: 'info',
              day: 'TIS',
              num: '5',
              mon: 'MAJ',
              title: 'Senaste besök',
              sub: 'Konsultation',
              state: 'done',
              stateLabel: 'Klar',
              historyWeek: -3,
            },
          ],
          files: [
            { icon: '📋', name: 'Hälsodekl', badge: 'OK' },
            { icon: '📄', name: 'Avtal' },
          ],
          notes: [
            {
              text: 'Begränsad info i mockup. I produktion: alla anteckningar härifrån.',
              meta: 'System',
            },
          ],
          comm: [{ type: 'mail', text: 'Senaste mejl', meta: 'för 3 dagar sedan' }],
          economy: [
            { label: 'Total intäkt', value: '11 200 kr' },
            { label: 'Utestående', value: '0 kr' },
          ],
          insights: [{ text: 'Föreslå nästa besök inom 2–4 veckor.', action: null }],
        };
      }

      const intelShell = document.getElementById('intelShell');
      const intelCustomerView = document.getElementById('intelCustomerView');
      const breadcrumbSlot = document.getElementById('breadcrumbSlot');

      function openCustomerDossier(name) {
        const d = getDossier(name);

        intelCustomerView.innerHTML = `
    <div class="dossier-head">
      <div class="dossier-avatar" style="background:${d.bg}">${d.init}</div>
      <div class="dossier-head-body">
        <div class="dossier-kicker">★ Kunddossiér</div>
        <div class="dossier-name">${name}</div>
        <div class="dossier-contact">${d.contact}</div>
        <div class="dossier-tags">
          ${d.tags.map((t) => `<span class="dossier-tag dossier-tag--${t.kind}">${t.label}</span>`).join('')}
        </div>
      </div>
      <button class="dossier-close" id="dossierClose" title="Stäng dossiér">×</button>
    </div>

    <div class="dossier-stats">
      ${d.stats
        .map(
          (s) => `
        <div class="dossier-stat">
          <div class="dossier-stat-label">${s.label}</div>
          <div class="dossier-stat-value">${s.value}</div>
          <div class="dossier-stat-trend">${s.trend}</div>
        </div>
      `
        )
        .join('')}
    </div>

    <div class="dossier-scroll">
      ${
        d.upcoming.length
          ? `
        <details class="dossier-section" open>
          <summary>Kommande bokningar <span class="count">${d.upcoming.length}</span></summary>
          ${d.upcoming
            .map(
              (b, i) => `
            <div class="dossier-booking" data-source="${b.source}" data-jump-current="${i === 0 ? '1' : '0'}">
              <div class="db-date"><div class="day">${b.day}</div><div class="num">${b.num}</div><div class="mon">${b.mon}</div></div>
              <div class="db-meta"><div class="db-title">${b.title}</div><div class="db-sub">${b.sub}</div></div>
              <span class="db-status" data-state="${b.state}">${b.stateLabel}</span>
            </div>
          `
            )
            .join('')}
        </details>
      `
          : ''
      }

      <details class="dossier-section">
        <summary>Historik <span class="count">${d.history.length}</span></summary>
        ${d.history
          .map(
            (b) => `
          <div class="dossier-booking" data-source="${b.source}" data-history-week="${b.historyWeek}">
            <div class="db-date"><div class="day">${b.day}</div><div class="num">${b.num}</div><div class="mon">${b.mon}</div></div>
            <div class="db-meta"><div class="db-title">${b.title}</div><div class="db-sub">${b.sub}</div></div>
            <span class="db-status" data-state="${b.state}">${b.stateLabel}</span>
          </div>
        `
          )
          .join('')}
      </details>

      <details class="dossier-section">
        <summary>Filer <span class="count">${d.files.length}</span></summary>
        <div class="dossier-files">
          ${d.files
            .map(
              (f) => `
            <div class="dossier-file">
              <div class="dossier-file-icon">${f.icon}</div>
              <div class="dossier-file-name">${f.name}</div>
              ${f.badge ? `<span class="dossier-file-badge">${f.badge}</span>` : ''}
            </div>
          `
            )
            .join('')}
        </div>
      </details>

      <details class="dossier-section">
        <summary>Anteckningar <span class="count">${d.notes.length}</span></summary>
        ${d.notes
          .map(
            (n) => `
          <div class="dossier-note">
            ${n.text}
            <div class="dossier-note-meta">${n.meta}</div>
          </div>
        `
          )
          .join('')}
      </details>

      <details class="dossier-section">
        <summary>Kommunikation <span class="count">${d.comm.length}</span></summary>
        ${d.comm
          .map(
            (c) => `
          <div class="dossier-comm">
            <div class="dossier-comm-icon" data-type="${c.type}">${c.type === 'mail' ? '✉' : c.type === 'sms' ? '💬' : '📞'}</div>
            <div class="dossier-comm-body">
              <div class="dossier-comm-text">${c.text}</div>
              <div class="dossier-comm-meta">${c.meta}</div>
            </div>
          </div>
        `
          )
          .join('')}
      </details>

      <details class="dossier-section">
        <summary>Ekonomi <span class="count">${d.economy.length}</span></summary>
        <div class="dossier-economy">
          ${d.economy
            .map(
              (m) => `
            <div class="dossier-money">
              <div class="dossier-money-label">${m.label}</div>
              <div class="dossier-money-value">${m.value}</div>
            </div>
          `
            )
            .join('')}
        </div>
      </details>

      <details class="dossier-section" open>
        <summary>AI-insikter <span class="count">${d.insights.length}</span></summary>
        ${d.insights
          .map(
            (ins, i) => `
          <div class="dossier-insight" data-insight-action="${ins.action || ''}" data-insight-idx="${i}">${ins.text}</div>
        `
          )
          .join('')}
      </details>
    </div>

    <div class="dossier-actions">
      <button class="quick-pill quick-pill--ai full">★ Boka nästa PRP (12 jun)</button>
      <button class="quick-pill">✎ Anteckna</button>
      <button class="quick-pill">✉ Svarstudio</button>
      <button class="quick-pill quick-pill--success full">✓ Bekräfta kommande tider (${d.upcoming.length})</button>
    </div>
  `;

        // Switch context
        intelShell.dataset.context = 'customer';

        // Breadcrumb
        breadcrumbSlot.innerHTML = `
    <span class="breadcrumb">
      <span class="back" id="bcBack" title="Tillbaka">‹</span>
      Kalender /
      <span class="who">${name}</span>
    </span>
  `;

        // Highlight kundens bokningar i kalendern (matchar via avatar-init)
        document
          .querySelectorAll('.booking.dossier-highlight')
          .forEach((b) => b.classList.remove('dossier-highlight'));
        document.querySelectorAll('.booking').forEach((b) => {
          const av = b.querySelector('.avatar-bubble');
          if (av && av.dataset.init === d.init) {
            b.classList.add('dossier-highlight');
          }
        });

        // Wire close
        document.getElementById('dossierClose').addEventListener('click', closeDossier);
        document.getElementById('bcBack').addEventListener('click', closeDossier);

        // Wire bookings: klick → hoppa till booking i kalendern
        intelCustomerView
          .querySelectorAll('.dossier-booking[data-jump-current="1"]')
          .forEach((b) => {
            b.addEventListener('click', () => {
              const first = document.querySelector('.booking.dossier-highlight');
              if (first) {
                first.scrollIntoView({ behavior: 'smooth', block: 'center' });
                first.classList.add('is-receiving');
                setTimeout(() => first.classList.remove('is-receiving'), 720);
              }
            });
          });
        // Wire history: klick → tid-maskinen flyttas till den veckan
        intelCustomerView.querySelectorAll('[data-history-week]').forEach((b) => {
          b.addEventListener('click', () => {
            const w = parseInt(b.dataset.historyWeek, 10);
            tmSlider.value = String(Math.max(-7, Math.min(7, w)));
            tmSlider.dispatchEvent(new Event('input'));
            const flash = document.createElement('div');
            flash.className = 'undo-flash';
            document.body.appendChild(flash);
            setTimeout(() => flash.remove(), 520);
          });
        });
        // Wire AI insights: klick → ghost-suggestion på en slot
        intelCustomerView.querySelectorAll('.dossier-insight').forEach((ins) => {
          ins.addEventListener('click', () => {
            if (ins.dataset.insightAction === 'suggestPRPSlot') {
              // Lägg ghost-suggestion i Tor-kolumnen 14:30 (mock)
              const todaySlots = document.querySelectorAll('.day-col.today .day-slots');
              const target = todaySlots[0];
              if (!target) return;
              // Ta bort gammal ghost
              target.querySelectorAll('.ghost-suggestion').forEach((g) => g.remove());
              const ghost = document.createElement('div');
              ghost.className = 'ghost-suggestion';
              ghost.style.top = '470px';
              ghost.style.height = '46px';
              ghost.innerHTML = `<div style="font-size:10.5px;font-weight:700;color:var(--cco-color-brand);">PRP 5/6 · Anna</div><div style="font-size:9.5px;color:var(--cco-text-secondary);">14:30–15:15 · Egzona</div>`;
              target.appendChild(ghost);
              ghost.addEventListener('click', () => {
                ghost.classList.add('is-receiving');
                setTimeout(() => ghost.remove(), 320);
                const toast = document.createElement('div');
                toast.className = 'ai-toast';
                toast.style.background = 'linear-gradient(180deg, #eef7f2, #c8e0d2)';
                toast.style.borderColor = 'rgba(74,130,104,.34)';
                toast.style.color = 'var(--cco-status-success)';
                toast.textContent = '✓ Tid bokad — Anna får bekräftelse';
                document.body.appendChild(toast);
                requestAnimationFrame(() => toast.classList.add('is-visible'));
                setTimeout(() => {
                  toast.classList.remove('is-visible');
                  setTimeout(() => toast.remove(), 320);
                }, 2400);
              });
              // Scroll till slot
              setTimeout(() => target.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100);
            }
          });
        });

        // Säkerställ att vyn är vecka för att se highlights
        if (content.dataset.mode === 'morgon') setMode('vecka');
      }

      function closeDossier() {
        intelShell.dataset.context = 'booking';
        breadcrumbSlot.innerHTML = '';
        document
          .querySelectorAll('.booking.dossier-highlight')
          .forEach((b) => b.classList.remove('dossier-highlight'));
        document.querySelectorAll('.ghost-suggestion').forEach((g) => g.remove());
      }

      // Esc → close dossier (om sökoverlay inte är öppen)
      document.addEventListener('keydown', (ev) => {
        if (
          ev.key === 'Escape' &&
          intelShell.dataset.context === 'customer' &&
          !searchOverlay.classList.contains('is-visible')
        ) {
          closeDossier();
        }
      });
    } catch (e) {
      if (window.console) console.warn('[cco-cal-v8] interaktion init:', e && e.message);
    }
  }

  // ── P1: riktig data i Morgon-vyn via det DELADE datalagret ───────────────
  // Återanvänder ArcanaBookingCalendarShared (samma enda källa som legacy) —
  // ingen egen datakälla. Heuristiken speglar legacy-kalenderns dokumenterade
  // morgon-standup (boknings-räkning, lediga luckor, transparent schema-säkerhet).
  function v8Esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function v8SetKicker(card, text) {
    if (!card) return;
    var k = card.querySelector('.story-card-kicker');
    if (!k) return;
    var icon = k.querySelector('.icon');
    k.innerHTML = (icon ? icon.outerHTML : '') + ' ' + v8Esc(text);
  }
  async function populateMorgonReal(root) {
    try {
      if (typeof window.__ARCANA_ENSURE_BOOKING_SCRIPTS__ === 'function') {
        await window.__ARCANA_ENSURE_BOOKING_SCRIPTS__();
      }
      var S = window.ArcanaBookingCalendarShared;
      if (!S || typeof S.fetchCalendarRange !== 'function') return;
      var today = S.todayIso ? S.todayIso() : new Date().toISOString().slice(0, 10);
      var endD = new Date(today + 'T12:00:00');
      endD.setDate(endD.getDate() + 13);
      var range = await S.fetchCalendarRange(today, endD.toISOString().slice(0, 10));
      var sbd = range && range.slotsByDate;
      var daySlots = (sbd instanceof Map ? sbd.get(today) : sbd && sbd[today]) || [];
      var booked = daySlots.filter(function (s) {
        return s && s.kind === 'booked';
      });
      var available = daySlots.filter(function (s) {
        return s && s.kind === 'available';
      });
      booked.sort(function (a, b) {
        return S.slotStartMinutes(a) - S.slotStartMinutes(b);
      });
      var t = function (slot, idx) {
        var r = (S.formatTimeRange(slot) || '').split('–');
        return (r[idx] || '').trim();
      };
      var first = booked[0] ? t(booked[0], 0) : null;
      var last = booked.length ? booked[booked.length - 1] : null;

      // Hälsning — riktig veckodag/tid, neutralt namn (inget påhittat).
      var now = new Date();
      var hh = now.getHours();
      var greet = hh < 11 ? 'God morgon' : hh < 18 ? 'God dag' : 'God kväll';
      var clock = String(hh).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
      var dayWord = new Date(today + 'T12:00:00').toLocaleDateString('sv-SE', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      });
      var h1 = root.querySelector('.greet-text h1');
      if (h1) h1.innerHTML = v8Esc(greet) + '<span>.</span>';
      var gp = root.querySelector('.greet-text p');
      if (gp) gp.innerHTML = v8Esc(dayWord) + ' · klockan är <strong>' + v8Esc(clock) + '</strong>';

      // IDAG
      var idag = root.querySelector('[data-kind="idag"]');
      if (idag) {
        var num = idag.querySelector('.num');
        if (num) num.textContent = String(booked.length);
        var sub = idag.querySelector('.story-card-sub');
        if (sub) {
          sub.textContent = booked.length
            ? 'Första kl ' +
              first +
              ' · sista kl ' +
              t(last, 0) +
              ' · ' +
              available.length +
              ' lediga tider'
            : available.length + ' lediga tider · inga bokningar denna dag ännu';
        }
        // day-spark: bokningar per timme 8–19
        var spark = idag.querySelector('.day-spark');
        if (spark) {
          var buckets = [];
          for (var hI = 0; hI < 12; hI++) buckets.push(0);
          booked.forEach(function (s) {
            var m = S.slotStartMinutes(s);
            var hr = Math.floor(m / 60) - 7;
            if (hr >= 0 && hr < 12) buckets[hr] += 1;
          });
          var mx = Math.max(1, Math.max.apply(null, buckets));
          spark.innerHTML = buckets
            .map(function (n) {
              var pct = Math.round((n / mx) * 100);
              return (
                '<div class="day-spark-bar"' +
                (n ? '' : ' data-h="0"') +
                ' style="height:' +
                pct +
                '%"></div>'
              );
            })
            .join('');
        }
      }

      // RISKER — ärligt: bokningar med obekräftad/tentativ status.
      var risks = booked
        .filter(function (s) {
          return /(tentat|pending|obekräft|obekraft|väntar|vantar)/i.test(String(s.status || ''));
        })
        .map(function (s) {
          return {
            who: s.title || s.serviceLabel || 'Bokning',
            what: 'väntar bekräftelse',
            when: t(s, 0),
            sev: 'med',
          };
        });
      var riskCard = root.querySelector('[data-kind="risker"]');
      if (riskCard) {
        v8SetKicker(riskCard, risks.length + ' risker');
        var rlist = riskCard.querySelector('.story-list');
        if (rlist) {
          rlist.innerHTML = risks.length
            ? risks
                .map(function (r) {
                  return (
                    '<div class="story-item" data-severity="' +
                    r.sev +
                    '"><span class="badge">!</span>' +
                    '<span><span class="who">' +
                    v8Esc(r.who) +
                    '</span> <span class="what">' +
                    v8Esc(r.what) +
                    '</span></span>' +
                    '<span class="when">' +
                    v8Esc(r.when) +
                    '</span></div>'
                  );
                })
                .join('')
            : '<div class="story-empty">Inga risker idag — allt ser bra ut.</div>';
        }
      }

      // MÖJLIGHETER — riktiga lediga luckor.
      var oppCard = root.querySelector('[data-kind="mojligheter"]');
      if (oppCard) {
        v8SetKicker(oppCard, available.length + ' möjligheter');
        var olist = oppCard.querySelector('.story-list');
        if (olist) {
          olist.innerHTML = available.length
            ? available
                .slice(0, 4)
                .map(function (s) {
                  var res = s.resourceLabel || s.resource || '';
                  return (
                    '<div class="story-item" data-severity="ok"><span class="badge">★</span>' +
                    '<span><span class="who">Ledig tid</span> <span class="what">' +
                    (res ? '— ' + v8Esc(res) : '— boka in en kund') +
                    '</span></span>' +
                    '<span class="when">' +
                    v8Esc(t(s, 0)) +
                    '</span></div>'
                  );
                })
                .join('')
            : '<div class="story-empty">Inga lediga luckor kvar idag.</div>';
        }
      }

      // PROGNOS — transparent heuristik på riktig data (ej AI).
      var conf = Math.max(30, Math.min(99, 100 - risks.length * 9));
      var prog = root.querySelector('[data-kind="klart"]');
      if (prog) {
        var ph = prog.querySelector('.story-card-headline');
        if (ph)
          ph.textContent = booked.length ? 'Klar ' + (t(last, 1) || '—') : 'Ingen dag att planera';
        var ps = prog.querySelector('.story-card-sub');
        if (ps) {
          ps.textContent = booked.length
            ? (risks.length ? risks.length + ' öppna punkter. ' : 'Allt hanterat. ') +
              conf +
              '% schema-säkerhet (heuristik på din dag).'
            : 'Lägg in bokningar för att se en prognos.';
        }
        var fill = prog.querySelector('.ready-meter-fill');
        if (fill) fill.style.width = (booked.length ? conf : 0) + '%';
        var lbls = prog.querySelectorAll('.ready-meter-labels span');
        if (lbls && lbls[1]) lbls[1].textContent = booked.length ? conf + '%' : '—';
      }
    } catch (e) {
      if (window.console) console.warn('[cco-cal-v8] morgon-data:', e && e.message);
    }
  }

  // ── P2: riktig data i Vecko-griden ──────────────────────────────────────
  var V8_PX_HOUR = 62; // facit: 06:00 = 0px, 62px/timme (top:186 = 09:00).
  var V8_BASE_HOUR = 6;
  function v8SlotTop(minOfDay) {
    return Math.max(0, ((minOfDay - V8_BASE_HOUR * 60) / 60) * V8_PX_HOUR);
  }
  function v8MondayOf(iso) {
    var d = new Date(iso + 'T12:00:00');
    var wd = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() - wd);
    return d;
  }
  function v8IsoOf(d) {
    return (
      d.getFullYear() +
      '-' +
      String(d.getMonth() + 1).padStart(2, '0') +
      '-' +
      String(d.getDate()).padStart(2, '0')
    );
  }
  var V8_DAYS = ['Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör', 'Sön'];
  function v8BookingCard(S, slot) {
    var booked = slot.kind === 'booked';
    var startMin = S.slotStartMinutes(slot);
    var durMin =
      slot.durationMinutes || (S.slotDurationMinutes && S.slotDurationMinutes(slot)) || 30;
    var top = v8SlotTop(startMin);
    var height = Math.max(20, (durMin / 60) * V8_PX_HOUR);
    var range = S.formatTimeRange(slot) || '';
    var title = booked
      ? slot.title || slot.serviceLabel || 'Bokning'
      : 'Ledig' + (slot.resourceLabel ? ' · ' + slot.resourceLabel : '');
    var sub = booked ? slot.resourceLabel || '' : slot.serviceLabel || '';
    return (
      '<div class="booking" data-source="' +
      (booked ? 'info' : 'open') +
      '" data-status="' +
      (booked ? 'confirmed' : 'open') +
      '" data-v8-open="' +
      (booked ? '0' : '1') +
      '" data-v8-title="' +
      v8Esc(title) +
      '" data-v8-time="' +
      v8Esc(range) +
      '" data-v8-res="' +
      v8Esc(slot.resourceLabel || '') +
      '" data-v8-svc="' +
      v8Esc(slot.serviceLabel || '') +
      '" data-v8-st="' +
      v8Esc(booked ? slot.status || 'Bekräftad' : 'Ledig tid') +
      '" style="top:' +
      Math.round(top) +
      'px;height:' +
      Math.round(height) +
      'px">' +
      '<div class="booking-time">' +
      v8Esc(range) +
      '</div><div class="booking-title">' +
      v8Esc(title) +
      '</div>' +
      (sub ? '<div class="booking-sub">' + v8Esc(sub) + '</div>' : '') +
      '</div>'
    );
  }
  function v8GetDay(sbd, iso) {
    return (sbd instanceof Map ? sbd.get(iso) : sbd && sbd[iso]) || [];
  }
  async function populateGridsReal(root) {
    try {
      if (typeof window.__ARCANA_ENSURE_BOOKING_SCRIPTS__ === 'function') {
        await window.__ARCANA_ENSURE_BOOKING_SCRIPTS__();
      }
      var S = window.ArcanaBookingCalendarShared;
      if (!S || typeof S.fetchCalendarRange !== 'function') return;
      var today = S.todayIso ? S.todayIso() : new Date().toISOString().slice(0, 10);
      var monday = v8MondayOf(today);
      var weekDates = [];
      for (var i = 0; i < 7; i++) {
        var d = new Date(monday);
        d.setDate(d.getDate() + i);
        weekDates.push(v8IsoOf(d));
      }
      var range = await S.fetchCalendarRange(weekDates[0], weekDates[6]);
      var sbd = range && range.slotsByDate;
      var weekEl = root.querySelector('#calWeek') || root.querySelector('.calendar-week');
      if (weekEl) {
        var cols = weekEl.querySelectorAll('.day-col');
        for (var c = 0; c < cols.length && c < 7; c++) {
          var iso = weekDates[c];
          var dt = new Date(iso + 'T12:00:00');
          var head = cols[c].querySelector('.day-head');
          if (head) {
            var lbl = head.querySelector('.day-label');
            var dnum = head.querySelector('.day-date');
            if (lbl) lbl.textContent = V8_DAYS[c];
            if (dnum) dnum.textContent = String(dt.getDate());
            cols[c].classList.toggle('is-today', iso === today);
          }
          var slotsWrap = cols[c].querySelector('.day-slots');
          if (slotsWrap) {
            var daySlots = v8GetDay(sbd, iso)
              .slice()
              .sort(function (a, b) {
                return S.slotStartMinutes(a) - S.slotStartMinutes(b);
              });
            slotsWrap.innerHTML = daySlots
              .map(function (s) {
                return v8BookingCard(S, s);
              })
              .join('');
          }
        }
      }

      // VÄNSTERPANEL (side-shell) — riktiga räknare ur veckans data.
      var bookedOn = function (iso) {
        return v8GetDay(sbd, iso).filter(function (s) {
          return s && s.kind === 'booked';
        });
      };
      var tomorrow = v8IsoOf(new Date(new Date(today + 'T12:00:00').getTime() + 86400000));
      var weekBooked = weekDates.reduce(function (acc, iso) {
        return acc.concat(bookedOn(iso));
      }, []);
      var statusCount = function (re) {
        return weekBooked.filter(function (s) {
          return re.test(String(s.status || ''));
        }).length;
      };
      var resSet = {};
      weekDates.forEach(function (iso) {
        v8GetDay(sbd, iso).forEach(function (s) {
          if (s && (s.resourceId || s.resourceLabel)) resSet[s.resourceId || s.resourceLabel] = 1;
        });
      });
      var resources = Object.keys(resSet);
      var setLink = function (labelRe, n) {
        var links = root.querySelectorAll('.side-shell .side-link');
        for (var li = 0; li < links.length; li++) {
          if (labelRe.test(links[li].textContent || '')) {
            var cnt = links[li].querySelector('.count');
            if (cnt) cnt.textContent = String(n);
            return;
          }
        }
      };
      setLink(/dagens mottagning/i, bookedOn(today).length);
      setLink(/imorgon/i, bookedOn(tomorrow).length);
      setLink(/veckan/i, weekBooked.length);
      setLink(/resurser/i, resources.length);
      setLink(/bekräftade/i, statusCount(/(confirm|bekräft|bekraft|planer)/i));
      setLink(/tentativa/i, statusCount(/(tentat|pending|väntar|vantar|obekräft)/i));
      setLink(/konflikt/i, (range && range.conflicts && range.conflicts.length) || 0);
      setLink(
        /återbesök|aterbesok/i,
        weekBooked.filter(function (s) {
          return /(återbesök|aterbesok|uppföljn|recall|prp)/i.test(
            String(s.serviceLabel || s.title || '')
          );
        }).length
      );

      // Klick på en slot → fyll höger Operatörsstöd-dossiér ur slotens riktiga
      // data (resurs/tid/tjänst/status). Delegerad, en gång per mount.
      if (!root.__v8DossierBound) {
        root.__v8DossierBound = true;
        root.addEventListener('click', function (ev) {
          var card = ev.target && ev.target.closest ? ev.target.closest('.booking') : null;
          if (card) populateDossierFromCard(root, card);
        });
      }
    } catch (e) {
      if (window.console) console.warn('[cco-cal-v8] grid-data:', e && e.message);
    }
  }

  // Fyll intel-shell (Operatörsstöd) ur ett klickat slot-korts riktiga data.
  function populateDossierFromCard(root, card) {
    try {
      var d = card.dataset || {};
      var booked = d.v8Open !== '1';
      var name = booked ? d.v8Title || 'Bokning' : 'Ledig tid';
      var intel = root.querySelector('.intel-shell');
      if (!intel) return;
      var setText = function (sel, val) {
        var el = intel.querySelector(sel);
        if (el) el.textContent = val;
      };
      setText('.intel-name', name);
      setText(
        '.intel-meta',
        (booked ? 'Bokning' : 'Öppen lucka') + (d.v8Res ? ' · ' + d.v8Res : '')
      );
      var av = intel.querySelector('.intel-avatar');
      if (av) {
        av.textContent = booked
          ? name
              .split(/\s+/)
              .map(function (w) {
                return w[0] || '';
              })
              .join('')
              .slice(0, 2)
              .toUpperCase()
          : '◷';
      }
      var pairs = {
        Behandling: d.v8Svc || (booked ? '—' : 'Ledig tid'),
        Tid: d.v8Time || '—',
        Behandlare: d.v8Res || '—',
        Status: d.v8St || '—',
      };
      intel.querySelectorAll('.intel-grid dt').forEach(function (dt) {
        var key = (dt.textContent || '').trim();
        var dd = dt.nextElementSibling;
        if (dd && pairs[key] != null && pairs[key] !== '') dd.textContent = pairs[key];
      });
    } catch (e) {
      /* tyst */
    }
  }

  // Facitens setMode hårdkodar titlarna ("Tor 28 maj" etc). Skriv om dem till
  // riktiga datum och re-applicera efter varje vy-byte (efter facit-JS:t).
  function fixV8Titles(root) {
    try {
      var title = root.querySelector('#calTitle');
      if (!title) return;
      var now = new Date();
      var todayIso = v8IsoOf(now);
      var monday = v8MondayOf(todayIso);
      var sunday = new Date(monday);
      sunday.setDate(sunday.getDate() + 6);
      var mShort = function (d) {
        return d.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' });
      };
      var isoWeek = function (d) {
        var t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
        var dn = (t.getUTCDay() + 6) % 7;
        t.setUTCDate(t.getUTCDate() - dn + 3);
        var firstThu = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
        return (
          1 + Math.round(((t - firstThu) / 86400000 - 3 + ((firstThu.getUTCDay() + 6) % 7)) / 7)
        );
      };
      var titles = {
        morgon: now.getHours() < 11 ? 'God morgon' : now.getHours() < 18 ? 'God dag' : 'God kväll',
        vecka:
          mShort(monday) +
          ' – ' +
          sunday.toLocaleDateString('sv-SE', { day: 'numeric', month: 'long', year: 'numeric' }),
        dag: now.toLocaleDateString('sv-SE', { weekday: 'short', day: 'numeric', month: 'long' }),
        resurs: 'Resurser · vecka ' + isoWeek(now),
      };
      var content = root.querySelector('.calendar-content');
      var apply = function () {
        var mode = content ? content.dataset.mode || 'morgon' : 'morgon';
        if (titles[mode]) title.textContent = titles[mode];
      };
      apply();
      root.querySelectorAll('.segment-tab').forEach(function (tab) {
        tab.addEventListener('click', function () {
          setTimeout(apply, 0); // efter facitens setMode
        });
      });
    } catch (e) {
      /* tyst */
    }
  }

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
    initV8Interactions();
    // P1/P2: fyll vyerna med riktig data från det delade datalagret (async).
    populateMorgonReal(root);
    populateGridsReal(root);
    fixV8Titles(root);
    return root;
  }

  window.ArcanaCalendarV8 = { render: render };

  // ── Self-mount boot ────────────────────────────────────────────────────
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
