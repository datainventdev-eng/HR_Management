import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { EmployeeManagerMap, Timesheet, TimesheetEntry, TimesheetRole } from './timesheet.types';
import { OpsService } from '../ops/ops.service';

interface TimesheetContext {
  role: TimesheetRole;
  employeeId?: string;
}

@Injectable()
export class TimesheetService {
  private readonly timesheets: Timesheet[] = [];
  private readonly managerMap: EmployeeManagerMap[] = [];

  constructor(private readonly opsService: OpsService) {}

  setManagerMap(ctx: TimesheetContext, payload: EmployeeManagerMap) {
    this.assertHrOrManager(ctx);
    const idx = this.managerMap.findIndex((entry) => entry.employeeId === payload.employeeId);
    if (idx >= 0) {
      this.managerMap[idx] = payload;
    } else {
      this.managerMap.push(payload);
    }
    return payload;
  }

  submitTimesheet(
    ctx: TimesheetContext,
    payload: {
      weekStartDate: string;
      entries: TimesheetEntry[];
    },
  ) {
    if (ctx.role !== 'employee') {
      throw new UnauthorizedException('Only employees can submit timesheets.');
    }

    if (!ctx.employeeId) {
      throw new UnauthorizedException('Employee context is missing.');
    }

    if (!payload.entries?.length) {
      throw new BadRequestException('At least one day entry is required.');
    }

    const invalidEntry = payload.entries.find((entry) => entry.hours < 0 || entry.hours > 24);
    if (invalidEntry) {
      throw new BadRequestException('Timesheet hours must be between 0 and 24.');
    }

    const mapping = this.managerMap.find((entry) => entry.employeeId === ctx.employeeId);
    if (!mapping) {
      throw new BadRequestException('Manager assignment is required before submitting timesheet.');
    }

    const existing = this.timesheets.find(
      (sheet) => sheet.employeeId === ctx.employeeId && sheet.weekStartDate === payload.weekStartDate,
    );

    if (existing && existing.status === 'Approved') {
      throw new BadRequestException('Approved timesheet cannot be edited.');
    }

    const totalHours = payload.entries.reduce((sum, entry) => sum + entry.hours, 0);

    if (existing) {
      existing.entries = payload.entries;
      existing.totalHours = totalHours;
      existing.status = 'Submitted';
      existing.history.push({ status: 'Submitted', at: new Date().toISOString() });
      this.opsService.addNotification({
        userId: mapping.managerId,
        type: 'timesheet',
        title: 'Timesheet resubmitted',
        message: `Employee ${ctx.employeeId} resubmitted weekly timesheet ${existing.id}.`,
      });
      this.opsService.addAudit({
        actorId: ctx.employeeId,
        action: 'timesheet.submitted',
        entity: 'timesheet',
        entityId: existing.id,
        metadata: { weekStartDate: existing.weekStartDate, totalHours },
      });
      return existing;
    }

    const sheet: Timesheet = {
      id: this.id('ts'),
      employeeId: ctx.employeeId,
      managerId: mapping.managerId,
      weekStartDate: payload.weekStartDate,
      entries: payload.entries,
      totalHours,
      status: 'Submitted',
      history: [{ status: 'Submitted', at: new Date().toISOString() }],
    };

    this.timesheets.push(sheet);
    this.opsService.addNotification({
      userId: mapping.managerId,
      type: 'timesheet',
      title: 'New timesheet submitted',
      message: `Employee ${ctx.employeeId} submitted timesheet ${sheet.id}.`,
    });
    this.opsService.addAudit({
      actorId: ctx.employeeId,
      action: 'timesheet.submitted',
      entity: 'timesheet',
      entityId: sheet.id,
      metadata: { weekStartDate: sheet.weekStartDate, totalHours },
    });
    return sheet;
  }

  listTimesheets(ctx: TimesheetContext, query?: { employeeId?: string; weekStartDate?: string }) {
    let list = this.timesheets;

    if (ctx.role === 'employee') {
      list = list.filter((sheet) => sheet.employeeId === ctx.employeeId);
    }

    if (ctx.role === 'manager') {
      list = list.filter((sheet) => sheet.managerId === ctx.employeeId);
    }

    if (ctx.role === 'hr_admin' && query?.employeeId) {
      list = list.filter((sheet) => sheet.employeeId === query.employeeId);
    }

    if (query?.weekStartDate) {
      list = list.filter((sheet) => sheet.weekStartDate === query.weekStartDate);
    }

    return list;
  }

  decideTimesheet(
    ctx: TimesheetContext,
    payload: {
      timesheetId: string;
      decision: 'Approved' | 'Rejected';
      managerComment?: string;
    },
  ) {
    if (ctx.role !== 'manager') {
      throw new UnauthorizedException('Only managers can approve or reject timesheets.');
    }

    const timesheet = this.timesheets.find((sheet) => sheet.id === payload.timesheetId);
    if (!timesheet) {
      throw new NotFoundException('Timesheet not found.');
    }

    if (timesheet.managerId !== ctx.employeeId) {
      throw new UnauthorizedException('Managers can only decide direct-report timesheets.');
    }

    if (timesheet.status !== 'Submitted') {
      throw new BadRequestException('Only submitted timesheets can be updated.');
    }

    timesheet.status = payload.decision;
    timesheet.managerComment = payload.managerComment;
    timesheet.history.push({ status: payload.decision, at: new Date().toISOString(), comment: payload.managerComment });
    this.opsService.addNotification({
      userId: timesheet.employeeId,
      type: 'timesheet',
      title: `Timesheet ${payload.decision.toLowerCase()}`,
      message: `Your timesheet ${timesheet.id} was ${payload.decision.toLowerCase()}.`,
    });
    this.opsService.addAudit({
      actorId: ctx.employeeId || 'manager',
      action: `timesheet.${payload.decision.toLowerCase()}`,
      entity: 'timesheet',
      entityId: timesheet.id,
      metadata: { managerComment: payload.managerComment || '' },
    });

    return timesheet;
  }

  seedDemoData() {
    if (this.managerMap.length === 0) {
      this.managerMap.push({ employeeId: 'emp_demo_1', managerId: 'mgr_demo_1' });
    }

    return {
      message: 'Timesheet demo baseline is ready.',
      mappingCount: this.managerMap.length,
    };
  }

  pendingApprovalsCount(managerId?: string) {
    const list = managerId
      ? this.timesheets.filter((sheet) => sheet.managerId === managerId)
      : this.timesheets;
    return list.filter((sheet) => sheet.status === 'Submitted').length;
  }

  private assertHrOrManager(ctx: TimesheetContext) {
    if (ctx.role !== 'hr_admin' && ctx.role !== 'manager') {
      throw new UnauthorizedException('Only HR Admin or Manager can perform this action.');
    }
  }

  private id(prefix: string) {
    return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
  }
}
