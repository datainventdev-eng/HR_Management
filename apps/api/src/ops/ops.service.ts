import { Injectable, OnModuleInit } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

export interface NotificationItem {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: 'leave' | 'timesheet' | 'payroll' | 'system';
  read: boolean;
  createdAt: string;
}

export interface AuditItem {
  id: string;
  actorId: string;
  action: string;
  entity: string;
  entityId: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class OpsService implements OnModuleInit {
  constructor(private readonly db: DatabaseService) {}

  async onModuleInit() {
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS app_notifications (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id TEXT NOT NULL,
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('leave','timesheet','payroll','system')),
        read BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await this.db.query(`
      CREATE TABLE IF NOT EXISTS app_audits (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        actor_id TEXT NOT NULL,
        action TEXT NOT NULL,
        entity TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        metadata JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
  }

  async addNotification(payload: Omit<NotificationItem, 'id' | 'createdAt' | 'read'>) {
    const result = await this.db.query<{
      id: string;
      user_id: string;
      title: string;
      message: string;
      type: 'leave' | 'timesheet' | 'payroll' | 'system';
      read: boolean;
      created_at: string;
    }>(
      `
      INSERT INTO app_notifications (user_id, title, message, type, read)
      VALUES ($1, $2, $3, $4, FALSE)
      RETURNING *
      `,
      [payload.userId, payload.title, payload.message, payload.type],
    );
    return this.mapNotification(result.rows[0]);
  }

  async listNotifications(userId?: string) {
    const result = userId
      ? await this.db.query<any>(`SELECT * FROM app_notifications WHERE user_id = $1 ORDER BY created_at DESC`, [userId])
      : await this.db.query<any>(`SELECT * FROM app_notifications ORDER BY created_at DESC`);
    return result.rows.map((row) => this.mapNotification(row));
  }

  async markNotificationRead(id: string) {
    const result = await this.db.query<any>(
      `UPDATE app_notifications SET read = TRUE WHERE id = $1 RETURNING *`,
      [id],
    );
    return result.rows[0] ? this.mapNotification(result.rows[0]) : null;
  }

  async addAudit(payload: Omit<AuditItem, 'id' | 'createdAt'>) {
    const result = await this.db.query<any>(
      `
      INSERT INTO app_audits (actor_id, action, entity, entity_id, metadata)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
      `,
      [payload.actorId, payload.action, payload.entity, payload.entityId, payload.metadata ?? null],
    );
    return this.mapAudit(result.rows[0]);
  }

  async listAudits(entity?: string) {
    const result = entity
      ? await this.db.query<any>(`SELECT * FROM app_audits WHERE entity = $1 ORDER BY created_at DESC`, [entity])
      : await this.db.query<any>(`SELECT * FROM app_audits ORDER BY created_at DESC`);
    return result.rows.map((row) => this.mapAudit(row));
  }

  async latestActivity(limit = 10) {
    const result = await this.db.query<any>(`SELECT * FROM app_audits ORDER BY created_at DESC LIMIT $1`, [limit]);
    return result.rows.map((row) => this.mapAudit(row));
  }

  private mapNotification(row: any): NotificationItem {
    return {
      id: row.id,
      userId: row.user_id,
      title: row.title,
      message: row.message,
      type: row.type,
      read: row.read,
      createdAt: row.created_at,
    };
  }

  private mapAudit(row: any): AuditItem {
    return {
      id: row.id,
      actorId: row.actor_id,
      action: row.action,
      entity: row.entity,
      entityId: row.entity_id,
      createdAt: row.created_at,
      metadata: row.metadata ?? undefined,
    };
  }
}
