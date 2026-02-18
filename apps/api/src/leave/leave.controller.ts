import { Body, Controller, Delete, Get, Headers, Param, Patch, Post, Query } from '@nestjs/common';
import { LeaveService } from './leave.service';
import { LeaveRole } from './leave.types';

@Controller('leave')
export class LeaveController {
  constructor(private readonly leaveService: LeaveService) {}

  @Post('seed-demo')
  seedDemo() {
    return this.leaveService.seedDemoData();
  }

  @Get('types')
  listTypes() {
    return this.leaveService.listLeaveTypes();
  }

  @Post('types')
  createType(@Headers() headers: Record<string, string>, @Body() body: { name: string; paid: boolean; annualLimit?: number }) {
    return this.leaveService.createLeaveType(this.ctx(headers), body);
  }

  @Patch('types/:id')
  updateType(
    @Headers() headers: Record<string, string>,
    @Param('id') id: string,
    @Body() body: { name: string; paid: boolean; annualLimit?: number },
  ) {
    return this.leaveService.updateLeaveType(this.ctx(headers), id, body);
  }

  @Delete('types/:id')
  deleteType(@Headers() headers: Record<string, string>, @Param('id') id: string) {
    return this.leaveService.deleteLeaveType(this.ctx(headers), id);
  }

  @Post('manager-map')
  mapManager(@Headers() headers: Record<string, string>, @Body() body: { employeeId: string; managerId: string }) {
    return this.leaveService.setManagerMap(this.ctx(headers), body);
  }

  @Post('allocations')
  allocate(
    @Headers() headers: Record<string, string>,
    @Body() body: { employeeId: string; leaveTypeId: string; allocated: number },
  ) {
    return this.leaveService.allocateLeave(this.ctx(headers), body);
  }

  @Get('balances')
  balances(@Headers() headers: Record<string, string>, @Query('employeeId') employeeId?: string) {
    return this.leaveService.getBalances(this.ctx(headers), employeeId);
  }

  @Post('requests')
  requestLeave(
    @Headers() headers: Record<string, string>,
    @Body() body: { leaveTypeId: string; startDate: string; endDate: string; reason?: string },
  ) {
    return this.leaveService.requestLeave(this.ctx(headers), body);
  }

  @Get('requests')
  listRequests(
    @Headers() headers: Record<string, string>,
    @Query('employeeId') employeeId?: string,
    @Query('managerId') managerId?: string,
  ) {
    return this.leaveService.listRequests(this.ctx(headers), { employeeId, managerId });
  }

  @Post('requests/decision')
  decide(
    @Headers() headers: Record<string, string>,
    @Body() body: { requestId: string; decision: 'Approved' | 'Rejected'; managerComment?: string },
  ) {
    return this.leaveService.decideRequest(this.ctx(headers), body);
  }

  private ctx(headers: Record<string, string>) {
    return {
      role: (headers['x-role'] || 'employee') as LeaveRole,
      employeeId: headers['x-employee-id'],
    };
  }
}
