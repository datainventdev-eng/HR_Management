import { BadRequestException, Injectable, NotFoundException, OnModuleInit, UnauthorizedException } from '@nestjs/common';
import { Customer, Department, EmployeeProfile, LifecycleEvent, Project, UserRole } from './core-hr.types';
import { OpsService } from '../ops/ops.service';
import { DatabaseService } from '../database/database.service';

interface RequestContext {
  role: UserRole;
  employeeId?: string;
}

interface DbDepartment {
  id: string;
  name: string;
  code: string | null;
}

interface DbEmployee {
  id: string;
  full_name: string;
  employee_id: string;
  join_date: string;
  department_id: string;
  title: string;
  manager_id: string | null;
  status: 'active' | 'inactive';
  phone: string | null;
  email: string | null;
  emergency_contact: { name: string; relationship: string; phone: string } | null;
}

interface DbLifecycle {
  id: string;
  employee_id: string;
  type: LifecycleEvent['type'];
  effective_date: string;
  notes: string | null;
  changes: LifecycleEvent['changes'] | null;
}

interface DbCustomer {
  id: string;
  name: string;
  description: string | null;
}

interface DbProject {
  id: string;
  customer_id: string | null;
  customer_name?: string | null;
  name: string;
  description: string | null;
}

@Injectable()
export class CoreHrService implements OnModuleInit {
  constructor(
    private readonly opsService: OpsService,
    private readonly db: DatabaseService,
  ) {}

  async onModuleInit() {
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS core_departments (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        code TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await this.db.query(`
      CREATE TABLE IF NOT EXISTS core_employees (
        id TEXT PRIMARY KEY,
        full_name TEXT NOT NULL,
        employee_id TEXT UNIQUE NOT NULL,
        join_date DATE NOT NULL,
        department_id TEXT NOT NULL,
        title TEXT NOT NULL,
        manager_id TEXT,
        status TEXT NOT NULL CHECK (status IN ('active','inactive')),
        phone TEXT,
        email TEXT,
        emergency_contact JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT fk_core_department FOREIGN KEY (department_id) REFERENCES core_departments(id)
      );
    `);

    await this.db.query(`
      CREATE TABLE IF NOT EXISTS core_lifecycle_events (
        id TEXT PRIMARY KEY,
        employee_id TEXT NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('transfer','promotion','resignation','termination')),
        effective_date DATE NOT NULL,
        notes TEXT,
        changes JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT fk_core_lifecycle_employee FOREIGN KEY (employee_id) REFERENCES core_employees(id)
      );
    `);

    await this.db.query(`
      CREATE TABLE IF NOT EXISTS core_customers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await this.db.query(`
      CREATE TABLE IF NOT EXISTS core_projects (
        id TEXT PRIMARY KEY,
        customer_id TEXT,
        name TEXT NOT NULL,
        description TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT fk_core_project_customer FOREIGN KEY (customer_id) REFERENCES core_customers(id)
      );
    `);

    await this.db.query(`
      ALTER TABLE core_projects
      ADD COLUMN IF NOT EXISTS customer_id TEXT;
    `);
  }

  async createCustomer(ctx: RequestContext, payload: { name: string; description?: string }) {
    this.assertHrAdmin(ctx);
    const name = payload.name?.trim();
    if (!name) {
      throw new BadRequestException('Customer name is required.');
    }

    const customer: Customer = {
      id: this.id('cust'),
      name,
      description: payload.description?.trim() || undefined,
    };

    await this.db.query(`INSERT INTO core_customers (id, name, description) VALUES ($1, $2, $3)`, [
      customer.id,
      customer.name,
      customer.description ?? null,
    ]);

    await this.opsService.addAudit({
      actorId: ctx.employeeId || 'hr_admin',
      action: 'customer.created',
      entity: 'customer',
      entityId: customer.id,
      metadata: { name: customer.name },
    });

    return customer;
  }

  async listCustomers() {
    const result = await this.db.query<DbCustomer>(`SELECT id, name, description FROM core_customers ORDER BY name ASC`);
    return result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description ?? undefined,
    }));
  }

  async createProject(ctx: RequestContext, payload: { customerId: string; name: string; description?: string }) {
    this.assertHrAdmin(ctx);
    const customerId = payload.customerId?.trim();
    if (!customerId) {
      throw new BadRequestException('Customer is required.');
    }
    await this.ensureCustomerExists(customerId);

    const name = payload.name?.trim();
    if (!name) {
      throw new BadRequestException('Project name is required.');
    }

    const project: Project = {
      id: this.id('proj'),
      customerId,
      name,
      description: payload.description?.trim() || undefined,
    };

    await this.db.query(`INSERT INTO core_projects (id, customer_id, name, description) VALUES ($1, $2, $3, $4)`, [
      project.id,
      project.customerId,
      project.name,
      project.description ?? null,
    ]);

    await this.opsService.addAudit({
      actorId: ctx.employeeId || 'hr_admin',
      action: 'project.created',
      entity: 'project',
      entityId: project.id,
      metadata: { name: project.name, customerId: project.customerId },
    });

    return project;
  }

  async listProjects() {
    const result = await this.db.query<DbProject>(
      `
      SELECT p.id, p.customer_id, c.name AS customer_name, p.name, p.description
      FROM core_projects p
      LEFT JOIN core_customers c ON c.id = p.customer_id
      ORDER BY p.name ASC
      `,
    );
    return result.rows.map((row) => ({
      id: row.id,
      customerId: row.customer_id ?? '',
      customerName: row.customer_name ?? undefined,
      name: row.name,
      description: row.description ?? undefined,
    }));
  }

  async createDepartment(ctx: RequestContext, payload: { name: string; code?: string }) {
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

    await this.db.query(`INSERT INTO core_departments (id, name, code) VALUES ($1, $2, $3)`, [
      department.id,
      department.name,
      department.code ?? null,
    ]);

    await this.opsService.addAudit({
      actorId: ctx.employeeId || 'hr_admin',
      action: 'department.created',
      entity: 'department',
      entityId: department.id,
      metadata: { name: department.name },
    });

    return department;
  }

  async listDepartments() {
    const result = await this.db.query<DbDepartment>(`SELECT id, name, code FROM core_departments ORDER BY name ASC`);
    return result.rows.map((row) => ({ id: row.id, name: row.name, code: row.code ?? undefined }));
  }

  async createEmployee(ctx: RequestContext, payload: Omit<EmployeeProfile, 'id'>) {
    this.assertHrAdmin(ctx);
    this.validateEmployeePayload(payload);

    const existing = await this.db.query<{ id: string }>(`SELECT id FROM core_employees WHERE employee_id = $1 LIMIT 1`, [
      payload.employeeId,
    ]);
    if (existing.rows[0]) {
      throw new BadRequestException('Employee ID already exists.');
    }

    await this.ensureDepartmentExists(payload.departmentId);
    if (payload.managerId) {
      await this.ensureEmployeeExists(payload.managerId);
    }

    const employee: EmployeeProfile = {
      id: this.id('emp'),
      ...payload,
    };

    await this.db.query(
      `
      INSERT INTO core_employees (
        id, full_name, employee_id, join_date, department_id, title, manager_id, status, phone, email, emergency_contact
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      `,
      [
        employee.id,
        employee.fullName,
        employee.employeeId,
        employee.joinDate,
        employee.departmentId,
        employee.title,
        employee.managerId ?? null,
        employee.status,
        employee.phone ?? null,
        employee.email ?? null,
        employee.emergencyContact ? JSON.stringify(employee.emergencyContact) : null,
      ],
    );

    await this.opsService.addAudit({
      actorId: ctx.employeeId || 'hr_admin',
      action: 'employee.created',
      entity: 'employee',
      entityId: employee.id,
      metadata: { employeeId: employee.employeeId, title: employee.title },
    });

    return employee;
  }

  async updateEmployee(ctx: RequestContext, id: string, payload: Partial<Omit<EmployeeProfile, 'id' | 'employeeId'>>) {
    this.assertHrAdmin(ctx);

    const existing = await this.db.query<DbEmployee>(`SELECT * FROM core_employees WHERE id = $1 LIMIT 1`, [id]);
    const employee = existing.rows[0];
    if (!employee) {
      throw new NotFoundException('Employee not found.');
    }

    if (payload.departmentId) {
      await this.ensureDepartmentExists(payload.departmentId);
    }
    if (payload.managerId) {
      await this.ensureEmployeeExists(payload.managerId);
    }

    const next = {
      fullName: payload.fullName ?? employee.full_name,
      joinDate: payload.joinDate ?? employee.join_date,
      departmentId: payload.departmentId ?? employee.department_id,
      title: payload.title ?? employee.title,
      managerId: payload.managerId ?? employee.manager_id,
      status: payload.status ?? employee.status,
      phone: payload.phone ?? employee.phone,
      email: payload.email ?? employee.email,
      emergencyContact: payload.emergencyContact ?? employee.emergency_contact,
    };

    await this.db.query(
      `
      UPDATE core_employees
      SET full_name = $2,
          join_date = $3,
          department_id = $4,
          title = $5,
          manager_id = $6,
          status = $7,
          phone = $8,
          email = $9,
          emergency_contact = $10,
          updated_at = NOW()
      WHERE id = $1
      `,
      [
        id,
        next.fullName,
        next.joinDate,
        next.departmentId,
        next.title,
        next.managerId ?? null,
        next.status,
        next.phone ?? null,
        next.email ?? null,
        next.emergencyContact ? JSON.stringify(next.emergencyContact) : null,
      ],
    );

    await this.opsService.addAudit({
      actorId: ctx.employeeId || 'hr_admin',
      action: 'employee.updated',
      entity: 'employee',
      entityId: id,
      metadata: payload as Record<string, unknown>,
    });

    return this.mapEmployee({ ...employee, ...this.toDbEmployeePartial(next), id });
  }

  async listEmployees(ctx: RequestContext) {
    if (ctx.role === 'employee') {
      if (!ctx.employeeId) {
        throw new UnauthorizedException('Employee context is missing.');
      }
      const result = await this.db.query<DbEmployee>(`SELECT * FROM core_employees WHERE id = $1`, [ctx.employeeId]);
      return result.rows.map((row) => this.mapEmployee(row));
    }

    if (ctx.role === 'manager') {
      if (!ctx.employeeId) {
        throw new UnauthorizedException('Manager context is missing.');
      }
      const result = await this.db.query<DbEmployee>(
        `SELECT * FROM core_employees WHERE manager_id = $1 OR id = $1 ORDER BY full_name ASC`,
        [ctx.employeeId],
      );
      return result.rows.map((row) => this.mapEmployee(row));
    }

    const result = await this.db.query<DbEmployee>(`SELECT * FROM core_employees ORDER BY full_name ASC`);
    return result.rows.map((row) => this.mapEmployee(row));
  }

  async getDirectReports(ctx: RequestContext, managerId: string) {
    if (ctx.role === 'employee') {
      throw new UnauthorizedException('You are not allowed to view direct reports.');
    }

    if (ctx.role === 'manager' && ctx.employeeId !== managerId) {
      throw new UnauthorizedException('Managers can only view their own direct reports.');
    }

    const result = await this.db.query<DbEmployee>(`SELECT * FROM core_employees WHERE manager_id = $1 ORDER BY full_name ASC`, [
      managerId,
    ]);
    return result.rows.map((row) => this.mapEmployee(row));
  }

  async createLifecycleEvent(
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

    await this.ensureEmployeeExists(payload.employeeId);

    if (payload.changes?.departmentId) {
      await this.ensureDepartmentExists(payload.changes.departmentId);
    }
    if (payload.changes?.managerId) {
      await this.ensureEmployeeExists(payload.changes.managerId);
    }

    const event: LifecycleEvent = {
      id: this.id('life'),
      ...payload,
    };

    await this.db.query(
      `
      INSERT INTO core_lifecycle_events (id, employee_id, type, effective_date, notes, changes)
      VALUES ($1, $2, $3, $4, $5, $6)
      `,
      [event.id, event.employeeId, event.type, event.effectiveDate, event.notes ?? null, event.changes ? JSON.stringify(event.changes) : null],
    );

    if (payload.changes) {
      const existing = await this.db.query<DbEmployee>(`SELECT * FROM core_employees WHERE id = $1 LIMIT 1`, [payload.employeeId]);
      const employee = existing.rows[0];
      if (employee) {
        const next = {
          departmentId: payload.changes.departmentId ?? employee.department_id,
          title: payload.changes.title ?? employee.title,
          managerId: payload.changes.managerId ?? employee.manager_id,
          status: payload.changes.status ?? employee.status,
        };

        await this.db.query(
          `
          UPDATE core_employees
          SET department_id = $2,
              title = $3,
              manager_id = $4,
              status = $5,
              updated_at = NOW()
          WHERE id = $1
          `,
          [payload.employeeId, next.departmentId, next.title, next.managerId ?? null, next.status],
        );
      }
    }

    await this.opsService.addAudit({
      actorId: ctx.employeeId || 'hr_admin',
      action: 'employee.lifecycle.updated',
      entity: 'lifecycle_event',
      entityId: event.id,
      metadata: { employeeId: event.employeeId, type: event.type },
    });

    return event;
  }

  async getLifecycleHistory(ctx: RequestContext, employeeId: string) {
    if (ctx.role === 'employee' && ctx.employeeId !== employeeId) {
      throw new UnauthorizedException('Employees can only view their own lifecycle history.');
    }

    if (ctx.role === 'manager') {
      const managesResult = await this.db.query<{ id: string }>(
        `SELECT id FROM core_employees WHERE id = $1 AND manager_id = $2 LIMIT 1`,
        [employeeId, ctx.employeeId ?? ''],
      );
      const managesEmployee = Boolean(managesResult.rows[0]);
      if (!managesEmployee && ctx.employeeId !== employeeId) {
        throw new UnauthorizedException('Managers can only view lifecycle history for direct reports.');
      }
    }

    const result = await this.db.query<DbLifecycle>(
      `SELECT id, employee_id, type, effective_date, notes, changes FROM core_lifecycle_events WHERE employee_id = $1 ORDER BY effective_date DESC`,
      [employeeId],
    );

    return result.rows.map((row) => ({
      id: row.id,
      employeeId: row.employee_id,
      type: row.type,
      effectiveDate: row.effective_date,
      notes: row.notes ?? undefined,
      changes: row.changes ?? undefined,
    }));
  }

  async seedDemoData() {
    const deptCount = await this.db.query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM core_departments`);
    const empCount = await this.db.query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM core_employees`);
    if (Number(deptCount.rows[0]?.count || '0') > 0 || Number(empCount.rows[0]?.count || '0') > 0) {
      return { message: 'Demo data already exists.' };
    }

    const eng = { id: this.id('dept'), name: 'Engineering', code: 'ENG' };
    const hr = { id: this.id('dept'), name: 'Human Resources', code: 'HR' };

    await this.db.query(`INSERT INTO core_departments (id, name, code) VALUES ($1, $2, $3), ($4, $5, $6)`, [
      eng.id,
      eng.name,
      eng.code,
      hr.id,
      hr.name,
      hr.code,
    ]);

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

    await this.db.query(
      `
      INSERT INTO core_employees (
        id, full_name, employee_id, join_date, department_id, title, manager_id, status, phone, email, emergency_contact
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11), ($12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
      `,
      [
        manager.id,
        manager.fullName,
        manager.employeeId,
        manager.joinDate,
        manager.departmentId,
        manager.title,
        manager.managerId ?? null,
        manager.status,
        manager.phone ?? null,
        manager.email ?? null,
        manager.emergencyContact ? JSON.stringify(manager.emergencyContact) : null,
        directReport.id,
        directReport.fullName,
        directReport.employeeId,
        directReport.joinDate,
        directReport.departmentId,
        directReport.title,
        directReport.managerId ?? null,
        directReport.status,
        directReport.phone ?? null,
        directReport.email ?? null,
        directReport.emergencyContact ? JSON.stringify(directReport.emergencyContact) : null,
      ],
    );

    return {
      message: 'Demo data seeded.',
      managerId: manager.id,
      employeeId: directReport.id,
    };
  }

  async headcountStats() {
    const result = await this.db.query<{ total: string; active: string }>(
      `
      SELECT COUNT(*)::text AS total,
             COUNT(*) FILTER (WHERE status = 'active')::text AS active
      FROM core_employees
      `,
    );

    const total = Number(result.rows[0]?.total || '0');
    const active = Number(result.rows[0]?.active || '0');
    return {
      total,
      active,
      inactive: total - active,
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

  private async ensureDepartmentExists(departmentId: string) {
    const result = await this.db.query<{ id: string }>(`SELECT id FROM core_departments WHERE id = $1 LIMIT 1`, [departmentId]);
    if (!result.rows[0]) {
      throw new BadRequestException('Department does not exist.');
    }
  }

  private async ensureEmployeeExists(employeeId: string) {
    const result = await this.db.query<{ id: string }>(`SELECT id FROM core_employees WHERE id = $1 LIMIT 1`, [employeeId]);
    if (!result.rows[0]) {
      throw new BadRequestException('Manager/Employee reference does not exist.');
    }
  }

  private async ensureCustomerExists(customerId: string) {
    const result = await this.db.query<{ id: string }>(`SELECT id FROM core_customers WHERE id = $1 LIMIT 1`, [customerId]);
    if (!result.rows[0]) {
      throw new BadRequestException('Customer does not exist.');
    }
  }

  private assertHrAdmin(ctx: RequestContext) {
    if (ctx.role !== 'hr_admin') {
      throw new UnauthorizedException('Only HR Admin can perform this action.');
    }
  }

  private mapEmployee(row: DbEmployee): EmployeeProfile {
    return {
      id: row.id,
      fullName: row.full_name,
      employeeId: row.employee_id,
      joinDate: row.join_date,
      departmentId: row.department_id,
      title: row.title,
      managerId: row.manager_id ?? undefined,
      status: row.status,
      phone: row.phone ?? undefined,
      email: row.email ?? undefined,
      emergencyContact: row.emergency_contact ?? undefined,
    };
  }

  private toDbEmployeePartial(next: {
    fullName: string;
    joinDate: string;
    departmentId: string;
    title: string;
    managerId: string | null;
    status: 'active' | 'inactive';
    phone: string | null;
    email: string | null;
    emergencyContact: { name: string; relationship: string; phone: string } | null;
  }) {
    return {
      full_name: next.fullName,
      join_date: next.joinDate,
      department_id: next.departmentId,
      title: next.title,
      manager_id: next.managerId,
      status: next.status,
      phone: next.phone,
      email: next.email,
      emergency_contact: next.emergencyContact,
    };
  }

  private id(prefix: string) {
    return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
  }
}
