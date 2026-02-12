import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: Array<'employee' | 'manager' | 'hr_admin'>) => SetMetadata(ROLES_KEY, roles);
