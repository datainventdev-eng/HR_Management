import { Body, Controller, Get, Headers, Post, Query } from '@nestjs/common';
import { TimesheetService } from './timesheet.service';
import { TimesheetRole } from './timesheet.types';

@Controller('timesheet')
export class TimesheetController {
  constructor(private readonly timesheetService: TimesheetService) {}

  @Post('seed-demo')
  seedDemo() {
    return this.timesheetService.seedDemoData();
  }

  @Post('manager-map')
  setManagerMap(@Headers() headers: Record<string, string>, @Body() body: { employeeId: string; managerId: string }) {
    return this.timesheetService.setManagerMap(this.ctx(headers), body);
  }

  @Post('submit')
  submit(
    @Headers() headers: Record<string, string>,
    @Body() body: { weekStartDate: string; entries: Array<{ day: string; hours: number }> },
  ) {
    return this.timesheetService.submitTimesheet(this.ctx(headers), body);
  }

  @Get('list')
  list(
    @Headers() headers: Record<string, string>,
    @Query('employeeId') employeeId?: string,
    @Query('weekStartDate') weekStartDate?: string,
  ) {
    return this.timesheetService.listTimesheets(this.ctx(headers), { employeeId, weekStartDate });
  }

  @Post('decision')
  decide(
    @Headers() headers: Record<string, string>,
    @Body() body: { timesheetId: string; decision: 'Approved' | 'Rejected'; managerComment?: string },
  ) {
    return this.timesheetService.decideTimesheet(this.ctx(headers), body);
  }

  private ctx(headers: Record<string, string>) {
    return {
      role: (headers['x-role'] || 'employee') as TimesheetRole,
      employeeId: headers['x-employee-id'],
    };
  }
}
