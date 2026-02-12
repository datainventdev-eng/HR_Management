import { Controller, Get, Headers } from '@nestjs/common';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('overview')
  overview(@Headers() headers: Record<string, string>) {
    const role = (headers['x-role'] || 'hr_admin') as 'employee' | 'manager' | 'hr_admin';
    const employeeId = headers['x-employee-id'];
    return this.dashboardService.overview({ role, employeeId });
  }
}
