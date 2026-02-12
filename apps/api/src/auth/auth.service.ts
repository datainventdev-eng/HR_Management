import { BadRequestException, Injectable, InternalServerErrorException, UnauthorizedException } from '@nestjs/common';
import { compare, hash } from 'bcryptjs';
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
        password_hash TEXT NOT NULL,
        refresh_token_hash TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    const adminEmail = process.env.BOOTSTRAP_ADMIN_EMAIL;
    const adminPassword = process.env.BOOTSTRAP_ADMIN_PASSWORD;
    if (adminEmail && adminPassword) {
      const existing = await this.findUserByEmail(adminEmail);
      if (!existing) {
        const passwordHash = await hash(adminPassword, 10);
        await this.db.query(
          `INSERT INTO app_users (email, full_name, role, password_hash) VALUES ($1, $2, 'hr_admin', $3)`,
          [adminEmail.toLowerCase(), 'System Admin', passwordHash],
        );
      }
    }
  }

  async register(payload: { email: string; password: string; fullName: string; role?: UserRole; employeeId?: string }) {
    const email = payload.email.trim().toLowerCase();
    if (!email || !payload.password || !payload.fullName?.trim()) {
      throw new BadRequestException('Email, password, and full name are required.');
    }

    const existing = await this.findUserByEmail(email);
    if (existing) {
      throw new BadRequestException('User with this email already exists.');
    }

    if (payload.role && payload.role !== 'employee') {
      throw new BadRequestException('Role cannot be elevated during self-registration.');
    }

    const role: UserRole = 'employee';
    const passwordHash = await hash(payload.password, 10);

    const result = await this.db.query<AppUser>(
      `
      INSERT INTO app_users (email, full_name, role, employee_id, password_hash)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
      `,
      [email, payload.fullName.trim(), role, payload.employeeId ?? null, passwordHash],
    );

    const user = result.rows[0];
    return this.issueTokens(user);
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
      },
      accessToken,
      refreshToken,
    };
  }

  private signToken(payload: JwtPayload, secret: string | undefined, expiresIn: string) {
    if (!secret) {
      throw new InternalServerErrorException('JWT secret is not configured.');
    }

    return jwt.sign(payload, secret, { expiresIn });
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
}
