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
  assert.match(view,/جدول دوام مرن للموظف/);
});

test('employee schedule supports independent weekdays and overnight shifts',()=>{
  assert.match(view,/schedule\.days\.map/);
  assert.match(view,/updateFlexibleDay/);
  assert.match(view,/يدعم الدوام الليلي الممتد لليوم التالي/);
  assert.match(view,/attendanceStatus:workday\?'REVIEW':'OFF'/);
  assert.match(view,/`schedule-\$\{company\.id\}-\$\{schedule\.employeeId\}-\$\{date\}`/);
});

test('Excel and CSV imports automatically use the saved employee schedule by date',()=>{
  assert.match(importView,/savedScheduleOverrides/);
  assert.match(importView,/effectiveDayOverrides/);
  assert.match(importView,/item\.id===`schedule-\$\{company\.id\}-\$\{activeWorkerId\}-\$\{item\.date\}`/);
  assert.match(importView,/dayOverrides:effectiveDayOverrides/);
  assert.match(importView,/savedScheduleOverrides\.filter\(saved=>!dayOverrides\.some/);
});
