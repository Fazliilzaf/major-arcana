/*!
 * CCO Staff Shell · auto-inject CCO top-nav
 * Cycle 18 · 2026-06-04
 *
 * Lägg <script defer src="/cco-staff-shell.js"></script> i <head>
 * — den injicerar CCO top-nav överst på <body> så alla staff-sidor
 * ser ut som Kunder/Patientkort.
 *
 * Markera <body data-cco-shell="staff"> för opt-in.
 */
(function () {
  if (typeof document === 'undefined') return;

  function inject() {
    if (document.querySelector('.cco-top-nav[data-cco-injected]')) return;

    // Add body marker for CSS overrides
    document.body.classList.add('cco-shell');
    document.body.setAttribute('data-cco-shell', 'staff');

    var nav = document.createElement('div');
    nav.className = 'cco-top-nav';
    nav.setAttribute('data-cco-injected', 'true');
    nav.innerHTML = [
      '<span class="cco-brand">CCO</span>',
      '<a href="/konversationer.html">Konversationer</a>',
      '<a href="/kunder.html">Kunder</a>',
      '<a href="/kalender.html">Kalender</a>',
      '<a href="/cco-demo.html" class="cco-nav-active-personal">Journalpilot</a>'
    ].join('');

    // Mark active link based on URL
    var path = (document.location && document.location.pathname) || '';
    var staffPaths = [
      '/cco-personal-start.html',
      '/cco-presenter-mode.html',
      '/cco-4june-command-center.html',
      '/journal-pilot-guide.html',
      '/journal-pilot-print-pack.html',
      '/cco-staff-training-mode.html',
      '/cco-journalpilot-faq.html',
      '/cco-journalpilot-go-live.html',
      '/cco-staff-go-live-control.html',
      '/cco-journal-safety-helper.html',
      '/cco-review-material-warning.html',
      '/cco-pre-signering-check.html',
      '/cco-after-meeting-start.html',
      '/cco-morning-checklist.html',
      '/cco-staff-day1-checklist.html',
      '/journal-pilot-signoff-sheet.html',
      '/cco-staff-training-completion.html'
    ];
    if (staffPaths.indexOf(path) !== -1) {
      var personalLink = nav.querySelector('.cco-nav-active-personal');
      if (personalLink) personalLink.classList.add('active');
    } else if (path === '/kunder.html') {
      var kunderLink = nav.querySelector('a[href="/kunder.html"]');
      if (kunderLink) kunderLink.classList.add('active');
    }

    if (document.body.firstChild) {
      document.body.insertBefore(nav, document.body.firstChild);
    } else {
      document.body.appendChild(nav);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inject);
  } else {
    inject();
  }
})();
