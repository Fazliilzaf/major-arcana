# CCO Unified Shell Integration Plan

Status: proposed architecture lock (PR0, documentation only)

Production surface: `https://arcana.hairtpclinic.com/admin#cco`

This document defines how the existing CCO surfaces are integrated into one
production shell. PR0 does not change runtime code, navigation, data, or send
behavior. Implementation remains blocked until this plan is approved and the
active customer and conversation work is handed off explicitly.

## Decision

The new live Conversations experience in `public/konversationer.html` is the
visual and behavioral baseline for the unified CCO shell.

The customer registry and V12 dossier remain the existing customer product.
They must be mounted as customer content inside the unified shell; they must
not bring their own global shell, router, navigation, demo state, or legacy
conversation workspace.

The production result must have:

- one global CCO shell;
- one global navigation;
- one owner for global routing;
- one active segment at a time; and
- existing segment content and data mounted without being rebuilt or copied.

The current production route is frozen while the implementation is prepared.
No visual shell change may merge without explicit screenshot signoff.

## Visual Baseline

The user-provided production screenshots from 2026-07-10 establish the visual
acceptance baseline:

- PASS: the live Conversations view shown at 10:08:45, with the real mailbox
  list, selected conversation, customer context, and bottom actions.
- FAIL: the view shown at 10:18:56, containing `Arbetskö`, `Fokusyta`, and the
  sample conversation for Anna Karlsson. This is a legacy/demo conversation
  workspace and must never appear when the Customers segment is selected.
- FAIL: any page with two global CCO navigation rows or two competing shells.

The screenshots are review evidence, not repository assets. Every visual PR
must produce fresh Chrome and Safari screenshots at agreed viewports.

## Target Architecture

```text
/admin#cco
`-- unified CCO shell (Conversations visual baseline)
    |-- Conversations: live inbox and stored message thread
    |   `-- Cloud-built actions and dialogs
    |-- Customers: live customer registry and V12 dossier
    |-- Calendar: existing calendar content
    |-- Automation: existing automation content
    |-- Analytics: existing analytics content
    `-- More: existing supporting tools
```

The shell owns layout, global navigation, segment selection, deep-link state,
loading/error boundaries, and browser history. A mounted segment owns only its
content region and local interactions.

Nested global shells are prohibited. A segment adapter must fail closed if it
cannot mount the intended content; it must not fall back to another full-page
workspace.

## Existing Sources Of Truth

| Surface | Existing implementation to preserve | Runtime/data contract |
| --- | --- | --- |
| Conversations | `public/konversationer.html`, `public/konversationer-bottom-actions.js` | `/api/v1/cco/runtime/worklist/consumer`, conversation messages, actions, and reply APIs |
| Conversation dialogs | Existing `public/major-arcana-preview/cco-*.html` views | Open as actions/dialogs from the selected live conversation |
| Customers | Customer mode in `public/major-arcana-preview/index.html` and `public/major-arcana-preview/app/patient-master-ui.js` | `/api/v1/cco/staff/customers-shell` and `/api/v1/cco-patient-master/*`; canonical identity is `patient.id` exposed as `patientId` |
| Calendar | `public/kalender.html` | Existing calendar APIs and state |
| Automation | `public/major-arcana-preview/cco-automatisering-v3.html` | Existing implementation and data |
| Analytics | `public/major-arcana-preview/cco-analytics-v3.html` | Existing implementation and data |
| More | Existing integration, macro, settings, notifications, signatures, audit, and showcase views | Existing implementation and data |

This plan does not authorize copies or replacements of these products. An
implementation may add a thin content adapter only where the existing page
cannot be mounted without its own shell.

## Route Contract

`/admin#cco` remains the only production entry point.

The production Customers target must use live customer mode and preserve
`patientId` deep links. It must not include `demo=on` or `demoOpDay=1`. Those
flags select or persist demo/UAT behavior and are not valid production routing.

Removing the flags is necessary but not sufficient. In `embed=admin` mode the
customer implementation must be hard-locked to customer content. Its internal
router must not mount the legacy Conversations workspace, even if stale local
storage, history, or query state is present.

Every segment transition must satisfy all of these conditions:

- the URL and active tab describe the content that is actually visible;
- refresh restores the same segment and relevant deep-link state;
- browser back and forward preserve segment state;
- no second global navigation is rendered; and
- stale demo state cannot override the selected production segment.

## Ownership Lock

Codex is the sole integration owner for the unified shell and global route
contract. During this program, no parallel agent edits the shell/navigation
boundary without a direct handoff.

| Owner | Allowed scope | Excluded scope |
| --- | --- | --- |
| Codex | Global shell, router, navigation, segment adapters, integration tests, cutover | Rebuilding customer or conversation domain products |
| Cursor | Customer registry, customer view, V12 dossier, patient-master data behavior | Global CCO shell/navigation and Conversations |
| Cloud Code | Conversations content, actions, dialogs, mailbox/read models | Global CCO shell/navigation and Customers |
| Coworker | Plan review, evidence review, coordination | Independent production shell implementation |

The protected integration boundary currently includes:

- `public/admin.html`
- `public/admin.js`
- `public/admin/cco-subnav.js`
- `public/admin/cco-shell.css`
- the global navigation/router region of `public/konversationer.html`
- admin-embed shell overrides in `public/major-arcana-preview/`

Before a customer or conversation phase starts, its owner must provide a branch
or commit, changed-file list, runtime assumptions, tests, and known open work.
Uncommitted or stashed work is not an integration handoff.

## Delivery Sequence

One small draft PR is active at a time. Each phase starts from current `main`
after the previous approved phase is merged.

### PR0 - Architecture lock

- Add this plan to the active CCO index.
- Make no runtime or visual changes.
- Require user approval before PR1 starts.

### PR1 - Shell contract and opt-in candidate

- Establish one shell and one router behind a temporary opt-in flag.
- Add segment mount/unmount and history contracts.
- Keep the current production default unchanged.
- Add tests that detect duplicate global navigation.

### PR2 - Conversations adapter

- Mount the existing live Conversations product as the first content segment.
- Preserve mailbox filters, selected thread, full stored message body, customer
  context, bottom actions, and Bearer-token behavior.
- Prove there is no live Graph fetch when a thread opens.

### PR3 - Conversation actions and dialogs

- Inventory and wire the existing Cloud-built actions and dialogs.
- Preserve booking, notes, macros, calendar, later, notifications, sent,
  dossier, no-show, signatures, and reply workflows.
- Keep all live-send gates unchanged.

### PR4 - Customers adapter

- Integrate the active Cursor customer branch by explicit commit handoff.
- Mount only the live customer registry and V12 dossier content.
- Remove production demo/UAT flags from the route mapping.
- Preserve live counts, patient-master data, and canonical `patientId` links.
- Fail closed rather than showing the legacy Conversations workspace.

### PR5 - Remaining segments

- Mount Calendar, Automation, Analytics, and More as content-only segments.
- Preserve each existing implementation and data contract.
- Remove any nested global navigation exposed by embed mode.

### PR6 - Cross-browser signoff and cutover

- Run the complete preservation and navigation test matrix.
- Capture matching Chrome and Safari screenshots at desktop and mobile widths.
- Obtain explicit user signoff.
- Change the production default only after signoff.

## Acceptance Gates

The unified shell is not ready to cut over unless every item below passes:

- Exactly one global CCO navigation is visible in every segment.
- Exactly one global router controls segment selection and browser history.
- Conversations matches the approved live visual baseline and retains real
  inbox data, full bodies, customer context, and all current actions.
- Customers shows the live registry and V12 dossier, not `Arbetskö`,
  `Fokusyta`, Anna Karlsson sample data, or any legacy conversation surface.
- Production navigation contains no `demo=on` or `demoOpDay=1`.
- `patientId` deep links open the correct live customer and survive refresh.
- Calendar, Automation, Analytics, and More render their existing real content.
- Bearer-token authentication and current API contracts remain unchanged.
- Conversation opening remains local-readmodel based with no live Graph fetch.
- No send gate, owner approval rule, or mailbox policy changes in this program.
- Chrome and Safari agree at desktop and mobile widths.
- Existing focused tests, syntax checks, lint, and CCO smoke checks pass.
- The user approves the final screenshots before production cutover.

## Cutover And Rollback

The candidate shell is introduced behind a temporary opt-in flag. Production
continues to use the current default until the final acceptance gate passes.

Cutover changes only the selected shell/route default. It does not migrate or
rewrite mailbox, conversation, customer, patient-master, or document data.
Rollback therefore restores the previous shell/route selection and does not
require a data rollback.

After a successful production soak, the temporary flag and old routing branch
must be removed in a dedicated cleanup PR. The opt-in path is a controlled
cutover mechanism, not a permanent extra layer.

## Non-Goals

- No new visual design, palette, or product concept.
- No recreation or copying of existing customer or conversation data.
- No new API unless an implementation phase proves a missing contract.
- No redesign of Cloud-built actions or dialogs.
- No Drive internalization work.
- No live-send activation or send-policy change.
- No merge of visual shell work without user screenshot signoff.

## Go/No-Go

PR0 is GO for documentation review only.

PR1 and all runtime implementation are NO-GO until:

1. the user approves this plan;
2. the active Cursor customer branch/commit is identified;
3. the active Cloud conversation branch/commit or `main` baseline is identified;
4. the protected shell ownership lock is acknowledged; and
5. the PASS/FAIL visual baselines are confirmed.
