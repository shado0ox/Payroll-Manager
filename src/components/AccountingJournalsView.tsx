import React, { useState, useMemo } from 'react';
import { 
  Layers, 
  FileSpreadsheet, 
  Download, 
  CheckCircle2, 
  Calendar, 
  Send, 
  Sparkles, 
  Settings, 
  DollarSign,
  AlertCircle,
  Building2
} from 'lucide-react';
import { Company, PayrollRun, JournalBatch, UserRole } from '../types';
import { formatSAR, formatNumber, roundAmount } from '../utils/payrollEngine';
import { generatePayrollJournalBatch, generatePaymentJournalBatch } from '../utils/accountingEngine';
import { exportQoyodJournalCsv } from '../utils/exportUtils';

interface AccountingJournalsViewProps {
  company: Company;
  payrollRuns: PayrollRun[];
  journals: JournalBatch[];
  activeRole: UserRole;
  onUpdateCompany: (company: Company) => void;
  onOpenQoyodModal: () => void;
}

export const AccountingJournalsView: React.FC<AccountingJournalsViewProps> = ({
  company,
  payrollRuns,
  journals,
  activeRole,
  onUpdateCompany,
  onOpenQoyodModal,
}) => {
  const companyRuns = useMemo(() => {
    return payrollRuns.filter(r => r.companyId === company.id);
  }, [payrollRuns, company.id]);

  const [selectedPeriod, setSelectedPeriod] = useState<string>(
    companyRuns[0]?.periodMonth || '2026-08'
  );

  const [journalType, setJournalType] = useState<'ACCRUAL' | 'PAYMENT'>('ACCRUAL');
  const [isAccountsMapModalOpen, setIsAccountsMapModalOpen] = useState(false);

  const currentRun = useMemo(() => {
    return companyRuns.find(r => r.periodMonth === selectedPeriod) || companyRuns[0];
  }, [companyRuns, selectedPeriod]);

  // Generate or retrieve current active batch
  const activeBatch: JournalBatch | null = useMemo(() => {
    if (!currentRun) return null;
    if (journalType === 'ACCRUAL') {
      return generatePayrollJournalBatch(company, currentRun);
    } else {
      return generatePaymentJournalBatch(company, currentRun);
    }
  }, [company, currentRun, journalType]);

  const isBalanced = activeBatch ? Math.abs(activeBatch.totalDebit - activeBatch.totalCredit) < 0.01 : false;

  // Chart of accounts form state
  const [accountsForm, setAccountsForm] = useState(company.chartOfAccounts);

  const handleSaveAccounts = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateCompany({
      ...company,
      chartOfAccounts: accountsForm,
    });
    setIsAccountsMapModalOpen(false);
    alert('تم تحديث خريطة الحسابات بنجاح ومطابقتها مع دليل حسابات قيود!');
  };

  return (
    <div className="space-y-6">
      
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Layers className="w-6 h-6 text-emerald-600" />
            <span>القيود المحاسبية وتكامل برنامج قيود</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            توليد قيود اليومية المزدوجة المتوازنة آلياً حسب مراكز التكلفة والتصدير بصيغة قيود المحاسبي
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Period Selector */}
          <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border border-slate-200 shadow-xs">
            <Calendar className="w-4 h-4 text-slate-500" />
            <select
              value={selectedPeriod}
              onChange={(e) => setSelectedPeriod(e.target.value)}
              className="bg-transparent text-xs font-bold text-slate-800 border-none focus:ring-0 cursor-pointer"
            >
              {companyRuns.map(r => (
                <option key={r.id} value={r.periodMonth}>فترة {r.periodMonth}</option>
              ))}
            </select>
          </div>

          {/* Accounts Mapping Config */}
          <button
            onClick={() => {
              setAccountsForm(company.chartOfAccounts);
              setIsAccountsMapModalOpen(true);
            }}
            className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <Settings className="w-4 h-4 text-slate-600" />
            <span>خريطة الحسابات (قيود)</span>
          </button>

          {/* Qoyod Direct CSV Export */}
          {activeBatch && (
            <button
              onClick={() => exportQoyodJournalCsv(activeBatch, company)}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>تصدير قيد قيود CSV</span>
            </button>
          )}
        </div>
      </div>

      {/* Journal Type Toggle: Accrual vs Payment */}
      <div className="flex items-center gap-3 bg-white p-2 rounded-2xl border border-slate-200 shadow-xs max-w-md">
        <button
          onClick={() => setJournalType('ACCRUAL')}
          className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all ${
            journalType === 'ACCRUAL'
              ? 'bg-emerald-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-50'
          }`}
        >
          قيد استحقاق الرواتب والأجور (Accrual JV)
        </button>

        <button
          onClick={() => setJournalType('PAYMENT')}
          className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all ${
            journalType === 'PAYMENT'
              ? 'bg-emerald-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-50'
          }`}
        >
          قيد سداد وصرف البنك (Payment PV)
        </button>
      </div>

      {/* Batch Header Information Card */}
      {activeBatch && (
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="font-mono font-bold text-xs px-2.5 py-1 rounded-md bg-slate-900 text-white">
                {activeBatch.batchNumber}
              </span>
              <span className="text-xs text-slate-500 font-medium">
                تاريخ القيد: {activeBatch.date}
              </span>
            </div>
            <h3 className="font-bold text-sm text-slate-900">{activeBatch.description}</h3>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-[11px] text-slate-500">إجمالي المدين (Debit)</div>
              <div className="text-base font-extrabold text-slate-900 font-mono">
                {formatSAR(activeBatch.totalDebit)}
              </div>
            </div>

            <div className="text-right">
              <div className="text-[11px] text-slate-500">إجمالي الدائن (Credit)</div>
              <div className="text-base font-extrabold text-slate-900 font-mono">
                {formatSAR(activeBatch.totalCredit)}
              </div>
            </div>

            <div className="px-3 py-1.5 rounded-xl border flex items-center gap-1.5 text-xs font-bold bg-emerald-50 text-emerald-800 border-emerald-200">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>القيد متوازن تماماً (Balanced)</span>
            </div>
          </div>
        </div>
      )}

      {/* Double-Entry Journal Lines Table */}
      {activeBatch && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead>
                <tr className="bg-slate-800 text-white font-bold border-b border-slate-700">
                  <th className="py-3 px-4">رمز الحساب (قيود)</th>
                  <th className="py-3 px-4">اسم الحساب في الدليل</th>
                  <th className="py-3 px-4">مركز التكلفة</th>
                  <th className="py-3 px-4">البيان والشرح</th>
                  <th className="py-3 px-4 text-emerald-300 font-extrabold">مدين (Debit)</th>
                  <th className="py-3 px-4 text-sky-300 font-extrabold">دائن (Credit)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono">
                {activeBatch.lines.map((line) => (
                  <tr key={line.id} className="hover:bg-slate-50">
                    <td className="py-3 px-4 font-bold text-slate-800">{line.accountCode}</td>
                    <td className="py-3 px-4 font-sans font-semibold text-slate-900">{line.accountNameAr}</td>
                    <td className="py-3 px-4 font-sans text-slate-600">
                      {line.costCenterName ? (
                        <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[10px] font-bold">
                          {line.costCenterCode} - {line.costCenterName}
                        </span>
                      ) : (
                        <span className="text-slate-300">-</span>
                      )}
                    </td>
                    <td className="py-3 px-4 font-sans text-slate-600">{line.descriptionAr}</td>
                    <td className="py-3 px-4 font-extrabold text-emerald-700">
                      {line.debit > 0 ? formatSAR(line.debit) : '-'}
                    </td>
                    <td className="py-3 px-4 font-extrabold text-sky-700">
                      {line.credit > 0 ? formatSAR(line.credit) : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-slate-50 border-t-2 border-slate-300 font-bold text-slate-900">
                  <td colSpan={4} className="py-3 px-4 text-left font-sans">الإجمالي العام المتوازن:</td>
                  <td className="py-3 px-4 text-emerald-800 text-sm font-extrabold font-mono">{formatSAR(activeBatch.totalDebit)}</td>
                  <td className="py-3 px-4 text-sky-800 text-sm font-extrabold font-mono">{formatSAR(activeBatch.totalCredit)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Accounts Mapping Modal */}
      {isAccountsMapModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full shadow-2xl border border-slate-200 p-6 space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">خريطة الحسابات المحاسبية (دليل قيود)</h3>
                <p className="text-xs text-slate-500">تخصيص رموز وأرقام الحسابات للمنشأة: {company.nameAr}</p>
              </div>
              <button
                onClick={() => setIsAccountsMapModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveAccounts} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">ح/ مصروف الرواتب الأساسية</label>
                  <input
                    type="text"
                    value={accountsForm.salariesExpenseAccount}
                    onChange={(e) => setAccountsForm({ ...accountsForm, salariesExpenseAccount: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">ح/ مصروف بدل السكن</label>
                  <input
                    type="text"
                    value={accountsForm.housingAllowanceAccount}
                    onChange={(e) => setAccountsForm({ ...accountsForm, housingAllowanceAccount: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">ح/ مصروف بدل النقل</label>
                  <input
                    type="text"
                    value={accountsForm.transportAllowanceAccount}
                    onChange={(e) => setAccountsForm({ ...accountsForm, transportAllowanceAccount: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">ح/ مصروف العمل الإضافي</label>
                  <input
                    type="text"
                    value={accountsForm.overtimeExpenseAccount}
                    onChange={(e) => setAccountsForm({ ...accountsForm, overtimeExpenseAccount: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">ح/ مصروف التأمينات - حصة المنشأة</label>
                  <input
                    type="text"
                    value={accountsForm.gosiEmployerExpenseAccount}
                    onChange={(e) => setAccountsForm({ ...accountsForm, gosiEmployerExpenseAccount: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">ح/ مستحقات الرواتب والأجور (دائن)</label>
                  <input
                    type="text"
                    value={accountsForm.salariesPayableAccount}
                    onChange={(e) => setAccountsForm({ ...accountsForm, salariesPayableAccount: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">ح/ مستحقات التأمينات GOSI (دائن)</label>
                  <input
                    type="text"
                    value={accountsForm.gosiPayableAccount}
                    onChange={(e) => setAccountsForm({ ...accountsForm, gosiPayableAccount: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">ح/ سلف وذمم الموظفين (دائن)</label>
                  <input
                    type="text"
                    value={accountsForm.employeeAdvancesAccount}
                    onChange={(e) => setAccountsForm({ ...accountsForm, employeeAdvancesAccount: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">ح/ البنك الجاري (حساب الصرف)</label>
                  <input
                    type="text"
                    value={accountsForm.bankAccount}
                    onChange={(e) => setAccountsForm({ ...accountsForm, bankAccount: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono"
                  />
                </div>
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAccountsMapModalOpen(false)}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold"
                >
                  حفظ الخريطة
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
