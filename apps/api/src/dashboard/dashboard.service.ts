import { Injectable } from '@nestjs/common';
import { AttendanceService } from '../attendance/attendance.service';
import { CoreHrService } from '../core-hr/core-hr.service';
import { LeaveService } from '../leave/leave.service';
import { OpsService } from '../ops/ops.service';
import { RecruitmentService } from '../recruitment/recruitment.service';
import { TimesheetService } from '../timesheet/timesheet.service';

@Injectable()
export class DashboardService {
  constructor(
    private readonly coreHrService: CoreHrService,
    private readonly attendanceService: AttendanceService,
    private readonly leaveService: LeaveService,
    private readonly recruitmentService: RecruitmentService,
    private readonly timesheetService: TimesheetService,
    private readonly opsService: OpsService,
  ) {}

  overview(ctx: { role: 'employee' | 'manager' | 'hr_admin'; employeeId?: string }) {
    const headcount = this.coreHrService.headcountStats();
    const attendance = this.attendanceService.todaySummary();
    const onLeave = this.leaveService.onLeaveCount();
    const openPositions = this.recruitmentService.openPositionsCount();
    const pendingTimesheets = this.timesheetService.pendingApprovalsCount(ctx.role === 'manager' ? ctx.employeeId : undefined);

    return {
      greeting: ctx.role === 'employee' ? 'Welcome back' : 'Good Morning',
      role: ctx.role,
      kpis: {
        totalEmployees: headcount.total,
        presentToday: attendance.presentCount,
        onLeave,
        openPositions,
        pendingTimesheets,
      },
      attendance,
      schedule: [
        { id: 'ev1', title: 'Team Standup', time: '09:00 AM' },
        { id: 'ev2', title: 'Interview Block', time: '02:30 PM' },
      ],
      quickActions: ['Add Employee', 'Process Payroll', 'Schedule Interview', 'Generate Report'],
      recentActivity: this.opsService.latestActivity(6),
      currentProjects: [
        { name: 'Q1 Performance Reviews', progress: 85, due: '2026-03-15' },
        { name: 'New Hire Onboarding', progress: 60, due: '2026-02-28' },
        { name: 'Training Program Rollout', progress: 92, due: '2026-02-20' },
      ],
    };
  }
}
