import fs from 'node:fs';

const path = 'src/components/PayrollRunsView.tsx';
let source = fs.readFileSync(path, 'utf8');

const stateAnchor = "  const [selectedPeriod, setSelectedPeriod] = useState<string>(\n    companyRuns[0]?.periodMonth || currentPeriod\n  );\n";
const stateReplacement = `${stateAnchor}\n  const [selectedYear, setSelectedYear] = useState<number>(() =>\n    Number((companyRuns[0]?.periodMonth || currentPeriod).slice(0, 4))\n  );\n\n  const availableYears = useMemo(() => {\n    const currentYear = Number(currentPeriod.slice(0, 4));\n    const years = new Set<number>([currentYear - 1, currentYear, currentYear + 1, selectedYear]);\n    companyRuns.forEach(run => years.add(Number(run.periodMonth.slice(0, 4))));\n    return Array.from(years).filter(Number.isFinite).sort((a, b) => b - a);\n  }, [companyRuns, currentPeriod, selectedYear]);\n\n  const yearPeriods = useMemo(() =>\n    Array.from({ length: 12 }, (_, index) => \`${'${selectedYear}'}-\${String(index + 1).padStart(2, '0')}\`),\n    [selectedYear]\n  );\n`;

if (!source.includes(stateAnchor)) throw new Error('Payroll period state anchor not found');
source = source.replace(stateAnchor, stateReplacement);

const oldSelector = `            <select\n              value={selectedPeriod}\n              onChange={(e) => { setSelectedPeriod(e.target.value); setSelectedPaymentEmployeeIds([]); }}\n              className="bg-transparent text-xs font-bold text-slate-800 border-none focus:ring-0 cursor-pointer"\n            >\n              {Array.from(new Set([selectedPeriod, ...companyRuns.map(run => run.periodMonth), ...[-2, -1, 0, 1].map(offset => { const date = new Date(); date.setMonth(date.getMonth() + offset); return date.toISOString().slice(0, 7); })])).sort().reverse().map(period => (\n                <option key={period} value={period}>{new Intl.DateTimeFormat(language === 'ar' ? 'ar-SA' : 'en-US', { month: 'long', year: 'numeric' }).format(new Date(\`${'${period}'}-01T12:00:00\`))}</option>\n              ))}\n            </select>`;

const newSelector = `            <select\n              aria-label={tr('السنة', 'Year')}\n              value={selectedYear}\n              onChange={(e) => {\n                const year = Number(e.target.value);\n                setSelectedYear(year);\n                const month = selectedPeriod.slice(5, 7) || currentPeriod.slice(5, 7);\n                setSelectedPeriod(\`${'${year}'}-\${month}\`);\n                setSelectedPaymentEmployeeIds([]);\n              }}\n              className="bg-transparent text-xs font-bold text-slate-800 border-none focus:ring-0 cursor-pointer"\n            >\n              {availableYears.map(year => <option key={year} value={year}>{year}</option>)}\n            </select>\n            <span className="text-slate-300">/</span>\n            <select\n              aria-label={tr('شهر المسير', 'Payroll month')}\n              value={selectedPeriod}\n              onChange={(e) => { setSelectedPeriod(e.target.value); setSelectedPaymentEmployeeIds([]); }}\n              className="bg-transparent text-xs font-bold text-slate-800 border-none focus:ring-0 cursor-pointer"\n            >\n              {yearPeriods.map(period => (\n                <option key={period} value={period}>{new Intl.DateTimeFormat(language === 'ar' ? 'ar-SA' : 'en-US', { month: 'long' }).format(new Date(\`${'${period}'}-01T12:00:00\`))}</option>\n              ))}\n            </select>`;

if (!source.includes(oldSelector)) throw new Error('Payroll period selector anchor not found');
source = source.replace(oldSelector, newSelector);

fs.writeFileSync(path, source);
console.log('Applied full-year payroll period selector');
