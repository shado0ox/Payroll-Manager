export type EmployeeImportField =
  | 'employeeNo' | 'fullName' | 'nationalIdOrIqama' | 'country'
  | 'bankIban' | 'bankName' | 'bankSwiftCode' | 'baseSalary'
  | 'allowances' | 'deductions' | 'status' | 'notes';

export interface EmployeeImportColumn {
  index: number;
  header: string;
  suggestedField: EmployeeImportField | '';
}

export interface ParsedEmployeeSheet {
  fileName: string;
  headerRow: number;
  columns: EmployeeImportColumn[];
  rows: string[][];
}

const aliases: Record<EmployeeImportField, string[]> = {
  employeeNo: ['functional number', 'employee number', 'employee no', 'emp no', 'الرقم الوظيفي', 'رقم الموظف'],
  fullName: ['housemaid name', 'employee name', 'worker name', 'full name', 'name', 'اسم العاملة', 'اسم الموظف', 'الاسم'],
  nationalIdOrIqama: ['iqama', 'iqama no', 'national id', 'id number', 'رقم الاقامة', 'الاقامة', 'الهوية'],
  country: ['country', 'nationality', 'nationality code', 'الدولة', 'الجنسية'],
  bankIban: ['iban', 'bank iban', 'الايبان', 'الآيبان'],
  bankName: ['bank', 'bank name', 'cards', 'card', 'البنك', 'اسم البنك', 'البطاقات'],
  bankSwiftCode: ['swift', 'swift code', 'swift bic', 'bic', 'cash', 'السويفت', 'رمز السويفت'],
  baseSalary: ['basic', 'basic salary', 'base salary', 'salary', 'الراتب الاساسي', 'الاساسي'],
  allowances: ['+', 'allowances', 'addition', 'additions', 'البدلات', 'الاضافات'],
  deductions: ['-', 'deductions', 'deduction', 'الخصومات', 'الاستقطاعات'],
  status: ['states', 'state', 'status', 'الحالة'],
  notes: ['notes', 'note', 'ملاحظات', 'الملاحظات'],
};

function normalize(value: unknown): string {
  return String(value ?? '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .trim()
    .toLowerCase()
    .replace(/[\s_./\\()[\]{}:]+/g, ' ')
    .replace(/^\s+|\s+$/g, '');
}

function suggestField(header: string): EmployeeImportField | '' {
  const normalized = normalize(header);
  if (!normalized) return '';
  for (const [field, fieldAliases] of Object.entries(aliases) as [EmployeeImportField, string[]][]) {
    if (fieldAliases.some(alias => normalize(alias) === normalized)) return field;
  }
  return '';
}

function parseDelimited(text: string, delimiter: ',' | '\t'): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') { cell += '"'; i += 1; }
      else quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      row.push(cell); cell = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[i + 1] === '\n') i += 1;
      row.push(cell); cell = '';
      if (row.some(value => value.trim())) rows.push(row);
      row = [];
    } else cell += char;
  }
  row.push(cell);
  if (row.some(value => value.trim())) rows.push(row);
  return rows;
}

export async function parseEmployeeSheet(file: File): Promise<ParsedEmployeeSheet> {
  if (file.size > 5 * 1024 * 1024) throw new Error('FILE_TOO_LARGE');
  const extension = file.name.split('.').pop()?.toLowerCase();
  let rawRows: unknown[][];
  if (extension === 'xlsx') {
    const { default: readXlsxFile } = await import('read-excel-file');
    rawRows = await readXlsxFile(file);
  } else if (extension === 'csv' || extension === 'tsv') {
    const text = (await file.text()).replace(/^\uFEFF/, '');
    rawRows = parseDelimited(text, extension === 'tsv' ? '\t' : ',');
  } else {
    throw new Error('UNSUPPORTED_FILE');
  }
  if (rawRows.length > 2501) throw new Error('TOO_MANY_ROWS');

  const rows = rawRows.map(row => row.slice(0, 50).map(value => String(value ?? '').trim()));
  let headerIndex = 0;
  let bestScore = -1;
  rows.slice(0, 20).forEach((row, index) => {
    const score = row.reduce((sum, value) => sum + (suggestField(value) ? 1 : 0), 0);
    if (score > bestScore) { bestScore = score; headerIndex = index; }
  });
  if (bestScore < 2) throw new Error('HEADER_NOT_FOUND');

  const width = Math.max(...rows.slice(headerIndex).map(row => row.length), 0);
  const used = new Set<EmployeeImportField>();
  const columns = Array.from({ length: width }, (_, index) => {
    const sourceHeader = rows[headerIndex]?.[index] || '';
    const header = sourceHeader || `Column ${index + 1}`;
    let field = suggestField(header);
    if (field && used.has(field)) field = '';
    if (field) used.add(field);
    return { index, header, suggestedField: field };
  });
  const dataRows = rows.slice(headerIndex + 1).filter(row => row.some(value => value.trim()));
  if (!columns.some(column => column.suggestedField === 'country')) {
    const employeeNoIndex = columns.find(column => column.suggestedField === 'employeeNo')?.index ?? -1;
    const countryCandidate = columns.find(column => {
      if (column.index === 0 || column.index >= employeeNoIndex || !column.header.startsWith('Column ')) return false;
      const samples = dataRows.slice(0, 10).map(row => row[column.index] || '').filter(Boolean);
      return samples.length > 0 && samples.every(value => /^[A-Za-z\u0600-\u06ff -]{2,30}$/.test(value));
    });
    if (countryCandidate) countryCandidate.suggestedField = 'country';
  }
  return { fileName: file.name, headerRow: headerIndex + 1, columns, rows: dataRows };
}

export function parseMoney(value: string): number {
  const cleaned = value.replace(/[\s,]/g, '').replace(/[^0-9.-]/g, '');
  const amount = Number(cleaned);
  return Number.isFinite(amount) ? amount : 0;
}
