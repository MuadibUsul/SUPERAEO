# CIP Route Map

Last updated: 2026-05-21

## Canonical Route Trees

### Public Website

The public website is the unauthenticated product surface.

- `/:locale`
- `/:locale/start`
- `/:locale/login`
- `/:locale/signup`
- `/:locale/product`
- `/:locale/use-cases`

The public homepage should stay focused on the Semantic Nebula showcase and the primary audit CTA.

### Customer App

The customer app is the authenticated AI cognition audit workspace.

- `/:locale/app`
- `/:locale/app/projects`
- `/:locale/app/projects/new`
- `/:locale/app/projects/:projectId/dashboard`
- `/:locale/app/projects/:projectId/semantic-nebula`
- `/:locale/app/projects/:projectId/opportunities`
- `/:locale/app/projects/:projectId/question-territory`
- `/:locale/app/projects/:projectId/reports`
- `/:locale/app/projects/:projectId/evidence`
- `/:locale/app/projects/:projectId/settings`

Customer-facing product pages should prioritize insights, evidence, and next actions. Technical workflow pages belong under Settings > Advanced.

### Operator Admin

The operator admin is the internal operations console.

- `/:locale/admin`
- `/:locale/admin/users`
- `/:locale/admin/organizations`
- `/:locale/admin/projects`
- `/:locale/admin/ai-providers`
- `/:locale/admin/models`
- `/:locale/admin/prompts`
- `/:locale/admin/routing`
- `/:locale/admin/queues`
- `/:locale/admin/logs`
- `/:locale/admin/usage`
- `/:locale/admin/audit-logs`
- `/:locale/admin/system`

Admin pages may expose provider, routing, queue, usage, and trace details that should not appear in the normal customer experience.

## API Route Groups

### Auth

- `/api/auth/login`
- `/api/auth/logout`
- `/api/auth/me`
- `/api/auth/signup`

### Customer Projects

- `/api/projects`
- `/api/projects/:projectId`
- `/api/projects/:projectId/diagnosis/start`
- `/api/projects/:projectId/diagnosis/status`
- `/api/projects/:projectId/semantic-nebula`
- `/api/projects/:projectId/opportunities`
- `/api/projects/:projectId/question-territory`
- `/api/projects/:projectId/reports`
- `/api/projects/:projectId/runs`

### Brand Probes

- `/api/probe-runs`
- `/api/probe-runs/:runId`
- `/api/probe-runs/:runId/probes`
- `/api/probe-runs/:runId/responses`
- `/api/probe-runs/:runId/signals`
- `/api/probe-runs/:runId/retry-failed`

### Admin

- `/api/admin/*`

Admin API routes must require operator roles. Write endpoints should require `platform_owner` or `operator_admin`.

## Legacy Route Tree

`src/app/(app)` still exists and should be treated as legacy.

Rules for future work:

- Do not add new features to `src/app/(app)`.
- Do not use legacy pages as source of truth for UX decisions.
- Prefer redirecting or deleting legacy pages once the localized route tree is verified.
- Any remaining useful component logic should be moved into shared components before removal.

## Product Boundary

Public and customer routes should describe observable answer space, semantic neighborhoods, evidence-backed cognition maps, and answer inclusion opportunities.

Avoid customer-facing language that implies hidden model access, ranking manipulation, or direct control over AI answers.
