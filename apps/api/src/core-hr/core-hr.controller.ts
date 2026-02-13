import { Body, Controller, Get, Headers, Param, Patch, Post } from '@nestjs/common';
import { CoreHrService } from './core-hr.service';
import { UserRole } from './core-hr.types';

@Controller('core-hr')
export class CoreHrController {
  constructor(private readonly coreHrService: CoreHrService) {}

  @Post('seed-demo')
  seedDemoData() {
    return this.coreHrService.seedDemoData();
  }

  @Get('departments')
  listDepartments() {
    return this.coreHrService.listDepartments();
  }

  @Post('departments')
  createDepartment(@Headers() headers: Record<string, string>, @Body() body: { name: string; code?: string }) {
    return this.coreHrService.createDepartment(this.ctx(headers), body);
  }

  @Get('customers')
  listCustomers() {
    return this.coreHrService.listCustomers();
  }

  @Post('customers')
  createCustomer(@Headers() headers: Record<string, string>, @Body() body: { name: string; description?: string }) {
    return this.coreHrService.createCustomer(this.ctx(headers), body);
  }

  @Get('projects')
  listProjects() {
    return this.coreHrService.listProjects();
  }

  @Post('projects')
  createProject(@Headers() headers: Record<string, string>, @Body() body: { customerId: string; name: string; description?: string }) {
    return this.coreHrService.createProject(this.ctx(headers), body);
  }

  @Get('employees')
  listEmployees(@Headers() headers: Record<string, string>) {
    return this.coreHrService.listEmployees(this.ctx(headers));
  }

  @Post('employees')
  createEmployee(@Headers() headers: Record<string, string>, @Body() body: any) {
    return this.coreHrService.createEmployee(this.ctx(headers), body);
  }

  @Patch('employees/:id')
  updateEmployee(@Headers() headers: Record<string, string>, @Param('id') id: string, @Body() body: any) {
    return this.coreHrService.updateEmployee(this.ctx(headers), id, body);
  }

  @Get('managers/:managerId/reports')
  getDirectReports(@Headers() headers: Record<string, string>, @Param('managerId') managerId: string) {
    return this.coreHrService.getDirectReports(this.ctx(headers), managerId);
  }

  @Post('lifecycle-events')
  createLifecycleEvent(@Headers() headers: Record<string, string>, @Body() body: any) {
    return this.coreHrService.createLifecycleEvent(this.ctx(headers), body);
  }

  @Get('employees/:employeeId/lifecycle-events')
  getLifecycleHistory(@Headers() headers: Record<string, string>, @Param('employeeId') employeeId: string) {
    return this.coreHrService.getLifecycleHistory(this.ctx(headers), employeeId);
  }

  private ctx(headers: Record<string, string>) {
    const role = (headers['x-role'] || 'employee') as UserRole;
    return {
      role,
      employeeId: headers['x-employee-id'],
    };
  }
}
