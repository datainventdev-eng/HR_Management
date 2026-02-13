export type UserRole = 'employee' | 'manager' | 'hr_admin';

export interface EmployeeProfile {
  id: string;
  fullName: string;
  employeeId: string;
  joinDate: string;
  departmentId: string;
  title: string;
  managerId?: string;
  status: 'active' | 'inactive';
  phone?: string;
  email?: string;
  emergencyContact?: {
    name: string;
    relationship: string;
    phone: string;
  };
}

export interface Department {
  id: string;
  name: string;
  code?: string;
}

export interface LifecycleEvent {
  id: string;
  employeeId: string;
  type: 'transfer' | 'promotion' | 'resignation' | 'termination';
  effectiveDate: string;
  notes?: string;
  changes?: Partial<Pick<EmployeeProfile, 'departmentId' | 'title' | 'managerId' | 'status'>>;
}

export interface Customer {
  id: string;
  name: string;
  description?: string;
}

export interface Project {
  id: string;
  customerId: string;
  customerName?: string;
  name: string;
  description?: string;
}
