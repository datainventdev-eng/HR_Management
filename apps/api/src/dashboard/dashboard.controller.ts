import { Controller, Get, Headers, Query } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { Param } from '@nestjs/common';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('overview')
  overview(@Headers() headers: Record<string, string>) {
    const role = (headers['x-role'] || 'hr_admin') as 'employee' | 'manager' | 'hr_admin';
    const employeeId = headers['x-employee-id'];
    return this.dashboardService.overview({ role, employeeId });
  }

  @Get('project-hours')
  projectHours(@Query('month') month?: string) {
    return this.dashboardService.projectHours(month);
  }

  @Get('project-hours/:projectId/employees')
  projectEmployeeHours(@Param('projectId') projectId: string, @Query('month') month?: string) {
    return this.dashboardService.projectEmployeeHours(projectId, month);
  }
}
