import { Body, Controller, Get, Headers, Post, Query } from '@nestjs/common';
import { WfhService } from './wfh.service';
import { WfhRole } from './wfh.types';

@Controller('wfh')
export class WfhController {
  constructor(private readonly wfhService: WfhService) {}

  @Post('requests')
  requestWfh(
    @Headers() headers: Record<string, string>,
    @Body() body: { startDate: string; endDate: string; reason: string },
  ) {
    return this.wfhService.request(this.ctx(headers), body);
  }

  @Get('requests')
  listRequests(@Headers() headers: Record<string, string>, @Query('employeeId') employeeId?: string) {
    return this.wfhService.list(this.ctx(headers), { employeeId });
  }

  @Post('requests/decision')
  decide(
    @Headers() headers: Record<string, string>,
    @Body() body: { requestId: string; decision: 'Approved' | 'Rejected'; managerComment?: string },
  ) {
    return this.wfhService.decide(this.ctx(headers), body);
  }

  private ctx(headers: Record<string, string>) {
    return {
      role: (headers['x-role'] || 'employee') as WfhRole,
      employeeId: headers['x-employee-id'],
    };
  }
}
