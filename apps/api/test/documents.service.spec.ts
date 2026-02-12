import { DocumentsService } from '../src/documents/documents.service';

describe('DocumentsService', () => {
  it('returns only published policies for employee role', () => {
    const service = new DocumentsService();
    const admin = { role: 'hr_admin' as const };

    service.publishPolicy(admin, { title: 'A', fileName: 'a.pdf', published: true });
    service.publishPolicy(admin, { title: 'B', fileName: 'b.pdf', published: false });

    const employeeView = service.listPolicies({ role: 'employee', employeeId: 'emp_1' });
    expect(employeeView.length).toBe(1);
    expect(employeeView[0].title).toBe('A');
  });

  it('lists expiring docs in next 30 days only', () => {
    const service = new DocumentsService();
    const admin = { role: 'hr_admin' as const };

    const soon = new Date();
    soon.setDate(soon.getDate() + 10);

    const late = new Date();
    late.setDate(late.getDate() + 60);

    service.uploadEmployeeDocument(admin, {
      employeeId: 'emp_1',
      name: 'Passport',
      fileName: 'passport.pdf',
      expiresOn: soon.toISOString().slice(0, 10),
    });

    service.uploadEmployeeDocument(admin, {
      employeeId: 'emp_1',
      name: 'Visa',
      fileName: 'visa.pdf',
      expiresOn: late.toISOString().slice(0, 10),
    });

    const expiring = service.expiringInNext30Days(admin);
    expect(expiring.length).toBe(1);
    expect(expiring[0].name).toBe('Passport');
  });
});
