# 01 - Architecture

## 1. System Overview

V1 is a web-based HR management system for a single company with 50-200 employees.  
Primary objective: centralize employee HR operations (Core HR, Attendance, Leave, Payroll, Recruitment basics, Reporting, Self-Service) in one usable platform.

## 2. Scope Boundaries

### In Scope (V1)
- Core HR: employee profiles, org structure, lifecycle events, basic RBAC
- Attendance & Time: check-in/out, monthly view, late/early flags, timesheets, basic shifts
- Leave: leave types, requests, approvals, balances
- Payroll: fixed salary components, monthly run (draft/finalize), payslips PDF, summaries
- Recruitment basics: jobs, candidates, pipeline, interviews, feedback, offers, conversion to employee
- Reports: headcount, attendance, leave, payroll summary, hiring funnel
- Employee self-service: own profile view/update request, leave/attendance view, payslip download
- Workflows/Admin: approvals, notifications (in-app), audit logs, basic expiring documents list
- Dashboard: all approved sections from provided design references

### Out of Scope (V1)
- Biometric/GPS/face attendance, complex roster/overtime policies
- Advanced payroll compliance, multi-currency/entity, bank integrations
- Benefits administration
- Advanced performance/LMS/succession modules
- Advanced ATS integrations/automation
- Heavy third-party integrations (SSO/accounting/chat tools/hardware)
- Multi-tenant architecture
- Predictive/advanced analytics and warehouse integrations

## 3. Target Users and Access Model

Roles for V1:
- HR Admin: full access across modules (including payroll + recruitment actions)
- Manager: team views, approvals, interview feedback
- Employee: self-service for own data/actions

## 4. High-Level Architecture

Monorepo architecture:
- `apps/web`: Next.js frontend (responsive web for mobile/tablet/desktop)
- `apps/api`: NestJS backend (REST API, auth, business logic)
- `packages/shared`: shared types, constants, validation schemas, utilities

Core runtime flow:
1. User authenticates via JWT auth flow.
2. Frontend consumes NestJS APIs for dashboard + module data.
3. Backend enforces RBAC and validates inputs.
4. PostgreSQL stores operational data + audit trail.

## 5. Module Breakdown

### Frontend (Next.js)
- App shell: sidebar, topbar, responsive layout grid
- Dashboard page with approved widgets
- Core module pages/forms/tables
- Reusable components: cards, tables, forms, status chips, modals, notifications
- Form validation + clear human-readable errors

### Backend (NestJS)
- Auth module (JWT access + refresh)
- Users/Roles module
- Employee module
- Attendance module
- Timesheet module
- Leave module
- Payroll module
- Recruitment module
- Reporting module
- Documents module
- Notifications module
- Audit module

### Data Layer (PostgreSQL)
- Relational schema with foreign keys
- Soft status handling where required (active/inactive, approval statuses)
- Indexed lookup fields for common dashboards/filters

## 6. API and Contract Principles

- API style: REST JSON
- Contract rules:
  - Explicit DTO validation on every write endpoint
  - Consistent pagination/filter shape for list endpoints
  - Consistent error envelope with user-readable message
- Status workflows:
  - Standard approval statuses: `Draft`, `Submitted`, `Pending`, `Approved`, `Rejected`
- Access control:
  - Manager operations limited to direct reports
  - Employee access limited to own records

## 7. Data Model (Initial Domain Entities)

- User
- Role
- EmployeeProfile
- Department
- EmployeeLifecycleEvent
- EmployeeDocument
- AttendanceRecord
- Shift
- ShiftAssignment
- Timesheet
- TimesheetEntry
- LeaveType
- LeaveAllocation
- LeaveRequest
- SalaryStructure
- SalaryComponent
- PayrollRun
- PayrollEntry
- Payslip
- JobPosting
- Candidate
- CandidateStageHistory
- Interview
- InterviewFeedback
- Offer
- Notification
- AuditLog
- PolicyDocument

## 8. Non-Functional Targets

- Performance: common pages/APIs under 2s for 50-200 employee dataset
- Availability: 99%+ target for initial production
- Browser support: latest Chrome, Edge, Safari
- Accessibility: clear contrast, keyboard support for core forms/actions
- Responsiveness: fully usable on mobile/tablet/desktop (explicit V1 requirement)
- Security baseline:
  - Password hashing (`bcrypt`)
  - JWT access/refresh strategy
  - RBAC guards
  - Rate limiting on auth endpoints
  - Input validation everywhere
  - HTTPS in production
  - Audit logs for key actions
- Ops: daily database backups

## 9. Key Risks and Mitigations

- Risk: V1 scope expansion across many modules
  - Mitigation: strict P0/P1/P2 tagging and group gating
- Risk: inconsistent UX across modules
  - Mitigation: lock baseline design language from approved dashboard references
- Risk: parallel task conflicts
  - Mitigation: non-overlapping file ownership in task groups
- Risk: approval routing mistakes
  - Mitigation: manager-direct-report validation checks + tests
- Risk: payroll data quality issues
  - Mitigation: validation gates before payroll finalize

## 10. Architecture Assumptions

- Single company tenant in V1
- Team setup for current delivery: user + Codex implementation, reviewer approval by `F`
- Target launch date: by end of week, interpreted as Sunday, February 15, 2026
