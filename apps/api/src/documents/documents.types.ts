export type DocumentsRole = 'employee' | 'manager' | 'hr_admin';

export interface EmployeeDocument {
  id: string;
  employeeId: string;
  name: string;
  fileName: string;
  expiresOn?: string;
  uploadedAt: string;
}

export interface PolicyDocument {
  id: string;
  title: string;
  fileName: string;
  published: boolean;
  uploadedAt: string;
}
