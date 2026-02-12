export interface CurrentUser {
  id: string;
  email: string;
  role: 'employee' | 'manager' | 'hr_admin';
  employeeId?: string;
}
