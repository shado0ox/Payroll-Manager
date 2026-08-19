import { strToU8, zipSync } from 'fflate';
import { Company, Employee, PayrollPaymentBatch, PayrollRun } from '../types';

const xmlEscape = (value: unknown) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&apos;');

const columnName = (index: number) => {
  let name = '';
  for (let value = index + 1; value > 0; value = Math.floor((value - 1) / 26)) {
    name = String.fromCharCode(65 + ((value - 1) % 26)) + name;
  }
  return name;
};

const textCell = (ref: string, value: unknown, style = 0) =>
  `<c r="${ref}" t="inlineStr" s="${style}"><is><t xml:space="preserve">${xmlEscape(value)}</t></is></c>`;
const numberCell = (ref: string, value: number, style = 0) =>
  `<c r="${ref}" s="${style}"><v>${Number.isFinite(value) ? value : 0}</v></c>`;

const makeRow = (rowNumber: number, values: Array<string | number | null>, style = 0, numericColumns = new Set<number>()) => {
  const cells = values.map((value, index) => {
    if (value === null || value === '') return '';
    const ref = `${columnName(index)}${rowNumber}`;
    return numericColumns.has(index) && typeof value === 'number'
      ? numberCell(ref, value, style)
      : textCell(ref, value, style);
  }).join('');
  return `<row r="${rowNumber}">${cells}</row>`;
};

const formatDdMmYyyy = (isoDate: string) => {
  const [year, month, day] = isoDate.split('-');
  return `${day || ''}${month || ''}${year || ''}`;
};

export function buildBankPayrollXlsx(payrollRun: PayrollRun, company: Company, batch: PayrollPaymentBatch, employees: Employee[] = []): Uint8Array {
  const selectedIds = new Set(batch.employeeIds);
  const items = payrollRun.items.filter(item => selectedIds.has(item.employeeId) && !item.isSuspended && item.netSalary > 0);
  const employeeById = new Map(employees.map(employee => [employee.id, employee]));
  if (!items.length) {
    throw new Error('لا يوجد موظفون صالحون للتصدير في هذه الدفعة');
  }

  const missingBankData = items.filter(item => {
    const employee = employeeById.get(item.employeeId);
    return !(item.nationalIdOrIqama || employee?.nationalIdOrIqama) || !item.bankIban || !(item.bankSwiftCode || employee?.bankSwiftCode);
  });
  if (missingBankData.length) {
    throw new Error(`لا يمكن إنشاء ملف البنك: يوجد ${missingBankData.length} موظف ببيانات هوية أو IBAN أو SWIFT غير مكتملة.`);
  }

  const topHeaders = ['Type', 'اسم العميل ', 'رمز الإتفاقية', 'حساب التمويل', 'رقم الفرع', 'تاريخ الإستحقاق (DDMMYYYY)', 'رقم  المنشأه في مكتب العمل ', 'رقم المنشأه في الغرفة التجارية', 'رمز البنك', 'العملة', 'رقم الدفعة ', 'مرجع الملف ', null, null, null];
  const topValues = [
    '111',
    company.bankCustomerCode || company.companyCode,
    company.bankAgreementCode || company.companyCode,
    company.bankFundingAccount || (company.bankIban || '').replace(/^SA/, ''),
    company.bankBranchCode || '',
    formatDdMmYyyy(batch.scheduledDate),
    company.laborOfficeEstablishmentNo || company.gosiEstablishmentNo,
    company.chamberOfCommerceNo || company.crNumber,
    company.bankPayrollCode || (company.bankSwiftCode || '').slice(0, 4),
    'SAR',
    Number((batch.batchNumber.match(/(\d+)$/) || [])[1] || 1),
    batch.reference || batch.batchNumber,
    null, null, null,
  ];
  const detailHeaders = ['SN', 'هوية المستفيد/ المرجع', 'المستفيد / اسم الموظف', 'رقم الحساب ', 'رمز البنك', 'إجمالي المبلغ', 'الراتب الأساسي', 'بدل السكن', 'دخل آخر', 'الخصومات', 'العنوان', 'العملة ', 'الحالة', 'وصف  الدفع', 'مرجع  الدفع'];
  const rows = [
    makeRow(1, topHeaders, 1),
    makeRow(2, topValues, 0, new Set([10])),
    makeRow(3, detailHeaders, 1),
    ...items.map((item, index) => {
      const employee = employeeById.get(item.employeeId);
      return makeRow(index + 4, [
      String(index + 1).padStart(4, '0'),
      item.nationalIdOrIqama || employee?.nationalIdOrIqama || '',
      item.employeeNameEn || (employee ? `${employee.firstNameEn || ''} ${employee.lastNameEn || ''}`.trim() : '') || item.employeeName,
      item.bankIban,
      item.bankSwiftCode || employee?.bankSwiftCode || '',
      item.netSalary,
      item.baseSalary,
      item.housingAllowance,
      item.transportAllowance + item.otherAllowances + item.overtimeAmount + item.bonuses,
      item.totalDeductions,
      'DMM',
      'SAR',
      'active',
      'Salary',
      index + 1,
    ], 0, new Set([5, 6, 7, 8, 9, 14]));
    }),
  ].join('');

  const worksheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <dimension ref="A1:O${items.length + 3}"/>
  <sheetViews><sheetView workbookViewId="0"><pane ySplit="3" topLeftCell="A4" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
  <cols>${[10,18,32,28,17,18,18,16,16,16,12,12,12,16,14].map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`).join('')}</cols>
  <sheetData>${rows}</sheetData>
  <autoFilter ref="A3:O${items.length + 3}"/>
</worksheet>`;
  const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>`;
  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF287A51"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="2"><border/><border><left style="thin"/><right style="thin"/><top style="thin"/><bottom style="thin"/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/></cellXfs></styleSheet>`;
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`;
  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
  const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;

  return zipSync({
    '[Content_Types].xml': strToU8(contentTypes),
    '_rels/.rels': strToU8(rootRels),
    'xl/workbook.xml': strToU8(workbookXml),
    'xl/_rels/workbook.xml.rels': strToU8(workbookRels),
    'xl/styles.xml': strToU8(stylesXml),
    'xl/worksheets/sheet1.xml': strToU8(worksheetXml),
  }, { level: 6 });
}

export function exportBankPayrollXlsx(payrollRun: PayrollRun, company: Company, batch: PayrollPaymentBatch, employees: Employee[] = []): void {
  let file: Uint8Array;
  try {
    file = buildBankPayrollXlsx(payrollRun, company, batch, employees);
  } catch (error) {
    alert(error instanceof Error ? error.message : 'تعذر إنشاء ملف البنك');
    return;
  }
  const blob = new Blob([file], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `Bank_Payroll_${payrollRun.periodMonth}_${batch.batchNumber}.xlsx`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
