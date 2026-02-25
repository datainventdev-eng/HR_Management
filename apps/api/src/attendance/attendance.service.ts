import { BadRequestException, Injectable, OnModuleInit, UnauthorizedException } from '@nestjs/common';
import { AttendanceRecord, AttendanceRole, OfficeHours, Shift, ShiftAssignment } from './attendance.types';
import { DatabaseService } from '../database/database.service';

interface AttendanceContext {
  role: AttendanceRole;
  employeeId?: string;
}

interface DbAttendanceRecord {
  id: string;
  employee_id: string;
  date: string;
  check_in_time: string | null;
  check_out_time: string | null;
  total_hours: number | null;
  is_late: boolean;
  left_early: boolean;
}

@Injectable()
export class AttendanceService implements OnModuleInit {
  constructor(private readonly db: DatabaseService) {}

  async onModuleInit() {
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS attendance_office_hours (
        id TEXT PRIMARY KEY,
        start_time TEXT NOT NULL,
        end_time TEXT NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await this.db.query(`
      INSERT INTO attendance_office_hours (id, start_time, end_time)
      VALUES ('default', '09:00', '18:00')
      ON CONFLICT (id) DO NOTHING;
    `);

    await this.db.query(`
      CREATE TABLE IF NOT EXISTS attendance_shifts (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        start_time TEXT NOT NULL,
        end_time TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await this.db.query(`
      CREATE TABLE IF NOT EXISTS attendance_shift_assignments (
        id TEXT PRIMARY KEY,
        employee_id TEXT NOT NULL,
        shift_id TEXT NOT NULL,
        from_date DATE NOT NULL,
        to_date DATE NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT fk_attendance_shift FOREIGN KEY (shift_id) REFERENCES attendance_shifts(id)
      );
    `);

    await this.db.query(`
      CREATE TABLE IF NOT EXISTS attendance_records (
        id TEXT PRIMARY KEY,
        employee_id TEXT NOT NULL,
        date DATE NOT NULL,
        check_in_time TEXT,
        check_out_time TEXT,
        total_hours NUMERIC(6,2),
        is_late BOOLEAN NOT NULL DEFAULT FALSE,
        left_early BOOLEAN NOT NULL DEFAULT FALSE,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_attendance_employee_day UNIQUE (employee_id, date)
      );
    `);
  }

  async setOfficeHours(ctx: AttendanceContext, payload: OfficeHours) {
    this.assertHrAdmin(ctx);
    await this.db.query(
      `
      UPDATE attendance_office_hours
      SET start_time = $2, end_time = $3, updated_at = NOW()
      WHERE id = $1
      `,
      ['default', payload.startTime, payload.endTime],
    );
    return payload;
  }

  async getOfficeHours() {
    const result = await this.db.query<{ start_time: string; end_time: string }>(
      `SELECT start_time, end_time FROM attendance_office_hours WHERE id = 'default' LIMIT 1`,
    );
    const row = result.rows[0] ?? { start_time: '09:00', end_time: '18:00' };
    return {
      startTime: row.start_time,
      endTime: row.end_time,
    };
  }

  async createShift(ctx: AttendanceContext, payload: { name: string; startTime: string; endTime: string }) {
    this.assertHrAdmin(ctx);
    if (!payload.name?.trim()) {
      throw new BadRequestException('Shift name is required.');
    }

    const shift: Shift = {
      id: this.id('shift'),
      name: payload.name.trim(),
      startTime: payload.startTime,
      endTime: payload.endTime,
    };

    await this.db.query(`INSERT INTO attendance_shifts (id, name, start_time, end_time) VALUES ($1, $2, $3, $4)`, [
      shift.id,
      shift.name,
      shift.startTime,
      shift.endTime,
    ]);

    return shift;
  }

  async listShifts() {
    const result = await this.db.query<{ id: string; name: string; start_time: string; end_time: string }>(
      `SELECT id, name, start_time, end_time FROM attendance_shifts ORDER BY name ASC`,
    );
    return result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      startTime: row.start_time,
      endTime: row.end_time,
    }));
  }

  async updateShift(
    ctx: AttendanceContext,
    id: string,
    payload: { name?: string; startTime?: string; endTime?: string },
  ) {
    this.assertHrAdmin(ctx);
    const existing = await this.db.query<{ id: string }>(`SELECT id FROM attendance_shifts WHERE id = $1 LIMIT 1`, [id]);
    if (!existing.rows[0]) {
      throw new BadRequestException('Shift does not exist.');
    }

    await this.db.query(
      `
      UPDATE attendance_shifts
      SET
        name = COALESCE(NULLIF($2, ''), name),
        start_time = COALESCE(NULLIF($3, ''), start_time),
        end_time = COALESCE(NULLIF($4, ''), end_time)
      WHERE id = $1
      `,
      [id, payload.name ?? null, payload.startTime ?? null, payload.endTime ?? null],
    );

    const refreshed = await this.db.query<{ id: string; name: string; start_time: string; end_time: string }>(
      `SELECT id, name, start_time, end_time FROM attendance_shifts WHERE id = $1 LIMIT 1`,
      [id],
    );

    const row = refreshed.rows[0];
    return {
      id: row.id,
      name: row.name,
      startTime: row.start_time,
      endTime: row.end_time,
    };
  }

  async deleteShift(ctx: AttendanceContext, id: string) {
    this.assertHrAdmin(ctx);
    const existing = await this.db.query<{ id: string }>(`SELECT id FROM attendance_shifts WHERE id = $1 LIMIT 1`, [id]);
    if (!existing.rows[0]) {
      throw new BadRequestException('Shift does not exist.');
    }

    const linkedAssignments = await this.db.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM attendance_shift_assignments WHERE shift_id = $1`,
      [id],
    );
    if (Number(linkedAssignments.rows[0]?.count || '0') > 0) {
      throw new BadRequestException('Cannot delete shift with active assignments.');
    }

    await this.db.query(`DELETE FROM attendance_shifts WHERE id = $1`, [id]);
    return { success: true };
  }

  async assignShift(
    ctx: AttendanceContext,
    payload: {
      employeeId: string;
      shiftId: string;
      fromDate: string;
      toDate: string;
    },
  ) {
    this.assertHrAdmin(ctx);

    const shift = await this.db.query<{ id: string }>(`SELECT id FROM attendance_shifts WHERE id = $1 LIMIT 1`, [payload.shiftId]);
    if (!shift.rows[0]) {
      throw new BadRequestException('Shift does not exist.');
    }

    if (payload.toDate < payload.fromDate) {
      throw new BadRequestException('Shift assignment date range is invalid.');
    }

    const assignment: ShiftAssignment = {
      id: this.id('assign'),
      ...payload,
    };

    await this.db.query(
      `
      INSERT INTO attendance_shift_assignments (id, employee_id, shift_id, from_date, to_date)
      VALUES ($1, $2, $3, $4, $5)
      `,
      [assignment.id, assignment.employeeId, assignment.shiftId, assignment.fromDate, assignment.toDate],
    );

    return assignment;
  }

  async listAssignments(ctx: AttendanceContext, employeeId?: string) {
    if (ctx.role === 'employee') {
      if (!ctx.employeeId) {
        throw new UnauthorizedException('Employee context is missing.');
      }
      return this.fetchAssignments(ctx.employeeId);
    }

    if (ctx.role === 'manager') {
      return employeeId ? this.fetchAssignments(employeeId) : [];
    }

    return employeeId ? this.fetchAssignments(employeeId) : this.fetchAssignments();
  }

  async checkIn(ctx: AttendanceContext, payload?: { date?: string; time?: string }) {
    if (!ctx.employeeId) {
      throw new UnauthorizedException('Employee context is missing.');
    }

    if (ctx.role === 'hr_admin') {
      throw new UnauthorizedException('HR Admin cannot check in as employee from this endpoint.');
    }

    const date = payload?.date ?? this.today();
    const time = payload?.time ?? this.currentTime();
    const schedule = await this.resolveScheduleForEmployee(ctx.employeeId, date);
    const result = await this.upsertCheckInRecord(ctx.employeeId, date, time, schedule.startTime);
    if (result.status === 'skipped') {
      throw new BadRequestException('You already checked in for this day.');
    }
    return result.record;
  }

  async bulkCheckInByAdmin(
    ctx: AttendanceContext,
    payload: { entries: Array<{ employeeId: string; date?: string; time?: string }> },
  ) {
    this.assertHrAdmin(ctx);

    if (!payload.entries?.length) {
      throw new BadRequestException('At least one entry is required.');
    }

    const results: Array<{ employeeId: string; date: string; status: 'created' | 'updated' | 'skipped'; record: AttendanceRecord }> = [];

    for (const entry of payload.entries) {
      if (!entry.employeeId?.trim()) {
        throw new BadRequestException('Each entry must include employeeId.');
      }
      const date = entry.date ?? this.today();
      const time = entry.time ?? this.currentTime();
      const schedule = await this.resolveScheduleForEmployee(entry.employeeId.trim(), date);
      const output = await this.upsertCheckInRecord(entry.employeeId.trim(), date, time, schedule.startTime);
      results.push({
        employeeId: entry.employeeId.trim(),
        date,
        status: output.status,
        record: output.record,
      });
    }

    return {
      message: `Processed ${results.length} check-in entries.`,
      summary: {
        created: results.filter((item) => item.status === 'created').length,
        updated: results.filter((item) => item.status === 'updated').length,
        skipped: results.filter((item) => item.status === 'skipped').length,
      },
      results,
    };
  }

  async checkOut(ctx: AttendanceContext, payload?: { date?: string; time?: string }) {
    if (!ctx.employeeId) {
      throw new UnauthorizedException('Employee context is missing.');
    }

    if (ctx.role === 'hr_admin') {
      throw new UnauthorizedException('HR Admin cannot check out as employee from this endpoint.');
    }

    const date = payload?.date ?? this.today();
    const time = payload?.time ?? this.currentTime();
    const schedule = await this.resolveScheduleForEmployee(ctx.employeeId, date);

    const result = await this.db.query<DbAttendanceRecord>(
      `SELECT * FROM attendance_records WHERE employee_id = $1 AND date = $2 LIMIT 1`,
      [ctx.employeeId, date],
    );

    const record = result.rows[0];
    if (!record?.check_in_time) {
      throw new BadRequestException('Check-in is required before check-out.');
    }

    if (record.check_out_time) {
      throw new BadRequestException('You already checked out for this day.');
    }

    const leftEarly = this.isBefore(time, schedule.endTime);
    const totalHours = this.hoursBetween(record.check_in_time, time);

    await this.db.query(
      `
      UPDATE attendance_records
      SET check_out_time = $3,
          left_early = $4,
          total_hours = $5,
          updated_at = NOW()
      WHERE id = $1 AND employee_id = $2
      `,
      [record.id, ctx.employeeId, time, leftEarly, totalHours],
    );

    const refreshed = await this.db.query<DbAttendanceRecord>(`SELECT * FROM attendance_records WHERE id = $1 LIMIT 1`, [record.id]);
    return this.mapRecord(refreshed.rows[0]);
  }

  private async resolveScheduleForEmployee(employeeId: string, date: string) {
    const assigned = await this.db.query<{ start_time: string; end_time: string }>(
      `
      SELECT s.start_time, s.end_time
      FROM attendance_shift_assignments a
      JOIN attendance_shifts s ON s.id = a.shift_id
      WHERE a.employee_id = $1
        AND $2::date BETWEEN a.from_date AND a.to_date
      ORDER BY a.from_date DESC
      LIMIT 1
      `,
      [employeeId, date],
    );
    if (assigned.rows[0]) {
      return {
        startTime: assigned.rows[0].start_time,
        endTime: assigned.rows[0].end_time,
      };
    }

    const general = await this.db.query<{ start_time: string; end_time: string }>(
      `
      SELECT start_time, end_time
      FROM attendance_shifts
      WHERE LOWER(name) = 'general'
      ORDER BY created_at ASC
      LIMIT 1
      `,
    );
    if (general.rows[0]) {
      return {
        startTime: general.rows[0].start_time,
        endTime: general.rows[0].end_time,
      };
    }

    return this.getOfficeHours();
  }

  async monthlyAttendance(ctx: AttendanceContext, payload?: { employeeId?: string; month?: string }) {
    const month = payload?.month ?? this.today().slice(0, 7);

    let targetEmployeeId = payload?.employeeId;

    if (ctx.role === 'employee') {
      targetEmployeeId = ctx.employeeId;
    }

    if (!targetEmployeeId) {
      throw new BadRequestException('Employee ID is required for this view.');
    }

    const result = await this.db.query<DbAttendanceRecord>(
      `
      SELECT *
      FROM attendance_records
      WHERE employee_id = $1
        AND TO_CHAR(date, 'YYYY-MM') = $2
      ORDER BY date ASC
      `,
      [targetEmployeeId, month],
    );

    return result.rows.map((row) => this.mapRecord(row));
  }

  async todayRecord(ctx: AttendanceContext, payload?: { date?: string; employeeId?: string }) {
    const date = payload?.date ?? this.today();
    let targetEmployeeId = payload?.employeeId;

    if (ctx.role === 'employee') {
      targetEmployeeId = ctx.employeeId;
    }

    if (!targetEmployeeId) {
      throw new BadRequestException('Employee ID is required for this view.');
    }

    const result = await this.db.query<DbAttendanceRecord>(
      `SELECT * FROM attendance_records WHERE employee_id = $1 AND date = $2 LIMIT 1`,
      [targetEmployeeId, date],
    );

    return result.rows[0] ? this.mapRecord(result.rows[0]) : null;
  }

  async seedDemoData() {
    const result = await this.db.query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM attendance_shifts`);
    if (Number(result.rows[0]?.count || '0') === 0) {
      await this.db.query(`
        INSERT INTO attendance_shifts (id, name, start_time, end_time)
        VALUES ($1, 'General', '09:00', '18:00')
      `, [this.id('shift')]);
    }

    const shiftCountResult = await this.db.query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM attendance_shifts`);

    return {
      message: 'Attendance demo baseline is ready.',
      shiftCount: Number(shiftCountResult.rows[0]?.count || '0'),
      officeHours: await this.getOfficeHours(),
    };
  }

  async todaySummary(date = this.today()) {
    const result = await this.db.query<{
      present_count: string;
      late_count: string;
      early_leave_count: string;
      partial_present_count: string;
    }>(
      `
      SELECT COUNT(*) FILTER (WHERE check_in_time IS NOT NULL)::text AS present_count,
             COUNT(*) FILTER (WHERE is_late = TRUE)::text AS late_count,
             COUNT(*) FILTER (WHERE left_early = TRUE)::text AS early_leave_count,
             COUNT(*) FILTER (WHERE total_hours IS NOT NULL AND total_hours < 7)::text AS partial_present_count
      FROM attendance_records
      WHERE date = $1
      `,
      [date],
    );

    return {
      date,
      presentCount: Number(result.rows[0]?.present_count || '0'),
      lateCount: Number(result.rows[0]?.late_count || '0'),
      earlyLeaveCount: Number(result.rows[0]?.early_leave_count || '0'),
      partialPresentCount: Number(result.rows[0]?.partial_present_count || '0'),
    };
  }

  private async upsertCheckInRecord(employeeId: string, date: string, time: string, officeStartTime: string) {
    const existing = await this.db.query<DbAttendanceRecord>(
      `SELECT * FROM attendance_records WHERE employee_id = $1 AND date = $2 LIMIT 1`,
      [employeeId, date],
    );

    const record = existing.rows[0];
    if (!record) {
      const created: AttendanceRecord = {
        id: this.id('att'),
        employeeId,
        date,
        checkInTime: time,
        isLate: this.isAfter(time, officeStartTime),
        leftEarly: false,
      };

      await this.db.query(
        `
        INSERT INTO attendance_records (id, employee_id, date, check_in_time, is_late, left_early, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, NOW())
        `,
        [created.id, created.employeeId, created.date, created.checkInTime, created.isLate, created.leftEarly],
      );

      return { status: 'created' as const, record: created };
    }

    if (record.check_in_time) {
      return { status: 'skipped' as const, record: this.mapRecord(record) };
    }

    await this.db.query(
      `
      UPDATE attendance_records
      SET check_in_time = $3, is_late = $4, updated_at = NOW()
      WHERE id = $1 AND employee_id = $2
      `,
      [record.id, employeeId, time, this.isAfter(time, officeStartTime)],
    );

    const refreshed = await this.db.query<DbAttendanceRecord>(`SELECT * FROM attendance_records WHERE id = $1 LIMIT 1`, [record.id]);
    return { status: 'updated' as const, record: this.mapRecord(refreshed.rows[0]) };
  }

  private assertHrAdmin(ctx: AttendanceContext) {
    if (ctx.role !== 'hr_admin') {
      throw new UnauthorizedException('Only HR Admin can perform this action.');
    }
  }

  private async fetchAssignments(employeeId?: string) {
    const result = employeeId
      ? await this.db.query<{ id: string; employee_id: string; shift_id: string; from_date: string; to_date: string }>(
          `SELECT id, employee_id, shift_id, from_date, to_date FROM attendance_shift_assignments WHERE employee_id = $1 ORDER BY from_date DESC`,
          [employeeId],
        )
      : await this.db.query<{ id: string; employee_id: string; shift_id: string; from_date: string; to_date: string }>(
          `SELECT id, employee_id, shift_id, from_date, to_date FROM attendance_shift_assignments ORDER BY from_date DESC`,
        );

    return result.rows.map((row) => ({
      id: row.id,
      employeeId: row.employee_id,
      shiftId: row.shift_id,
      fromDate: row.from_date,
      toDate: row.to_date,
    }));
  }

  private mapRecord(row: DbAttendanceRecord): AttendanceRecord {
    return {
      id: row.id,
      employeeId: row.employee_id,
      date: row.date,
      checkInTime: row.check_in_time ?? undefined,
      checkOutTime: row.check_out_time ?? undefined,
      totalHours: row.total_hours === null ? undefined : Number(row.total_hours),
      isLate: row.is_late,
      leftEarly: row.left_early,
    };
  }

  private today() {
    return new Date().toISOString().slice(0, 10);
  }

  private currentTime() {
    return new Date().toISOString().slice(11, 16);
  }

  private hoursBetween(start: string, end: string) {
    const [sh, sm] = start.split(':').map(Number);
    const [eh, em] = end.split(':').map(Number);
    const minutes = eh * 60 + em - (sh * 60 + sm);
    return Number((minutes / 60).toFixed(2));
  }

  private isAfter(left: string, right: string) {
    return left > right;
  }

  private isBefore(left: string, right: string) {
    return left < right;
  }

  private id(prefix: string) {
    return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
  }
}
