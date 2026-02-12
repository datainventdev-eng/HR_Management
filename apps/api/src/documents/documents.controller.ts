import { Body, Controller, Get, Headers, Post, Query } from '@nestjs/common';
import { DocumentsService } from './documents.service';
import { DocumentsRole } from './documents.types';

@Controller('documents')
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Post('seed-demo')
  seedDemo() {
    return this.documentsService.seedDemoData();
  }

  @Post('employee')
  uploadEmployee(
    @Headers() headers: Record<string, string>,
    @Body() body: { employeeId: string; name: string; fileName: string; expiresOn?: string },
  ) {
    return this.documentsService.uploadEmployeeDocument(this.ctx(headers), body);
  }

  @Get('employee')
  listEmployee(@Headers() headers: Record<string, string>, @Query('employeeId') employeeId?: string) {
    return this.documentsService.listEmployeeDocuments(this.ctx(headers), employeeId);
  }

  @Post('policy')
  publishPolicy(@Headers() headers: Record<string, string>, @Body() body: { title: string; fileName: string; published?: boolean }) {
    return this.documentsService.publishPolicy(this.ctx(headers), body);
  }

  @Post('policy/status')
  updatePolicyStatus(@Headers() headers: Record<string, string>, @Body() body: { policyId: string; published: boolean }) {
    return this.documentsService.updatePolicyStatus(this.ctx(headers), body);
  }

  @Get('policy')
  listPolicies(@Headers() headers: Record<string, string>) {
    return this.documentsService.listPolicies(this.ctx(headers));
  }

  @Get('expiring')
  expiring(@Headers() headers: Record<string, string>) {
    return this.documentsService.expiringInNext30Days(this.ctx(headers));
  }

  private ctx(headers: Record<string, string>) {
    return {
      role: (headers['x-role'] || 'employee') as DocumentsRole,
      employeeId: headers['x-employee-id'],
    };
  }
}
