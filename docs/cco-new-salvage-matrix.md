# CCO New Salvage Matrix

## Purpose

This document exists to prevent any loss of functionality while moving the CCO work onto the **new CCO UI base**.

It is a no-loss migration map, not a redesign brief.

## Non-negotiables

- The **only** correct UI base for the new CCO is:
  - `/Users/fazlikrasniqi/Desktop/Arcana/public/major-arcana-preview/index.html`
  - `/Users/fazlikrasniqi/Desktop/Arcana/public/major-arcana-preview/styles.css`
  - `/Users/fazlikrasniqi/Desktop/Arcana/public/major-arcana-preview/app.js`
- The old `/cco-next` React app is **not** the target UI.
- The old `/cco-next` React app is a **function source only**:
  - `/Users/fazlikrasniqi/Desktop/Arcana/vendor/cconext-upstream/src/app`
- No functionality already built may be silently dropped.
- No area is considered migrated until its no-loss gate is satisfied.
- Backend, store, runtime, and action logic are salvageable.
- Old page composition and old shell structure are not the forward UI source.

## Source Types

### A. Correct target UI base

- `/Users/fazlikrasniqi/Desktop/Arcana/public/major-arcana-preview/index.html`
- `/Users/fazlikrasniqi/Desktop/Arcana/public/major-arcana-preview/styles.css`
- `/Users/fazlikrasniqi/Desktop/Arcana/public/major-arcana-preview/app.js`

These files already contain the new shell structure and entry points for:

- Conversations
- Customers
- Automation
- Analytics
- More
- Later
- Sent
- Integrations
- Macros
- Settings
- Showcase
- Studio
- Notes
- Follow-up
- Customer merge/settings

### B. Reusable backend and store work

These are the primary salvage candidates and should be reused directly where possible:

- `/Users/fazlikrasniqi/Desktop/Arcana/src/routes/ccoWorkspace.js`
- `/Users/fazlikrasniqi/Desktop/Arcana/src/routes/ccoIntegrations.js`
- `/Users/fazlikrasniqi/Desktop/Arcana/src/routes/ccoMacros.js`
- `/Users/fazlikrasniqi/Desktop/Arcana/src/routes/ccoSettings.js`
- `/Users/fazlikrasniqi/Desktop/Arcana/src/ops/ccoFollowUpStore.js`
- `/Users/fazlikrasniqi/Desktop/Arcana/src/ops/ccoHistoryStore.js`
- `/Users/fazlikrasniqi/Desktop/Arcana/src/ops/ccoIntegrationStore.js`
- `/Users/fazlikrasniqi/Desktop/Arcana/src/ops/ccoMacroStore.js`
- `/Users/fazlikrasniqi/Desktop/Arcana/src/ops/ccoNoteStore.js`
- `/Users/fazlikrasniqi/Desktop/Arcana/src/ops/ccoSettingsStore.js`
- `/Users/fazlikrasniqi/Desktop/Arcana/src/ops/ccoShadowRun.js`
- `/Users/fazlikrasniqi/Desktop/Arcana/src/ops/ccoWorkspacePrefsStore.js`

### C. Logic/reference source, but wrong UI base

These are behavior references only. Do not keep building the new UI on them:

- `/Users/fazlikrasniqi/Desktop/Arcana/vendor/cconext-upstream/src/app/routes.tsx`
- `/Users/fazlikrasniqi/Desktop/Arcana/vendor/cconext-upstream/src/app/layouts/main-layout.tsx`
- `/Users/fazlikrasniqi/Desktop/Arcana/vendor/cconext-upstream/src/app/context/cco-next-runtime-context.tsx`
- `/Users/fazlikrasniqi/Desktop/Arcana/vendor/cconext-upstream/src/app/context/mailbox-context.tsx`
- `/Users/fazlikrasniqi/Desktop/Arcana/vendor/cconext-upstream/src/app/hooks/use-cco-next-runtime.ts`
- `/Users/fazlikrasniqi/Desktop/Arcana/vendor/cconext-upstream/src/app/pages`
- `/Users/fazlikrasniqi/Desktop/Arcana/vendor/cconext-upstream/src/app/components`
- `/Users/fazlikrasniqi/Desktop/Arcana/public/cco-next-release`

## Forbidden continuation paths

Do not continue the migration by extending these as the UI destination:

- `/Users/fazlikrasniqi/Desktop/Arcana/vendor/cconext-upstream/src/app/pages/inbox-page-final.tsx`
- `/Users/fazlikrasniqi/Desktop/Arcana/vendor/cconext-upstream/src/app/pages/later-page.tsx`
- `/Users/fazlikrasniqi/Desktop/Arcana/vendor/cconext-upstream/src/app/pages/sent-page.tsx`
- `/Users/fazlikrasniqi/Desktop/Arcana/vendor/cconext-upstream/src/app/pages/analytics-page.tsx`
- `/Users/fazlikrasniqi/Desktop/Arcana/vendor/cconext-upstream/src/app/pages/integrations-page.tsx`
- `/Users/fazlikrasniqi/Desktop/Arcana/vendor/cconext-upstream/src/app/pages/macros-page.tsx`
- `/Users/fazlikrasniqi/Desktop/Arcana/vendor/cconext-upstream/src/app/pages/settings-page.tsx`
- `/Users/fazlikrasniqi/Desktop/Arcana/vendor/cconext-upstream/src/app/pages/showcase-page.tsx`
- `/Users/fazlikrasniqi/Desktop/Arcana/vendor/cconext-upstream/src/app/pages/template-studio-page.tsx`
- `/Users/fazlikrasniqi/Desktop/Arcana/vendor/cconext-upstream/src/app/pages/workflow-builder-page.tsx`

These files may still be mined for logic and behavior references.

## Migration method

Each migration area must be handled in this order:

1. Backend and store reuse
2. Runtime and action wiring
3. UI wiring into the new CCO shell
4. Empty, loading, and error states
5. Verification against old behavior

## Global no-loss gate

No area is complete until all of these are true in the new CCO:

- All intended entry points exist
- All relevant buttons work
- All tabs or panels work
- All modals or dialogs open and save correctly
- Runtime state is connected
- Mailbox scope is correct
- Queue/filter effects are correct where applicable
- Empty state exists
- Loading state exists
- Error state exists
- There is a direct test path on a local URL

## 13 migration areas

### 1. Runtime / auth / reauth / Graph / Comms

**Target in new CCO**

- Top-level conversation shell in:
  - `/Users/fazlikrasniqi/Desktop/Arcana/public/major-arcana-preview/app.js`
- Search, sprint pill, top utility controls, and conversation workspace shell

**Reuse directly**

- `/Users/fazlikrasniqi/Desktop/Arcana/vendor/cconext-upstream/src/app/hooks/use-cco-next-runtime.ts`
- `/Users/fazlikrasniqi/Desktop/Arcana/vendor/cconext-upstream/src/app/context/cco-next-runtime-context.tsx`

**Behavior reference only**

- `/Users/fazlikrasniqi/Desktop/Arcana/vendor/cconext-upstream/src/app/pages/inbox-page-final.tsx`
- `/Users/fazlikrasniqi/Desktop/Arcana/vendor/cconext-upstream/src/app/layouts/main-layout.tsx`

**Must not be missed**

- auth
- reauth
- Graph read/send status
- Comms gating
- live threads
- live mailboxes
- send enabled / delete enabled
- default sender mailbox
- default signature profile
- offline state

**No-loss gate**

- New CCO can render live state and offline state
- Reauth path is reachable
- Mailbox and thread data are not hardcoded
- Search and focus shell use live runtime rather than preview-only seed state

### 2. Mailbox selection / multi-mailbox / custom mailboxes

**Target in new CCO**

- Mailbox selectors and owner filters in conversation shell
- Mailbox references in history and customer history

**Reuse directly**

- `/Users/fazlikrasniqi/Desktop/Arcana/vendor/cconext-upstream/src/app/context/mailbox-context.tsx`
- runtime mailbox handling from `/Users/fazlikrasniqi/Desktop/Arcana/vendor/cconext-upstream/src/app/hooks/use-cco-next-runtime.ts`

**Behavior reference only**

- `/Users/fazlikrasniqi/Desktop/Arcana/vendor/cconext-upstream/src/app/components/mailbox-dropdown.tsx`
- `/Users/fazlikrasniqi/Desktop/Arcana/vendor/cconext-upstream/src/app/components/add-mailbox-modal.tsx`
- `/Users/fazlikrasniqi/Desktop/Arcana/vendor/cconext-upstream/src/app/components/add-mailbox-modal-advanced.tsx`

**Must not be missed**

- runtime-generated mailboxes
- multi-mailbox selection
- custom mailbox addition
- mailbox filtering impact on list, history, and customer history

**No-loss gate**

- New CCO mailbox controls reflect real runtime mailboxes
- Mailbox selection changes queue contents
- Mailbox selection changes history scopes
- Custom mailbox flows still exist

### 3. Queue logic / worklist

**Target in new CCO**

- Left worklist column in conversation shell
- Queue chips, lane stacks, counts, and operator action row

**Reuse directly**

- queue state patterns from `/Users/fazlikrasniqi/Desktop/Arcana/vendor/cconext-upstream/src/app/context/cco-next-runtime-context.tsx`

**Behavior reference only**

- `/Users/fazlikrasniqi/Desktop/Arcana/vendor/cconext-upstream/src/app/components/simplified-worklist-panel.tsx`
- `/Users/fazlikrasniqi/Desktop/Arcana/vendor/cconext-upstream/src/app/components/worklist-panel.tsx`
- `/Users/fazlikrasniqi/Desktop/Arcana/vendor/cconext-upstream/src/app/components/toggleable-filter-pills.tsx`

**Must not be missed**

- lane categories
- counts
- active filters
- selection logic
- drag/reorder behavior
- mailbox-scope impact

**No-loss gate**

- New CCO queue shows correct counts
- Queue filters affect actual visible threads
- Lane order state is preserved
- Queue empty states and filtered-empty states are separate

### 4. History / customer history

**Target in new CCO**

- Focus tabs:
  - Conversation
  - Customer history
  - History
  - Notes
- Customer intelligence history jump

**Reuse directly**

- `/Users/fazlikrasniqi/Desktop/Arcana/src/ops/ccoHistoryStore.js`
- relevant runtime/history logic from `/Users/fazlikrasniqi/Desktop/Arcana/vendor/cconext-upstream/src/app/hooks/use-cco-next-runtime.ts`

**Behavior reference only**

- `/Users/fazlikrasniqi/Desktop/Arcana/vendor/cconext-upstream/src/app/components/conversation-focus-panel.tsx`
- `/Users/fazlikrasniqi/Desktop/Arcana/vendor/cconext-upstream/src/app/components/customer-intelligence-panel.tsx`

**Must not be missed**

- History = thread/conversation scope
- Customer history = customer across mailboxes
- search
- mailbox filter
- type filter
- date/time filters
- customer intelligence history button as smart entry into same system

**No-loss gate**

- New CCO preserves the distinction between history and customer history
- History uses current thread scope
- Customer history uses customer + mailbox scope
- History jump from customer intelligence does not open a third separate system

### 5. Response Studio

**Target in new CCO**

- Studio shell
- Focus actions:
  - Reply now
  - Reply later
  - Mark done
  - Schedule follow-up
  - Open history

**Reuse directly**

- runtime action logic from `/Users/fazlikrasniqi/Desktop/Arcana/vendor/cconext-upstream/src/app/hooks/use-cco-next-runtime.ts`

**Behavior reference only**

- `/Users/fazlikrasniqi/Desktop/Arcana/vendor/cconext-upstream/src/app/components/response-studio-ultra.tsx`
- `/Users/fazlikrasniqi/Desktop/Arcana/vendor/cconext-upstream/src/app/components/response-studio.tsx`
- `/Users/fazlikrasniqi/Desktop/Arcana/vendor/cconext-upstream/src/app/components/response-studio-modal.tsx`
- `/Users/fazlikrasniqi/Desktop/Arcana/vendor/cconext-upstream/src/app/components/response-studio-drawer.tsx`
- `/Users/fazlikrasniqi/Desktop/Arcana/vendor/cconext-upstream/src/app/components/signature-editor-modal.tsx`

**Must not be missed**

- send
- save draft
- delete
- signature management
- templates
- preview mode
- rewrite / regenerate
- reply later
- mark handled

**No-loss gate**

- New CCO studio opens from all expected entry points
- Studio uses live thread and mailbox scope
- Sending, saving, deleting, and signature selection work
- Rewrite/regenerate does not silently disappear

### 6. Customer intelligence

**Target in new CCO**

- Right intelligence column
- Tabs:
  - Overview
  - AI
  - Medicine
  - Team
  - Actions

**Reuse directly**

- runtime data composition from `/Users/fazlikrasniqi/Desktop/Arcana/vendor/cconext-upstream/src/app/hooks/use-cco-next-runtime.ts`

**Behavior reference only**

- `/Users/fazlikrasniqi/Desktop/Arcana/vendor/cconext-upstream/src/app/components/customer-intelligence-panel.tsx`
- `/Users/fazlikrasniqi/Desktop/Arcana/vendor/cconext-upstream/src/app/components/customer-intelligence-sidebar.tsx`
- `/Users/fazlikrasniqi/Desktop/Arcana/vendor/cconext-upstream/src/app/components/customer-intelligence-sidebar-optimized.tsx`
- `/Users/fazlikrasniqi/Desktop/Arcana/vendor/cconext-upstream/src/app/components/customer-journey-timeline.tsx`

**Must not be missed**

- overview readouts
- AI recommendations
- medicine/treatment context
- team/handoff signals
- actions and next-step logic

**No-loss gate**

- New CCO tabs use live customer + conversation context
- No tab is just decorative
- AI and team cards still have action value, not just copy

### 7. Notes + follow-up

**Target in new CCO**

- Notes shell
- Follow-up shell
- Focus actions and customer intelligence actions that open them

**Reuse directly**

- `/Users/fazlikrasniqi/Desktop/Arcana/src/routes/ccoWorkspace.js`
- `/Users/fazlikrasniqi/Desktop/Arcana/src/ops/ccoNoteStore.js`
- `/Users/fazlikrasniqi/Desktop/Arcana/src/ops/ccoFollowUpStore.js`
- `/Users/fazlikrasniqi/Desktop/Arcana/src/ops/ccoWorkspacePrefsStore.js`

**Behavior reference only**

- `/Users/fazlikrasniqi/Desktop/Arcana/vendor/cconext-upstream/src/app/components/notes-dialog.tsx`
- `/Users/fazlikrasniqi/Desktop/Arcana/vendor/cconext-upstream/src/app/components/schedule-followup-dialog.tsx`
- `/Users/fazlikrasniqi/Desktop/Arcana/vendor/cconext-upstream/src/app/components/notes-viewer-panel.tsx`

**Must not be missed**

- note categories
- templates
- smart context
- note visibility
- correct customer + conversation linkage
- follow-up date/time
- doctor/category
- reminder
- note text
- suggestions
- persistence

**No-loss gate**

- Notes save and load in the new CCO
- Follow-up scheduling updates the current conversation state
- Notes/follow-up keep customer and conversation linkage

### 8. Calibration + shadow review

**Target in new CCO**

- Customer intelligence action chips:
  - Calibration
  - Shadow review

**Reuse directly**

- `/Users/fazlikrasniqi/Desktop/Arcana/src/ops/ccoShadowRun.js`

**Behavior reference only**

- `/Users/fazlikrasniqi/Desktop/Arcana/vendor/cconext-upstream/src/app/components/customer-intelligence-panel.tsx`

**Must not be missed**

- correct readout URLs
- customer email
- conversation id
- mailbox ids
- mailbox fallback logic

**No-loss gate**

- New CCO opens calibration and shadow review with correct scoped params
- Missing history mailbox options do not break the action

### 9. Later + sent

**Target in new CCO**

- Later view
- Sent view
- Entry points from queue and studio

**Reuse directly**

- runtime list data handling from `/Users/fazlikrasniqi/Desktop/Arcana/vendor/cconext-upstream/src/app/hooks/use-cco-next-runtime.ts`

**Behavior reference only**

- `/Users/fazlikrasniqi/Desktop/Arcana/vendor/cconext-upstream/src/app/components/progressive-message-list.tsx`
- `/Users/fazlikrasniqi/Desktop/Arcana/vendor/cconext-upstream/src/app/components/progressive-message-item.tsx`
- `/Users/fazlikrasniqi/Desktop/Arcana/vendor/cconext-upstream/src/app/components/multi-select-toolbar.tsx`
- `/Users/fazlikrasniqi/Desktop/Arcana/vendor/cconext-upstream/src/app/components/follow-up-filter.tsx`

**Must not be missed**

- real Later list
- real Sent list
- multi-select
- density/view modes
- filters
- mailbox context
- row metadata
- actions on selection

**No-loss gate**

- Later and Sent are not thin demo feeds
- Mailbox selection affects both
- Multi-select works
- Selecting a row can still drive shared conversation context where intended

### 10. Customers

**Target in new CCO**

- Customers view
- Merge shell
- Customer settings shell

**Reuse directly**

- customer-related backend that already exists in app routes/services

**Behavior reference only**

- `/Users/fazlikrasniqi/Desktop/Arcana/vendor/cconext-upstream/src/app/components/customer-identity-page.tsx`
- `/Users/fazlikrasniqi/Desktop/Arcana/vendor/cconext-upstream/src/app/components/customer-identity-manager.tsx`
- `/Users/fazlikrasniqi/Desktop/Arcana/vendor/cconext-upstream/src/app/components/contact-merge-modal.tsx`
- `/Users/fazlikrasniqi/Desktop/Arcana/vendor/cconext-upstream/src/app/components/bulk-merge-panel.tsx`

**Must not be missed**

- merge
- bulk merge
- split contact
- set primary email
- import
- export
- customer settings

**No-loss gate**

- New CCO can perform merge/split/primary-email actions
- Deep identity operations live in modal or secondary flow, not lost
- Import/export entry points still exist

### 11. Analytics

**Target in new CCO**

- Analytics view and period controls already present in new shell

**Reuse directly**

- existing analytics-related routes:
  - `/Users/fazlikrasniqi/Desktop/Arcana/src/routes/reports.js`
  - `/Users/fazlikrasniqi/Desktop/Arcana/src/routes/mailInsights.js`
  - `/Users/fazlikrasniqi/Desktop/Arcana/src/ops/runtimeMetrics.js`

**Behavior reference only**

- `/Users/fazlikrasniqi/Desktop/Arcana/vendor/cconext-upstream/src/app/pages/analytics-page.tsx`

**Must not be missed**

- KPI cards
- runtime-linked telemetry
- mailbox-aware metrics where applicable
- period switching

**No-loss gate**

- New CCO analytics uses real data paths
- There is not a split between live top cards and dead lower sections

### 12. Integrations

**Target in new CCO**

- Integrations view and catalog

**Reuse directly**

- `/Users/fazlikrasniqi/Desktop/Arcana/src/routes/ccoIntegrations.js`
- `/Users/fazlikrasniqi/Desktop/Arcana/src/ops/ccoIntegrationStore.js`

**Behavior reference only**

- `/Users/fazlikrasniqi/Desktop/Arcana/vendor/cconext-upstream/src/app/pages/integrations-page.tsx`

**Must not be missed**

- connected/disconnected state
- connect
- disconnect
- docs
- contact sales
- updated timestamps
- pending state

**No-loss gate**

- New CCO integrations reflect backend state
- Connect/disconnect is not local-only
- Docs and contact-sales still work

### 13. Macros / settings / showcase

**Target in new CCO**

- Macros view
- Settings view
- Showcase view
- Existing automation shell in new CCO must also be included in this bucket, even though it was not split out as its own numbered area

**Reuse directly**

- `/Users/fazlikrasniqi/Desktop/Arcana/src/routes/ccoMacros.js`
- `/Users/fazlikrasniqi/Desktop/Arcana/src/routes/ccoSettings.js`
- `/Users/fazlikrasniqi/Desktop/Arcana/src/ops/ccoMacroStore.js`
- `/Users/fazlikrasniqi/Desktop/Arcana/src/ops/ccoSettingsStore.js`

**Behavior reference only**

- `/Users/fazlikrasniqi/Desktop/Arcana/vendor/cconext-upstream/src/app/components/macro-builder.tsx`
- `/Users/fazlikrasniqi/Desktop/Arcana/vendor/cconext-upstream/src/app/pages/settings-page.tsx`
- `/Users/fazlikrasniqi/Desktop/Arcana/vendor/cconext-upstream/src/app/pages/showcase-page.tsx`
- `/Users/fazlikrasniqi/Desktop/Arcana/vendor/cconext-upstream/src/app/pages/workflow-builder-page.tsx`
- `/Users/fazlikrasniqi/Desktop/Arcana/vendor/cconext-upstream/src/app/pages/template-studio-page.tsx`

**Must not be missed**

- macro CRUD
- macro run
- run count / last run
- settings persistence
- profile/security/settings toggles
- showcase feature navigation
- automation subviews and builder/template companions already represented in new shell

**No-loss gate**

- New CCO macros persist and run
- New CCO settings persist
- Showcase routes to real live destinations where applicable
- Automation shell is not left as a dead shell

## Cross-cutting checks that apply to every area

- The new CCO must preserve spacing and layout geometry from the frozen target base
- Do not import old `/cco-next` shell layout into the new base
- Prefer lifting action logic, stores, and fetch flows
- Do not reintroduce old navigation structure just because it already exists in vendor
- Every migrated action must be tested from the new CCO URL, not the old one

## Recommended implementation order

1. Runtime / auth / Comms / Graph
2. Mailboxes
3. Queue
4. History / customer history
5. Response Studio
6. Customer intelligence
7. Notes / follow-up
8. Calibration / shadow review
9. Later / Sent
10. Customers
11. Analytics
12. Integrations
13. Macros / Settings / Showcase

## Stop rule

If any of these happen during migration, stop and reconcile before continuing:

- A function exists only in old `/cco-next` and has no mapped destination in the new CCO
- A route in the new CCO has no runtime or backend path behind it
- An action exists in both UIs but with conflicting behavior
- A shell in the new CCO cannot host the required behavior without structural conflict

## Definition of success

The migration is successful only when:

- `/Users/fazlikrasniqi/Desktop/Arcana/public/major-arcana-preview` is the real CCO UI base
- all required functionality is reachable from the new CCO
- old `/cco-next` is no longer the active place where new UI work is happening
- nothing from the 13 areas has been silently dropped
