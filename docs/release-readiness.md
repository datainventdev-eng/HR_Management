# GW-4 Release Readiness Pack

## Scope Covered
- GW-4.1: Dashboard live data integration via `/dashboard/overview`
- GW-4.2: Notifications and audit events via `/ops/notifications`, `/ops/audits`, and automatic workflow logging
- GW-4.3: Responsive + accessibility hardening (focus-visible states, semantic controls, keyboard-visible outlines)
- GW-4.4: Release checklist and deployment handoff docs

## Environment Targets
- Frontend hosting: Vercel
- Backend runtime: Node (NestJS)
- Database: Supabase Postgres

## Required Environment Variables
- `NEXT_PUBLIC_API_URL`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_DB_URL`
- `JWT_ACCESS_SECRET`
- `JWT_REFRESH_SECRET`

## Pre-Release Checklist
- [ ] CI green on GW-4 PR
- [ ] API health endpoint returns OK
- [ ] Dashboard data loads for Employee/Manager/HR Admin role contexts
- [ ] Leave/timesheet/payroll actions create notifications and audit entries
- [ ] Core pages verified on desktop and mobile breakpoints
- [ ] Required env vars set in Vercel and backend runtime
- [ ] Backup policy verified for Supabase database

## Smoke Tests
1. Seed demo baselines in modules.
2. Load dashboard and verify KPI cards populate from API.
3. Submit a leave request and approve it as manager.
4. Submit timesheet and approve as manager.
5. Finalize payroll and verify payslip record.
6. Check `/ops/notifications` and `/ops/audits` for generated events.

## Known Limitations (Expected in V1)
- In-memory module data still used for many domain slices.
- CSV export endpoints return generated string payloads, not file streams.
- External storage integration for uploaded files is pending.
