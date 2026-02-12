import { Injectable } from '@nestjs/common';

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
export class OpsService {
  private readonly notifications: NotificationItem[] = [];
  private readonly audits: AuditItem[] = [];

  addNotification(payload: Omit<NotificationItem, 'id' | 'createdAt' | 'read'>) {
    const item: NotificationItem = {
      id: this.id('notif'),
      read: false,
      createdAt: new Date().toISOString(),
      ...payload,
    };
    this.notifications.unshift(item);
    return item;
  }

  listNotifications(userId?: string) {
    return userId ? this.notifications.filter((item) => item.userId === userId) : this.notifications;
  }

  markNotificationRead(id: string) {
    const item = this.notifications.find((row) => row.id === id);
    if (item) {
      item.read = true;
    }
    return item;
  }

  addAudit(payload: Omit<AuditItem, 'id' | 'createdAt'>) {
    const item: AuditItem = {
      id: this.id('audit'),
      createdAt: new Date().toISOString(),
      ...payload,
    };
    this.audits.unshift(item);
    return item;
  }

  listAudits(entity?: string) {
    return entity ? this.audits.filter((item) => item.entity === entity) : this.audits;
  }

  latestActivity(limit = 10) {
    return this.audits.slice(0, limit);
  }

  private id(prefix: string) {
    return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
  }
}
