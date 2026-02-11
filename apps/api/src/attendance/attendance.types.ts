export type AttendanceRole = 'employee' | 'manager' | 'hr_admin';

export interface AttendanceRecord {
  id: string;
  employeeId: string;
  date: string;
  checkInTime?: string;
  checkOutTime?: string;
  totalHours?: number;
  isLate: boolean;
  leftEarly: boolean;
}

export interface Shift {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
}

export interface ShiftAssignment {
  id: string;
  employeeId: string;
  shiftId: string;
  fromDate: string;
  toDate: string;
}

export interface OfficeHours {
  startTime: string;
  endTime: string;
}
