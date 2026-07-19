# CCO Kalender — global history-search smoke guard

This is a test/runbook guard for the embedded production path:

- `public/kalender.html`
- `public/cco-kalender-shell.js`
- `/admin#cco` → Kalender iframe `/kalender.html?embed=1`

Do not use the preview-only `public/major-arcana-preview/app/cco-calendar-v8-shell.js`
as evidence for this smoke. The active production iframe is the root
`/kalender.html` path.

Before clicking a global search result, the smoke must fail closed unless all of
these are true:

1. `#searchOverlay` has class `is-visible`.
2. `getComputedStyle(#searchOverlay).pointerEvents === "auto"`.
3. The planned click point is the center of the intended `.search-result`.
4. `document.elementFromPoint(x, y).closest(".search-result")` is the same
   `.search-result` that will be clicked.

If any condition fails, do not interpret the click result as a product handoff
failure. Re-open the overlay through the real global-search interaction and
repeat the hit-target guard first.

The regression helper lives in:

- `scripts/calendar-visible-search-click-guard.js`

The focused tests live in:

- `tests/scripts/calendarVisibleSearchClickGuard.test.js`

The guard is intentionally docs/test-only. It must not perform writes, deploys,
booking changes, ledger changes, patient/encounter writes, or runtime activation.
