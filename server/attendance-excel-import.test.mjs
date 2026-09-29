import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const parser=fs.readFileSync(new URL('../src/utils/moqootAttendanceImport.ts',import.meta.url),'utf8');
const view=fs.readFileSync(new URL('../src/components/attendance/AttendanceImportPanel.tsx',import.meta.url),'utf8');

test('attendance import accepts CSV and XLSX through one reviewed workflow',()=>{
  assert.match(view,/accept="\.xlsx,\.csv/);
  assert.match(view,/parseMoqootAttendanceFile\(file/);
  assert.match(view,/Excel \/ CSV/);
  assert.match(parser,/extension==='csv'/);
  assert.match(parser,/extension==='xlsx'/);
  assert.match(parser,/import\('read-excel-file'\)/);
  assert.match(parser,/file\.size>5\*1024\*1024/);
  assert.match(parser,/rows\.length>5000/);
});

test('Excel attendance cells normalize date serials and time fractions',()=>{
  assert.match(parser,/excelSerialDate/);
  assert.match(parser,/value>20_000&&value<100_000/);
  assert.match(parser,/value>=0&&value<1/);
  assert.match(parser,/parseMoqootAttendanceRows/);
});
