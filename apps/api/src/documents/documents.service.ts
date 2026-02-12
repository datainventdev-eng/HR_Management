import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { DocumentsRole, EmployeeDocument, PolicyDocument } from './documents.types';

interface DocumentsContext {
  role: DocumentsRole;
  employeeId?: string;
}

@Injectable()
export class DocumentsService {
  private readonly employeeDocs: EmployeeDocument[] = [];
  private readonly policyDocs: PolicyDocument[] = [];

  uploadEmployeeDocument(
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

    this.employeeDocs.push(doc);
    return doc;
  }

  listEmployeeDocuments(ctx: DocumentsContext, employeeId?: string) {
    const targetId = ctx.role === 'employee' ? ctx.employeeId : employeeId;
    if (!targetId) {
      return this.employeeDocs;
    }
    return this.employeeDocs.filter((doc) => doc.employeeId === targetId);
  }

  publishPolicy(ctx: DocumentsContext, payload: { title: string; fileName: string; published?: boolean }) {
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

    this.policyDocs.push(policy);
    return policy;
  }

  updatePolicyStatus(ctx: DocumentsContext, payload: { policyId: string; published: boolean }) {
    this.assertHrAdmin(ctx);
    const policy = this.policyDocs.find((item) => item.id === payload.policyId);
    if (!policy) {
      throw new BadRequestException('Policy document not found.');
    }
    policy.published = payload.published;
    return policy;
  }

  listPolicies(ctx: DocumentsContext) {
    if (ctx.role === 'hr_admin') {
      return this.policyDocs;
    }
    return this.policyDocs.filter((policy) => policy.published);
  }

  expiringInNext30Days(ctx: DocumentsContext) {
    this.assertHrAdmin(ctx);
    const now = new Date();
    const threshold = new Date(now);
    threshold.setDate(threshold.getDate() + 30);

    return this.employeeDocs.filter((doc) => {
      if (!doc.expiresOn) return false;
      const expiry = new Date(`${doc.expiresOn}T00:00:00Z`);
      return expiry >= now && expiry <= threshold;
    });
  }

  seedDemoData() {
    if (this.policyDocs.length === 0 && this.employeeDocs.length === 0) {
      this.policyDocs.push({
        id: this.id('pdoc'),
        title: 'Leave Policy',
        fileName: 'leave-policy.pdf',
        published: true,
        uploadedAt: new Date().toISOString(),
      });

      const soon = new Date();
      soon.setDate(soon.getDate() + 14);

      this.employeeDocs.push({
        id: this.id('edoc'),
        employeeId: 'emp_demo_1',
        name: 'CNIC',
        fileName: 'cnic.pdf',
        expiresOn: soon.toISOString().slice(0, 10),
        uploadedAt: new Date().toISOString(),
      });
    }

    return { message: 'Documents demo baseline is ready.', policyCount: this.policyDocs.length };
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
