import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Department, EmployeeProfile, LifecycleEvent, UserRole } from './core-hr.types';

interface RequestContext {
  role: UserRole;
  employeeId?: string;
}

@Injectable()
export class CoreHrService {
  private readonly employees: EmployeeProfile[] = [];
  private readonly departments: Department[] = [];
  private readonly lifecycleEvents: LifecycleEvent[] = [];

  createDepartment(ctx: RequestContext, payload: { name: string; code?: string }) {
    this.assertHrAdmin(ctx);
    const name = payload.name?.trim();
    if (!name) {
      throw new BadRequestException('Department name is required.');
    }

    const department: Department = {
      id: this.id('dept'),
      name,
      code: payload.code?.trim() || undefined,
    };

    this.departments.push(department);
    return department;
  }

  listDepartments() {
    return this.departments;
  }

  createEmployee(ctx: RequestContext, payload: Omit<EmployeeProfile, 'id'>) {
    this.assertHrAdmin(ctx);
    this.validateEmployeePayload(payload);

    if (this.employees.some((employee) => employee.employeeId === payload.employeeId)) {
      throw new BadRequestException('Employee ID already exists.');
    }

    this.ensureDepartmentExists(payload.departmentId);
    if (payload.managerId) {
      this.ensureEmployeeExists(payload.managerId);
    }

    const employee: EmployeeProfile = {
      id: this.id('emp'),
      ...payload,
    };

    this.employees.push(employee);
    return employee;
  }

  updateEmployee(ctx: RequestContext, id: string, payload: Partial<Omit<EmployeeProfile, 'id' | 'employeeId'>>) {
    this.assertHrAdmin(ctx);
    const employee = this.employees.find((entry) => entry.id === id);
    if (!employee) {
      throw new NotFoundException('Employee not found.');
    }

    if (payload.departmentId) {
      this.ensureDepartmentExists(payload.departmentId);
    }
    if (payload.managerId) {
      this.ensureEmployeeExists(payload.managerId);
    }

    Object.assign(employee, payload);
    return employee;
  }

  listEmployees(ctx: RequestContext) {
    if (ctx.role === 'employee') {
      if (!ctx.employeeId) {
        throw new UnauthorizedException('Employee context is missing.');
      }
      const me = this.employees.find((employee) => employee.id === ctx.employeeId);
      return me ? [me] : [];
    }

    if (ctx.role === 'manager') {
      if (!ctx.employeeId) {
        throw new UnauthorizedException('Manager context is missing.');
      }
      return this.employees.filter((employee) => employee.managerId === ctx.employeeId || employee.id === ctx.employeeId);
    }

    return this.employees;
  }

  getDirectReports(ctx: RequestContext, managerId: string) {
    if (ctx.role === 'employee') {
      throw new UnauthorizedException('You are not allowed to view direct reports.');
    }

    if (ctx.role === 'manager' && ctx.employeeId !== managerId) {
      throw new UnauthorizedException('Managers can only view their own direct reports.');
    }

    return this.employees.filter((employee) => employee.managerId === managerId);
  }

  createLifecycleEvent(
    ctx: RequestContext,
    payload: {
      employeeId: string;
      type: LifecycleEvent['type'];
      effectiveDate: string;
      notes?: string;
      changes?: LifecycleEvent['changes'];
    },
  ) {
    this.assertHrAdmin(ctx);

    const employee = this.employees.find((entry) => entry.id === payload.employeeId);
    if (!employee) {
      throw new NotFoundException('Employee not found for lifecycle event.');
    }

    const event: LifecycleEvent = {
      id: this.id('life'),
      ...payload,
    };

    this.lifecycleEvents.push(event);

    if (payload.changes) {
      if (payload.changes.departmentId) {
        this.ensureDepartmentExists(payload.changes.departmentId);
      }
      if (payload.changes.managerId) {
        this.ensureEmployeeExists(payload.changes.managerId);
      }
      Object.assign(employee, payload.changes);
    }

    return event;
  }

  getLifecycleHistory(ctx: RequestContext, employeeId: string) {
    if (ctx.role === 'employee' && ctx.employeeId !== employeeId) {
      throw new UnauthorizedException('Employees can only view their own lifecycle history.');
    }

    if (ctx.role === 'manager') {
      const managesEmployee = this.employees.some((employee) => employee.id === employeeId && employee.managerId === ctx.employeeId);
      if (!managesEmployee && ctx.employeeId !== employeeId) {
        throw new UnauthorizedException('Managers can only view lifecycle history for direct reports.');
      }
    }

    return this.lifecycleEvents.filter((event) => event.employeeId === employeeId);
  }

  seedDemoData() {
    if (this.departments.length > 0 || this.employees.length > 0) {
      return { message: 'Demo data already exists.' };
    }

    const eng = { id: this.id('dept'), name: 'Engineering', code: 'ENG' };
    const hr = { id: this.id('dept'), name: 'Human Resources', code: 'HR' };
    this.departments.push(eng, hr);

    const manager: EmployeeProfile = {
      id: this.id('emp'),
      fullName: 'John Doe',
      employeeId: 'EMP-001',
      joinDate: '2024-01-10',
      departmentId: eng.id,
      title: 'Engineering Manager',
      status: 'active',
      email: 'john@company.com',
    };

    const directReport: EmployeeProfile = {
      id: this.id('emp'),
      fullName: 'Sarah Chen',
      employeeId: 'EMP-002',
      joinDate: '2025-05-01',
      departmentId: eng.id,
      title: 'Senior Developer',
      managerId: manager.id,
      status: 'active',
      email: 'sarah@company.com',
    };

    this.employees.push(manager, directReport);

    return {
      message: 'Demo data seeded.',
      managerId: manager.id,
      employeeId: directReport.id,
    };
  }

  private validateEmployeePayload(payload: Omit<EmployeeProfile, 'id'>) {
    if (!payload.fullName?.trim()) {
      throw new BadRequestException('Full name is required.');
    }

    if (!payload.employeeId?.trim()) {
      throw new BadRequestException('Employee ID is required.');
    }

    if (!payload.joinDate?.trim()) {
      throw new BadRequestException('Join date is required.');
    }

    if (!payload.departmentId?.trim()) {
      throw new BadRequestException('Department is required.');
    }

    if (!payload.title?.trim()) {
      throw new BadRequestException('Role/Title is required.');
    }
  }

  private ensureDepartmentExists(departmentId: string) {
    if (!this.departments.some((department) => department.id === departmentId)) {
      throw new BadRequestException('Department does not exist.');
    }
  }

  private ensureEmployeeExists(employeeId: string) {
    if (!this.employees.some((employee) => employee.id === employeeId)) {
      throw new BadRequestException('Manager/Employee reference does not exist.');
    }
  }

  private assertHrAdmin(ctx: RequestContext) {
    if (ctx.role !== 'hr_admin') {
      throw new UnauthorizedException('Only HR Admin can perform this action.');
    }
  }

  private id(prefix: string) {
    return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
  }
}
