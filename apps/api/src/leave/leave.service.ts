import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { EmployeeManagerMap, LeaveAllocation, LeaveRequest, LeaveRole, LeaveType } from './leave.types';
import { OpsService } from '../ops/ops.service';

interface LeaveContext {
  role: LeaveRole;
  employeeId?: string;
}

@Injectable()
export class LeaveService {
  private readonly leaveTypes: LeaveType[] = [];
  private readonly allocations: LeaveAllocation[] = [];
  private readonly requests: LeaveRequest[] = [];
  private readonly employeeManagerMap: EmployeeManagerMap[] = [];

  constructor(private readonly opsService: OpsService) {}

  createLeaveType(ctx: LeaveContext, payload: { name: string; paid: boolean; annualLimit?: number }) {
    this.assertHrAdmin(ctx);
    if (!payload.name?.trim()) {
      throw new BadRequestException('Leave type name is required.');
    }

    const leaveType: LeaveType = {
      id: this.id('lt'),
      name: payload.name.trim(),
      paid: payload.paid,
      annualLimit: payload.annualLimit,
    };

    this.leaveTypes.push(leaveType);
    return leaveType;
  }

  listLeaveTypes() {
    return this.leaveTypes;
  }

  setManagerMap(ctx: LeaveContext, payload: EmployeeManagerMap) {
    this.assertHrAdmin(ctx);
    const idx = this.employeeManagerMap.findIndex((entry) => entry.employeeId === payload.employeeId);
    if (idx >= 0) {
      this.employeeManagerMap[idx] = payload;
    } else {
      this.employeeManagerMap.push(payload);
    }

    return payload;
  }

  allocateLeave(ctx: LeaveContext, payload: { employeeId: string; leaveTypeId: string; allocated: number }) {
    this.assertHrAdmin(ctx);

    if (!this.leaveTypes.some((type) => type.id === payload.leaveTypeId)) {
      throw new BadRequestException('Leave type does not exist.');
    }

    const existing = this.allocations.find(
      (allocation) => allocation.employeeId === payload.employeeId && allocation.leaveTypeId === payload.leaveTypeId,
    );

    if (existing) {
      existing.allocated = payload.allocated;
      return existing;
    }

    const allocation: LeaveAllocation = {
      id: this.id('la'),
      employeeId: payload.employeeId,
      leaveTypeId: payload.leaveTypeId,
      allocated: payload.allocated,
      used: 0,
    };

    this.allocations.push(allocation);
    return allocation;
  }

  async requestLeave(
    ctx: LeaveContext,
    payload: {
      leaveTypeId: string;
      startDate: string;
      endDate: string;
      reason?: string;
    },
  ) {
    if (ctx.role !== 'employee') {
      throw new UnauthorizedException('Only employees can create leave requests from this endpoint.');
    }

    if (!ctx.employeeId) {
      throw new UnauthorizedException('Employee context is missing.');
    }

    if (payload.endDate < payload.startDate) {
      throw new BadRequestException('Leave date range is invalid.');
    }

    const leaveType = this.leaveTypes.find((type) => type.id === payload.leaveTypeId);
    if (!leaveType) {
      throw new BadRequestException('Leave type does not exist.');
    }

    const mapping = this.employeeManagerMap.find((entry) => entry.employeeId === ctx.employeeId);
    if (!mapping) {
      throw new BadRequestException('Manager assignment is required before requesting leave.');
    }

    const days = this.diffDays(payload.startDate, payload.endDate);
    const allocation = this.allocations.find(
      (entry) => entry.employeeId === ctx.employeeId && entry.leaveTypeId === payload.leaveTypeId,
    );

    if (leaveType.paid) {
      if (!allocation) {
        throw new BadRequestException('Leave allocation is required before requesting paid leave.');
      }

      if (allocation.allocated - allocation.used < days) {
        throw new BadRequestException('Insufficient leave balance for this request.');
      }
    }

    const request: LeaveRequest = {
      id: this.id('lr'),
      employeeId: ctx.employeeId,
      managerId: mapping.managerId,
      leaveTypeId: payload.leaveTypeId,
      startDate: payload.startDate,
      endDate: payload.endDate,
      reason: payload.reason,
      days,
      status: 'Pending',
      createdAt: new Date().toISOString(),
    };

    this.requests.push(request);

    await this.opsService.addNotification({
      userId: mapping.managerId,
      type: 'leave',
      title: 'New leave request',
      message: `Employee ${ctx.employeeId} submitted leave request ${request.id}.`,
    });
    await this.opsService.addAudit({
      actorId: ctx.employeeId,
      action: 'leave.request.submitted',
      entity: 'leave_request',
      entityId: request.id,
      metadata: { leaveTypeId: request.leaveTypeId, days: request.days },
    });
    return request;
  }

  listRequests(ctx: LeaveContext, query?: { employeeId?: string; managerId?: string }) {
    if (ctx.role === 'employee') {
      return this.requests.filter((request) => request.employeeId === ctx.employeeId);
    }

    if (ctx.role === 'manager') {
      if (!ctx.employeeId) {
        throw new UnauthorizedException('Manager context is missing.');
      }
      return this.requests.filter((request) => request.managerId === ctx.employeeId);
    }

    if (query?.employeeId) {
      return this.requests.filter((request) => request.employeeId === query.employeeId);
    }

    if (query?.managerId) {
      return this.requests.filter((request) => request.managerId === query.managerId);
    }

    return this.requests;
  }

  async decideRequest(
    ctx: LeaveContext,
    payload: {
      requestId: string;
      decision: 'Approved' | 'Rejected';
      managerComment?: string;
    },
  ) {
    if (ctx.role !== 'manager') {
      throw new UnauthorizedException('Only managers can approve or reject leave requests.');
    }

    const request = this.requests.find((entry) => entry.id === payload.requestId);
    if (!request) {
      throw new NotFoundException('Leave request not found.');
    }

    if (request.managerId !== ctx.employeeId) {
      throw new UnauthorizedException('Manager can only approve direct-report leave requests.');
    }

    if (request.status !== 'Pending') {
      throw new BadRequestException('Only pending requests can be updated.');
    }

    request.status = payload.decision;
    request.managerComment = payload.managerComment;

    if (payload.decision === 'Approved') {
      const allocation = this.allocations.find(
        (entry) => entry.employeeId === request.employeeId && entry.leaveTypeId === request.leaveTypeId,
      );

      if (allocation) {
        allocation.used += request.days;
      }
    }

    await this.opsService.addNotification({
      userId: request.employeeId,
      type: 'leave',
      title: `Leave ${payload.decision.toLowerCase()}`,
      message: `Your leave request ${request.id} was ${payload.decision.toLowerCase()}.`,
    });
    await this.opsService.addAudit({
      actorId: ctx.employeeId || 'manager',
      action: `leave.request.${payload.decision.toLowerCase()}`,
      entity: 'leave_request',
      entityId: request.id,
      metadata: { managerComment: payload.managerComment || '' },
    });

    return request;
  }

  getBalances(ctx: LeaveContext, employeeId?: string) {
    const targetEmployeeId = ctx.role === 'employee' ? ctx.employeeId : employeeId;
    if (!targetEmployeeId) {
      throw new BadRequestException('Employee ID is required to view balances.');
    }

    return this.allocations
      .filter((allocation) => allocation.employeeId === targetEmployeeId)
      .map((allocation) => ({
        ...allocation,
        remaining: allocation.allocated - allocation.used,
        leaveType: this.leaveTypes.find((type) => type.id === allocation.leaveTypeId)?.name ?? allocation.leaveTypeId,
      }));
  }

  seedDemoData() {
    if (this.leaveTypes.length === 0) {
      const annual = { id: this.id('lt'), name: 'Annual Leave', paid: true, annualLimit: 14 };
      const sick = { id: this.id('lt'), name: 'Sick Leave', paid: true, annualLimit: 8 };
      this.leaveTypes.push(annual, sick);

      this.employeeManagerMap.push({ employeeId: 'emp_demo_1', managerId: 'mgr_demo_1' });
      this.allocations.push({ id: this.id('la'), employeeId: 'emp_demo_1', leaveTypeId: annual.id, allocated: 14, used: 0 });
      this.allocations.push({ id: this.id('la'), employeeId: 'emp_demo_1', leaveTypeId: sick.id, allocated: 8, used: 0 });
    }

    return {
      message: 'Leave demo baseline is ready.',
      leaveTypes: this.leaveTypes.length,
    };
  }

  onLeaveCount(date = new Date().toISOString().slice(0, 10)) {
    return this.requests.filter(
      (request) => request.status === 'Approved' && request.startDate <= date && request.endDate >= date,
    ).length;
  }

  private assertHrAdmin(ctx: LeaveContext) {
    if (ctx.role !== 'hr_admin') {
      throw new UnauthorizedException('Only HR Admin can perform this action.');
    }
  }

  private diffDays(startDate: string, endDate: string) {
    const start = new Date(`${startDate}T00:00:00Z`).getTime();
    const end = new Date(`${endDate}T00:00:00Z`).getTime();
    return Math.floor((end - start) / (1000 * 60 * 60 * 24)) + 1;
  }

  private id(prefix: string) {
    return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
  }
}
