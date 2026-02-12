# HR Management System (V1)

A simple, responsive HR management web app built for single-company use.

## V1 Modules

- Core HR (employee profiles, org structure, lifecycle)
- Attendance & Time (check-in/out, attendance view, shifts)
- Leave Management (requests, approvals, balances)
- Payroll (salary components, monthly run, payslips)
- Recruitment (jobs, candidates, pipeline, interviews, offers)
- Reports & Dashboard
- Employee Self-Service
- Notifications and Audit Logs

## Tech Stack

- Frontend: Next.js
- Backend: NestJS
- Database: Supabase (Postgres)
- Auth: JWT
- Repo model: Monorepo

## Workspace Structure

- `apps/web` - Next.js frontend
- `apps/api` - NestJS backend
- `packages/shared` - shared types/constants
- `.github/workflows` - CI workflows
- `01-architecture.md` to `05-execution-tracker.md` - planning artifacts

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Run frontend

```bash
npm run dev:web
```

### 3. Run backend

```bash
npm run dev:api
```

### Local API auth note

For local development with real auth flow, set:

```bash
AUTH_BYPASS=false
```

in `apps/api/.env`.

Bootstrap HR Admin credentials come from:

- `BOOTSTRAP_ADMIN_EMAIL`
- `BOOTSTRAP_ADMIN_PASSWORD`

in `apps/api/.env`.

### 4. Run checks

```bash
npm run lint
npm run test
npm run build
```

## Delivery Rules

Project execution follows the rulebook artifacts in repository root:

- `01-architecture.md`
- `02-agent-context.md`
- `03-project-summary.md`
- `04-task-groups.md`
- `05-execution-tracker.md`
