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

  @Get('catalog')
  catalog(@Headers() headers: Record<string, string>) {
    return this.timesheetService.catalog(this.ctx(headers));
  }

  @Get('summary')
  summary(
    @Headers() headers: Record<string, string>,
    @Query('employeeId') employeeId?: string,
    @Query('weekStartDate') weekStartDate?: string,
  ) {
    return this.timesheetService.summary(this.ctx(headers), { employeeId, weekStartDate });
  }

  @Get('single')
  single(
    @Headers() headers: Record<string, string>,
    @Query('date') date?: string,
    @Query('employeeId') employeeId?: string,
  ) {
    return this.timesheetService.listSingleEntries(this.ctx(headers), { date, employeeId });
  }

  @Post('single')
  saveSingle(
    @Headers() headers: Record<string, string>,
    @Body() body: { customerId: string; projectId: string; billable: boolean; startDate: string; duration: string; notes?: string },
  ) {
    return this.timesheetService.saveSingleEntry(this.ctx(headers), body);
  }

  @Get('weekly-rows')
  weeklyRows(
    @Headers() headers: Record<string, string>,
    @Query('weekStartDate') weekStartDate?: string,
    @Query('employeeId') employeeId?: string,
  ) {
    return this.timesheetService.listWeeklyRows(this.ctx(headers), { weekStartDate, employeeId });
  }

  @Post('weekly-rows')
  saveWeeklyRows(
    @Headers() headers: Record<string, string>,
    @Body()
    body: {
      weekStartDate: string;
      rows: Array<{
        customerId: string;
        projectId: string;
        billable: boolean;
        notes?: string;
        hours: { sun: number; mon: number; tue: number; wed: number; thu: number; fri: number; sat: number };
      }>;
    },
  ) {
    return this.timesheetService.saveWeeklyRows(this.ctx(headers), body);
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
