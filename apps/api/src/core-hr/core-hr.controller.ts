import { Body, Controller, Delete, Get, Headers, Param, Patch, Post } from '@nestjs/common';
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

  @Patch('customers/:id')
  updateCustomer(
    @Headers() headers: Record<string, string>,
    @Param('id') id: string,
    @Body() body: { name: string; description?: string },
  ) {
    return this.coreHrService.updateCustomer(this.ctx(headers), id, body);
  }

  @Delete('customers/:id')
  deleteCustomer(@Headers() headers: Record<string, string>, @Param('id') id: string) {
    return this.coreHrService.deleteCustomer(this.ctx(headers), id);
  }

  @Get('projects')
  listProjects() {
    return this.coreHrService.listProjects();
  }

  @Post('projects')
  createProject(@Headers() headers: Record<string, string>, @Body() body: { customerId: string; name: string; description?: string }) {
    return this.coreHrService.createProject(this.ctx(headers), body);
  }

  @Patch('projects/:id')
  updateProject(
    @Headers() headers: Record<string, string>,
    @Param('id') id: string,
    @Body() body: { customerId: string; name: string; description?: string },
  ) {
    return this.coreHrService.updateProject(this.ctx(headers), id, body);
  }

  @Delete('projects/:id')
  deleteProject(@Headers() headers: Record<string, string>, @Param('id') id: string) {
    return this.coreHrService.deleteProject(this.ctx(headers), id);
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

  @Delete('employees/:id')
  deleteEmployee(@Headers() headers: Record<string, string>, @Param('id') id: string) {
    return this.coreHrService.deleteEmployee(this.ctx(headers), id);
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
