export type UserRole = 'employee' | 'manager' | 'hr_admin';

export interface AppUser {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  employee_id: string | null;
  password_hash: string;
  refresh_token_hash: string | null;
  created_at: string;
  updated_at: string;
}

export interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
  employeeId?: string;
  type: 'access' | 'refresh';
}
