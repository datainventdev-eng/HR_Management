# 03 - Project Summary

## 1. Objective

Build a simple, easy-to-use, responsive HR management web platform for a single company, centralizing Core HR, Attendance, Leave, Payroll, Recruitment basics, reporting, and employee self-service.

## 2. Business Goal

Enable HR and managers to run day-to-day operations efficiently in one system with faster approvals, reduced manual payroll effort, and measurable adoption by employees.

## 3. Target Users

- HR Admin
- Manager
- Employee

Note: Payroll and Recruitment functions are handled by HR Admin in V1.

## 4. Scope

### In Scope (V1)
- Core HR
- Attendance & Time
- Leave Management
- Payroll (simple/fixed calculations)
- Recruitment (ATS basics)
- Analytics/Reports (basic operational)
- Employee self-service
- Workflow/admin basics (notifications, approvals, audit logs)
- Dashboard matching approved visual baseline

### Out of Scope (V1)
- Advanced attendance automation/hardware
- Advanced payroll compliance/integrations
- Benefits/performance/LMS advanced suites
- Heavy third-party integrations
- Multi-company tenancy
- Advanced BI/predictive analytics

## 5. Success Metrics (V1)

- Leave approval turnaround under 24 hours
- Payroll processing time reduced by 30-50% vs current process
- Attendance completeness above 95%
- Employee self-service adoption above 60-70% in first 2 months
- Monthly active users growth across employee/manager/HR roles

## 6. Timeline and Milestones

- Delivery window: current week
- Target go-live: Sunday, February 15, 2026

High-level milestones:
1. Planning artifacts approval
2. Foundation group completion
3. Core functional groups completion
4. Test/quality passes
5. Release readiness and handoff

## 7. Team and Ownership

- Execution: user + Codex
- Reviewer/approver: `F`
- Product/design direction: provided by user with iterative refinement

## 8. Technical Direction

- Monorepo setup
- Frontend: Next.js
- Backend: NestJS
- Database: Supabase (Postgres)
- Auth: JWT
- Hosting: Vercel (final project/environment setup later)
- CI baseline: lint + test + build on PR

## 9. Assumptions

- Single-company V1
- 50-200 employees at launch
- Managers are approximately 10-20% of employee count
- HR Admin users: 1-3
- Dashboard reference images are the design baseline for V1

## 10. Dependencies

- Final Vercel project/environment setup details
- Access to production infra credentials when deployment is ready
- Stable acceptance from reviewer (`F`) per group

## 11. Delivery Plan

1. Approve mandatory planning artifacts.
2. Execute grouped tasks (`GW`) with independent parallel tasks (`TW`).
3. Merge group task PRs after CI + review.
4. Run test pass PR and quality pass PR.
5. Close group only when Definition of Done is met.

## 12. Definition of Success

Project is successful when:
- V1 modules in scope are functional and responsive
- Core workflows for HR Admin, Manager, and Employee are complete
- Quality gates pass consistently
- Dashboard and module UX remain simple and consistent
- Success metrics are measurable from available system reports
