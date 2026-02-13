import { BadRequestException, Injectable, InternalServerErrorException, UnauthorizedException } from '@nestjs/common';
import { compare, hash } from 'bcryptjs';
import { randomBytes } from 'crypto';
import * as jwt from 'jsonwebtoken';
import { DatabaseService } from '../database/database.service';
import { AppUser, JwtPayload, UserRole } from './auth.types';

@Injectable()
export class AuthService {
  constructor(private readonly db: DatabaseService) {}

  async ensureSchema() {
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS app_users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email TEXT UNIQUE NOT NULL,
        full_name TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('employee','manager','hr_admin')),
        employee_id TEXT,
        must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
        password_hash TEXT NOT NULL,
        refresh_token_hash TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await this.db.query(`
      ALTER TABLE app_users
      ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE;
    `);

    const adminEmail = process.env.BOOTSTRAP_ADMIN_EMAIL;
    const adminPassword = process.env.BOOTSTRAP_ADMIN_PASSWORD;
    if (adminEmail && adminPassword) {
      const existing = await this.findUserByEmail(adminEmail);
      if (!existing) {
        const passwordHash = await hash(adminPassword, 10);
        await this.db.query(
          `INSERT INTO app_users (email, full_name, role, must_change_password, password_hash) VALUES ($1, $2, 'hr_admin', FALSE, $3)`,
          [adminEmail.toLowerCase(), 'System Admin', passwordHash],
        );
      }
    }
  }

  async register(payload: { email: string; password: string; fullName: string; role?: UserRole; employeeId?: string }) {
    throw new BadRequestException('Public signup is disabled. HR Admin must create user accounts.');
  }

  async createUserByAdmin(
    actor: { role: UserRole; id: string },
    payload: {
      email: string;
      fullName: string;
      role: UserRole;
      employeeId?: string;
      joinDate?: string;
      departmentId?: string;
      title?: string;
      managerId?: string;
      status?: 'active' | 'inactive';
    },
  ) {
    if (actor.role !== 'hr_admin') {
      throw new UnauthorizedException('Only HR Admin can create users.');
    }

    const email = payload.email.trim().toLowerCase();
    if (!email || !payload.fullName?.trim()) {
      throw new BadRequestException('Email and full name are required.');
    }

    const existing = await this.findUserByEmail(email);
    if (existing) {
      throw new BadRequestException('User with this email already exists.');
    }

    const linkedEmployeeProfileId = await this.resolveEmployeeProfileIdForProvisioning(payload);
    const temporaryPassword = this.generateTemporaryPassword();
    const passwordHash = await hash(temporaryPassword, 10);

    const result = await this.db.query<AppUser>(
      `
      INSERT INTO app_users (email, full_name, role, employee_id, must_change_password, password_hash)
      VALUES ($1, $2, $3, $4, TRUE, $5)
      RETURNING *
      `,
      [email, payload.fullName.trim(), payload.role, linkedEmployeeProfileId, passwordHash],
    );

    const user = result.rows[0];
    return {
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        role: user.role,
        employeeId: user.employee_id,
        mustChangePassword: user.must_change_password,
      },
      temporaryPassword,
      provisionedEmployeeProfileId: linkedEmployeeProfileId,
    };
  }

  async login(payload: { email: string; password: string }) {
    const email = payload.email.trim().toLowerCase();
    const user = await this.findUserByEmail(email);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials.');
    }

    const isValid = await compare(payload.password, user.password_hash);
    if (!isValid) {
      throw new UnauthorizedException('Invalid credentials.');
    }

    return this.issueTokens(user);
  }

  async refresh(payload: { refreshToken: string }) {
    const token = payload.refreshToken;
    if (!token) {
      throw new UnauthorizedException('Refresh token is required.');
    }

    const decoded = this.verifyToken(token, 'refresh');
    const user = await this.findUserById(decoded.sub);
    if (!user || !user.refresh_token_hash) {
      throw new UnauthorizedException('Refresh token is invalid.');
    }

    const isValid = await compare(token, user.refresh_token_hash);
    if (!isValid) {
      throw new UnauthorizedException('Refresh token is invalid.');
    }

    return this.issueTokens(user);
  }

  async logout(userId: string) {
    await this.db.query(`UPDATE app_users SET refresh_token_hash = NULL, updated_at = NOW() WHERE id = $1`, [userId]);
    return { success: true };
  }

  async changePassword(userId: string, payload: { currentPassword?: string; newPassword: string }) {
    const user = await this.findUserById(userId);
    if (!user) {
      throw new UnauthorizedException('User not found.');
    }

    if (!payload.newPassword?.trim()) {
      throw new BadRequestException('New password is required.');
    }

    if (!user.must_change_password) {
      if (!payload.currentPassword) {
        throw new BadRequestException('Current password is required.');
      }
      const isValid = await compare(payload.currentPassword, user.password_hash);
      if (!isValid) {
        throw new UnauthorizedException('Current password is invalid.');
      }
    }

    const sameAsCurrent = await compare(payload.newPassword, user.password_hash);
    if (sameAsCurrent) {
      throw new BadRequestException('New password must be different from current password.');
    }

    const newHash = await hash(payload.newPassword, 10);
    await this.db.query(
      `UPDATE app_users SET password_hash = $2, must_change_password = FALSE, refresh_token_hash = NULL, updated_at = NOW() WHERE id = $1`,
      [userId, newHash],
    );

    return { success: true };
  }

  async getMe(userId: string) {
    const user = await this.findUserById(userId);
    if (!user) {
      throw new UnauthorizedException('User not found.');
    }

    return {
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      role: user.role,
      employeeId: user.employee_id,
      mustChangePassword: user.must_change_password,
    };
  }

  verifyAccessToken(token: string) {
    return this.verifyToken(token, 'access');
  }

  private async issueTokens(user: AppUser) {
    const accessToken = this.signToken(
      {
        sub: user.id,
        email: user.email,
        role: user.role,
        employeeId: user.employee_id ?? undefined,
        type: 'access',
      },
      process.env.JWT_ACCESS_SECRET,
      process.env.JWT_ACCESS_EXPIRES_IN ?? '1h',
    );

    const refreshToken = this.signToken(
      {
        sub: user.id,
        email: user.email,
        role: user.role,
        employeeId: user.employee_id ?? undefined,
        type: 'refresh',
      },
      process.env.JWT_REFRESH_SECRET,
      process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
    );

    const refreshHash = await hash(refreshToken, 10);

    await this.db.query(`UPDATE app_users SET refresh_token_hash = $1, updated_at = NOW() WHERE id = $2`, [refreshHash, user.id]);

    return {
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        role: user.role,
        employeeId: user.employee_id,
        mustChangePassword: user.must_change_password,
      },
      accessToken,
      refreshToken,
    };
  }

  private signToken(payload: JwtPayload, secret: string | undefined, expiresIn: string) {
    if (!secret) {
      throw new InternalServerErrorException('JWT secret is not configured.');
    }

    const options: jwt.SignOptions = {
      expiresIn: expiresIn as jwt.SignOptions['expiresIn'],
    };
    return jwt.sign(payload, secret as jwt.Secret, options);
  }

  private verifyToken(token: string, expectedType: 'access' | 'refresh') {
    const secret = expectedType === 'access' ? process.env.JWT_ACCESS_SECRET : process.env.JWT_REFRESH_SECRET;

    if (!secret) {
      throw new InternalServerErrorException('JWT secret is not configured.');
    }

    try {
      const payload = jwt.verify(token, secret) as JwtPayload;
      if (payload.type !== expectedType) {
        throw new UnauthorizedException('Token type is invalid.');
      }
      return payload;
    } catch {
      throw new UnauthorizedException('Token is invalid or expired.');
    }
  }

  private async findUserByEmail(email: string) {
    const result = await this.db.query<AppUser>(`SELECT * FROM app_users WHERE email = $1 LIMIT 1`, [email]);
    return result.rows[0] ?? null;
  }

  private async findUserById(id: string) {
    const result = await this.db.query<AppUser>(`SELECT * FROM app_users WHERE id = $1 LIMIT 1`, [id]);
    return result.rows[0] ?? null;
  }

  private async resolveEmployeeProfileIdForProvisioning(payload: {
    email: string;
    fullName: string;
    role: UserRole;
    employeeId?: string;
    joinDate?: string;
    departmentId?: string;
    title?: string;
    managerId?: string;
    status?: 'active' | 'inactive';
  }) {
    if (payload.role !== 'employee' && payload.role !== 'manager') {
      return payload.employeeId ?? null;
    }

    await this.ensureCoreHrSchema();

    if (payload.employeeId) {
      const existing = await this.db.query<{ id: string }>(`SELECT id FROM core_employees WHERE id = $1 LIMIT 1`, [payload.employeeId]);
      if (!existing.rows[0]) {
        throw new BadRequestException('Provided employee profile ID does not exist.');
      }
      return payload.employeeId;
    }

    const departmentId = payload.departmentId || (await this.ensureDefaultDepartment());
    const joinDate = payload.joinDate || new Date().toISOString().slice(0, 10);
    const profileId = this.id('emp');
    const employeeCode = this.generateEmployeeCode();
    const title = payload.title || (payload.role === 'manager' ? 'Manager' : 'Employee');
    const status = payload.status || 'active';

    if (payload.departmentId) {
      const dept = await this.db.query<{ id: string }>(`SELECT id FROM core_departments WHERE id = $1 LIMIT 1`, [payload.departmentId]);
      if (!dept.rows[0]) {
        throw new BadRequestException('Selected department does not exist.');
      }
    }

    if (payload.managerId) {
      const manager = await this.db.query<{ id: string }>(`SELECT id FROM core_employees WHERE id = $1 LIMIT 1`, [payload.managerId]);
      if (!manager.rows[0]) {
        throw new BadRequestException('Selected manager does not exist.');
      }
    }

    await this.db.query(
      `
      INSERT INTO core_employees (
        id, full_name, employee_id, join_date, department_id, title, manager_id, status, phone, email, emergency_contact
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      `,
      [profileId, payload.fullName.trim(), employeeCode, joinDate, departmentId, title, payload.managerId || null, status, null, payload.email, null],
    );

    return profileId;
  }

  private async ensureCoreHrSchema() {
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS core_departments (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        code TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await this.db.query(`
      CREATE TABLE IF NOT EXISTS core_employees (
        id TEXT PRIMARY KEY,
        full_name TEXT NOT NULL,
        employee_id TEXT UNIQUE NOT NULL,
        join_date DATE NOT NULL,
        department_id TEXT NOT NULL,
        title TEXT NOT NULL,
        manager_id TEXT,
        status TEXT NOT NULL CHECK (status IN ('active','inactive')),
        phone TEXT,
        email TEXT,
        emergency_contact JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT fk_core_department FOREIGN KEY (department_id) REFERENCES core_departments(id)
      );
    `);
  }

  private async ensureDefaultDepartment() {
    const existing = await this.db.query<{ id: string }>(`SELECT id FROM core_departments ORDER BY created_at ASC LIMIT 1`);
    if (existing.rows[0]) {
      return existing.rows[0].id;
    }

    const deptId = this.id('dept');
    await this.db.query(`INSERT INTO core_departments (id, name, code) VALUES ($1, $2, $3)`, [deptId, 'General', 'GEN']);
    return deptId;
  }

  private generateEmployeeCode() {
    return `EMP-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  }

  private id(prefix: string) {
    return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
  }

  private generateTemporaryPassword() {
    return randomBytes(18).toString('base64url');
  }
}
