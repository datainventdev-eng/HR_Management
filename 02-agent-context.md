# 02 - Agent Context

## 1. Purpose

Shared operating contract for all implementation threads/agents on this project.
All threads must follow this file to keep outputs consistent and merge-safe.

## 2. Delivery Guardrails (Mandatory)

- No coding starts until `01` to `05` artifacts are approved.
- One task (`TW`) = one branch = one PR.
- No mixed-purpose PRs.
- No overlapping file ownership inside same group.
- No merge without:
  - CI pass
  - reviewer approval (`F`)
  - acceptance criteria met
- Test and quality passes run after each merged group.

## 3. Repository Map (Planned)

- `01-architecture.md`
- `02-agent-context.md`
- `03-project-summary.md`
- `04-task-groups.md`
- `05-execution-tracker.md`
- `apps/web` (Next.js)
- `apps/api` (NestJS)
- `packages/shared` (shared types/schemas/constants)
- `docs/` (optional extended docs if needed)

## 4. Stack and Core Constraints

- Frontend: Next.js
- Backend: NestJS
- Database: Supabase (Postgres)
- Auth: JWT (access + refresh)
- Architecture: monorepo
- Deployment hosting: Vercel (environment setup in later group)
- V1 must be responsive across mobile/tablet/desktop

## 5. Branch and PR Standards

- Base branch: `main`
- Branch naming:
  - `feature/[GW-x]-[TW-x.y]-short-name`
- PR title:
  - `[GW-x][TW-x.y] concise task summary`
- PR body must include:
  - Objective
  - Scope
  - Files changed
  - Tests run
  - Risk notes

## 6. Testing and Quality Strategy

### CI Checks (required on each PR)
- Lint
- Unit tests
- Build

### Test Expectations
- Add/adjust tests for changed behavior
- Include edge and failure cases for workflow modules
- Validate role/permission behavior

### Quality Expectations
- Keep modules cohesive and testable
- Avoid hidden contract changes
- Keep naming and folder conventions consistent

## 7. Lint/Style Policy

- Use project linters/formatters as configured
- No dead code or unused exports in PR
- Keep comments minimal and useful
- Prefer clear, explicit DTO/schema typing

## 8. API Contract Policy

- REST JSON
- Validate all incoming writes
- Return actionable, non-technical error messages for expected user errors
- Keep response shapes stable per module

## 9. Security Baseline

- Password hashing with `bcrypt`
- JWT auth with expiry handling
- Route-level RBAC guards
- Rate limit auth endpoints
- Audit log key write actions
- Enforce HTTPS in production

## 10. UX and Responsiveness Policy

- Keep UI simple and easy-to-use first
- Follow baseline visual language from approved dashboard references
- Maintain consistency in spacing, cards, table patterns, status chips, and forms
- All core pages must function on common mobile/tablet widths

## 11. Operational Workflow

For each group:
1. Start all tasks in parallel threads.
2. Keep each thread isolated to task boundary.
3. Open one focused PR per task.
4. Merge group task PRs after checks and review.
5. Run Test Agent pass PR.
6. Run Quality Agent pass PR.
7. Mark group complete only when final gate conditions are met.
