export type Role = 'employee' | 'manager' | 'hr_admin';

export const approvalStatuses = [
  'Draft',
  'Submitted',
  'Pending',
  'Approved',
  'Rejected',
] as const;
