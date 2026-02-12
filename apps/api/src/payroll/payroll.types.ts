export type PayrollRole = 'employee' | 'manager' | 'hr_admin';

export interface SalaryComponent {
  id: string;
  employeeId: string;
  type: 'earning' | 'deduction';
  name: string;
  amount: number;
  effectiveFrom: string;
}

export interface PayrollEntry {
  employeeId: string;
  month: string;
  gross: number;
  deductions: number;
  net: number;
  status: 'Draft' | 'Finalized';
}

export interface Payslip {
  id: string;
  employeeId: string;
  month: string;
  gross: number;
  deductions: number;
  net: number;
}
