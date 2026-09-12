# CIP interface direction

The nebula remains the signature visualization. The working interface is a quiet, light canvas with a persistent navigation rail. Color communicates selection, priority, and status rather than decorating every container.

## Visual rules

- Canvas: `#f8f9fb`; sidebar: `#f3f4f8`; primary action: `#5b52cf`; borders: `#e5e6ed`.
- Dark surfaces belong to the nebula and selected brand illustrations. Keep data tables, forms, reports, and drawers light.
- Page headings: 28–32 px; section headings: 18–20 px; body: 14–16 px; metadata: 12 px. Keep Chinese text at a readable line height, without artificially wide tracking.
- Use one main action per task area. Secondary navigation uses text or outline controls. Reserve warning and danger colors for actual conditions.
- Prefer separators and spacing to nested cards. Drawers show suggested work and evidence before optional score explanations.
- Use 140–200 ms color/opacity transitions. Respect reduced motion. Keyboard focus must remain visible and return to the opener when a dialog closes.

## User journey

1. Find or create a project. Search by name, brand, or domain; plan usage is secondary information.
2. Overview: see the next useful step, the latest observation, and supporting metrics. Insufficient samples direct the user to sampling.
3. Explore the nebula or the priority action list. Search and filter actions, then open their recommendations and evidence.
4. Inspect private evidence. Filters and exports are grouped in one expandable toolbar.
5. Sample/retest, assess effects, and create reports using the original project-scoped interfaces.

The primary navigation exposes overview, nebula, actions, sampling, evidence, assessments, and reports. Coverage, question territory, and alerts are under deeper analysis; entity, competitors, keywords, and queries remain under project settings. Mobile navigation retains every route.

Active, delayed, and failed audit jobs appear as a compact status notice on project pages. Full audit controls live on sampling. The overview must not hide running jobs behind a closed disclosure.

## Verification

Run `node scripts/verify-design.mjs` against the local server. Set `DESIGN_TEST_EMAIL` and `DESIGN_TEST_PASSWORD` for authenticated route, drawer, keyboard, and evidence-export checks. `DESIGN_ONLY_PRIVATE=1` skips the public route checks. Screenshots are saved to `.artifacts/design-review/`. The check does not create projects, start AI sampling, or issue public shares.

This redesign changes presentation and navigation. Existing permissions, report signatures, statistical gates, sampling interfaces, and the nebula renderer remain in place.
