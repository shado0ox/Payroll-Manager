import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const view=fs.readFileSync(new URL('../src/components/AttendanceLeavesView.tsx',import.meta.url),'utf8');
const importView=fs.readFileSync(new URL('../src/components/attendance/AttendanceImportPanel.tsx',import.meta.url),'utf8');

test('work schedules target one employee instead of departments',()=>{
  assert.match(view,/schedule\.employeeId/);
  assert.match(view,/SearchableEmployeeSelect required employees=\{companyEmployees\}/);
  assert.doesNotMatch(view,/schedule\.department/);
  assert.doesNotMatch(view,/scheduleEmployees/);
  assert.match(view,/قواعد دوام الموظف/);
});

test('employee schedule uses effective dates, selected weekdays, and one rule time',()=>{
  assert.match(view,/schedule\.days\.map/);
  assert.match(view,/updateFlexibleDay/);
  assert.match(view,/سريان القاعدة من/);
  assert.match(view,/وقت العمل من/);
  assert.match(view,/scheduledStart:workday\?schedule\.startTime/);
  assert.match(view,/scheduledEnd:workday\?schedule\.endTime/);
  assert.match(view,/attendanceStatus:workday\?'REVIEW':'OFF'/);
  assert.match(view,/`schedule-\$\{company\.id\}-\$\{schedule\.employeeId\}-\$\{date\}`/);
});

test('Excel and CSV imports automatically use the saved employee schedule by date',()=>{
  assert.match(importView,/savedScheduleOverrides/);
  assert.match(importView,/effectiveDayOverrides/);
  assert.match(importView,/item\.id===`schedule-\$\{company\.id\}-\$\{activeWorkerId\}-\$\{item\.date\}`/);
  assert.match(importView,/dayOverrides:effectiveDayOverrides/);
  assert.match(importView,/effectiveDayOverrides=useMemo<DayScheduleOverride\[\]>\(\(\)=>savedScheduleOverrides/);
  assert.doesNotMatch(importView,/setShowMonthDays|updateDayOverride|updatePreviewRow/);
});

test('imported attendance requires explicit row approval before payroll posting',()=>{
  const payroll=fs.readFileSync(new URL('../src/utils/payrollEngine.ts',import.meta.url),'utf8');
  assert.match(importView,/approvedIds/);
  assert.match(importView,/اعتماد المحدد وترحيله/);
  assert.match(importView,/payrollApproved:approved/);
  assert.match(view,/a\.sourceType !== 'MOQOOT_IMPORT' \|\| a\.payrollApproved === true/);
  assert.match(payroll,/record\.sourceType === 'MOQOOT_IMPORT' && record\.payrollApproved !== true/);
});
