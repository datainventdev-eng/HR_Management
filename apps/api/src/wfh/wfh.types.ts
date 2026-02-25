export type WfhRole = 'employee' | 'manager' | 'hr_admin';

export interface WfhRequest {
  id: string;
  employeeId: string;
  employeeName?: string;
  startDate: string;
  endDate: string;
  reason: string;
  status: 'Pending' | 'Approved' | 'Rejected';
  managerComment?: string;
  createdAt: string;
}
