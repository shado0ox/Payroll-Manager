import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {buildEmployeeAttendanceReport} from './routes/employee-portal-routes.mjs';
import {resolveAnnualLeaveAccrual} from './annual-leave-accrual.mjs';

const routes=fs.readFileSync(new URL('./routes/attendance-leave-routes.mjs',import.meta.url),'utf8');
const schema=fs.readFileSync(new URL('./database-schema.mjs',import.meta.url),'utf8');
const view=fs.readFileSync(new URL('../src/components/AttendanceLeavesView.tsx',import.meta.url),'utf8');
const importView=fs.readFileSync(new URL('../src/components/attendance/AttendanceImportPanel.tsx',import.meta.url),'utf8');
const publicView=fs.readFileSync(new URL('../src/components/PublicAttendanceReport.tsx',import.meta.url),'utf8');
const app=fs.readFileSync(new URL('../src/App.tsx',import.meta.url),'utf8');

test('historical Saudi labor-law entitlement accrues from hire anniversary',()=>{
  const beforeFifth=resolveAnnualLeaveAccrual({hire_date:'2021-09-08',payload:{annualLeavePolicy:'LABOR_LAW'}},2026,'2026-09-07');
  assert.equal(beforeFifth.accruedEntitlementDays,105);
  assert.equal(beforeFifth.currentCycleDays,21);
  const fifth=resolveAnnualLeaveAccrual({hire_date:'2021-09-08',payload:{annualLeavePolicy:'LABOR_LAW'}},2026,'2026-09-08');
  assert.equal(fifth.accruedEntitlementDays,135);
  assert.equal(fifth.currentCycleDays,30);
});

test('date-range schedules expand into one report row per calendar day',()=>{
  const report=buildEmployeeAttendanceReport([{id:'schedule-1',record_date:'2026-09-08',end_date:'2026-09-10',days_count:3,delay_minutes:0,absence:false,unpaid_leave:false,overtime_hours:0,notes:'',payload:{scheduledStart:'08:00',scheduledEnd:'17:00',attendanceStatus:'REVIEW'}}],'2026-09');
  assert.deepEqual(report.records.map(row=>row.date),['2026-09-08','2026-09-09','2026-09-10']);
  assert.ok(report.records.every(row=>row.scheduledStart==='08:00'&&row.scheduledEnd==='17:00'));
});

test('attendance reports use hashed expiring links and one-time signed responses',()=>{
  assert.match(schema,/attendance_report_shares/);
  assert.match(schema,/attendance_report_shares.*ADD COLUMN IF NOT EXISTS viewed_at/s);
  assert.match(routes,/token_hash/);
  assert.match(routes,/ATTENDANCE_REPORT_EXPIRED/);
  assert.match(routes,/ATTENDANCE_REPORT_ALREADY_SIGNED/);
  assert.match(routes,/signatureData\.startsWith\('data:image\/png;base64,'\)/);
  assert.match(routes,/ipHash:sha256/);
  assert.match(routes,/router\.get\('\/attendance-report-shares'/);
  assert.match(routes,/viewed_at=COALESCE\(viewed_at,now\(\)\)/);
  assert.match(importView,/https:\/\/wa\.me\/\?text=/);
  assert.match(view,/قواعد دوام الموظف/);
  assert.match(publicView,/تعليق اختياري على هذا اليوم/);
  assert.match(publicView,/toDataURL\(["']image\/png["']\)/);
  assert.match(publicView,/h-dvh overflow-y-auto/);
  assert.match(publicView,/طباعة (?:الكشف الموقّع|A4 الموقعة)/);
  assert.match(importView,/فتح التقرير ولم يوقّع/);
  assert.match(importView,/printShare/);
  assert.doesNotMatch(view,/مشاركة ومتابعة كشف موظف/);
  assert.match(app,/!window\.location\.pathname\.startsWith\('\/attendance-report\/'\)/);
});
