# 04 - Task Groups

## 1. Grouping Strategy

- Groups are sequential: `GW-1` -> `GW-2` -> `GW-3` -> `GW-4`
- Tasks inside each group are designed for parallel execution with non-overlapping module ownership.
- Each task follows: objective, dependencies, target files/modules, acceptance criteria, test requirements, PR title format.

## 2. Dependency Graph

- `GW-1` Foundation and baseline contracts
- `GW-2` Core operational modules (independent vertical slices)
- `GW-3` Advanced V1 modules and reporting
- `GW-4` Integration hardening, responsiveness pass, release readiness

Merge order:
1. Merge all `GW-1` task PRs
2. Test Agent pass for `GW-1`
3. Quality Agent pass for `GW-1`
4. Repeat same cycle for `GW-2`, `GW-3`, `GW-4`

---

## GW-1 (Foundation Setup)

### TW-1.1 Monorepo and Tooling Bootstrap
- Objective: initialize monorepo workspace and shared tooling baseline.
- Inputs/dependencies: approved architecture and stack.
- Target files/modules: root workspace config, package manager config, base lint/test/build scripts.
- Acceptance criteria:
  - Monorepo workspace runs install and base scripts.
  - Shared script commands available from root.
  - No module-specific business logic included.
- Test requirements:
  - Verify lint/test/build placeholder commands execute.
- Expected PR title format:
  - `[GW-1][TW-1.1] bootstrap monorepo tooling baseline`

### TW-1.2 API Platform Skeleton (NestJS)
- Objective: create backend app skeleton with module registration pattern.
- Inputs/dependencies: architecture module map.
- Target files/modules: `apps/api` bootstrap, app module, config, health endpoint.
- Acceptance criteria:
  - API boots successfully with base route and health check.
  - Folder conventions support module-by-module expansion.
- Test requirements:
  - Unit test for health endpoint/app bootstrap.
- Expected PR title format:
  - `[GW-1][TW-1.2] initialize nestjs api skeleton`

### TW-1.3 Web Platform Skeleton (Next.js + Dashboard Base UI)
- Objective: create frontend shell with responsive layout and dashboard scaffold from approved design baseline.
- Inputs/dependencies: dashboard reference visuals.
- Target files/modules: `apps/web` app shell, sidebar/topbar, dashboard sections with mock data.
- Acceptance criteria:
  - Responsive shell works on desktop/tablet/mobile.
  - Dashboard includes all approved sections from reference.
  - UI is simple and consistent with baseline style.
- Test requirements:
  - Basic component/render tests for dashboard shell.
- Expected PR title format:
  - `[GW-1][TW-1.3] create responsive dashboard shell`

### TW-1.4 CI Pipeline and PR Checks
- Objective: set up CI workflow for lint, unit tests, and build.
- Inputs/dependencies: branch/PR policy.
- Target files/modules: CI workflow files and check scripts.
- Acceptance criteria:
  - Every PR triggers lint, test, and build checks.
  - Required checks map to merge gate policy.
- Test requirements:
  - Validate workflow on sample PR branch.
- Expected PR title format:
  - `[GW-1][TW-1.4] configure ci checks for prs`

---

## GW-2 (Core HR Operations)

### TW-2.1 Core HR Vertical Slice
- Objective: deliver employee profile, org structure, lifecycle tracking, and role basics.
- Inputs/dependencies: GW-1 platform ready.
- Target files/modules: Core HR API and web pages/components under dedicated core-hr modules.
- Acceptance criteria:
  - HR Admin can create/edit employee profiles with required fields.
  - Departments and manager assignments are manageable.
  - Lifecycle events are stored and visible in profile history.
  - Role rules align to Employee/Manager/HR Admin access model.
- Test requirements:
  - API and UI tests for profile CRUD, lifecycle events, and access control paths.
- Expected PR title format:
  - `[GW-2][TW-2.1] implement core hr vertical slice`

### TW-2.2 Attendance & Time Vertical Slice
- Objective: deliver check-in/out, attendance history, late/early flags, and basic shifts.
- Inputs/dependencies: GW-1 platform ready.
- Target files/modules: attendance/shift API and web modules only.
- Acceptance criteria:
  - Employee check-in/out flows work with validation.
  - Monthly attendance view available.
  - Late/early flags computed from configured standard hours.
  - Shift creation/assignment and employee shift viewing work.
- Test requirements:
  - Validation tests for duplicate check-in and invalid check-out.
  - Module tests for late/early rule behavior.
- Expected PR title format:
  - `[GW-2][TW-2.2] implement attendance and shift flows`

### TW-2.3 Leave Vertical Slice
- Objective: deliver leave types, request flow, manager approvals, and balance tracking.
- Inputs/dependencies: GW-1 platform ready.
- Target files/modules: leave API and web modules only.
- Acceptance criteria:
  - Leave types configurable by HR Admin.
  - Employee can request leave with status tracking.
  - Manager approval/rejection limited to direct reports.
  - Balances update when leave is approved.
- Test requirements:
  - Tests for date validation, approval authorization, and balance deduction.
- Expected PR title format:
  - `[GW-2][TW-2.3] implement leave request and approval module`

### TW-2.4 Timesheet Vertical Slice
- Objective: deliver weekly timesheet submit/review workflow.
- Inputs/dependencies: GW-1 platform ready.
- Target files/modules: timesheet API and web modules only.
- Acceptance criteria:
  - Employee can submit weekly hours.
  - Manager can approve/reject with optional comments.
  - Employee can view timesheet status history.
- Test requirements:
  - Tests for status transitions and manager authorization.
- Expected PR title format:
  - `[GW-2][TW-2.4] implement timesheet workflow`

---

## GW-3 (Payroll, Recruitment, Documents, Reports)

### TW-3.1 Payroll Vertical Slice
- Objective: deliver salary structure, monthly run (draft/finalize), payslips, and summary.
- Inputs/dependencies: GW-2 user and organization data available.
- Target files/modules: payroll API and web modules only.
- Acceptance criteria:
  - HR Admin can configure fixed salary components.
  - Payroll draft and finalize flow works per month.
  - Finalized payroll exposes payslips to employee portal.
  - Duplicate finalize for same employee/month is blocked.
- Test requirements:
  - Calculation and finalize guard tests.
- Expected PR title format:
  - `[GW-3][TW-3.1] implement payroll run and payslips`

### TW-3.2 Recruitment Vertical Slice
- Objective: deliver ATS basics for jobs, candidates, pipeline, interviews, feedback, offers.
- Inputs/dependencies: GW-1 platform ready.
- Target files/modules: recruitment API and web modules only.
- Acceptance criteria:
  - HR Admin can manage jobs and candidates through defined stages.
  - Interview scheduling and feedback capture work.
  - Offer statuses support draft/sent/accepted/declined.
  - Accepted candidate can be converted to employee profile.
- Test requirements:
  - Tests for stage transitions and conversion flow.
- Expected PR title format:
  - `[GW-3][TW-3.2] implement recruitment ats basics`

### TW-3.3 Documents and Policy Center
- Objective: deliver employee/policy documents with basic expiry tracking.
- Inputs/dependencies: GW-2 profile data available.
- Target files/modules: documents API and web modules only.
- Acceptance criteria:
  - HR Admin can upload and publish policy documents.
  - Employee can access personal and company policy documents.
  - Expiring-in-30-days list is available.
- Test requirements:
  - Tests for document access permissions and expiry list logic.
- Expected PR title format:
  - `[GW-3][TW-3.3] implement documents and policy module`

### TW-3.4 Analytics and Reports
- Objective: deliver basic headcount, attendance, leave, payroll, and hiring funnel reports.
- Inputs/dependencies: GW-2 and GW-3 module data available.
- Target files/modules: reporting API and web modules only.
- Acceptance criteria:
  - Required report pages and filters are operational.
  - Headcount, attendance, leave, payroll summary, hiring funnel visible.
  - Optional CSV export implemented where feasible.
- Test requirements:
  - Tests for report query outputs and role-based access.
- Expected PR title format:
  - `[GW-3][TW-3.4] implement v1 operational reports`

---

## GW-4 (Integration, UX Hardening, Release Gate)

### TW-4.1 Dashboard Live Data Integration
- Objective: connect dashboard widgets to real backend data with role-aware views.
- Inputs/dependencies: GW-2 and GW-3 merged.
- Target files/modules: dashboard API endpoints and dashboard web page only.
- Acceptance criteria:
  - KPI cards, chart, schedule, quick actions, activity, projects populate from API.
  - Loading/empty/error states are clear and usable.
- Test requirements:
  - Integration tests for dashboard endpoints and render states.
- Expected PR title format:
  - `[GW-4][TW-4.1] wire dashboard to live module data`

### TW-4.2 Notifications and Audit Completeness
- Objective: ensure key workflows generate notifications and audit entries.
- Inputs/dependencies: GW-2 and GW-3 merged.
- Target files/modules: notifications and audit modules only.
- Acceptance criteria:
  - Leave/timesheet submissions notify managers.
  - Decision outcomes notify employees.
  - Key actions write audit records with actor/action/time/entity.
- Test requirements:
  - Event-to-notification tests and audit log assertions.
- Expected PR title format:
  - `[GW-4][TW-4.2] finalize notifications and audit coverage`

### TW-4.3 Responsive and Accessibility Pass
- Objective: harden all core pages for mobile/tablet/desktop usability.
- Inputs/dependencies: all feature modules merged.
- Target files/modules: web layout/style/components only; no business logic changes.
- Acceptance criteria:
  - Core module pages are usable on common breakpoints.
  - Keyboard navigation works on core forms/actions.
  - Contrast/readability remains clear.
- Test requirements:
  - Responsive checks and focused accessibility smoke tests.
- Expected PR title format:
  - `[GW-4][TW-4.3] complete responsive and a11y hardening`

### TW-4.4 Release Readiness Pack
- Objective: finalize release checklist, docs, and production readiness notes.
- Inputs/dependencies: all GW-4 tasks complete.
- Target files/modules: release docs, runbooks, environment configs.
- Acceptance criteria:
  - Release checklist complete with verified CI status.
  - Known issues and fallback plans documented.
  - Hand-off notes ready for go-live decision.
- Test requirements:
  - Validate production build artifacts and smoke checks.
- Expected PR title format:
  - `[GW-4][TW-4.4] prepare v1 release readiness pack`

---

## 3. File Ownership Boundaries (Parallel Safety)

- `TW-1.1` root tooling only
- `TW-1.2` API bootstrap only
- `TW-1.3` web shell/dashboard scaffold only
- `TW-1.4` CI workflow only
- `TW-2.x` module ownership isolated by module directories
- `TW-3.x` module ownership isolated by module directories
- `TW-4.x` ownership isolated to designated integration/support modules

When unavoidable shared files appear (routing/index registration), assign temporary ownership to one task and reference stubs/interfaces from others to prevent merge collisions.
