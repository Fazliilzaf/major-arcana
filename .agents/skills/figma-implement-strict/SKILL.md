---
name: figma-implement-strict
description: Use this skill for design-to-code work from Figma Make or Figma Design when implementation must be careful, explicit, and low-guessing. Use it for strict UI implementation, fidelity audits, repo mapping, and Figma-to-code tasks. Do not use it for generic coding tasks without Figma context.
---

# Figma Implement Strict

This skill enforces a strict workflow for Figma-driven implementation in a production codebase.

## Goal
Implement UI from Figma with minimal guessing and an explicit distinction between:
- Make-derived implementation context
- Design-derived visual fidelity

## Operating modes
Determine exactly one mode before doing any coding:

### `MAKE_ONLY`
Use when only a Figma Make URL is available.

What this mode is for:
- understanding app structure
- understanding page/component decomposition
- extracting copy/assets from linked resources
- using Make-generated implementation context as a scaffold

What this mode is NOT for:
- screenshot-grounded visual signoff
- exact spacing/geometry claims
- exact token extraction
- pixel-perfect fidelity claims

### `DESIGN_ONLY`
Use when a Figma Design selection URL with `node-id` is available.

What this mode is for:
- strict visual implementation
- screenshot-based fidelity
- variable/token extraction
- frame/node-accurate inspection

### `COMBINED`
Use when both a Make URL and a Design selection URL are available.

What this mode is for:
- Design as visual truth
- Make as behavior/source scaffold
- highest-confidence implementation

## Ask Mode behavior
In Ask Mode:
- do not write code
- identify source mode
- list which MCP tools were called
- list what is confirmed
- list what is inferred
- list what is missing or blocked
- produce the smallest implementation plan
- map likely repo files/components to reuse
- say whether the task is:
  - `GO`
  - `NO_GO`
- if `NO_GO`, state the minimum missing input

## Code Mode behavior
In Code Mode:
- only implement after producing an Ask Mode plan
- keep the diff minimal
- reuse existing components first
- report all assumptions instead of hiding them

## Required tool workflow

### If mode = MAKE_ONLY
1. Call `get_design_context` on the Make URL.
2. Read the returned resource links.
3. Open the app entry file and then the most relevant page/layout/component resources.
4. Build a context map:
   - app entrypoint
   - relevant page(s)
   - layout(s)
   - component tree
   - assets
   - visible copy
   - likely behavior
5. If the returned context is truncated:
   - do not trust the truncated summary alone
   - inspect linked resources directly
6. Before coding, produce:
   - confirmed facts from resources
   - inferred facts
   - blocked facts
7. If the user asks for exact visual fidelity:
   - mark fidelity as blocked
   - request or recommend a Design selection URL
8. After identifying `MAKE_ONLY`, continue the audit immediately by opening the linked Make resources.
9. Do not stop after summarizing the top-level MCP response if linked resources are available.
10. In Ask Mode, inspect enough linked resources to identify:
   - the entrypoint
   - the relevant page
   - the layout
   - the directly related components
   - the visible copy
   - the assets
   - the likely interaction logic
11. Prefer file-backed conclusions over generic summaries.

### If mode = DESIGN_ONLY
1. Require a Design selection URL with `node-id`.
2. Call:
   - `get_design_context`
   - `get_screenshot`
   - `get_variable_defs`
   - `get_code_connect_map` when available
3. If the context is too large:
   - call `get_metadata`
   - fetch child nodes individually
4. Build a checklist of:
   - layout/hierarchy
   - spacing
   - typography
   - colors
   - borders/radii/shadows
   - assets
   - visible states
   - accessibility-sensitive elements
5. Use the screenshot and context as the visual truth.

### If mode = COMBINED
1. Run the DESIGN_ONLY workflow.
2. Run the MAKE_ONLY workflow.
3. Merge them with this rule:
   - Design wins for visuals
   - Make informs behavior and implementation structure
4. If they disagree:
   - prefer Design for UI appearance
   - report the disagreement explicitly

## Repo reuse rules
Before creating new code:
- search for existing UI components
- search for feature-specific components
- prefer Code Connect mapped components
- prefer existing route and layout patterns
- prefer existing design tokens and semantic variants

## Styling rules
- do not hardcode hex values if tokens exist
- do not hardcode spacing, typography, radii, or shadows if tokens exist
- if a needed token is missing, use the nearest valid project token and report it

## Asset rules
- use real assets from Figma/Make when available
- do not replace known assets with placeholders
- do not add new icon packages if the asset already exists in context or in the repo

## State rules
Implement only states that are confirmed by:
- Design selection
- Make resources
- existing repo behavior

Never invent:
- extra screens
- extra flows
- hidden product logic
- unsupported visual states

If likely-needed states are missing, explicitly list:
- hover
- focus
- active
- disabled
- loading
- empty
- error

## Accessibility rules
- preserve semantic HTML
- preserve visible focus styles
- ensure controls have accessible names
- if design and accessibility conflict, choose accessible behavior and report the deviation

## Validation rules
### MAKE_ONLY
- validate against Make resources and repo conventions
- do not claim screenshot-based fidelity
- final status must be:
  - `BEST_EFFORT_IMPLEMENTED`
  - or `FIDELITY_BLOCKED`

### DESIGN_ONLY / COMBINED
- compare implementation against screenshot and design context
- validate layout, spacing, typography, colors, borders, radii, shadows, assets, and visible states

## Required commands
Run:
- `pnpm lint`
- `pnpm test`
- `pnpm build`

## Required final report
Always end with:
- source mode
- MCP tools invoked
- scope implemented
- files changed
- reused components
- new components created
- confirmed facts
- inferred facts
- missing/blocked facts
- assumptions
- unresolved ambiguities
- missing states
- missing tokens
- missing Code Connect mappings
- visual mismatches
- lint/test/build results

## Hard stops
Do not mark the task complete as strict fidelity if:
- mode was `MAKE_ONLY`
- screenshot was unavailable
- Design visual context was missing
- truncation was ignored
- a major mismatch remains unreported
