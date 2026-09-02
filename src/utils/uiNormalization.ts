import '../mobileUi.css';

const MOBILE_QUERY = '(max-width: 767px)';
const COUNT_TAB_LABELS = [
  'جدول سلف وأقساط الموظفين',
  'Employee loans & installments',
  'سجل الجزاءات والخصومات',
  'Penalties & deductions',
  'العمولات والمكافآت المؤقتة',
  'Temporary earnings',
  'سجل الحضور والتأخير والإضافي',
  'Attendance, lateness & overtime',
  'طلبات الإجازات والإجازة بدون راتب',
  'Leave and unpaid leave requests',
];

const isPayrollMonthSelect = (select: HTMLSelectElement) => {
  const label = `${select.getAttribute('aria-label') || ''}`.toLowerCase();
  return label.includes('شهر المسير') || label.includes('payroll month');
};

const formatGregorianPeriod = (period: string, language: 'ar' | 'en', monthOnly = false) => {
  const [year, month] = period.split('-').map(Number);
  if (!year || !month) return period;
  const date = new Date(Date.UTC(year, month - 1, 1, 12));
  return new Intl.DateTimeFormat(
    language === 'ar' ? 'ar-SA-u-ca-gregory-nu-latn' : 'en-US-u-ca-gregory-nu-latn',
    {
      month: 'long',
      ...(monthOnly ? {} : { year: 'numeric' }),
      calendar: 'gregory',
      numberingSystem: 'latn',
      timeZone: 'UTC',
    },
  ).format(date);
};

const normalizeMonthSelects = () => {
  document.querySelectorAll<HTMLSelectElement>('select').forEach(select => {
    const periodOptions = Array.from(select.options).filter(option => /^\d{4}-\d{2}$/.test(option.value));
    if (!periodOptions.length) return;
    const pageLanguage: 'ar' | 'en' = document.documentElement.dir === 'rtl' || document.documentElement.lang.startsWith('ar') ? 'ar' : 'en';
    const monthOnly = isPayrollMonthSelect(select);
    periodOptions.forEach(option => {
      const text = formatGregorianPeriod(option.value, pageLanguage, monthOnly);
      if (option.text !== text) option.text = text;
    });
  });

  // Date/month values remain ISO Gregorian in storage. This also prevents the
  // browser from inheriting an alternate calendar locale for the visible control.
  document.querySelectorAll<HTMLInputElement>('input[type="date"], input[type="month"]').forEach(input => {
    input.lang = 'en-CA';
    input.dir = 'ltr';
  });
};

const removeMisleadingTabCounts = () => {
  document.querySelectorAll<HTMLButtonElement>('button').forEach(button => {
    const text = (button.textContent || '').replace(/\s+/g, ' ').trim();
    if (!COUNT_TAB_LABELS.some(label => text.startsWith(label))) return;
    button.childNodes.forEach(node => {
      if (node.nodeType !== Node.TEXT_NODE) return;
      const value = node.textContent || '';
      const cleaned = value.replace(/\s*\(\d+\)\s*$/, '');
      if (cleaned !== value) node.textContent = cleaned;
    });
  });
};

const isEmployeeRegisterTable = (table: HTMLTableElement) => {
  const headers = Array.from(table.querySelectorAll('thead th')).map(th => (th.textContent || '').replace(/\s+/g, ' ').trim());
  if (headers.length !== 9) return false;
  const joined = headers.join('|');
  const hasEmployee = joined.includes('الرقم والموظف') || joined.includes('Employee & Number');
  const hasIdentity = joined.includes('الهوية / الإقامة') || joined.includes('ID / Iqama');
  const hasNationality = joined.includes('الجنسية والتأمينات') || joined.includes('Nationality & GOSI');
  return hasEmployee && hasIdentity && hasNationality;
};

const enhanceEmployeeTable = (table: HTMLTableElement) => {
  if (!isEmployeeRegisterTable(table)) return;
  table.classList.add('mobile-employee-table');
  const headers = Array.from(table.querySelectorAll<HTMLTableCellElement>('thead th'));

  table.querySelectorAll<HTMLTableRowElement>('tbody tr').forEach(row => {
    const cells = Array.from(row.querySelectorAll<HTMLTableCellElement>(':scope > td'));
    if (cells.length !== 9) return;
    row.classList.add('mobile-employee-row');

    cells.forEach((cell, index) => {
      cell.classList.add(`mobile-col-${index + 1}`);
      const label = (headers[index]?.textContent || '').replace(/\s+/g, ' ').trim();
      if (label) cell.dataset.mobileLabel = label;
    });

    const primaryCell = cells[0];
    if (!primaryCell.querySelector<HTMLButtonElement>('[data-mobile-row-toggle]')) {
      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.setAttribute('data-mobile-row-toggle', 'true');
      toggle.setAttribute('aria-expanded', 'false');
      toggle.className = 'mobile-row-toggle';
      toggle.innerHTML = '<span aria-hidden="true">⌄</span>';
      toggle.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        const expanded = row.classList.toggle('mobile-expanded');
        toggle.setAttribute('aria-expanded', String(expanded));
      });
      primaryCell.appendChild(toggle);
    }
  });
};

const normalizeUi = () => {
  normalizeMonthSelects();
  removeMisleadingTabCounts();
  document.querySelectorAll<HTMLTableElement>('table').forEach(enhanceEmployeeTable);
};

export const initUiNormalization = () => {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  let scheduled = false;
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    window.requestAnimationFrame(() => {
      scheduled = false;
      normalizeUi();
    });
  };

  schedule();
  const observer = new MutationObserver(schedule);
  observer.observe(document.body, { childList: true, subtree: true });

  const media = window.matchMedia(MOBILE_QUERY);
  media.addEventListener?.('change', schedule);
};
