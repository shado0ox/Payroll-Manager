import { AttendanceRecord, LeaveRequest } from '../types';

export interface DailySchedule {
  weekday: number;
  enabled: boolean;
  start: string;
  end: string;
}

export interface MoqootImportOptions {
  companyId: string;
  employeeId: string;
  employeeName?: string;
  employeeNo?: string;
  attendanceOnlyWorker: boolean;
  periodMonth: string;
  graceMinutes: number;
  schedule: DailySchedule[];
  sourceFileName: string;
  leaves: LeaveRequest[];
}

const normalize = (value: string) => value.trim().replace(/^\uFEFF/, '');

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let value = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') { value += '"'; index += 1; }
      else quoted = !quoted;
    } else if (char === ',' && !quoted) {
      values.push(normalize(value)); value = '';
    } else value += char;
  }
  values.push(normalize(value));
  return values;
}

function parseTime(value: string): number | null {
  const clean = normalize(value).replace(/\s+/g, ' ');
  const match = clean.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([صم])?$/);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = Number(match[3] || 0);
  if (match[4] === 'م' && hour < 12) hour += 12;
  if (match[4] === 'ص' && hour === 12) hour = 0;
  if (hour > 23 || minute > 59 || second > 59) return null;
  return hour * 60 + minute + second / 60;
}

const minutesToTime = (minutes: number | null): string | undefined => {
  if (minutes === null) return undefined;
  const safe = ((Math.floor(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`;
};

const isApprovedLeave = (date: string, employeeId: string, leaves: LeaveRequest[]) =>
  leaves.some(leave => leave.employeeId === employeeId && leave.status === 'APPROVED' && leave.startDate <= date && leave.endDate >= date);

export function parseMoqootAttendance(text: string, options: MoqootImportOptions): AttendanceRecord[] {
  const lines = text.replace(/\r/g, '').split('\n').filter(line => line.trim());
  if (lines.length < 2) throw new Error('EMPTY_ATTENDANCE_FILE');
  const headers = parseCsvLine(lines[0]);
  const dateIndex = headers.findIndex(header => header === 'يوم' || header.toLowerCase() === 'date');
  const inIndex = headers.findIndex(header => header === 'حضور' || header.toLowerCase().includes('check in'));
  const outIndex = headers.findIndex(header => header === 'انصراف' || header.toLowerCase().includes('check out'));
  if (dateIndex < 0 || inIndex < 0 || outIndex < 0) throw new Error('UNSUPPORTED_ATTENDANCE_FILE');

  const byDate = new Map<string, { ins: number[]; outs: number[]; absent: boolean }>();
  for (const line of lines.slice(1)) {
    const row = parseCsvLine(line);
    const date = normalize(row[dateIndex] || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !date.startsWith(`${options.periodMonth}-`)) continue;
    const current = byDate.get(date) || { ins: [], outs: [], absent: false };
    const incoming = normalize(row[inIndex] || '');
    const outgoing = normalize(row[outIndex] || '');
    if (incoming === 'غائب' || incoming.toLowerCase() === 'absent') current.absent = true;
    const inTime = parseTime(incoming);
    const outTime = parseTime(outgoing);
    if (inTime !== null) current.ins.push(inTime);
    if (outTime !== null) current.outs.push(outTime);
    byDate.set(date, current);
  }

  return [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, day]) => {
    const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
    const schedule = options.schedule.find(item => item.weekday === weekday) || { weekday, enabled: false, start: '09:00', end: '17:00' };
    const scheduledStart = parseTime(schedule.start) ?? 0;
    const firstIn = day.ins.length ? Math.min(...day.ins) : null;
    const lastOut = day.outs.length ? Math.max(...day.outs) : null;
    const approvedLeave = !options.attendanceOnlyWorker && isApprovedLeave(date, options.employeeId, options.leaves);
    let status: AttendanceRecord['attendanceStatus'] = 'PRESENT';
    let note = '';
    let calculatedDelayMinutes = 0;
    if (!schedule.enabled) status = 'OFF';
    else if (approvedLeave) status = 'LEAVE';
    else if (firstIn === null && lastOut === null) status = 'ABSENT';
    else if (firstIn === null) status = 'MISSING_IN';
    else if (lastOut === null) status = 'MISSING_OUT';
    else {
      calculatedDelayMinutes = Math.max(0, Math.floor(firstIn - scheduledStart - options.graceMinutes));
      status = calculatedDelayMinutes > 0 ? 'LATE' : 'PRESENT';
    }
    if (status === 'MISSING_OUT') note = 'بصمة حضور بدون بصمة انصراف';
    if (status === 'MISSING_IN') note = 'بصمة انصراف بدون بصمة حضور';
    if (status === 'ABSENT') note = day.absent ? 'مسجل غائب في ملف الحضور' : 'لا توجد بصمات في يوم عمل';

    return {
      id: `moqoot-${options.companyId}-${options.employeeId}-${date}`,
      companyId: options.companyId,
      employeeId: options.employeeId,
      periodMonth: options.periodMonth,
      date,
      delayMinutes: 0,
      absence: false,
      unpaidLeave: false,
      overtimeHours: 0,
      overtimeType: 'STANDARD',
      notes: note,
      sourceType: 'MOQOOT_IMPORT',
      sourceFileName: options.sourceFileName,
      importedAt: new Date().toISOString(),
      attendanceOnlyWorker: options.attendanceOnlyWorker,
      attendanceOnlyName: options.employeeName,
      attendanceOnlyNo: options.employeeNo,
      scheduledStart: schedule.start,
      scheduledEnd: schedule.end,
      actualCheckIn: minutesToTime(firstIn),
      actualCheckOut: minutesToTime(lastOut),
      graceMinutes: options.graceMinutes,
      calculatedDelayMinutes,
      workday: schedule.enabled,
      attendanceStatus: status,
      payrollApproved: false,
    };
  });
}
