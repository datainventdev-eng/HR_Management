import { UnauthorizedException } from '@nestjs/common';
import { CoreHrService } from '../src/core-hr/core-hr.service';

describe('CoreHrService', () => {
  it('blocks duplicate employee IDs', () => {
    const service = new CoreHrService();
    const admin = { role: 'hr_admin' as const };

    const dept = service.createDepartment(admin, { name: 'Engineering' });

    service.createEmployee(admin, {
      fullName: 'John Doe',
      employeeId: 'EMP-100',
      joinDate: '2025-01-01',
      departmentId: dept.id,
      title: 'Manager',
      status: 'active',
    });

    expect(() =>
      service.createEmployee(admin, {
        fullName: 'Jane Doe',
        employeeId: 'EMP-100',
        joinDate: '2025-01-10',
        departmentId: dept.id,
        title: 'Developer',
        status: 'active',
      }),
    ).toThrow('Employee ID already exists.');
  });

  it('allows only hr_admin to create departments', () => {
    const service = new CoreHrService();

    expect(() => service.createDepartment({ role: 'manager', employeeId: 'm1' }, { name: 'Finance' })).toThrow(
      UnauthorizedException,
    );
  });
});
