export type LeaveRole = 'employee' | 'manager' | 'hr_admin';

export interface LeaveType {
  id: string;
  name: string;
  paid: boolean;
  annualLimit?: number;
}

export interface LeaveAllocation {
  id: string;
  employeeId: string;
  leaveTypeId: string;
  allocated: number;
  used: number;
}

export interface LeaveRequest {
  id: string;
  employeeId: string;
  managerId: string;
  leaveTypeId: string;
  startDate: string;
  endDate: string;
  reason?: string;
  days: number;
  status: 'Pending' | 'Approved' | 'Rejected';
  managerComment?: string;
  createdAt: string;
}

export interface EmployeeManagerMap {
  employeeId: string;
  managerId: string;
}
