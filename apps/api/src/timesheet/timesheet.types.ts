export type TimesheetRole = 'employee' | 'manager' | 'hr_admin';

export type TimesheetStatus = 'Draft' | 'Submitted' | 'Approved' | 'Rejected';

export interface TimesheetEntry {
  day: string;
  hours: number;
}

export interface Timesheet {
  id: string;
  employeeId: string;
  managerId: string;
  weekStartDate: string;
  entries: TimesheetEntry[];
  totalHours: number;
  status: TimesheetStatus;
  managerComment?: string;
  history: Array<{
    status: TimesheetStatus;
    at: string;
    comment?: string;
  }>;
}

export interface EmployeeManagerMap {
  employeeId: string;
  managerId: string;
}
