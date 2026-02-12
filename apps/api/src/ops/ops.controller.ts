import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { OpsService } from './ops.service';

@Controller('ops')
export class OpsController {
  constructor(private readonly opsService: OpsService) {}

  @Get('notifications')
  notifications(@Query('userId') userId?: string) {
    return this.opsService.listNotifications(userId);
  }

  @Patch('notifications/:id/read')
  markRead(@Param('id') id: string) {
    return this.opsService.markNotificationRead(id);
  }

  @Get('audits')
  audits(@Query('entity') entity?: string) {
    return this.opsService.listAudits(entity);
  }

  @Get('activity')
  activity(@Query('limit') limit?: string) {
    return this.opsService.latestActivity(limit ? Number(limit) : 10);
  }

  @Post('notifications')
  createNotification(
    @Body() body: { userId: string; title: string; message: string; type: 'leave' | 'timesheet' | 'payroll' | 'system' },
  ) {
    return this.opsService.addNotification(body);
  }

  @Post('audits')
  createAudit(@Body() body: { actorId: string; action: string; entity: string; entityId: string; metadata?: Record<string, unknown> }) {
    return this.opsService.addAudit(body);
  }
}
