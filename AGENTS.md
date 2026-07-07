# AGENTS.md

## Working mode

- Always start with ASK MODE for larger tasks.
- Do not jump straight into code for major rewrites.
- Prefer larger coherent passes over many micro-patches.
- Keep changes focused on the stated goal.
- Do not add fluff, placeholder features, or unrelated polish.

## Model and reasoning budget

- Default to cost-aware operation for routine work.
- Treat `GPT-5.4-Mini` with `Medel` reasoning as the standard default for everyday analysis, screenshots, smaller bug fixes, HTML/CSS passes, and narrow implementation work.
- Treat `GPT-5.4` with `Medel` reasoning as the normal upgrade for important CCO code passes that need stronger reliability.
- Use `GPT-5.4` with `Hög` or `Extra hög` reasoning only for architecture work, hard regressions across multiple layers, major refactors, or unusually ambiguous debugging.
- Do not assume the most expensive mode by default.
- For advanced passes, explicitly tell the user at the start of ASK MODE when a model/reasoning upgrade is recommended before substantial work begins.
- Do not ask for an upgrade unless the task complexity materially justifies it.

## Inventory before new build (obligatorisk)

Innan ny feature, ny ORD-handover eller större implementation:

1. Sök **ORD/handover**, **docs/strategy**, **src/**, **public/**, **scripts/**, **verify-scripts**
2. Rapportera kort: **finns hel / delvis / saknas** med filreferens
3. Bygg **endast gapet** — duplicera inte parallell logik som redan finns (även demo, PARTIAL, eller ej deployat)

Se `.cursor/rules/check-before-code.mdc`.

## Preservation rule

- Preserve existing working functionality by default.
- Treat the current `/cco-next` implementation as the baseline from figma.
- Add missing functionality from Figma/link/zip additively.
- Do not remove or rewrite working features.
- If current implementation, Figma, and uploaded files conflict, report the conflict clearly before removing anything.
- Keep `/cco` unchanged unless explicitly requested.

## Working-copy rule (no folder forks)

- NEVER duplicate this repo, or any part of it, into a sibling folder
  (`*-copy`, `*-next`, `*-hydration`, feature-named folders) to do work.
- All work happens on a git branch. Need a parallel checkout? Use
  `git worktree add` — never `cp -r`. If it is not in git, it does not exist.
- Scratch experiments live in `git stash`, a branch, or `/tmp` — never as
  an untracked folder copy in `~/Code`.
- If you encounter an untracked folder copy: STOP. Report it, merge anything
  unique back via branch + PR, then move the folder to `~/Code/_archive/`.

## Completion rule

- Do not return with partial progress for major first-page work.
- For `/cco-next` first-page completion tasks, only return when the defined completion gate is satisfied or a true hard blocker is reached.
- Do not stop at “better”; stop only at “coherent, clickable, stable, and fully usable as an internal alpha surface”.

## For this project

- This repo is the source of truth for the new CCO-next app.
- For CCO inbox/mail work, read `docs/cco-active-index.md` and `docs/cco-mail-foundation-status.md` before planning; the status doc carries the current source map, OOM/#650 baseline, and locked drift rules.
- Ignore Arcana wrapper/integration unless explicitly requested.
- Prioritize:
  - information architecture
  - workflow
  - queue logic
  - operator support
  - stable layout
  - complete first-page work surface
- Design polish is secondary unless explicitly requested.

## Output format

For ASK MODE always return:

- Scope
- Proposed plan
- Files to change
- Risks
- GO / NO_GO

For CODE MODE always return:

- Scope implemented
- Files changed
- What improved
- What remains incomplete
- Validation results

## Validation

After code changes always run:

- `npm run check:syntax`
- `npm run lint:no-bypass`
- `npm run test:unit`
- `ARCANA_AI_PROVIDER=fallback ARCANA_GRAPH_READ_ENABLED=false ARCANA_GRAPH_SEND_ENABLED=false npm run smoke:local`

### Prod-verify before user test (mandatory)

- Never ask the user to test on prod, mobile, or real inbox until you have verified yourself (`npm run verify:*-prod`, Playwright iPhone viewport, `/readyz`, etc.).
- Report your own PASS/FAIL results first; only then optionally ask the user to confirm on a physical device if automation cannot cover it.
- See `.cursor/rules/prod-verify-before-user.mdc`.

## Screenshots

- After every completed task with a visual or UI result, always capture and share at least one current screenshot of the relevant state before closing the task.
- If a task has no visual surface, say that explicitly instead of forcing a screenshot.

# Arcana UI Rules

## CCO Fidelity

- Whitespace is a first-class requirement.
- Do not reduce gaps, padding, row heights, or section spacing to make content fit.
- Use shared design tokens for spacing, typography, radius, elevation, borders, and opacity.
- Do not invent arbitrary visual values outside the active token set.
- Prefer placeholder text, truncation, or wrapping before changing layout geometry.
- Match reference-driven work primarily by layout structure, spacing rhythm, surface depth, and component proportions, not by literal copy.
- Keep the implementation reusable and component-based.
- Follow the existing repo stack and conventions.
- For CCO shell work, keep one shared source of truth for visual tokens and consume those tokens consistently across components.

## CCO Delivery

- Create reusable components instead of one-off structures.
- Keep shared tokens in a dedicated token file and reuse them across the shell.
- Use placeholder content when needed instead of compressing layout geometry.
- Run build and lint-equivalent verification scripts when they exist in the repo.
- After implementation, report which files changed, where the tokens live, and how spacing, shadows, and opacity are enforced.

## CCO Major Arcana Overlay Spec

- Use `FärgpalettMajorArcana.PNG` and the attached inspiration images as the visual direction.
- Keep the existing live CCO layout and functionality as the base. Apply the new Major Arcana design language as an overlay. Do not replace the current CCO structure with the inspiration shell.
- Do not optimize for density. Optimize for spacing fidelity.
- Whitespace is a required part of the layout.
- Fail the task if inter-panel gaps, internal paddings, heading scale, shadow depth, and button opacity are not implemented exactly from the token spec.
- Build the UI shell through reusable styles and shared tokens, not one-off overrides.

### Major Arcana Goals

- Recreate the structural rhythm and premium soft-skeuomorphic depth of the references.
- Do not focus on literal copy.
- Preserve empty space even when content is short.
- Use truncation or wrapping before changing geometry.

### Major Arcana Priority Order

1. Overall layout geometry
2. Inter-panel spacing and internal padding
3. Typography hierarchy
4. Surface depth, shadow, bevel, and opacity
5. Radius and shape language
6. Placeholder content

### Major Arcana Tokens

#### Spacing scale

- `4px`
- `8px`
- `12px`
- `16px`
- `20px`
- `24px`
- `32px`
- `40px`
- `48px`

#### Layout tokens

- page outer padding: `32px`
- topbar height: `64px`
- gap below topbar to main content: `24px`
- gap between major panels/cards horizontally: `24px`
- gap between stacked right-side cards vertically: `24px`
- standard panel internal padding: `24px`
- secondary card internal padding: `16px`

#### Typography tokens

- panel title: `28px / 1.15 / 700`
- section heading: `22px / 1.2 / 650`
- primary row label: `18px / 1.25 / 550`
- metadata label: `15px / 1.3 / 500`
- body paragraph: `16px / 1.45 / 400`
- button label: `16px / 1.0 / 600`
- badge number: `20px / 1.0 / 700`
- month label: `24px / 1.0 / 700 / uppercase`
- small utility label: `14px / 1.2 / 500`

#### Radius tokens

- large panel radius: `20px`
- medium card/input radius: `14px`
- button radius: `14px`
- small chip radius: `12px`
- checkbox radius: `5px`
- circular badges: `999px`

#### Surface tokens

- page background: warm light neutral
- major panel background: `rgba(250, 246, 242, 0.92)`
- nested card background: `rgba(252, 248, 244, 0.90)`
- neutral input/chip background: `rgba(255, 255, 255, 0.82)`
- divider/border line: `rgba(120, 105, 90, 0.16)`
- inactive icon/text tint: `rgba(70, 60, 50, 0.55)`

#### Shadow and elevation tokens

- panel shadow:
  - `0 8px 24px rgba(70, 50, 30, 0.08)`
  - `0 2px 6px rgba(70, 50, 30, 0.05)`
- panel inner highlight:
  - `inset 0 1px 0 rgba(255,255,255,0.55)`
- elevated control shadow:
  - `0 4px 10px rgba(45, 28, 18, 0.20)`
  - `inset 0 1px 0 rgba(255,255,255,0.30)`
  - `inset 0 -2px 0 rgba(0,0,0,0.14)`
- selected row shadow:
  - `0 6px 14px rgba(35, 22, 15, 0.18)`
  - `inset 0 1px 0 rgba(255,255,255,0.18)`

#### Button opacity and fill rules

- dark glossy buttons are not fully opaque flat brown blocks
- top gradient tone alpha: `0.94`
- bottom gradient tone alpha: `0.98`
- default button text: high-contrast light text
- disabled or inactive button alpha: `0.45` to `0.55`
- neutral secondary chips: `0.80` to `0.84` alpha
- inactive utility icons: `0.50` to `0.60` alpha

### Major Arcana Shape Language

- outer panels: soft rounded rectangles
- smaller controls: medium rounded rectangles
- action buttons: more beveled and glossy than panels
- numeric badges: perfect circles with visible top highlight
- checkbox: small rounded square, not a hard square
- icons: thin monoline style with consistent stroke

### Major Arcana Text Rules

- Preserve clear hierarchy between panel titles, section titles, row labels, metadata, and paragraph text.
- Paragraph text must not visually merge with metadata.
- Use paragraph line-height `1.45`.
- Keep `16px` to `20px` vertical rhythm between text blocks.
- Do not use one generic font size for all labels.
- Headings must feel distinctly larger than row labels.
- Buttons must not use the same text style as body copy.

### Major Arcana Non-Negotiables

- Inter-panel gap must remain `24px`.
- Standard panel padding must remain `24px`.
- Do not collapse whitespace.
- Do not shrink row heights.
- Do not flatten shadows.
- Do not make buttons fully opaque flat rectangles.
- Do not use pure white surfaces.
- Do not let content density override the spacing system.
- Preserve a premium soft-skeuomorphic or neumorphic depth language.
- Focus on geometry and spacing more than literal content.

### Major Arcana Delivery Rules

- Create reusable components.
- Create a shared token file.
- Use the token file consistently across all components.
- Avoid arbitrary one-off values.
- Run build and lint after implementation if those scripts exist.

## CCO Mail-Client Skeleton Lock

- Use the latest user shell spec as the active source of truth for CCO shell work.
- Do not eliminate points from the latest point list.
- Treat CCO as a desktop mail client first: left navigation, center message list, right read/reply workspace.
- Keep CCO intelligence on top of that structure, never ahead of it.
- At rest, the user should perceive at most three structural levels: page background, three main surfaces, and content elements.
- Reduce frame layering aggressively. If a frame does not add understanding, remove it.
- Make spacing, typography, shadow depth, opacity, border softness, and radius primary acceptance criteria.
- Do not solve shell problems by shrinking text. Rebalance proportions instead.
- Semantic colors must stay visible and must not be washed into the neutral palette.

## CCO Shell Delivery Addendum

- Build the shell through one shared token source and reusable selectors/components.
- Remove conflicting legacy overlays before layering new shell rules.
- Preserve placeholder-first geometry during shell passes; do not compress whitespace to fit real content.
- After shell implementation, verify: top shell, left sidebar, center list, right read-only, right work mode.
- Report explicitly: what was removed, what was compressed, what gained space, what became primary, what became secondary, and how many visible frame layers remain.

## Cursor Cloud specific instructions

### Environment overview

Arcana is a Node.js (>=20 <23) + Express 5 monolithic server. No Docker, no database server, no build step needed for development. All state persists in JSON files under `./data/`.

### Running the dev server

- Offline mode (no AI cost, no external services): `npm run dev:offline` (port 3100)
- Full mode: `npm run dev` (port 3000, requires `OPENAI_API_KEY` for AI features)
- The `.env` file is required. For offline/CI use, the minimum is:
  ```
  ARCANA_AI_PROVIDER=fallback
  ARCANA_DEFAULT_TENANT=hair-tp-clinic
  ARCANA_OWNER_EMAIL=owner@hairtpclinic.se
  ARCANA_OWNER_PASSWORD=ArcanaPilot!2026
  PORT=3000
  PUBLIC_BASE_URL=http://localhost:3000
  ARCANA_GRAPH_READ_ENABLED=false
  ARCANA_GRAPH_SEND_ENABLED=false
  ```

### Validation commands (run after every code change)

See `## Validation` section above. The four commands are:

1. `npm run check:syntax`
2. `npm run lint:no-bypass`
3. `npm run test:unit`
4. `ARCANA_AI_PROVIDER=fallback ARCANA_GRAPH_READ_ENABLED=false ARCANA_GRAPH_SEND_ENABLED=false npm run smoke:local`

### Key URLs when running locally

- Patient chat: `http://localhost:3100/` (offline) or `http://localhost:3000/`
- CCO operator dashboard: `http://localhost:3100/major-arcana-preview/`
- Admin panel: `http://localhost:3100/admin`
- Health check: `GET /healthz`, readiness: `GET /readyz`

### Legal & compliance rule

- All legal documents in `docs/legal/` are **reviewed and approved by legal counsel** before being committed to the repo.
- Never flag committed legal documents as "drafts needing review" — if they are in the repo, they are approved.
- This applies to: DPA, Art. 30, PUB (integritetspolicy), PDL-bedömning, ISO/SOC2, and all other legal/compliance artifacts.

### Gotchas

- The smoke test (`npm run smoke:local`) starts its own server on port 3100, runs tests, then shuts down. Do not run it while `dev:offline` is already using port 3100.
- Unit tests have 61 pre-existing failures (agent gateway, auth, and UI test assertions); these are not regressions from setup.
- Husky is configured for pre-commit (`lint-staged`) and commit-msg (`commitlint` with conventional commits). Ensure commit messages follow conventional commit format.
- The `check:syntax` command uses `find` + `node --check` across `./src`, `./scripts`, and `./public` (excluding `cco-next-release`).
- `lint:no-bypass` checks for forbidden store imports in routes/capabilities and ensures no staged changes in the legacy CCO-next base.
- The mobile shell breakpoint is `max-width: 1023px` (covering phones + tablets). Desktop layout starts at `≥1024px`. The `MQ` constant in both `cco-mobile-shell.js` and `cco-mobile-core.js` must stay in sync.
- Frontend files under `public/major-arcana-preview/cco-mobile-*.js` have a dedicated eslint config entry with `globals.browser`.
