import { BadRequestException, Injectable, OnModuleInit, UnauthorizedException } from '@nestjs/common';
import { DocumentsRole, EmployeeDocument, PolicyDocument } from './documents.types';
import { DatabaseService } from '../database/database.service';

interface DocumentsContext {
  role: DocumentsRole;
  employeeId?: string;
}

@Injectable()
export class DocumentsService implements OnModuleInit {
  constructor(private readonly db: DatabaseService) {}

  async onModuleInit() {
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS document_employee_docs (
        id TEXT PRIMARY KEY,
        employee_id TEXT NOT NULL,
        name TEXT NOT NULL,
        file_name TEXT NOT NULL,
        expires_on DATE,
        uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await this.db.query(`
      CREATE TABLE IF NOT EXISTS document_policies (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        file_name TEXT NOT NULL,
        published BOOLEAN NOT NULL DEFAULT TRUE,
        uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
  }

  async uploadEmployeeDocument(
    ctx: DocumentsContext,
    payload: { employeeId: string; name: string; fileName: string; expiresOn?: string },
  ) {
    this.assertHrAdmin(ctx);
    if (!payload.employeeId?.trim() || !payload.name?.trim() || !payload.fileName?.trim()) {
      throw new BadRequestException('Employee ID, document name, and file name are required.');
    }

    const doc: EmployeeDocument = {
      id: this.id('edoc'),
      ...payload,
      uploadedAt: new Date().toISOString(),
    };

    await this.db.query(
      `
      INSERT INTO document_employee_docs (id, employee_id, name, file_name, expires_on, uploaded_at)
      VALUES ($1, $2, $3, $4, $5, NOW())
      `,
      [doc.id, doc.employeeId, doc.name, doc.fileName, doc.expiresOn ?? null],
    );

    return doc;
  }

  async listEmployeeDocuments(ctx: DocumentsContext, employeeId?: string) {
    const targetId = ctx.role === 'employee' ? ctx.employeeId : employeeId;
    const result = targetId
      ? await this.db.query<{
          id: string;
          employee_id: string;
          name: string;
          file_name: string;
          expires_on: string | null;
          uploaded_at: string;
        }>(
          `
          SELECT id, employee_id, name, file_name, expires_on::text AS expires_on, uploaded_at::text AS uploaded_at
          FROM document_employee_docs
          WHERE employee_id = $1
          ORDER BY uploaded_at DESC
          `,
          [targetId],
        )
      : await this.db.query<{
          id: string;
          employee_id: string;
          name: string;
          file_name: string;
          expires_on: string | null;
          uploaded_at: string;
        }>(
          `
          SELECT id, employee_id, name, file_name, expires_on::text AS expires_on, uploaded_at::text AS uploaded_at
          FROM document_employee_docs
          ORDER BY uploaded_at DESC
          `,
        );

    return result.rows.map((row) => ({
      id: row.id,
      employeeId: row.employee_id,
      name: row.name,
      fileName: row.file_name,
      expiresOn: row.expires_on ?? undefined,
      uploadedAt: row.uploaded_at,
    }));
  }

  async publishPolicy(ctx: DocumentsContext, payload: { title: string; fileName: string; published?: boolean }) {
    this.assertHrAdmin(ctx);
    if (!payload.title?.trim() || !payload.fileName?.trim()) {
      throw new BadRequestException('Policy title and file name are required.');
    }

    const policy: PolicyDocument = {
      id: this.id('pdoc'),
      title: payload.title,
      fileName: payload.fileName,
      published: payload.published ?? true,
      uploadedAt: new Date().toISOString(),
    };

    await this.db.query(
      `
      INSERT INTO document_policies (id, title, file_name, published, uploaded_at)
      VALUES ($1, $2, $3, $4, NOW())
      `,
      [policy.id, policy.title, policy.fileName, policy.published],
    );

    return policy;
  }

  async updatePolicyStatus(ctx: DocumentsContext, payload: { policyId: string; published: boolean }) {
    this.assertHrAdmin(ctx);

    const exists = await this.db.query<{ id: string; title: string; file_name: string; uploaded_at: string }>(
      `SELECT id, title, file_name, uploaded_at::text AS uploaded_at FROM document_policies WHERE id = $1 LIMIT 1`,
      [payload.policyId],
    );
    const policy = exists.rows[0];
    if (!policy) {
      throw new BadRequestException('Policy document not found.');
    }

    await this.db.query(`UPDATE document_policies SET published = $2 WHERE id = $1`, [payload.policyId, payload.published]);

    return {
      id: policy.id,
      title: policy.title,
      fileName: policy.file_name,
      published: payload.published,
      uploadedAt: policy.uploaded_at,
    };
  }

  async listPolicies(ctx: DocumentsContext) {
    const result = ctx.role === 'hr_admin'
      ? await this.db.query<{ id: string; title: string; file_name: string; published: boolean; uploaded_at: string }>(
          `SELECT id, title, file_name, published, uploaded_at::text AS uploaded_at FROM document_policies ORDER BY uploaded_at DESC`,
        )
      : await this.db.query<{ id: string; title: string; file_name: string; published: boolean; uploaded_at: string }>(
          `SELECT id, title, file_name, published, uploaded_at::text AS uploaded_at FROM document_policies WHERE published = TRUE ORDER BY uploaded_at DESC`,
        );

    return result.rows.map((row) => ({
      id: row.id,
      title: row.title,
      fileName: row.file_name,
      published: row.published,
      uploadedAt: row.uploaded_at,
    }));
  }

  async expiringInNext30Days(ctx: DocumentsContext) {
    this.assertHrAdmin(ctx);

    const result = await this.db.query<{
      id: string;
      employee_id: string;
      name: string;
      file_name: string;
      expires_on: string;
      uploaded_at: string;
    }>(
      `
      SELECT id, employee_id, name, file_name, expires_on::text AS expires_on, uploaded_at::text AS uploaded_at
      FROM document_employee_docs
      WHERE expires_on IS NOT NULL
        AND expires_on >= CURRENT_DATE
        AND expires_on <= (CURRENT_DATE + INTERVAL '30 days')
      ORDER BY expires_on ASC
      `,
    );

    return result.rows.map((row) => ({
      id: row.id,
      employeeId: row.employee_id,
      name: row.name,
      fileName: row.file_name,
      expiresOn: row.expires_on,
      uploadedAt: row.uploaded_at,
    }));
  }

  async seedDemoData() {
    const policyCount = await this.db.query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM document_policies`);
    const employeeDocCount = await this.db.query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM document_employee_docs`);

    if (Number(policyCount.rows[0]?.count || '0') === 0 && Number(employeeDocCount.rows[0]?.count || '0') === 0) {
      await this.db.query(
        `
        INSERT INTO document_policies (id, title, file_name, published, uploaded_at)
        VALUES ($1, 'Leave Policy', 'leave-policy.pdf', TRUE, NOW())
        `,
        [this.id('pdoc')],
      );

      const soon = new Date();
      soon.setDate(soon.getDate() + 14);

      await this.db.query(
        `
        INSERT INTO document_employee_docs (id, employee_id, name, file_name, expires_on, uploaded_at)
        VALUES ($1, 'emp_demo_1', 'CNIC', 'cnic.pdf', $2, NOW())
        `,
        [this.id('edoc'), soon.toISOString().slice(0, 10)],
      );
    }

    const refreshed = await this.db.query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM document_policies`);
    return { message: 'Documents demo baseline is ready.', policyCount: Number(refreshed.rows[0]?.count || '0') };
  }

  private assertHrAdmin(ctx: DocumentsContext) {
    if (ctx.role !== 'hr_admin') {
      throw new UnauthorizedException('Only HR Admin can manage documents.');
    }
  }

  private id(prefix: string) {
    return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
  }
}
