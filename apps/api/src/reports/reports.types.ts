export type ReportsRole = 'employee' | 'manager' | 'hr_admin';

export interface HeadcountSummary {
  totalActive: number;
  byDepartment: Array<{ department: string; count: number }>;
  byLocation: Array<{ location: string; count: number }>;
}

export interface AttendanceSummary {
  from: string;
  to: string;
  presentDays: number;
  lateCount: number;
  earlyLeaveCount: number;
}

export interface LeaveSummary {
  from: string;
  to: string;
  approvedDaysByType: Array<{ leaveType: string; days: number }>;
  requestsByStatus: Array<{ status: 'Pending' | 'Approved' | 'Rejected'; count: number }>;
}

export interface PayrollSummary {
  month: string;
  totalGross: number;
  totalDeductions: number;
  totalNet: number;
}

export interface HiringFunnelSummary {
  jobTitle: string;
  stages: Array<{ stage: string; count: number }>;
}
